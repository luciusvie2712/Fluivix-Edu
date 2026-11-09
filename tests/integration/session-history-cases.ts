import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { PrismaClient, Role } from "@prisma/client";

export function sessionHistoryCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  function databaseUrl() {
    const value = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (
      !value ||
      !["127.0.0.1", "localhost"].includes(new URL(value).hostname) ||
      !new URL(value).pathname.endsWith("_test")
    )
      throw Error("Disposable local integration database required");
    return value;
  }
  async function api(path: string, token = "", method = "GET", body?: unknown) {
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
  async function fixture() {
    const db = getDb(),
      stamp = randomUUID(),
      passwordHash = await hash();
    const tenant = await db.tenant.create({
      data: {
        slug: "session-history-" + stamp,
        name: "Synthetic session history centre",
        timezone: "America/New_York",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    const plan = await db.plan.findUniqueOrThrow({
      where: { code: "TEST_PLAN" },
    });
    await db.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        startsAt: new Date("2020-01-01Z"),
        endsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    const owner = await db.user.create({
      data: {
        email: `session-history-owner-${stamp}@example.test`,
        displayName: "Synthetic history owner",
        passwordHash,
        status: "ACTIVE",
      },
    });
    const actor = await db.user.create({
      data: {
        email: `session-history-actor-${stamp}@example.test`,
        displayName: "Synthetic history reader",
        passwordHash,
        status: "ACTIVE",
      },
    });
    await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }, { role: "teacher" }] },
      },
    });
    const member = await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: actor.id,
        status: "ACTIVE",
        roles: {
          create: (
            [
              "owner",
              "manager",
              "academic_staff",
              "accountant",
              "teacher",
              "student",
              "guardian",
            ] as const
          ).map((role) => ({ role })),
        },
      },
    });
    async function token(userId: string, role: Role) {
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const login = await api("/mobile/auth/login", "", "POST", {
        email: user.email,
        password,
      });
      expect(login.status).toBe(200);
      const chosen = await api(
        "/auth/switch-context",
        login.body.data.accessToken,
        "POST",
        { tenantId: tenant.id, role },
      );
      expect(chosen.status).toBe(200);
      return chosen.body.data.accessToken as string;
    }
    const ownerToken = await token(owner.id, "owner");
    const teacher = await db.teacher.create({
      data: {
        tenantId: tenant.id,
        userId: actor.id,
        teacherCode: "HISTORY-TEACHER",
        fullName: "Synthetic assigned teacher",
      },
    });
    const otherTeacher = await db.teacher.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        teacherCode: "OTHER-TEACHER",
        fullName: "Synthetic other teacher",
      },
    });
    const room = await db.room.create({
      data: {
        tenantId: tenant.id,
        code: "HISTORY-ROOM",
        name: "Synthetic initial room",
        capacity: 20,
      },
    });
    const otherRoom = await db.room.create({
      data: {
        tenantId: tenant.id,
        code: "OTHER-ROOM",
        name: "Synthetic changed room",
        capacity: 20,
      },
    });
    const cls = await db.educationClass.create({
      data: {
        tenantId: tenant.id,
        code: "HISTORY-CLASS",
        name: "Synthetic history class",
        capacity: 10,
        startDate: new Date("2030-01-01Z"),
        endDate: new Date("2031-01-01Z"),
        roomId: room.id,
      },
    });
    const otherClass = await db.educationClass.create({
      data: {
        tenantId: tenant.id,
        code: "OTHER-CLASS",
        name: "Synthetic unassigned class",
        capacity: 10,
        startDate: new Date("2030-01-01Z"),
        endDate: new Date("2031-01-01Z"),
      },
    });
    const assignment = await db.classTeacher.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        teacherId: teacher.id,
        effectiveFrom: new Date("2030-01-01Z"),
      },
    });
    await db.classTeacher.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        teacherId: otherTeacher.id,
        effectiveFrom: new Date("2030-01-01Z"),
      },
    });
    await db.classTeacher.create({
      data: {
        tenantId: tenant.id,
        classId: otherClass.id,
        teacherId: otherTeacher.id,
        effectiveFrom: new Date("2030-01-01Z"),
      },
    });
    const created = await api(
      `/classes/${cls.id}/sessions/extra`,
      ownerToken,
      "POST",
      {
        teacherId: teacher.id,
        roomId: room.id,
        startsAt: "2030-06-03T13:00:00Z",
        endsAt: "2030-06-03T14:00:00Z",
      },
    );
    expect(created.status).toBe(201);
    const sessionId = created.body.data.id as string;
    const otherSession = await db.classSession.create({
      data: {
        tenantId: tenant.id,
        classId: otherClass.id,
        teacherId: otherTeacher.id,
        scheduledDate: new Date("2030-06-04Z"),
        startsAt: new Date("2030-06-04T13:00:00Z"),
        endsAt: new Date("2030-06-04T14:00:00Z"),
      },
    });
    const foreign = await db.tenant.create({
      data: {
        slug: "foreign-session-history-" + stamp,
        name: "FOREIGN_HISTORY_CENTRE",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    const foreignActor = await db.user.create({
      data: {
        email: `foreign-history-${stamp}@example.test`,
        displayName: "FOREIGN_HISTORY_ACTOR",
        status: "ACTIVE",
      },
    });
    await db.membership.create({
      data: {
        tenantId: foreign.id,
        userId: foreignActor.id,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }, { role: "teacher" }] },
      },
    });
    const foreignTeacher = await db.teacher.create({
      data: {
        tenantId: foreign.id,
        userId: foreignActor.id,
        teacherCode: "FOREIGN",
        fullName: "FOREIGN_HISTORY_TEACHER",
      },
    });
    const foreignRoom = await db.room.create({
      data: {
        tenantId: foreign.id,
        code: "FOREIGN",
        name: "FOREIGN_HISTORY_ROOM",
        capacity: 20,
      },
    });
    const foreignClass = await db.educationClass.create({
      data: {
        tenantId: foreign.id,
        code: "FOREIGN",
        name: "FOREIGN_HISTORY_CLASS",
        capacity: 10,
        startDate: new Date("2030-01-01Z"),
        endDate: new Date("2031-01-01Z"),
      },
    });
    const foreignSession = await db.classSession.create({
      data: {
        tenantId: foreign.id,
        classId: foreignClass.id,
        teacherId: foreignTeacher.id,
        scheduledDate: new Date("2030-06-03Z"),
        startsAt: new Date("2030-06-03T13:00:00Z"),
        endsAt: new Date("2030-06-03T14:00:00Z"),
      },
    });
    const path = `/sessions/${sessionId}/changes`;
    async function move(day = "2030-06-05", teacherId = teacher.id) {
      const current = await db.classSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const changed = await api(
        `/sessions/${sessionId}/reschedule`,
        ownerToken,
        "POST",
        {
          sessionVersion: current.version,
          teacherId,
          roomId: otherRoom.id,
          startsAt: day + "T13:00:00Z",
          endsAt: day + "T14:00:00Z",
          reason: "Synthetic authorized history reschedule",
        },
      );
      expect(changed.status).toBe(201);
      return changed.body.data;
    }
    async function cancel() {
      const current = await db.classSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const result = await api(
        `/sessions/${sessionId}/cancel`,
        ownerToken,
        "POST",
        {
          sessionVersion: current.version,
          reason: "Synthetic authorized history cancellation",
        },
      );
      expect(result.status).toBe(201);
    }
    async function stored() {
      return db.sessionChange.findMany({
        where: { tenantId: tenant.id, sessionId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    }
    async function injected(
      patch: Record<string, unknown> = {},
      beforePatch: Record<string, unknown> = {},
    ) {
      const old = {
        startsAt: "2030-06-03T13:00:00.000Z",
        endsAt: "2030-06-03T14:00:00.000Z",
        scheduledDate: "2030-06-03",
        teacherId: teacher.id,
        roomId: room.id,
        status: "SCHEDULED",
        version: 1,
        ...beforePatch,
      };
      const next = { ...old, version: 2, ...patch };
      return db.sessionChange.create({
        data: {
          tenantId: tenant.id,
          sessionId,
          oldSnapshot: old,
          newSnapshot: next,
          actorId: owner.id,
          reason: "Synthetic injected history boundary fixture",
        },
      });
    }
    return {
      db,
      tenant,
      actor,
      owner,
      member,
      token,
      ownerToken,
      teacher,
      otherTeacher,
      room,
      otherRoom,
      cls,
      assignment,
      sessionId,
      otherSession,
      foreignSession,
      foreignActor,
      foreignTeacher,
      foreignRoom,
      path,
      move,
      cancel,
      stored,
      injected,
    };
  }

  it("session change history returns an honest empty page and rejects anonymous and malformed queries", async () => {
    const f = await fixture();
    const empty = await api(f.path, f.ownerToken);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.page).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
    expect((await api(f.path)).status).toBe(401);
    expect(
      (await api("/sessions/not-a-uuid/changes", f.ownerToken)).status,
    ).toBe(400);
    for (const query of [
      "page=0",
      "page=no",
      "limit=0",
      "limit=101",
      "search=unsupported",
    ])
      expect(
        (await api(f.path + "?" + query, f.ownerToken)).status,
        query,
      ).toBe(422);
    expect(
      (await api(f.path + "?page=2147483647&limit=100", f.ownerToken)).status,
    ).toBe(422);
  });
  it("actual reschedule and cancellation history exposes exact immutable before/after facts and minimal current labels", async () => {
    const f = await fixture();
    await f.move();
    await f.cancel();
    const result = await api(f.path, f.ownerToken);
    expect(result.status).toBe(200);
    expect(result.body.page.total).toBe(2);
    expect(
      result.body.data.map((v: { changeType: string }) => v.changeType),
    ).toEqual(["CANCELLED", "RESCHEDULED"]);
    const [cancelled, moved] = result.body.data;
    expect(cancelled.before.status).toBe("SCHEDULED");
    expect(cancelled.after.status).toBe("CANCELLED");
    expect(cancelled.before.version).toBe(2);
    expect(cancelled.after.version).toBe(3);
    expect(moved.before).toMatchObject({
      scheduledDate: "2030-06-03",
      startsAt: "2030-06-03T13:00:00.000Z",
      roomId: f.room.id,
      roomName: f.room.name,
      teacherName: f.teacher.fullName,
      version: 1,
    });
    expect(moved.after).toMatchObject({
      scheduledDate: "2030-06-05",
      roomId: f.otherRoom.id,
      roomName: f.otherRoom.name,
      version: 2,
    });
    expect(moved.actorId).toBe(f.owner.id);
    expect(moved.actorDisplayName).toBe(f.owner.displayName);
    expect(Object.keys(moved).sort()).toEqual([
      "actorDisplayName",
      "actorId",
      "after",
      "before",
      "changeType",
      "createdAt",
      "id",
      "reason",
    ]);
    expect(JSON.stringify(result.body)).not.toContain(f.owner.email);
    expect(JSON.stringify(result.body)).not.toContain(f.actor.email);
    const persisted = await f.stored();
    expect(persisted.map((v) => v.changeType)).toEqual([
      "CANCELLED",
      "RESCHEDULED",
    ]);
  });
  it("session history has deterministic bounded pagination and never mixes another session", async () => {
    const f = await fixture();
    for (let i = 0; i < 25; i++)
      await f.move(i % 2 ? "2030-06-05" : "2030-06-06");
    const persisted = await f.stored();
    const first = await api(f.path, f.ownerToken),
      second = await api(f.path + "?page=2", f.ownerToken);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.page).toEqual({
      page: 1,
      limit: 20,
      total: 25,
      totalPages: 2,
    });
    expect(second.body.data).toHaveLength(5);
    const ids = [...first.body.data, ...second.body.data].map(
      (v: { id: string }) => v.id,
    );
    expect(ids).toEqual(persisted.map((v) => v.id));
    expect(new Set(ids).size).toBe(25);
    expect(
      (await api(`/sessions/${f.otherSession.id}/changes`, f.ownerToken)).body
        .data,
    ).toEqual([]);
    const outside = await api(f.path + "?page=3", f.ownerToken);
    expect(outside.status).toBe(200);
    expect(outside.body.data).toEqual([]);
    expect(outside.body.page.total).toBe(25);
  });
  it.each(["owner", "manager", "academic_staff", "teacher"] as const)(
    "selected %s reads authorized session history",
    async (role) => {
      const f = await fixture();
      await f.move();
      const result = await api(f.path, await f.token(f.actor.id, role));
      expect(result.status).toBe(200);
      expect(result.body.page.total).toBe(1);
    },
  );
  it.each(["accountant", "student", "guardian"] as const)(
    "selected %s cannot inherit session history from other held roles",
    async (role) => {
      const f = await fixture();
      await f.move();
      const result = await api(f.path, await f.token(f.actor.id, role));
      expect(result.status).toBe(403);
      expect(result.body.data).toBeUndefined();
    },
  );
  it("teacher and owner mask foreign sessions while teacher scope excludes another teacher's session", async () => {
    const f = await fixture(),
      teacherToken = await f.token(f.actor.id, "teacher");
    for (const token of [teacherToken, f.ownerToken]) {
      const foreign = await api(
        `/sessions/${f.foreignSession.id}/changes`,
        token,
      );
      expect(foreign.status).toBe(404);
      expect(JSON.stringify(foreign.body)).not.toContain("FOREIGN_HISTORY");
    }
    expect(
      (await api(`/sessions/${f.otherSession.id}/changes`, teacherToken))
        .status,
    ).toBe(404);
    expect(
      (await api(`/sessions/${randomUUID()}/changes`, f.ownerToken)).status,
    ).toBe(404);
  });
  it("teacher history stops after actual reassignment even when the old class assignment remains", async () => {
    const f = await fixture(),
      teacherToken = await f.token(f.actor.id, "teacher");
    await f.move();
    expect((await api(f.path, teacherToken)).status).toBe(200);
    await f.move("2030-06-06", f.otherTeacher.id);
    expect((await api(f.path, teacherToken)).status).toBe(404);
    const owner = await api(f.path, f.ownerToken);
    expect(owner.status).toBe(200);
    expect(owner.body.data[0].after.teacherName).toBe(f.otherTeacher.fullName);
  });
  it("teacher history requires the current dated class assignment and active teacher profile", async () => {
    const f = await fixture(),
      teacherToken = await f.token(f.actor.id, "teacher");
    await f.move();
    await f.db.classTeacher.update({
      where: { id: f.assignment.id },
      data: { effectiveTo: new Date("2030-06-02Z") },
    });
    expect((await api(f.path, teacherToken)).status).toBe(404);
    await f.db.classTeacher.update({
      where: { id: f.assignment.id },
      data: { effectiveTo: null },
    });
    await f.db.teacher.update({
      where: { id: f.teacher.id },
      data: { status: "INACTIVE" },
    });
    expect((await api(f.path, teacherToken)).status).toBe(404);
  });
  it("history is read-only in READ_ONLY mode and does not authorize another mutation", async () => {
    const f = await fixture();
    await f.move();
    const before = await f.stored();
    await f.db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    expect((await api(f.path, f.ownerToken)).status).toBe(200);
    expect(
      (
        await api(`/sessions/${f.sessionId}/cancel`, f.ownerToken, "POST", {
          sessionVersion: 2,
          reason: "Synthetic blocked read-only cancellation",
        })
      ).status,
    ).toBe(403);
    expect(await f.stored()).toEqual(before);
  });
  it.each(["SUSPENDED", "TERMINATED"] as const)(
    "session history denies a %s centre",
    async (status) => {
      const f = await fixture();
      await f.move();
      await f.db.tenant.update({
        where: { id: f.tenant.id },
        data: { status },
      });
      expect((await api(f.path, f.ownerToken)).status).toBe(403);
    },
  );
  it("session snapshot output strips unknown personal JSON fields and keeps only the declared contract", async () => {
    const f = await fixture();
    await f.injected(
      { email: "PRIVATE_HISTORY_EMAIL", medical: "PRIVATE_HISTORY_MEDICAL" },
      { phone: "PRIVATE_HISTORY_PHONE" },
    );
    const result = await api(f.path, f.ownerToken);
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).not.toContain("PRIVATE_HISTORY");
    const keys = [
      "endsAt",
      "roomId",
      "roomName",
      "scheduledDate",
      "startsAt",
      "status",
      "teacherId",
      "teacherName",
      "version",
    ];
    expect(Object.keys(result.body.data[0].before).sort()).toEqual(keys);
    expect(Object.keys(result.body.data[0].after).sort()).toEqual(keys);
  });
  it.each(["roomId", "teacherId"] as const)(
    "foreign snapshot %s fails closed without leaking another centre's names or IDs",
    async (field) => {
      const f = await fixture(),
        id = field === "roomId" ? f.foreignRoom.id : f.foreignTeacher.id;
      await f.injected({ [field]: id });
      const result = await api(f.path, f.ownerToken);
      expect(result.status).toBe(422);
      expect(result.body.data).toBeUndefined();
      expect(JSON.stringify(result.body)).not.toContain(id);
      expect(JSON.stringify(result.body)).not.toContain("FOREIGN_HISTORY");
    },
  );
  it("corrupt stored snapshot rejects the page instead of returning partial or fabricated history", async () => {
    const f = await fixture();
    await f.move();
    await f.injected({ startsAt: "PRIVATE_INVALID_TIME" });
    const result = await api(f.path, f.ownerToken);
    expect(result.status).toBe(422);
    expect(result.body.data).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain("PRIVATE_INVALID_TIME");
  });
  it("database history retains append-only and cross-tenant actor constraints", async () => {
    const f = await fixture();
    await f.move();
    const before = await f.stored(),
      original = before[0];
    expect(original).toBeDefined();
    const pg = new Client({ connectionString: databaseUrl() });
    await pg.connect();
    try {
      await expect(
        pg.query("UPDATE session_changes SET reason=$1 WHERE id=$2", [
          "Synthetic blocked rewrite",
          original!.id,
        ]),
      ).rejects.toMatchObject({ code: "P0001" });
      await expect(
        pg.query("DELETE FROM session_changes WHERE id=$1", [original!.id]),
      ).rejects.toMatchObject({ code: "P0001" });
      await expect(
        pg.query(
          "INSERT INTO session_changes(id,tenant_id,session_id,old_snapshot,new_snapshot,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            f.tenant.id,
            f.sessionId,
            original!.oldSnapshot,
            original!.newSnapshot,
            "Synthetic foreign history actor",
            f.foreignActor.id,
          ],
        ),
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "session_change_actor_tenant_fk",
      });
      expect(await f.stored()).toEqual(before);
    } finally {
      await pg.end();
    }
  });
  it("queued history rechecks the current reader after an actual owner revocation acquires the canonical lock", async () => {
    const f = await fixture();
    await f.move();
    const manager = await f.token(f.actor.id, "manager"),
      before = await f.stored();
    const locker = new Client({
        connectionString: databaseUrl(),
      }),
      pending: Promise<unknown>[] = [];
    await locker.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(
        "SELECT id FROM tenants WHERE id=$1::uuid FOR UPDATE",
        [f.tenant.id],
      );
      const pid = (
        await locker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      async function blocked(n: number) {
        await expect
          .poll(
            async () => {
              const rows = await f.db.$queryRaw<
                { n: number }[]
              >`WITH RECURSIVE blocked AS (SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND ${pid}::integer=ANY(pg_blocking_pids(pid)) UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.datname=current_database()) SELECT count(DISTINCT pid)::integer AS n FROM blocked`;
              return rows[0]!.n;
            },
            { timeout: 5000, interval: 20 },
          )
          .toBeGreaterThanOrEqual(n);
      }
      const revoke = api(`/staff/${f.member.id}`, f.ownerToken, "PATCH", {
        version: f.member.version,
        status: "SUSPENDED",
        reason: "Synthetic queued session history revocation",
      });
      pending.push(revoke);
      await blocked(1);
      const attempted = api(f.path, manager);
      pending.push(attempted);
      await blocked(2);
      await locker.query("COMMIT");
      expect((await revoke).status).toBe(200);
      expect((await attempted).status).toBe(403);
      expect(await f.stored()).toEqual(before);
      expect((await api(f.path, f.ownerToken)).status).toBe(200);
    } finally {
      await locker.query("ROLLBACK").catch(() => {});
      await Promise.allSettled(pending);
      await locker.end();
    }
  });
}
