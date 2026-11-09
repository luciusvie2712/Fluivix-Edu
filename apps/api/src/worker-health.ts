import Redis from "ioredis";
import { Queue, type QueueGetters } from "bullmq";
import { heartbeatSchema } from "./worker-heartbeat";
import {
  dispatchStaleMs,
  heartbeatFreshMs,
  heartbeatKeys,
  heartbeatRetentionMs,
  operationalQueues,
  workerQueuePrefix,
  workerRedisConnection,
  type OperationalQueue,
} from "./worker-telemetry-config";

export const workerHealthStatuses = [
  "NOT_CONFIGURED",
  "INVALID_CONFIGURATION",
  "UNREACHABLE",
  "MISSING",
  "STALE",
  "DEGRADED",
  "HEALTHY",
] as const;
export type WorkerHealthStatus = (typeof workerHealthStatuses)[number];
export type OperationalQueueSnapshot = {
  name: OperationalQueue;
  consumers: "RUNNING" | "DISABLED" | "UNAVAILABLE";
  runningWorkers: number;
  disabledWorkers: number;
  paused: boolean;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  prioritized: number;
  waitingChildren: number;
  completed: number;
};
export type WorkerHealthSnapshot = {
  status: WorkerHealthStatus;
  freshWorkers: number | null;
  staleWorkers: number | null;
  invalidWorkers: number | null;
  lastHeartbeatAt: string | null;
  queues: OperationalQueueSnapshot[];
};
const unavailable = (status: WorkerHealthStatus): WorkerHealthSnapshot => ({
  status,
  freshWorkers: null,
  staleWorkers: null,
  invalidWorkers: null,
  lastHeartbeatAt: null,
  queues: [],
});

/** MFA caller only; aggregate data, bounded reads, never fetches job bodies. */
export async function readWorkerHealth(
  url = process.env.REDIS_URL,
  prefixValue = process.env.QUEUE_PREFIX,
): Promise<WorkerHealthSnapshot> {
  if (!url) return unavailable("NOT_CONFIGURED");
  let connection: ReturnType<typeof workerRedisConnection>, prefix: string;
  try {
    connection = workerRedisConnection(url);
    prefix = workerQueuePrefix(prefixValue);
  } catch {
    return unavailable("INVALID_CONFIGURATION");
  }
  const fastConnection = {
    ...connection,
    connectTimeout: 1000,
    commandTimeout: 1000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  };
  const redis = new Redis({ ...fastConnection, lazyConnect: true });
  redis.on("error", () => {});
  const getters: QueueGetters[] = [];
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = (async () => {
      await redis.connect();
      const [seconds, micros] = await redis.time();
      const now = Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
      const keys = heartbeatKeys(prefix);
      const ids = await redis.zrangebyscore(
        keys.registry,
        now - heartbeatRetentionMs,
        "+inf",
        "WITHSCORES",
        "LIMIT",
        0,
        101,
      );
      if (ids.length > 200)
        return { ...unavailable("DEGRADED"), invalidWorkers: 101 };
      const members = Array.from({ length: ids.length / 2 }, (_, n) => ({
        id: ids[n * 2]!,
        score: Number(ids[n * 2 + 1]),
      }));
      const validIds = members.every((r) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          r.id,
        ),
      );
      if (!validIds) return { ...unavailable("DEGRADED"), invalidWorkers: 1 };
      const raw = members.length
        ? await redis.mget(...members.map((r) => keys.instance(r.id)))
        : [];
      if (cancelled) throw new Error("HEALTH_PROBE_CANCELLED");
      const fresh: {
        payload: ReturnType<typeof heartbeatSchema.parse>;
        age: number;
      }[] = [];
      let staleWorkers = 0,
        invalidWorkers = 0;
      for (let n = 0; n < members.length; n++) {
        const member = members[n]!,
          value = raw[n];
        if (!value || now - member.score > heartbeatFreshMs) {
          staleWorkers++;
          continue;
        }
        try {
          if (value.length > 4096) throw new Error();
          const payload = heartbeatSchema.parse(JSON.parse(value));
          if (payload.sampledAt !== member.score || member.score > now)
            throw new Error();
          fresh.push({ payload, age: now - member.score });
        } catch {
          invalidWorkers++;
        }
      }
      const queues = await Promise.all(
        operationalQueues.map(async (name) => {
          const queue = new Queue(name, {
            connection: fastConnection,
            prefix,
            skipMetasUpdate: true,
          });
          getters.push(queue);
          queue.on("error", () => {});
          await queue.waitUntilReady();
          const counts = await queue.getJobCounts(
            "wait",
            "active",
            "delayed",
            "failed",
            "prioritized",
            "waiting-children",
            "completed",
          );
          const number = (key: string) => {
            const n = counts[key];
            if (!Number.isSafeInteger(n) || n! < 0)
              throw new Error("INVALID_QUEUE_COUNT");
            return n!;
          };
          const runningWorkers = fresh.filter(
            (r) => r.payload.queues[name] === "RUNNING",
          ).length;
          const disabledWorkers = fresh.filter(
            (r) => r.payload.queues[name] === "DISABLED",
          ).length;
          const pausedJobs = await redis.llen(`${prefix}:${name}:paused`);
          // Redis meta is an aggregate flag; no job data is accessed.
          const paused =
            (await redis.hget(`${prefix}:${name}:meta`, "paused")) === "1";
          return {
            name,
            consumers: runningWorkers
              ? ("RUNNING" as const)
              : disabledWorkers === fresh.length && fresh.length
                ? ("DISABLED" as const)
                : ("UNAVAILABLE" as const),
            runningWorkers,
            disabledWorkers,
            paused,
            waiting: number("wait") + pausedJobs,
            active: number("active"),
            delayed: number("delayed"),
            failed: number("failed"),
            prioritized: number("prioritized"),
            waitingChildren: number("waiting-children"),
            completed: number("completed"),
          };
        }),
      );
      let status: WorkerHealthStatus;
      if (invalidWorkers) status = "DEGRADED";
      else if (!fresh.length) status = staleWorkers ? "STALE" : "MISSING";
      else {
        const badDispatch = fresh.some(
          ({ payload: p, age }) =>
            p.dispatch === "FAILED" ||
            p.lastSuccessAgeMs === null ||
            (p.dispatch === "RUNNING" &&
              p.inProgressAgeMs !== null &&
              p.inProgressAgeMs + age > dispatchStaleMs) ||
            p.lastSuccessAgeMs + age > dispatchStaleMs,
        );
        status =
          staleWorkers ||
          badDispatch ||
          queues.some(
            (q) =>
              q.consumers === "UNAVAILABLE" ||
              q.paused ||
              q.failed > 0 ||
              (q.consumers === "DISABLED" &&
                q.waiting +
                  q.active +
                  q.delayed +
                  q.prioritized +
                  q.waitingChildren >
                  0),
          )
            ? "DEGRADED"
            : "HEALTHY";
      }
      const latest = fresh.length
        ? Math.max(...fresh.map((r) => r.payload.sampledAt))
        : null;
      return {
        status,
        freshWorkers: fresh.length,
        staleWorkers,
        invalidWorkers,
        lastHeartbeatAt:
          latest === null ? null : new Date(latest).toISOString(),
        queues,
      };
    })();
    return await Promise.race([
      operation,
      new Promise<WorkerHealthSnapshot>((resolve) => {
        timer = setTimeout(() => {
          cancelled = true;
          resolve(unavailable("UNREACHABLE"));
        }, 2500);
      }),
    ]);
  } catch {
    return unavailable("UNREACHABLE");
  } finally {
    cancelled = true;
    clearTimeout(timer);
    redis.disconnect();
    await Promise.allSettled(getters.map((q) => q.disconnect()));
  }
}
