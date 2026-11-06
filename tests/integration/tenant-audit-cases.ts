import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
export function tenantAuditCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("tenant audit live scoped and redacted history", () => {
    const tenant = randomUUID(),
      foreign = randomUUID();
    const roles = [
      "owner",
      "manager",
      "accountant",
      "academic_staff",
      "teacher",
      "student",
      "guardian",
    ] as const;
    type Actor = (typeof roles)[number];
    const users = Object.fromEntries(
      roles.map((r) => [r, randomUUID()]),
    ) as Record<Actor, string>;
    const tokens: Partial<Record<Actor, string>> = {};
    const target = "AUDIT-" + randomUUID(),
      privateMarker = "PRIVATE_AUDIT_PAYLOAD_" + randomUUID();
    const query = "?from=2026-11-01&to=2026-11-30&resourceId=" + target;
    const ids: string[] = [];
    async function api(
      path: string,
      actor: Actor = "owner",
      method = "GET",
      body?: unknown,
    ) {
      const r = await fetch(getBase() + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(tokens[actor]
            ? { Authorization: "Bearer " + tokens[actor] }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json() };
    }
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash();
      await db.$executeRaw`DELETE FROM auth_rate_limits`;
      for (const id of [tenant, foreign])
        await db.tenant.create({
          data: {
            id,
            slug: "audit-" + id,
            name: "Synthetic audit centre",
            status: "ACTIVE",
            timezone: "Asia/Ho_Chi_Minh",
            subscriptionEndsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
      for (const role of roles) {
        await db.user.create({
          data: {
            id: users[role],
            email: users[role] + "@example.test",
            displayName: "Synthetic audit actor",
            passwordHash,
            status: "ACTIVE",
          },
        });
        await db.membership.create({
          data: {
            tenantId: tenant,
            userId: users[role],
            status: "ACTIVE",
            roles: { create: { role } },
          },
        });
        const login = await api("/auth/login", role, "POST", {
          email: users[role] + "@example.test",
          password,
        });
        expect(login.status).toBe(200);
        tokens[role] = login.body.data.accessToken;
        const context = await api("/auth/switch-context", role, "POST", {
          tenantId: tenant,
          role,
        });
        expect(context.status).toBe(200);
        tokens[role] = context.body.data.accessToken;
      }
      // Same person, several roles: only the currently selected role grants audit scope.
      const member = await db.membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: tenant, userId: users.owner } },
      });
      await db.membershipRole.create({
        data: { membershipId: member.id, role: "manager" },
      });
      for (const action of [
        "attendance.reopened",
        "payment.recorded",
        "staff.role.assign",
        "future.unknown",
      ]) {
        const row = await db.auditLog.create({
          data: {
            tenantId: tenant,
            actorUserId: users.owner,
            action,
            resourceId: target,
            traceId: "audit-trace",
            createdAt: new Date("2026-11-02T00:00:00Z"),
            reason: privateMarker,
            metadata: {
              passwordHash: privateMarker,
              refreshToken: privateMarker,
              before: { score: privateMarker },
              after: { teacherNotesPrivate: privateMarker },
            },
          },
        });
        ids.push(row.id);
      }
      await db.auditLog.createMany({
        data: [
          {
            tenantId: foreign,
            action: "payment.recorded",
            resourceId: target,
            traceId: "FOREIGN_AUDIT",
            createdAt: new Date("2026-11-02Z"),
          },
          {
            tenantId: null,
            action: "global.private",
            resourceId: target,
            traceId: "GLOBAL_AUDIT",
            createdAt: new Date("2026-11-02Z"),
          },
          {
            tenantId: tenant,
            action: "attendance.reopened",
            resourceId: target,
            traceId: "BEFORE_CALENDAR",
            createdAt: new Date("2026-10-31T16:59:59Z"),
          },
          {
            tenantId: tenant,
            action: "attendance.reopened",
            resourceId: target,
            traceId: "START_CALENDAR",
            createdAt: new Date("2026-10-31T17:00:00Z"),
          },
          {
            tenantId: tenant,
            action: "attendance.reopened",
            resourceId: target,
            traceId: "END_CALENDAR",
            createdAt: new Date("2026-11-30T17:00:00Z"),
          },
        ],
      });
    });
    it("allowlists actual tenant event identities, exact filters and tenant calendar without payload/reason disclosure", async () => {
      const r = await api("/audit-logs" + query);
      expect(r.status).toBe(200);
      expect(r.body.data.scope).toBe("ALL");
      expect(r.body.data.timezone).toBe("Asia/Ho_Chi_Minh");
      expect(r.body.data.page.total).toBe(5);
      const raw = JSON.stringify(r.body);
      for (const marker of [
        privateMarker,
        "FOREIGN_AUDIT",
        "GLOBAL_AUDIT",
        "BEFORE_CALENDAR",
        "END_CALENDAR",
        "metadata",
        "reason",
      ])
        expect(raw).not.toContain(marker);
      expect(
        r.body.data.rows.some(
          (x: { traceId: string }) => x.traceId === "START_CALENDAR",
        ),
      ).toBe(true);
      for (const row of r.body.data.rows)
        expect(Object.keys(row).sort()).toEqual(
          [
            "id",
            "actorId",
            "action",
            "resourceId",
            "traceId",
            "createdAt",
          ].sort(),
        );
      const byActor = await api(
        "/audit-logs" +
          query +
          "&actorId=" +
          users.owner +
          "&action=payment.recorded&traceId=audit-trace",
      );
      expect(byActor.body.data.rows).toHaveLength(1);
      expect(byActor.body.data.rows[0].id).toBe(ids[1]);
      const pages = [];
      for (let page = 1; page <= 3; page++) {
        const p = await api("/audit-logs" + query + "&limit=2&page=" + page);
        expect(p.status).toBe(200);
        pages.push(...p.body.data.rows.map((x: { id: string }) => x.id));
      }
      expect(pages).toEqual(r.body.data.rows.map((x: { id: string }) => x.id));
      expect(new Set(pages).size).toBe(5);
      expect(
        (await api("/audit-logs" + query + "%25")).body.data.rows,
      ).toHaveLength(0);
    });
    it("enforces selected role operational/finance allowlists and denies other role reads/exports", async () => {
      const manager = await api("/audit-logs" + query, "manager"),
        accountant = await api("/audit-logs" + query, "accountant");
      expect(manager.status).toBe(200);
      expect(manager.body.data.scope).toBe("OPERATIONS");
      expect(manager.body.data.exportAllowed).toBe(false);
      expect(
        manager.body.data.rows.map((x: { action: string }) => x.action),
      ).toEqual(["attendance.reopened", "attendance.reopened"]);
      expect(accountant.status).toBe(200);
      expect(accountant.body.data.scope).toBe("FINANCE");
      expect(
        accountant.body.data.rows.map((x: { action: string }) => x.action),
      ).toEqual(["payment.recorded"]);
      expect(
        (
          await api(
            "/audit-logs" + query + "&action=staff.role.assign",
            "manager",
          )
        ).body.data.rows,
      ).toHaveLength(0);
      for (const actor of [
        "academic_staff",
        "teacher",
        "student",
        "guardian",
      ] as const) {
        expect((await api("/audit-logs" + query, actor)).status).toBe(403);
        expect((await api("/audit-logs/export" + query, actor)).status).toBe(
          403,
        );
      }
      expect((await api("/audit-logs/export" + query, "manager")).status).toBe(
        403,
      );
      const switched = await api("/auth/switch-context", "owner", "POST", {
        tenantId: tenant,
        role: "manager",
      });
      expect(switched.status).toBe(200);
      tokens.owner = switched.body.data.accessToken;
      expect((await api("/audit-logs" + query)).body.data.scope).toBe(
        "OPERATIONS",
      );
      expect((await api("/audit-logs/export" + query)).status).toBe(403);
      const back = await api("/auth/switch-context", "owner", "POST", {
        tenantId: tenant,
        role: "owner",
      });
      expect(back.status).toBe(200);
      tokens.owner = back.body.data.accessToken;
    });
    it("exports formula-safe actual CSV with actor/trace audit in READ_ONLY and leaves private history unchanged", async () => {
      const db = getDb(),
        formula = "=SUM(1,1)";
      await db.auditLog.create({
        data: {
          tenantId: tenant,
          action: "payment.recorded",
          actorUserId: users.accountant,
          resourceId: formula,
          traceId: "CSV_AUDIT",
          createdAt: new Date("2026-11-03Z"),
          reason: privateMarker,
          metadata: { secret: privateMarker },
        },
      });
      await db.tenant.update({
        where: { id: tenant },
        data: { status: "READ_ONLY" },
      });
      try {
        const r = await api(
          "/audit-logs/export?from=2026-11-01&to=2026-11-30&resourceId=" +
            encodeURIComponent(formula),
          "accountant",
        );
        expect(r.status).toBe(200);
        expect(r.body.data.rowCount).toBe(1);
        expect(r.body.data.csv).toContain("'=SUM(1,1)");
        expect(r.body.data.csv).toContain(users.accountant);
        expect(r.body.data.csv).not.toContain(privateMarker);
        const audit = await db.auditLog.findFirstOrThrow({
          where: {
            tenantId: tenant,
            action: "audit.exported",
            traceId: r.body.meta.traceId,
          },
        });
        expect(audit.actorUserId).toBe(users.accountant);
        expect(audit.metadata).toMatchObject({
          scope: "FINANCE",
          rowCount: 1,
          resourceId: formula,
        });
        const stored = await db.auditLog.findUniqueOrThrow({
          where: { id: ids[0]! },
        });
        expect(stored.reason).toBe(privateMarker);
        expect(JSON.stringify(stored.metadata)).toContain(privateMarker);
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("uses the tenant DST calendar and denies suspended centres without changing audit history", async () => {
      const db = getDb(),
        resource = "AUDIT-DST-" + randomUUID();
      await db.auditLog.createMany({
        data: [
          "2026-11-01T03:59:59Z",
          "2026-11-01T04:00:00Z",
          "2026-11-02T04:59:59.999Z",
          "2026-11-02T05:00:00Z",
        ].map((at, i) => ({
          tenantId: tenant,
          action: "payment.recorded",
          resourceId: resource,
          traceId: "DST-" + i,
          createdAt: new Date(at),
        })),
      });
      await db.tenant.update({
        where: { id: tenant },
        data: { timezone: "America/New_York" },
      });
      try {
        const result = await api(
          "/audit-logs?from=2026-11-01&to=2026-11-01&resourceId=" + resource,
        );
        expect(result.status).toBe(200);
        expect(result.body.data.timezone).toBe("America/New_York");
        expect(
          result.body.data.rows.map((r: { traceId: string }) => r.traceId),
        ).toEqual(["DST-2", "DST-1"]);
        expect(
          result.body.data.rows.every(
            (r: { actorId: string | null }) => r.actorId === null,
          ),
        ).toBe(true);
        await db.tenant.update({
          where: { id: tenant },
          data: { status: "SUSPENDED" },
        });
        expect((await api("/audit-logs" + query)).status).toBe(403);
        expect((await api("/audit-logs/export" + query)).status).toBe(403);
        expect(
          await db.auditLog.count({
            where: { tenantId: tenant, resourceId: resource },
          }),
        ).toBe(4);
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { timezone: "Asia/Ho_Chi_Minh", status: "ACTIVE" },
        });
      }
    });
    it("rejects malformed/unsafe queries, capped exports and revoked live membership without success audit", async () => {
      for (const suffix of [
        "&page=9007199254740992",
        "&actorId=not-a-uuid",
        "&search=private",
        "&tenantId=" + foreign,
      ])
        expect((await api("/audit-logs" + query + suffix)).status).toBe(422);
      expect(
        (await api("/audit-logs?from=2024-01-01&to=2026-11-30")).status,
      ).toBe(422);
      const db = getDb(),
        large = "CAP-" + randomUUID();
      await db.auditLog.createMany({
        data: Array.from({ length: 5001 }, () => ({
          tenantId: tenant,
          action: "payment.recorded",
          resourceId: large,
          traceId: "AUDIT_CAP",
          createdAt: new Date("2026-11-04Z"),
        })),
      });
      const count = await db.auditLog.count({
        where: { tenantId: tenant, action: "audit.exported" },
      });
      expect(
        (
          await api(
            "/audit-logs/export?from=2026-11-01&to=2026-11-30&resourceId=" +
              large,
          )
        ).status,
      ).toBe(422);
      expect(
        await db.auditLog.count({
          where: { tenantId: tenant, action: "audit.exported" },
        }),
      ).toBe(count);
      await db.membership.update({
        where: {
          tenantId_userId: { tenantId: tenant, userId: users.accountant },
        },
        data: { status: "SUSPENDED" },
      });
      expect((await api("/audit-logs" + query, "accountant")).status).toBe(403);
      expect(
        (await api("/audit-logs/export" + query, "accountant")).status,
      ).toBe(403);
    });
  });
}
