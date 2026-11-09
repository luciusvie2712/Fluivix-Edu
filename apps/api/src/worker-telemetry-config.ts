/** Server-only connection parsing. Never include the supplied URL in errors. */
export function workerRedisConnection(value: string | undefined) {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (!["redis:", "rediss:"].includes(url.protocol) || url.search || url.hash)
      throw new Error();
    const database = url.pathname.replace(/^\//, "");
    const db = database ? Number(database) : 0;
    const port = Number(url.port || "6379");
    if (
      (database && !/^\d+$/.test(database)) ||
      !Number.isSafeInteger(db) ||
      db < 0 ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      throw new Error();
    return {
      host: url.hostname.replace(/^\[|\]$/g, ""),
      port,
      db,
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    };
  } catch {
    throw new Error("INVALID_REDIS_CONFIGURATION");
  }
}

export function workerQueuePrefix(value = "fluivixedu") {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new Error("INVALID_QUEUE_PREFIX");
  return value;
}

export const operationalQueues = [
  "identity-mail",
  "domain-notifications",
  "schedule-generation",
] as const;
export type OperationalQueue = (typeof operationalQueues)[number];
export const heartbeatIntervalMs = 5000;
export const heartbeatFreshMs = 15000;
export const heartbeatTtlMs = 20000;
export const heartbeatRetentionMs = 86400000;
export const dispatchStaleMs = 20000;

export function heartbeatKeys(prefix: string) {
  const root = `${workerQueuePrefix(prefix)}:operations:workers`;
  return { registry: root, instance: (id: string) => `${root}:${id}` };
}
