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
        // Each scenario starts with fresh IP and synthetic-user account counters.
        // The growing suite must not consume a later scenario's login allowance.
        // Production limits remain unchanged; no counter is reset during a test.
        const keys = ["127.0.0.1", "::ffff:127.0.0.1", "::1"].map((ip) =>
          createHash("sha256")
            .update("login-ip:" + ip)
            .digest("hex"),
        );
        keys.push(
          ...["127.0.0.1", "::ffff:127.0.0.1", "::1"].map((ip) =>
            createHash("sha256")
              .update("platform-login-ip:" + ip)
              .digest("hex"),
          ),
        );
        const users = await db.query<{ email: string }>(
          "SELECT email FROM users",
        );
        keys.push(
          ...users.rows.map(({ email }) =>
            createHash("sha256")
              .update("login-account:" + email.trim().toLowerCase())
              .digest("hex"),
          ),
        );
        const platformUsers = await db.query<{ email: string }>(
          "SELECT email FROM platform_users",
        );
        keys.push(
          ...platformUsers.rows.map(({ email }) =>
            createHash("sha256")
              .update("platform-login-account:" + email.trim().toLowerCase())
              .digest("hex"),
          ),
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
