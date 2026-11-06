import { test as base } from "@playwright/test";
import { Client } from "pg";
import { createHash } from "node:crypto";

export { expect, type Page } from "@playwright/test";

export const test = base.extend<{ rateLimitIsolation: void }>({
  rateLimitIsolation: [
    async ({ request: _request }, use) => {
      const value = process.env.E2E_DATABASE_URL;
      if (!value)
        throw new Error("E2E fixture requires the isolated database runner");
      const url = new URL(value);
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        !url.pathname.endsWith("_test")
      )
        throw new Error(
          "Refusing rate-limit fixture cleanup outside a local test database",
        );
      const db = new Client({ connectionString: value });
      try {
        await db.connect();
        // Each browser scenario starts with fresh IP counters. Production limits
        // remain unchanged and a separate scenario verifies actual throttling.
        const keys = ["127.0.0.1", "::ffff:127.0.0.1", "::1"].map((ip) =>
          createHash("sha256")
            .update("login-ip:" + ip)
            .digest("hex"),
        );
        await db.query(
          "DELETE FROM auth_rate_limits WHERE key = ANY($1::text[])",
          [keys],
        );
      } finally {
        await db.end();
      }
      await use();
    },
    { auto: true },
  ],
});
