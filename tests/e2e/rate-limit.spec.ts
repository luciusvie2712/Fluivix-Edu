import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { testOrigins } from "../../tooling/test-origins";

test("real login throttling rejects the eleventh request without weakening production policy", async ({
  request,
}) => {
  const data = {
    email: `rate-${randomUUID()}@example.test`,
    password: "Synthetic-wrong-password-2026",
  };
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await request.post(testOrigins.api + "/api/v1/auth/login", {
      headers: { Origin: testOrigins.web },
      data,
    });
    expect(result.status()).toBe(401);
  }
  const blocked = await request.post(testOrigins.api + "/api/v1/auth/login", {
    headers: { Origin: testOrigins.web },
    data,
  });
  expect(blocked.status()).toBe(429);
});
