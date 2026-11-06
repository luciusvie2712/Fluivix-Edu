import { describe, expect, it } from "vitest";
import { redisConnection } from "../../apps/worker/src/redis";
import { testRedisUrl } from "../../tooling/test-redis";
import { requireTestRedis } from "../../tooling/test-redis";
import { createServer } from "node:net";

describe("Redis connection configuration", () => {
  it("fails promptly and closes connections when Redis is unavailable", async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const previous = process.env.TEST_REDIS_URL;
    try {
      process.env.TEST_REDIS_URL = `redis://127.0.0.1:${address.port}`;
      await expect(requireTestRedis()).rejects.toThrow(
        /^TEST_REDIS_UNAVAILABLE:/,
      );
    } finally {
      if (previous === undefined) delete process.env.TEST_REDIS_URL;
      else process.env.TEST_REDIS_URL = previous;
    }
  });
  it("uses the same default port for integration and browser runners", () => {
    const previous = process.env.TEST_REDIS_URL;
    try {
      delete process.env.TEST_REDIS_URL;
      expect(redisConnection(testRedisUrl())).toEqual({
        host: "127.0.0.1",
        port: 6379,
        db: 0,
      });
      process.env.TEST_REDIS_URL = "redis://127.0.0.1:6385/2";
      expect(redisConnection(testRedisUrl())).toEqual({
        host: "127.0.0.1",
        port: 6385,
        db: 2,
      });
    } finally {
      if (previous === undefined) delete process.env.TEST_REDIS_URL;
      else process.env.TEST_REDIS_URL = previous;
    }
  });
  it("preserves TLS, ACL credentials and database selection", () => {
    expect(
      redisConnection("rediss://worker:p%40ss@redis.example.test:6380/3"),
    ).toEqual({
      host: "redis.example.test",
      port: 6380,
      db: 3,
      username: "worker",
      password: "p@ss",
      tls: {},
    });
    expect(redisConnection("redis://[::1]/").host).toBe("::1");
  });
  it.each([
    undefined,
    "",
    "https://user:PRIVATE@example.test",
    "redis://localhost/no",
    "redis://localhost/1?password=PRIVATE",
    "redis://localhost/9007199254740992",
  ])("rejects invalid configuration without leaking its value", (value) => {
    expect(() => redisConnection(value)).toThrow(
      /^INVALID_REDIS_CONFIGURATION$/,
    );
  });
});
