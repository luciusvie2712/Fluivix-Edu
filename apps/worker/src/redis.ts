/** Parse once for workers and test runners; errors never echo credentials. */
export function redisConnection(value: string | undefined) {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (!["redis:", "rediss:"].includes(url.protocol)) throw new Error();
    if (url.search || url.hash) throw new Error();
    const database = url.pathname.replace(/^\//, "");
    if (database && !/^\d+$/.test(database)) throw new Error();
    const db = database ? Number(database) : 0;
    if (!Number.isSafeInteger(db)) throw new Error();
    return {
      host: url.hostname.replace(/^\[|\]$/g, ""),
      port: Number(url.port || "6379"),
      db,
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    };
  } catch {
    throw new Error("INVALID_REDIS_CONFIGURATION");
  }
}
