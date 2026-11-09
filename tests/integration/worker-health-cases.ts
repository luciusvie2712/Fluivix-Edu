import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { readWorkerHealth } from "../../apps/api/src/worker-health";
import { WorkerHeartbeat } from "../../apps/api/src/worker-heartbeat";
import { observeWorkerConsumer } from "../../apps/api/src/worker-consumer-state";
import {
  heartbeatKeys,
  workerRedisConnection,
} from "../../apps/api/src/worker-telemetry-config";
import { testRedisUrl } from "../../tooling/test-redis";

const requireWorker = createRequire(path.resolve("apps/worker/package.json"));
const Redis = requireWorker("ioredis")
  .default as typeof import("../../apps/worker/node_modules/ioredis").default;
const { Queue, Worker, RedisQueueBackend } = requireWorker(
  "bullmq",
) as typeof import("../../apps/worker/node_modules/bullmq");

export function workerHealthCases() {
  describe("real Redis worker operational telemetry", () => {
    async function fixture() {
      const prefix = "fluivix-health-test-" + randomUUID();
      const url = testRedisUrl();
      const redis = new Redis({
        ...workerRedisConnection(url),
        maxRetriesPerRequest: 1,
      });
      redis.on("error", () => {});
      await redis.ping();
      const states = () => ({
        "identity-mail": "RUNNING" as const,
        "domain-notifications": "RUNNING" as const,
        "schedule-generation": "DISABLED" as const,
      });
      const heartbeat = new WorkerHeartbeat(url, prefix, states);
      const keys = heartbeatKeys(prefix);
      async function close() {
        await heartbeat.stop();
        // Only this fixture's known registry/instance keys, never global Redis.
        const ids = await redis.zrange(keys.registry, "0", "-1");
        if (ids.length) await redis.del(...ids.map(keys.instance));
        await redis.del(keys.registry);
        redis.disconnect();
      }
      return { prefix, url, redis, heartbeat, keys, close };
    }

    it("reports unavailable configuration without leaking credentials or inventing queue zeroes", async () => {
      for (const [url, prefix, status] of [
        ["", "valid", "NOT_CONFIGURED"],
        [
          "https://private:secret@example.test/",
          "valid",
          "INVALID_CONFIGURATION",
        ],
        [testRedisUrl(), "bad:prefix", "INVALID_CONFIGURATION"],
        ["redis://127.0.0.1:1", "valid", "UNREACHABLE"],
      ]) {
        const start = performance.now();
        const result = await readWorkerHealth(url, prefix);
        expect(result).toMatchObject({
          status,
          queues: [],
          freshWorkers: null,
        });
        expect(performance.now() - start).toBeLessThan(4000);
        expect(JSON.stringify(result)).not.toMatch(/secret|private|redis:\/\//);
      }
    });

    it("uses actual Redis heartbeats, dispatch outcomes and clean-stop identity ownership", async () => {
      const f = await fixture();
      const second = new WorkerHeartbeat(f.url, f.prefix, () => ({
        "identity-mail": "RUNNING",
        "domain-notifications": "RUNNING",
        "schedule-generation": "DISABLED",
      }));
      try {
        expect((await readWorkerHealth(f.url, f.prefix)).status).toBe(
          "MISSING",
        );
        await f.heartbeat.start();
        expect((await readWorkerHealth(f.url, f.prefix)).status).toBe(
          "DEGRADED",
        );
        f.heartbeat.beginDispatch();
        f.heartbeat.endDispatch(true);
        await f.heartbeat.publish();
        const healthy = await readWorkerHealth(f.url, f.prefix);
        expect(healthy).toMatchObject({
          status: "HEALTHY",
          freshWorkers: 1,
          staleWorkers: 0,
        });
        expect(
          healthy.queues.find((q) => q.name === "schedule-generation")
            ?.consumers,
        ).toBe("DISABLED");
        expect(JSON.stringify(healthy)).not.toContain(f.prefix);
        f.heartbeat.beginDispatch();
        f.heartbeat.endDispatch(false);
        await f.heartbeat.publish();
        expect((await readWorkerHealth(f.url, f.prefix)).status).toBe(
          "DEGRADED",
        );
        second.beginDispatch();
        second.endDispatch(true);
        await second.start();
        expect((await readWorkerHealth(f.url, f.prefix)).freshWorkers).toBe(2);
        await f.heartbeat.stop();
        expect(await readWorkerHealth(f.url, f.prefix)).toMatchObject({
          status: "HEALTHY",
          freshWorkers: 1,
        });
        await second.stop();
        expect((await readWorkerHealth(f.url, f.prefix)).status).toBe(
          "MISSING",
        );
      } finally {
        await second.stop();
        await f.close();
      }
    });

    it("detects expired and malformed instance state instead of claiming a live worker", async () => {
      const f = await fixture();
      try {
        f.heartbeat.beginDispatch();
        f.heartbeat.endDispatch(true);
        await f.heartbeat.start();
        const [id] = await f.redis.zrange(f.keys.registry, "0", "-1");
        expect(id).toBeTruthy();
        await f.redis.pexpire(f.keys.instance(id!), 1);
        await expect.poll(() => f.redis.exists(f.keys.instance(id!))).toBe(0);
        expect(await readWorkerHealth(f.url, f.prefix)).toMatchObject({
          status: "STALE",
          freshWorkers: 0,
          staleWorkers: 1,
        });
        await f.redis.set(
          f.keys.instance(id!),
          '{"payload":"PRIVATE-NEVER-RETURN"}',
        );
        const invalid = await readWorkerHealth(f.url, f.prefix);
        expect(invalid).toMatchObject({
          status: "DEGRADED",
          invalidWorkers: 1,
        });
        expect(JSON.stringify(invalid)).not.toContain("PRIVATE-NEVER-RETURN");
      } finally {
        await f.close();
      }
    });

    it("measures real paused backlog, processing and failures without returning job payloads or mutating queue metadata", async () => {
      const f = await fixture();
      const connection = workerRedisConnection(f.url);
      const queue = new Queue("identity-mail", {
        connection,
        prefix: f.prefix,
      });
      let consumer: { close(): Promise<void> } | undefined;
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await queue.waitUntilReady();
        await queue.pause();
        await queue.add("synthetic-health", { secret: "PRIVATE-QUEUE-BODY" });
        f.heartbeat.beginDispatch();
        f.heartbeat.endDispatch(true);
        await f.heartbeat.start();
        const metaBefore = await f.redis.hgetall(
          `${f.prefix}:identity-mail:meta`,
        );
        const paused = await readWorkerHealth(f.url, f.prefix);
        expect(paused).toMatchObject({ status: "DEGRADED" });
        expect(
          paused.queues.find((q) => q.name === "identity-mail"),
        ).toMatchObject({ paused: true, waiting: 1, active: 0 });
        expect(await f.redis.hgetall(`${f.prefix}:identity-mail:meta`)).toEqual(
          metaBefore,
        );
        expect(JSON.stringify(paused)).not.toContain("PRIVATE-QUEUE-BODY");
        const consuming = new Worker(
          "identity-mail",
          async (job) => {
            if (job.name === "synthetic-health")
              throw new Error("SYNTHETIC_HEALTH_FAILURE");
            await held;
          },
          { connection, prefix: f.prefix },
        );
        consumer = consuming;
        consuming.on("error", () => {});
        await consuming.waitUntilReady();
        await queue.resume();
        await expect.poll(() => queue.getFailedCount()).toBe(1);
        const failed = await readWorkerHealth(f.url, f.prefix);
        expect(
          failed.queues.find((q) => q.name === "identity-mail"),
        ).toMatchObject({ paused: false, waiting: 0, failed: 1 });
        expect(failed.status).toBe("DEGRADED");
        await queue.add("held-success", { secret: "PRIVATE-SUCCESS-BODY" });
        await expect.poll(() => queue.getActiveCount()).toBe(1);
        const active = await readWorkerHealth(f.url, f.prefix);
        expect(
          active.queues.find((q) => q.name === "identity-mail")?.active,
        ).toBe(1);
        release();
        await expect.poll(() => queue.getCompletedCount()).toBe(1);
        await queue.add("delayed-success", {}, { delay: 60000 });
        const completed = await readWorkerHealth(f.url, f.prefix);
        expect(
          completed.queues.find((q) => q.name === "identity-mail"),
        ).toMatchObject({ active: 0, completed: 1, delayed: 1, failed: 1 });
        expect(JSON.stringify(completed)).not.toContain("PRIVATE-SUCCESS-BODY");
      } finally {
        release();
        await consumer?.close();
        await queue.obliterate({ force: true });
        await queue.close();
        await f.close();
      }
    });

    it("observes an actual production worker start and owned-process termination through heartbeat expiry", async () => {
      const f = await fixture();
      let child: ChildProcess | undefined;
      try {
        child = spawn(process.execPath, ["apps/worker/dist/main.js"], {
          env: {
            ...process.env,
            REDIS_URL: f.url,
            QUEUE_PREFIX: f.prefix,
            MAIL_PROVIDER: "mailpit",
            WEB_ORIGIN: "http://localhost:3000",
            SCHEDULE_GENERATION_ENABLED: "false",
            PUSH_PROVIDER: "disabled",
          },
          stdio: "ignore",
          windowsHide: true,
        });
        await expect
          .poll(
            async () => (await readWorkerHealth(f.url, f.prefix)).freshWorkers,
            { timeout: 10000 },
          )
          .toBe(1);
        const started = await readWorkerHealth(f.url, f.prefix);
        expect(started.status).toBe("HEALTHY");
        expect(
          started.queues.find((q) => q.name === "schedule-generation")
            ?.consumers,
        ).toBe("DISABLED");
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
        child = undefined;
        // Expire the real owned instance key without waiting20s; no synthetic payload.
        const [id] = await f.redis.zrange(f.keys.registry, "0", "-1");
        expect(id).toBeTruthy();
        await f.redis.pexpire(f.keys.instance(id!), 1);
        await expect.poll(() => f.redis.exists(f.keys.instance(id!))).toBe(0);
        expect((await readWorkerHealth(f.url, f.prefix)).status).toBe("STALE");
      } finally {
        if (child && child.exitCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
        await f.close();
      }
    });

    it("does not report a running loop as ready when its actual blocking Redis connection closes", async () => {
      const f = await fixture();
      const worker = new Worker("identity-mail", async () => {}, {
        connection: workerRedisConnection(f.url),
        prefix: f.prefix,
      });
      worker.on("error", () => {});
      try {
        await worker.waitUntilReady();
        const observed = await observeWorkerConsumer(worker);
        expect(observed()).toBe("RUNNING");
        const backend = worker.getBackend();
        if (!(backend instanceof RedisQueueBackend))
          throw new Error("Expected actual Redis worker backend");
        const blocking = await backend.blockingClient;
        if (!blocking) throw new Error("Expected actual blocking connection");
        const closed = new Promise<{ loop: boolean; observed: string }>(
          (resolve) => {
            blocking.once("close", () =>
              resolve({ loop: worker.isRunning(), observed: observed() }),
            );
          },
        );
        blocking.disconnect();
        expect(await closed).toEqual({ loop: true, observed: "STOPPED" });
        // BullMQ may reconnect this own client afterwards; no global outage is simulated.
      } finally {
        await worker.close(true);
        await f.close();
      }
    });
  });
}
