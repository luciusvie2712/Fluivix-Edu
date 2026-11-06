import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Role } from "@prisma/client";

export function teacherCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("teacher administration against real PostgreSQL", () => {
    const tenant = randomUUID(),
      foreign = randomUUID();
    const ids = {
      owner: randomUUID(),
      academic: randomUUID(),
      teacher: randomUUID(),
      accountant: randomUUID(),
      candidate: randomUUID(),
      foreign: randomUUID(),
    };
    const tokens = { owner: "", academic: "", teacher: "", accountant: "" };
    let profileId = "",
      passwordHash = "";
    async function api(
      path: string,
      method = "GET",
      body?: unknown,
      token = tokens.owner,
    ) {
      const response = await fetch(getBase() + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    }
    async function member(
      id: string,
      role: Role,
      tenantId = tenant,
      status: "ACTIVE" | "INVITED" | "SUSPENDED" = "ACTIVE",
    ) {
      await getDb().user.create({
        data: {
          id,
          email: id + "@example.test",
          displayName: "Synthetic " + role,
          status: "ACTIVE",
          passwordHash,
        },
      });
      return getDb().membership.create({
        data: { tenantId, userId: id, status, roles: { create: { role } } },
      });
    }
    async function context(id: string, role: Role) {
      const login = await api(
        "/mobile/auth/login",
        "POST",
        { email: id + "@example.test", password },
        "",
      );
      expect(login.status).toBe(200);
      const selected = await api(
        "/auth/switch-context",
        "POST",
        { tenantId: tenant, role },
        login.body.data.accessToken,
      );
      expect(selected.status).toBe(200);
      return selected.body.data.accessToken as string;
    }
    async function cls(code: string) {
      const r = await api("/classes", "POST", {
        code,
        name: "Synthetic " + code,
        capacity: 10,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });
      expect(r.status).toBe(201);
      return r.body.data.id as string;
    }
    beforeAll(async () => {
      passwordHash = await hash();
      const plan = await getDb().plan.findUniqueOrThrow({
        where: { code: "TEST_PLAN" },
      });
      for (const id of [tenant, foreign]) {
        await getDb().tenant.create({
          data: {
            id,
            slug: "teacher-" + id,
            name: "Synthetic teacher tenant",
            status: "ACTIVE",
            subscriptionEndsAt: new Date("2028-01-01Z"),
            graceUntil: new Date("2028-02-01Z"),
          },
        });
        await getDb().subscription.create({
          data: {
            tenantId: id,
            planId: plan.id,
            startsAt: new Date("2020-01-01Z"),
            endsAt: new Date("2028-01-01Z"),
            graceUntil: new Date("2028-02-01Z"),
          },
        });
      }
      for (const role of [
        "owner",
        "academic",
        "teacher",
        "accountant",
      ] as const) {
        const actual = role === "academic" ? "academic_staff" : role;
        await member(ids[role], actual);
        tokens[role] = await context(ids[role], actual);
      }
      await member(ids.candidate, "teacher");
      await member(ids.foreign, "teacher", foreign);
      const created = await api("/teachers", "POST", {
        userId: ids.teacher,
        teacherCode: "EXISTING",
        fullName: "Synthetic existing teacher",
      });
      expect(created.status).toBe(201);
      profileId = created.body.data.id;
    });
    it("exposes only eligible same-tenant accounts, searches codes, pages profiles and denies foreign and unauthorized reads/writes", async () => {
      const invited = randomUUID(),
        suspended = randomUUID(),
        disabled = randomUUID();
      await member(invited, "teacher", tenant, "INVITED");
      await member(suspended, "teacher", tenant, "SUSPENDED");
      await member(disabled, "teacher");
      await getDb().user.update({
        where: { id: disabled },
        data: { status: "DISABLED" },
      });
      const accounts = await api(
        "/teachers/accounts",
        "GET",
        undefined,
        tokens.academic,
      );
      expect(accounts.status).toBe(200);
      expect(accounts.body.data).toEqual([
        {
          userId: ids.candidate,
          displayName: "Synthetic teacher",
          email: ids.candidate + "@example.test",
        },
      ]);
      expect(
        (await api("/teachers/accounts?search=" + ids.foreign)).body.data,
      ).toEqual([]);
      for (const token of [tokens.teacher, tokens.accountant])
        for (const route of [
          "/teachers",
          "/teachers/accounts",
          `/teachers/${profileId}`,
          `/teachers/${profileId}/classes`,
        ])
          expect((await api(route, "GET", undefined, token)).status).toBe(403);
      const created = await api(
        "/teachers",
        "POST",
        {
          userId: ids.candidate,
          teacherCode: "FIND-CODE",
          fullName: "  Synthetic new teacher  ",
        },
        tokens.academic,
      );
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        fullName: "Synthetic new teacher",
        accountReady: true,
        version: 1,
      });
      expect((await api("/teachers/accounts")).body.data).toEqual([]);
      expect(
        (await api("/teachers?search=FIND-CODE")).body.data.map(
          (v: { id: string }) => v.id,
        ),
      ).toEqual([created.body.data.id]);
      expect((await api("/teachers?limit=1&page=2")).body.page).toMatchObject({
        total: 2,
        totalPages: 2,
        page: 2,
      });
      expect((await api("/teachers?status=invalid")).status).toBe(422);
      expect((await api("/teachers?limit=101")).status).toBe(422);
      expect(
        (
          await api("/teachers", "POST", {
            userId: ids.foreign,
            teacherCode: "FOREIGN",
            fullName: "Forbidden foreign account",
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await api("/teachers", "POST", {
            userId: ids.candidate,
            teacherCode: "DUPLICATE",
            fullName: "Existing candidate",
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await api("/teachers", "POST", {
            userId: invited,
            teacherCode: "INVITED",
            fullName: "Pending membership",
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await api("/teachers", "POST", {
            userId: randomUUID(),
            teacherCode: "BLANK",
            fullName: "   ",
          })
        ).status,
      ).toBe(422);
      const foreignProfile = await getDb().teacher.create({
        data: {
          tenantId: foreign,
          userId: ids.foreign,
          teacherCode: "FOREIGN",
          fullName: "Private foreign teacher",
        },
      });
      for (const route of [
        `/teachers/${foreignProfile.id}`,
        `/teachers/${foreignProfile.id}/classes`,
      ])
        expect((await api(route)).status).toBe(404);
      expect(JSON.stringify((await api("/teachers")).body)).not.toContain(
        "Private foreign teacher",
      );
      await expect(
        getDb().teacher.create({
          data: {
            tenantId: tenant,
            userId: ids.foreign,
            teacherCode: "SQL-FOREIGN",
            fullName: "Rejected",
          },
        }),
      ).rejects.toThrow();
    });
    it("preserves assigned classes and audited versions, serializes overlapping assignments and blocks inactive accounts and READ_ONLY writes", async () => {
      const classId = await cls("TASSIGN");
      const assignment = {
        teacherId: profileId,
        effectiveFrom: "2026-11-01",
        effectiveTo: "2026-12-31",
      };
      const outcomes = await Promise.all([
        api(`/classes/${classId}/teachers`, "POST", assignment),
        api(`/classes/${classId}/teachers`, "POST", assignment),
      ]);
      expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
      await expect(
        getDb().classTeacher.create({
          data: {
            tenantId: tenant,
            classId,
            teacherId: profileId,
            effectiveFrom: new Date("2026-11-02Z"),
            effectiveTo: new Date("2026-11-03Z"),
          },
        }),
      ).rejects.toThrow();
      const classes = await api(`/teachers/${profileId}/classes?limit=1`);
      expect(classes.body.page.total).toBe(1);
      expect(classes.body.data[0]).toMatchObject({
        classId,
        classCode: "TASSIGN",
        className: "Synthetic TASSIGN",
        effectiveFrom: "2026-11-01",
        effectiveTo: "2026-12-31",
      });
      const change = {
        version: 1,
        fullName: "Synthetic inactive teacher",
        status: "INACTIVE",
        reason: "Verified teacher administration change",
      };
      expect(
        (
          await api(`/teachers/${profileId}`, "PATCH", {
            ...change,
            reason: "x          ",
          })
        ).status,
      ).toBe(422);
      const changed = await api(`/teachers/${profileId}`, "PATCH", change);
      expect(changed.status).toBe(200);
      expect(changed.body.data).toMatchObject({
        status: "INACTIVE",
        version: 2,
        accountReady: true,
      });
      expect(
        (await api(`/teachers/${profileId}`, "PATCH", change)).status,
      ).toBe(409);
      expect(
        (await api("/teachers?status=INACTIVE")).body.data.map(
          (v: { id: string }) => v.id,
        ),
      ).toEqual([profileId]);
      expect(
        (
          await api(`/classes/${classId}/teachers`, "POST", {
            ...assignment,
            effectiveFrom: "2026-11-02",
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await api(`/classes/${classId}/sessions/extra`, "POST", {
            teacherId: profileId,
            startsAt: "2026-11-03T08:00:00Z",
            endsAt: "2026-11-03T09:00:00Z",
          })
        ).status,
      ).toBe(422);
      expect(
        (await api(`/teachers/${profileId}/classes`)).body.page.total,
      ).toBe(1);
      await getDb().membershipRole.deleteMany({
        where: {
          role: "teacher",
          membership: { tenantId: tenant, userId: ids.teacher },
        },
      });
      expect((await api(`/teachers/${profileId}`)).body.data.accountReady).toBe(
        false,
      );
      expect(
        (
          await api(`/teachers/${profileId}`, "PATCH", {
            ...change,
            version: 2,
            status: "ACTIVE",
          })
        ).status,
      ).toBe(422);
      const actorAudit = await getDb().auditLog.findFirstOrThrow({
        where: {
          tenantId: tenant,
          resourceId: profileId,
          action: "teacher.updated",
        },
      });
      expect(actorAudit).toMatchObject({
        actorUserId: ids.owner,
        reason: change.reason,
      });
      await getDb().tenant.update({
        where: { id: tenant },
        data: { status: "READ_ONLY" },
      });
      try {
        expect((await api(`/teachers/${profileId}`)).status).toBe(200);
        expect(
          (
            await api(`/teachers/${profileId}`, "PATCH", {
              ...change,
              version: 2,
            })
          ).status,
        ).toBe(403);
        expect(
          (await api(`/classes/${classId}/teachers`, "POST", assignment))
            .status,
        ).toBe(403);
      } finally {
        await getDb().tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("rechecks a suspended academic actor after waiting for teacher create, update and assignment locks", async () => {
      const user = randomUUID();
      await member(user, "teacher");
      const existing = await api("/teachers", "POST", {
        userId: user,
        teacherCode: "WAITING",
        fullName: "Synthetic waiting teacher",
      });
      expect(existing.status).toBe(201);
      const classId = await cls("WAITCLASS");
      const next = randomUUID();
      await member(next, "teacher");
      const actor = await getDb().membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: tenant, userId: ids.academic } },
      });
      for (const [route, method, body] of [
        [
          "/teachers",
          "POST",
          {
            userId: next,
            teacherCode: "WAITCREATE",
            fullName: "Denied waiting create",
          },
        ],
        [
          `/teachers/${existing.body.data.id}`,
          "PATCH",
          {
            version: 1,
            fullName: "Denied waiting update",
            status: "INACTIVE",
            reason: "Suspended actor cannot update teacher",
          },
        ],
        [
          `/classes/${classId}/teachers`,
          "POST",
          {
            teacherId: existing.body.data.id,
            effectiveFrom: "2026-11-01",
            effectiveTo: "2026-12-31",
          },
        ],
      ] as const) {
        let pending: ReturnType<typeof api> | undefined;
        try {
          await getDb().$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenant}::uuid FOR UPDATE`;
              pending = api(route, method, body, tokens.academic);
              await expect
                .poll(async () => {
                  const rows = await tx.$queryRaw<
                    { waiting: bigint }[]
                  >`SELECT count(*) AS waiting FROM pg_locks pending JOIN pg_locks held ON held.locktype=pending.locktype AND held.transactionid=pending.transactionid AND held.granted WHERE NOT pending.granted AND held.pid=pg_backend_pid()`;
                  return Number(rows[0]?.waiting ?? 0n);
                })
                .toBeGreaterThan(0);
              await tx.membership.update({
                where: { id: actor.id },
                data: { status: "SUSPENDED", version: { increment: 1 } },
              });
            },
            { timeout: 10000 },
          );
          expect((await pending!).status).toBe(403);
        } finally {
          await getDb().membership.update({
            where: { id: actor.id },
            data: { status: "ACTIVE", version: { increment: 1 } },
          });
        }
      }
      expect(
        await getDb().teacher.count({
          where: { tenantId: tenant, userId: next },
        }),
      ).toBe(0);
      expect(
        (
          await getDb().teacher.findUniqueOrThrow({
            where: { id: existing.body.data.id },
          })
        ).version,
      ).toBe(1);
      expect(
        await getDb().classTeacher.count({
          where: { tenantId: tenant, classId },
        }),
      ).toBe(0);
    });
  });
}
