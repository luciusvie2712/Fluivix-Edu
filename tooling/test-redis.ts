import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { redisConnection } from "../apps/worker/src/redis";

export function testRedisUrl() {
  return process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";
}

/** Fail before creating fixtures or workers, with bounded retries and no secrets. */
export async function requireTestRedis() {
  const require = createRequire(path.resolve("apps/worker/package.json"));
  const { Queue } =
    require("bullmq") as typeof import("../apps/worker/node_modules/bullmq");
  const queue = new Queue("readiness", {
    prefix: "fluivix-probe-" + randomUUID(),
    connection: {
      ...redisConnection(testRedisUrl()),
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    },
  });
  // Report one sanitized startup failure, rather than unhandled Redis events.
  queue.on("error", () => {});
  try {
    await queue.waitUntilReady();
  } catch {
    throw new Error(
      "TEST_REDIS_UNAVAILABLE: start Redis and set TEST_REDIS_URL",
    );
  } finally {
    await queue.close();
  }
}
