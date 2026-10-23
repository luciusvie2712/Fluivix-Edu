// Shared real-DB cases registered by identity.test.ts, reusing its isolated PostgreSQL lifecycle.
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { totp } from "../../apps/api/src/platform.security";
type Result = {
  status: number;
  body: { data?: Record<string, unknown> };
  cookie: string;
  cookieAttributes: string;
};
type Api = (
  route: string,
  options?: {
    method?: string;
    token?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
  },
) => Promise<Result>;
export function platformCases(
  getDb: () => PrismaClient,
  api: Api,
  hash: (value: string) => Promise<string>,
  tenantLogin: () => Promise<Result>,
) {
  const password = "Platform-Isolated-Test-Password-2026";
  const call = (route: string, options: Parameters<Api>[1] = {}) =>
    api("/platform" + route, {
      ...options,
      origin: options.origin ?? "http://localhost:3001",
    });
  async function account() {
    const user = await getDb().platformUser.create({
      data: {
        email: randomUUID() + "@example.test",
        displayName: "Platform test",
        passwordHash: await hash(password),
        recoveryHashes: [],
      },
    });
    const start = await call("/auth/login", {
      method: "POST",
      body: { email: user.email, password },
    });
    expect(start.status).toBe(200);
    const secret = String(start.body.data?.secret),
      challengeToken = String(start.body.data?.challengeToken);
    return { user, secret, challengeToken };
  }
  const verify = (challengeToken: string, secret: string) =>
    call("/auth/verify", {
      method: "POST",
      body: {
        challengeToken,
        code: totp(secret, Math.floor(Date.now() / 30000)),
      },
    });
  describe("platform mandatory MFA and distinct identity boundary", () => {
    it("does not mint access before MFA, exposes no tenant PII, rejects cross-audience credentials", async () => {
      const tenant = await tenantLogin();
      expect(
        (await call("/me", { token: String(tenant.body.data?.accessToken) }))
          .status,
      ).toBe(401);
      expect(
        (
          await call("/auth/login", {
            method: "POST",
            body: { email: "owner@example.test", password },
          })
        ).status,
      ).toBe(401);
      const start = await account();
      expect((await call("/me", { token: start.challengeToken })).status).toBe(
        401,
      );
      expect(
        await getDb().platformSession.count({
          where: { userId: start.user.id },
        }),
      ).toBe(0);
      const result = await verify(start.challengeToken, start.secret);
      expect(result.status).toBe(200);
      expect(result.cookieAttributes).toContain("__Host-fluivix-platform=");
      expect(result.cookieAttributes).toContain("HttpOnly");
      expect(result.cookieAttributes).toContain("Secure");
      expect(result.cookieAttributes).toContain("SameSite=Strict");
      const token = String(result.body.data?.accessToken);
      expect((await api("/me", { token })).status).toBe(401);
      const me = await call("/me", { token });
      expect(me.status).toBe(200);
      expect(me.body.data?.role).toBe("platform_admin");
      const overview = await call("/overview", { token });
      expect(overview.status).toBe(200);
      expect(JSON.stringify(overview.body)).not.toContain("student");
      expect(JSON.stringify(overview.body)).not.toContain("password");
      const stored = await getDb().platformUser.findUniqueOrThrow({
        where: { id: start.user.id },
      });
      expect(stored.mfaSecret).not.toContain(start.secret);
      expect(stored.recoveryHashes).toHaveLength(10);
      const codes = result.body.data?.recoveryCodes as string[];
      expect(codes).toHaveLength(10);
      expect(stored.recoveryHashes).not.toContain(codes[0]);
    });
    it("commits failed attempt counters and locks challenge after five wrong codes", async () => {
      const start = await account();
      const step = Math.floor(Date.now() / 30000);
      const valid = new Set(
        [step - 1, step, step + 1].map((value) => totp(start.secret, value)),
      );
      const wrong = Array.from({ length: 10 }, (_, index) =>
        String(index).padStart(6, "0"),
      ).find((value) => !valid.has(value));
      for (let count = 0; count < 5; count++)
        expect(
          (
            await call("/auth/verify", {
              method: "POST",
              body: { challengeToken: start.challengeToken, code: wrong },
            })
          ).status,
        ).toBe(401);
      expect((await verify(start.challengeToken, start.secret)).status).toBe(
        401,
      );
      const row = await getDb().platformChallenge.findFirstOrThrow({
        where: { userId: start.user.id },
      });
      expect(row.attempts).toBe(5);
    });
    it("rejects challenge reuse, TOTP replay across new challenges and expired challenge", async () => {
      const start = await account();
      expect((await verify(start.challengeToken, start.secret)).status).toBe(
        200,
      );
      expect((await verify(start.challengeToken, start.secret)).status).toBe(
        401,
      );
      const next = await call("/auth/login", {
        method: "POST",
        body: { email: start.user.email, password },
      });
      expect(next.body.data?.secret).toBeNull();
      expect(next.body.data?.enrollmentRequired).toBe(false);
      // A fresh challenge still cannot reuse a consumed TOTP timestep.
      await getDb().platformUser.update({
        where: { id: start.user.id },
        data: { lastTotpStep: BigInt(Math.floor(Date.now() / 30000) + 1) },
      });
      expect(
        (await verify(String(next.body.data?.challengeToken), start.secret))
          .status,
      ).toBe(401);
      await getDb().platformChallenge.updateMany({
        where: { userId: start.user.id, usedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (await verify(String(next.body.data?.challengeToken), start.secret))
          .status,
      ).toBe(401);
    });
    it("consumes recovery once under concurrent requests, revokes sessions and requires new TOTP enrollment", async () => {
      const start = await account(),
        enrolled = await verify(start.challengeToken, start.secret);
      const oldToken = String(enrolled.body.data?.accessToken),
        codes = enrolled.body.data?.recoveryCodes as string[];
      const challenge = await call("/auth/login", {
        method: "POST",
        body: { email: start.user.email, password },
      });
      const body = {
        challengeToken: challenge.body.data?.challengeToken,
        recoveryCode: codes[0],
      };
      const results = await Promise.all([
        call("/auth/recover", { method: "POST", body }),
        call("/auth/recover", { method: "POST", body }),
      ]);
      expect(results.map((value) => value.status).sort()).toEqual([200, 401]);
      expect((await call("/me", { token: oldToken })).status).toBe(401);
      const recovered = results.find((value) => value.status === 200)!;
      expect(recovered.body.data?.enrollmentRequired).toBe(true);
      expect(recovered.body.data?.secret).not.toBe(start.secret);
      const completed = await verify(
        String(recovered.body.data?.challengeToken),
        String(recovered.body.data?.secret),
      );
      expect(completed.status).toBe(200);
      const next = await call("/auth/login", {
        method: "POST",
        body: { email: start.user.email, password },
      });
      expect(
        (
          await call("/auth/recover", {
            method: "POST",
            body: {
              challengeToken: next.body.data?.challengeToken,
              recoveryCode: codes[0],
            },
          })
        ).status,
      ).toBe(401);
    });
    it("rotates separate refresh cookie and commits family revocation on reuse", async () => {
      const start = await account(),
        session = await verify(start.challengeToken, start.secret);
      expect(
        (
          await call("/auth/refresh", {
            method: "POST",
            cookie: session.cookie,
            origin: "http://localhost:3000",
            body: {},
          })
        ).status,
      ).toBe(403);
      const next = await call("/auth/refresh", {
        method: "POST",
        cookie: session.cookie,
        body: {},
      });
      expect(next.status).toBe(200);
      expect(next.cookie).not.toBe(session.cookie);
      expect(
        (
          await call("/auth/refresh", {
            method: "POST",
            cookie: session.cookie,
            body: {},
          })
        ).status,
      ).toBe(401);
      expect(
        (await call("/me", { token: String(next.body.data?.accessToken) }))
          .status,
      ).toBe(401);
    });
    it("denies disabled identities immediately, logs logout and prevents audit mutations", async () => {
      const start = await account(),
        session = await verify(start.challengeToken, start.secret),
        token = String(session.body.data?.accessToken);
      await getDb().platformUser.update({
        where: { id: start.user.id },
        data: { active: false },
      });
      expect((await call("/me", { token })).status).toBe(401);
      await getDb().platformUser.update({
        where: { id: start.user.id },
        data: { active: true },
      });
      expect(
        (await call("/auth/logout", { method: "POST", token, body: {} }))
          .status,
      ).toBe(200);
      expect((await call("/me", { token })).status).toBe(401);
      const audit = await getDb().platformAudit.findFirstOrThrow({
        where: { actorId: start.user.id, action: "platform.logout" },
      });
      await expect(
        getDb().platformAudit.update({
          where: { id: audit.id },
          data: { action: "tampered" },
        }),
      ).rejects.toThrow();
    });
  });
}
