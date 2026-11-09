import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import Redis from "ioredis";
import { z } from "zod";
import {
  heartbeatIntervalMs,
  heartbeatKeys,
  heartbeatRetentionMs,
  heartbeatTtlMs,
  workerRedisConnection,
  type OperationalQueue,
} from "./worker-telemetry-config";

const queueState = z.enum(["RUNNING", "PAUSED", "STOPPED", "DISABLED"]);
export const heartbeatSchema = z
  .object({
    version: z.literal(1),
    sampledAt: z.number().int().nonnegative(),
    queues: z
      .object({
        "identity-mail": queueState,
        "domain-notifications": queueState,
        "schedule-generation": queueState,
      })
      .strict(),
    dispatch: z.enum(["STARTING", "SUCCEEDED", "FAILED", "RUNNING"]),
    lastSuccessAgeMs: z.number().int().nonnegative().nullable(),
    inProgressAgeMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

/** One opaque instance; never records host names, job payloads or identities. */
export class WorkerHeartbeat {
  private readonly id = randomUUID();
  private readonly redis: Redis;
  private readonly keys: ReturnType<typeof heartbeatKeys>;
  private timer: ReturnType<typeof setInterval> | undefined;
  private publishing: Promise<void> | undefined;
  private stopped = false;
  private dispatchState: "STARTING" | "SUCCEEDED" | "FAILED" | "RUNNING" =
    "STARTING";
  private lastSuccess: number | null = null;
  private dispatchStarted: number | null = null;

  constructor(
    url: string | undefined,
    prefix: string,
    private readonly states: () => Record<
      OperationalQueue,
      z.infer<typeof queueState>
    >,
  ) {
    this.keys = heartbeatKeys(prefix);
    this.redis = new Redis({
      ...workerRedisConnection(url),
      lazyConnect: true,
      connectTimeout: 1500,
      commandTimeout: 1500,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    this.redis.on("error", () => {});
  }

  beginDispatch() {
    this.dispatchState = "RUNNING";
    this.dispatchStarted = performance.now();
  }
  endDispatch(success: boolean) {
    this.dispatchState = success ? "SUCCEEDED" : "FAILED";
    this.dispatchStarted = null;
    if (success) this.lastSuccess = performance.now();
  }
  async start() {
    await this.publish();
    if (this.stopped) return;
    this.timer = setInterval(() => void this.publish(), heartbeatIntervalMs);
    this.timer.unref();
  }
  publish(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.publishing) return this.publishing;
    this.publishing = this.write()
      .catch(() => {
        console.error(JSON.stringify({ code: "WORKER_HEARTBEAT_UNAVAILABLE" }));
      })
      .finally(() => {
        this.publishing = undefined;
      });
    return this.publishing;
  }
  private async write() {
    if (this.redis.status !== "ready") {
      this.redis.disconnect();
      await this.redis.connect();
    }
    const [seconds, micros] = await this.redis.time();
    const sampledAt =
      Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
    const now = performance.now();
    const payload = heartbeatSchema.parse({
      version: 1,
      sampledAt,
      queues: this.states(),
      dispatch: this.dispatchState,
      lastSuccessAgeMs:
        this.lastSuccess === null
          ? null
          : Math.max(0, Math.floor(now - this.lastSuccess)),
      inProgressAgeMs:
        this.dispatchStarted === null
          ? null
          : Math.max(0, Math.floor(now - this.dispatchStarted)),
    });
    const result = await this.redis
      .multi()
      .set(
        this.keys.instance(this.id),
        JSON.stringify(payload),
        "PX",
        heartbeatTtlMs,
      )
      .zadd(this.keys.registry, sampledAt, this.id)
      .zremrangebyscore(
        this.keys.registry,
        "-inf",
        sampledAt - heartbeatRetentionMs,
      )
      .pexpire(this.keys.registry, heartbeatRetentionMs * 2)
      .exec();
    if (!result || result.some(([error]) => error))
      throw new Error("HEARTBEAT_WRITE_FAILED");
  }
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    await this.publishing;
    try {
      if (this.redis.status === "ready") {
        const result = await this.redis
          .multi()
          .del(this.keys.instance(this.id))
          .zrem(this.keys.registry, this.id)
          .exec();
        if (!result || result.some(([error]) => error))
          throw new Error("HEARTBEAT_STOP_FAILED");
      }
    } finally {
      this.redis.disconnect();
    }
  }
}
