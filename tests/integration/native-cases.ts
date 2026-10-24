import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { NativeSession } from "../../apps/mobile/lib/session-client";

export function nativeCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
) {
  async function call(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(getBase() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { response, body: await response.json() };
  }
  const credentials = () => ({ email: "guardian@example.test", password });
  describe("native credential transport and rotation against PostgreSQL", () => {
    it("connects the actual generated native client to login/restore/context/logout without browser cookies", async () => {
      let stored: string | null = null;
      const db = getDb(),
        user = await db.user.findUniqueOrThrow({
          where: { email: "guardian@example.test" },
        }),
        membership = await db.membership.findFirstOrThrow({
          where: { userId: user.id, status: "ACTIVE" },
        });
      const native = new NativeSession(
        getBase().replace(/\/api\/v1$/, ""),
        {
          get: async () => stored,
          set: async (value) => {
            stored = value;
          },
          remove: async () => {
            stored = null;
          },
        },
        () => {},
        () => {},
      );
      await native.login("guardian@example.test", password);
      expect(stored).toHaveLength(43);
      const selected = await native.switchContext(
        membership.tenantId,
        "guardian",
      );
      expect(selected.activeTenantId).toBe(membership.tenantId);
      const restored = await native.restore();
      expect(restored?.activeRole).toBe("guardian");
      await native.logout();
      expect(stored).toBeNull();
    });
    it("issues no cookie; rotates once and revokes the entire family on reuse", async () => {
      const signed = await call("/mobile/auth/login", credentials());
      expect(signed.response.status).toBe(200);
      expect(signed.response.headers.get("set-cookie")).toBeNull();
      const first = signed.body.data.refreshToken as string;
      expect(first).toHaveLength(43);
      expect(
        await getDb().authSession.findFirst({
          where: { clientType: "MOBILE" },
        }),
      ).not.toBeNull();
      const next = await call("/mobile/auth/refresh", { refreshToken: first });
      expect(next.response.status).toBe(200);
      expect(next.body.data.refreshToken).not.toBe(first);
      expect(
        (await call("/mobile/auth/refresh", { refreshToken: first })).response
          .status,
      ).toBe(401);
      const me = await fetch(getBase() + "/me", {
        headers: { Authorization: `Bearer ${next.body.data.accessToken}` },
      });
      expect(me.status).toBe(401);
      expect(
        (
          await call("/mobile/auth/refresh", {
            refreshToken: next.body.data.refreshToken,
          })
        ).response.status,
      ).toBe(401);
    });
    it("rejects browser origins/cookies and does not cross native and web refresh channels", async () => {
      for (const headers of [
        { Origin: "http://localhost:3000" },
        { Origin: "https://evil.example" },
        { Cookie: "session=anything" },
      ]) {
        expect(
          (await call("/mobile/auth/login", credentials(), headers)).response
            .status,
        ).toBe(403);
      }
      const native = await call("/mobile/auth/login", credentials());
      const first = native.body.data.refreshToken as string;
      const wrongChannel = await call(
        "/auth/refresh",
        {},
        {
          Origin: "http://localhost:3000",
          Cookie: `__Host-fluivix-refresh=${first}`,
        },
      );
      expect(wrongChannel.response.status).toBe(401);
      expect(
        (await call("/mobile/auth/refresh", { refreshToken: first })).response
          .status,
      ).toBe(200);
      const web = await call("/auth/login", credentials(), {
        Origin: "http://localhost:3000",
      });
      expect(web.body.data).not.toHaveProperty("refreshToken");
      const cookie = web.response.headers.get("set-cookie")!.split(";")[0]!;
      expect(
        (
          await call("/mobile/auth/refresh", {
            refreshToken: cookie.split("=")[1],
          })
        ).response.status,
      ).toBe(401);
      expect(
        (
          await call(
            "/auth/refresh",
            {},
            { Origin: "http://localhost:3000", Cookie: cookie },
          )
        ).response.status,
      ).toBe(200);
    });
    it("returns only one rotation winner under concurrent native refresh", async () => {
      const signed = await call("/mobile/auth/login", credentials());
      const results = await Promise.all(
        [1, 2].map(() =>
          call("/mobile/auth/refresh", {
            refreshToken: signed.body.data.refreshToken,
          }),
        ),
      );
      expect(results.map((r) => r.response.status).sort()).toEqual([200, 401]);
      const winner = results.find((r) => r.response.status === 200)!;
      expect(
        (
          await call("/mobile/auth/refresh", {
            refreshToken: winner.body.data.refreshToken,
          })
        ).response.status,
      ).toBe(401);
    });
    it("lists only verified active children and rechecks revoked links for every profile request", async () => {
      const db = getDb();
      const user = await db.user.findUniqueOrThrow({
        where: { email: "guardian@example.test" },
      });
      const link = await db.guardianLink.findFirstOrThrow({
        where: { guardianUserId: user.id, status: "ACTIVE" },
      });
      const signed = await call("/mobile/auth/login", credentials());
      const selected = await call(
        "/auth/switch-context",
        { tenantId: link.tenantId, role: "guardian" },
        { Authorization: `Bearer ${signed.body.data.accessToken}` },
      );
      const token = selected.body.data.accessToken as string;
      async function read(path: string) {
        const response = await fetch(getBase() + path, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: response.status, body: await response.json() };
      }
      const children = await read("/mobile/guardian/students");
      expect(children.status).toBe(200);
      expect(
        children.body.data.map((child: { id: string }) => child.id),
      ).toEqual([link.studentId]);
      const foreign = await db.student.findFirstOrThrow({
        where: { tenantId: { not: link.tenantId } },
      });
      expect(
        (await read(`/mobile/guardian/students/${foreign.id}/profile`)).status,
      ).toBe(404);
      const profile = await read(
        `/mobile/guardian/students/${link.studentId}/profile`,
      );
      expect(profile.status).toBe(200);
      expect(profile.body.data).not.toHaveProperty("notesPrivate");
      await db.guardianLink.update({
        where: { id: link.id },
        data: { status: "REVOKED" },
      });
      try {
        expect(
          (await read(`/mobile/guardian/students/${link.studentId}/profile`))
            .status,
        ).toBe(404);
        expect((await read("/mobile/guardian/students")).body.data).toEqual([]);
      } finally {
        await db.guardianLink.update({
          where: { id: link.id },
          data: { status: "ACTIVE" },
        });
      }
    });
  });
}
