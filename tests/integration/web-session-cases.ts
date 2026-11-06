import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
export function webSessionCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("cookie-bound browser session verification", () => {
    const tenant = randomUUID(),
      users = [randomUUID(), randomUUID()] as const;
    type Credential = { accessToken: string; cookie: string };
    async function request(
      path: string,
      credential?: Credential,
      method = "GET",
      body?: unknown,
    ) {
      const response = await fetch(getBase() + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          ...(credential
            ? {
                Authorization: "Bearer " + credential.accessToken,
                ...(credential.cookie ? { Cookie: credential.cookie } : {}),
              }
            : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookies: response.headers.getSetCookie(),
      };
    }
    function token(result: Awaited<ReturnType<typeof request>>): Credential {
      const cookie = result.cookies
        .find((c) => c.startsWith("__Host-fluivix-refresh="))
        ?.split(";")[0];
      if (!cookie || typeof result.body.data?.accessToken !== "string")
        throw Error("Missing synthetic browser credential");
      return { accessToken: result.body.data.accessToken, cookie };
    }
    async function login(index = 0) {
      const r = await request("/auth/login", undefined, "POST", {
        email: users[index] + "@example.test",
        password,
      });
      expect(r.status).toBe(200);
      return token(r);
    }
    async function select(credential: Credential, role = "manager") {
      const r = await request("/auth/switch-context", credential, "POST", {
        tenantId: tenant,
        role,
      });
      expect(r.status).toBe(200);
      return { ...credential, accessToken: r.body.data.accessToken };
    }
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash();
      await db.$executeRaw`DELETE FROM auth_rate_limits`;
      await db.tenant.create({
        data: {
          id: tenant,
          slug: "web-session-" + tenant,
          name: "Synthetic browser session centre",
          status: "ACTIVE",
          subscriptionEndsAt: new Date("2040-01-01Z"),
          graceUntil: new Date("2040-02-01Z"),
        },
      });
      for (const id of users) {
        await db.user.create({
          data: {
            id,
            email: id + "@example.test",
            displayName: "Synthetic browser session actor",
            passwordHash,
            status: "ACTIVE",
          },
        });
        await db.membership.create({
          data: {
            tenantId: tenant,
            userId: id,
            status: "ACTIVE",
            roles: { create: [{ role: "owner" }, { role: "manager" }] },
          },
        });
      }
    });
    it("verifies actual current cookie/access scope without issuing or consuming credentials, including readonly reads", async () => {
      const db = getDb(),
        credential = await select(await login()),
        before = await db.authSession.count({ where: { userId: users[0] } });
      await db.tenant.update({
        where: { id: tenant },
        data: { status: "READ_ONLY" },
      });
      try {
        for (let i = 0; i < 2; i++) {
          const r = await request("/auth/web-session", credential);
          expect(r.status).toBe(200);
          expect(r.body.data.id).toBe(users[0]);
          expect(r.body.data.activeTenantId).toBe(tenant);
          expect(r.body.data.activeRole).toBe("manager");
          expect(r.cookies).toEqual([]);
          expect(r.body.data).not.toHaveProperty("accessToken");
          expect(r.body.data).not.toHaveProperty("refreshToken");
        }
        expect(
          await db.authSession.count({ where: { userId: users[0] } }),
        ).toBe(before);
        expect(
          (await request("/me", { ...credential, cookie: "" })).status,
        ).toBe(200);
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("rejects missing cookies, same-user/different-family cookies, different identities and stale context-free bootstrap claims", async () => {
      const first = await select(await login()),
        second = await login(),
        other = await login(1);
      expect(
        (await request("/auth/web-session", { ...first, cookie: "" })).status,
      ).toBe(401);
      expect(
        (
          await request("/auth/web-session", {
            ...first,
            cookie: second.cookie,
          })
        ).status,
      ).toBe(401);
      expect(
        (await request("/auth/web-session", { ...first, cookie: other.cookie }))
          .status,
      ).toBe(401);
      expect((await request("/auth/web-session", first)).status).toBe(200);
      await select(second);
      expect((await request("/auth/web-session", second)).status).toBe(401);
      // Ordinary bearer/native /me retains its existing transport contract.
      expect(
        (await request("/me", { ...first, cookie: other.cookie })).body.data.id,
      ).toBe(users[0]);
    });
    it("candidate rejection never revokes a family, while real refresh consumes once and reuse still revokes the newest access", async () => {
      const db = getDb(),
        old = await select(await login()),
        renewed = await request("/auth/refresh", old, "POST", {});
      expect(renewed.status).toBe(200);
      const current = token(renewed);
      expect(
        (await request("/auth/web-session", { ...old, cookie: current.cookie }))
          .status,
      ).toBe(401);
      expect(
        (await request("/auth/web-session", { ...current, cookie: old.cookie }))
          .status,
      ).toBe(401);
      expect((await request("/auth/web-session", current)).status).toBe(200);
      const before = await db.authSession.count({
        where: { userId: users[0], revokedAt: { not: null } },
      });
      expect((await request("/auth/refresh", old, "POST", {})).status).toBe(
        401,
      );
      expect((await request("/auth/web-session", current)).status).toBe(401);
      expect(
        await db.authSession.count({
          where: { userId: users[0], revokedAt: { not: null } },
        }),
      ).toBe(before + 2);
    });
    it("rejects a revoked selected role or suspended centre, and normal rotation drops that unavailable context", async () => {
      const db = getDb();
      let credential = await select(await login());
      const member = await db.membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: tenant, userId: users[0]! } },
      });
      await db.membershipRole.delete({
        where: {
          membershipId_role: { membershipId: member.id, role: "manager" },
        },
      });
      try {
        expect((await request("/auth/web-session", credential)).status).toBe(
          401,
        );
        const refreshed = await request(
          "/auth/refresh",
          credential,
          "POST",
          {},
        );
        expect(refreshed.status).toBe(200);
        credential = token(refreshed);
        const verified = await request("/auth/web-session", credential);
        expect(verified.status).toBe(200);
        expect(verified.body.data.activeTenantId).toBe(null);
        expect(verified.body.data.activeRole).toBe(null);
      } finally {
        await db.membershipRole.create({
          data: { membershipId: member.id, role: "manager" },
        });
      }
      credential = await select(credential);
      await db.tenant.update({
        where: { id: tenant },
        data: { status: "SUSPENDED" },
      });
      try {
        expect((await request("/auth/web-session", credential)).status).toBe(
          401,
        );
        const refreshed = await request(
          "/auth/refresh",
          credential,
          "POST",
          {},
        );
        expect(refreshed.status).toBe(200);
        expect(
          (await request("/auth/web-session", token(refreshed))).body.data
            .activeTenantId,
        ).toBe(null);
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("rejects genuinely expired access and mobile credentials in the browser validator without weakening either transport", async () => {
      const credential = await select(await login()),
        secret = process.env.JWT_SECRET;
      if (!secret) throw Error("Synthetic JWT key unavailable");
      const payload = JSON.parse(
        Buffer.from(
          credential.accessToken.split(".")[1]!,
          "base64url",
        ).toString(),
      ) as { sub: string; sid: string; tenantId: string; role: string };
      const expired = await new SignJWT({
        sub: payload.sub,
        sid: payload.sid,
        tenantId: payload.tenantId,
        role: payload.role,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("fluivixedu-api")
        .setAudience("fluivixedu-tenant")
        .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
        .sign(new TextEncoder().encode(secret));
      expect(
        (
          await request("/auth/web-session", {
            ...credential,
            accessToken: expired,
          })
        ).status,
      ).toBe(401);
      expect((await request("/auth/web-session", credential)).status).toBe(200);
      const response = await fetch(getBase() + "/mobile/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: users[1] + "@example.test", password }),
      });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(
        (
          await request("/auth/web-session", {
            accessToken: result.data.accessToken,
            cookie: "__Host-fluivix-refresh=" + result.data.refreshToken,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await request("/me", {
            accessToken: result.data.accessToken,
            cookie: "",
          })
        ).status,
      ).toBe(200);
    });
  });
}
