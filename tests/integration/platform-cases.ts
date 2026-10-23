// Shared real-DB cases registered by identity.test.ts, reusing its isolated PostgreSQL lifecycle.
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { totp } from "../../apps/api/src/platform.security";
import { openToken } from "../../packages/server-crypto/src";
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
    it("onboards owner transactionally, enforces concurrent student quota and blocks overlapping renewals", async () => {
      const start = await account(),
        signed = await verify(start.challengeToken, start.secret),
        token = String(signed.body.data?.accessToken);
      for (const monthlyPriceVnd of ["1.5", "9223372036854775808"]) {
        expect(
          (
            await call("/plans", {
              method: "POST",
              token,
              body: {
                code: "INVALID_" + randomUUID().slice(0, 8).toUpperCase(),
                name: "Invalid amount",
                monthlyPriceVnd,
                limits: {
                  maxStudents: 1,
                  maxUsers: 1,
                  maxClasses: 1,
                  maxStorageBytes: "0",
                },
              },
            })
          ).status,
        ).toBe(422);
      }
      const plan = await call("/plans", {
        method: "POST",
        token,
        body: {
          code: "P_" + randomUUID().slice(0, 8).toUpperCase(),
          name: "Exact VND",
          monthlyPriceVnd: "9007199254740993",
          limits: {
            maxStudents: 1,
            maxClasses: 2,
            maxUsers: 2,
            maxStorageBytes: "1073741824",
          },
        },
      });
      expect(plan.status).toBe(201);
      expect(plan.body.data?.monthlyPriceVnd).toBe("9007199254740993");
      const email = randomUUID() + "@example.test",
        slug = "center-" + randomUUID().slice(0, 8),
        ownerPassword = "CenterOwner-Password-2026";
      const period = {
        planId: plan.body.data?.id,
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
        graceUntil: new Date(Date.now() + 2 * 86400000).toISOString(),
      };
      const created = await call("/tenants", {
        method: "POST",
        token,
        body: {
          ...period,
          slug,
          name: "New center",
          ownerEmail: email,
          timezone: "Asia/Ho_Chi_Minh",
        },
      });
      expect(created.status).toBe(201);
      expect(created.body.data?.status).toBe("PENDING_ACTIVATION");
      const id = String(created.body.data?.id),
        db = getDb();
      expect(
        await db.membership.count({
          where: { tenantId: id, status: "INVITED" },
        }),
      ).toBe(1);
      const duplicateEmail = randomUUID() + "@example.test";
      expect(
        (
          await call("/tenants", {
            method: "POST",
            token,
            body: {
              ...period,
              slug,
              name: "Duplicate center",
              ownerEmail: duplicateEmail,
              timezone: "Asia/Ho_Chi_Minh",
            },
          })
        ).status,
      ).toBe(409);
      expect(await db.user.count({ where: { email: duplicateEmail } })).toBe(0);
      const originalInvitation = await db.invitation.findFirstOrThrow({
        where: { tenantId: id },
      });
      const originalEvent = await db.outboxEvent.findFirstOrThrow({
        where: { aggregateId: originalInvitation.id },
      });
      const oldRaw = openToken(
        (originalEvent.payload as { encryptedToken: string }).encryptedToken,
      );
      expect(
        (
          await call(`/tenants/${id}/resend-owner-invitation`, {
            method: "POST",
            token,
            body: {},
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await api("/auth/accept-invitation", {
            method: "POST",
            body: {
              token: oldRaw,
              password: ownerPassword,
              displayName: "Center owner",
            },
          })
        ).status,
      ).toBe(401);
      const invitation = await db.invitation.findFirstOrThrow({
        where: { tenantId: id },
        orderBy: { expiresAt: "desc" },
      });
      const event = await db.outboxEvent.findFirstOrThrow({
        where: { aggregateId: invitation.id },
      });
      const payload = event.payload as { encryptedToken: string },
        raw = openToken(payload.encryptedToken);
      expect(
        (
          await api("/auth/accept-invitation", {
            method: "POST",
            body: {
              token: raw,
              password: ownerPassword,
              displayName: "Center owner",
            },
          })
        ).status,
      ).toBe(200);
      expect(
        (await db.tenant.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("ACTIVE");
      const login = await api("/auth/login", {
        method: "POST",
        body: { email, password: ownerPassword },
      });
      expect(login.status).toBe(200);
      const context = await api("/auth/switch-context", {
        method: "POST",
        token: String(login.body.data?.accessToken),
        body: { tenantId: id, role: "owner" },
      });
      expect(context.status).toBe(200);
      const ownerToken = String(context.body.data?.accessToken);
      const students = await Promise.all([
        api("/students", {
          method: "POST",
          token: ownerToken,
          body: { studentCode: "QUOTA_A", fullName: "Quota A" },
        }),
        api("/students", {
          method: "POST",
          token: ownerToken,
          body: { studentCode: "QUOTA_B", fullName: "Quota B" },
        }),
      ]);
      expect(students.map((value) => value.status).sort()).toEqual([201, 409]);
      expect(await db.student.count({ where: { tenantId: id } })).toBe(1);
      const next = {
        planId: period.planId,
        startsAt: period.endsAt,
        endsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        graceUntil: new Date(Date.now() + 4 * 86400000).toISOString(),
      };
      const renewals = await Promise.all([
        call(`/tenants/${id}/subscriptions`, {
          method: "POST",
          token,
          body: next,
        }),
        call(`/tenants/${id}/subscriptions`, {
          method: "POST",
          token,
          body: next,
        }),
      ]);
      expect(renewals.map((value) => value.status).sort()).toEqual([201, 409]);
      expect(await db.subscription.count({ where: { tenantId: id } })).toBe(2);
      await expect(
        db.subscription.create({
          data: {
            tenantId: id,
            planId: String(period.planId),
            startsAt: new Date(next.startsAt),
            endsAt: new Date(next.endsAt),
            graceUntil: new Date(next.graceUntil),
          },
        }),
      ).rejects.toThrow(/subscription_no_active_overlap/);
      await expect(
        db.plan.update({
          where: { id: String(plan.body.data?.id) },
          data: { monthlyPriceVnd: 1n },
        }),
      ).rejects.toThrow();
      expect(
        (
          await call(`/tenants/${id}/suspend`, {
            method: "POST",
            token,
            body: { reason: "Testing suspension boundary" },
          })
        ).status,
      ).toBe(201);
      expect((await api("/students", { token: ownerToken })).status).toBe(403);
      expect(
        (
          await call(`/tenants/${id}/reactivate`, {
            method: "POST",
            token,
            body: { reason: "Testing controlled reactivation" },
          })
        ).status,
      ).toBe(201);
      expect((await api("/students", { token: ownerToken })).status).toBe(200);
      const audit = await db.platformAudit.findFirstOrThrow({
        where: { resourceId: id, action: "tenant.suspend" },
      });
      expect(audit.reason).toBe("Testing suspension boundary");
      const current = await db.subscription.findFirstOrThrow({
        where: { tenantId: id },
        orderBy: { startsAt: "asc" },
      });
      await db.subscription.update({
        where: { id: current.id },
        data: {
          startsAt: new Date(Date.now() - 3 * 86400000),
          endsAt: new Date(Date.now() - 2 * 86400000),
          graceUntil: new Date(Date.now() - 86400000),
        },
      });
      expect(
        (
          await api("/students", {
            method: "POST",
            token: ownerToken,
            body: { studentCode: "EXPIRED", fullName: "Expired plan" },
          })
        ).status,
      ).toBe(403);
      expect((await api("/students", { token: ownerToken })).status).toBe(200);
      const other = await tenantLogin();
      await db.tenant.update({ where: { id }, data: { status: "READ_ONLY" } });
      expect(
        (
          await call(`/tenants/${id}/subscriptions`, {
            method: "POST",
            token,
            body: {
              planId: period.planId,
              startsAt: new Date(Date.now() - 60000).toISOString(),
              endsAt: period.endsAt,
              graceUntil: period.graceUntil,
            },
          })
        ).status,
      ).toBe(201);
      expect(
        (await db.tenant.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("ACTIVE");
      expect(
        (
          await api("/students", {
            method: "POST",
            token: ownerToken,
            body: {
              studentCode: "FULL_AFTER_RENEW",
              fullName: "Quota still enforced",
            },
          })
        ).status,
      ).toBe(409);
      const info = await api("/tenant/subscription", { token: ownerToken });
      expect(info.status).toBe(200);
      expect(info.body.data?.mode).toBe("ACTIVE");
      expect(
        (await call("/plans", { token: String(other.body.data?.accessToken) }))
          .status,
      ).toBe(401);
    });
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
