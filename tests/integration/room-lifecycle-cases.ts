import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { PrismaClient, Role } from "@prisma/client";

export function roomLifecycleCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  async function api(
    path: string,
    method: string,
    token: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(getBase() + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function fixture() {
    const db = getDb(),
      stamp = randomUUID(),
      ownerId = randomUUID(),
      actorId = randomUUID(),
      passwordHash = await hash();
    const plan = await db.plan.findUniqueOrThrow({
        where: { code: "TEST_PLAN" },
      }),
      tenants = [];
    for (const kind of ["own", "foreign"]) {
      const t = await db.tenant.create({
        data: {
          slug: `room-${kind}-${stamp}`,
          name:
            kind === "own" ? "Synthetic room centre" : "FOREIGN_ROOM_CENTRE",
          status: "ACTIVE",
          subscriptionEndsAt: new Date("2040-01-01Z"),
          graceUntil: new Date("2040-02-01Z"),
        },
      });
      await db.subscription.create({
        data: {
          tenantId: t.id,
          planId: plan.id,
          startsAt: new Date("2020-01-01Z"),
          endsAt: new Date("2040-01-01Z"),
          graceUntil: new Date("2040-02-01Z"),
        },
      });
      tenants.push(t);
    }
    const tenant = tenants[0]!,
      foreign = tenants[1]!;
    for (const id of [ownerId, actorId])
      await db.user.create({
        data: {
          id,
          email: id + "@example.test",
          displayName:
            id === ownerId
              ? "Synthetic primary room owner"
              : "Synthetic multi-role room operator",
          passwordHash,
          status: "ACTIVE",
        },
      });
    await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: ownerId,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }] },
      },
    });
    const member = await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: actorId,
        status: "ACTIVE",
        roles: {
          create: (
            [
              "owner",
              "manager",
              "academic_staff",
              "teacher",
              "accountant",
            ] as const
          ).map((role) => ({ role })),
        },
      },
    });
    const foreignRoom = await db.room.create({
      data: {
        tenantId: foreign.id,
        code: "FOREIGN",
        name: "FOREIGN_ROOM_MARKER",
        capacity: 8,
      },
    });
    async function token(userId: string, role: Role) {
      const login = await api("/mobile/auth/login", "POST", "", {
        email: userId + "@example.test",
        password,
      });
      expect(login.status).toBe(200);
      const selected = await api(
        "/auth/switch-context",
        "POST",
        login.body.data.accessToken,
        { tenantId: tenant.id, role },
      );
      expect(selected.status).toBe(200);
      return selected.body.data.accessToken as string;
    }
    const owner = await token(ownerId, "owner");
    async function room(code = "ROOM", capacity = 10, who = owner) {
      const r = await api("/rooms", "POST", who, {
        code,
        name: "Synthetic room " + code,
        capacity,
      });
      expect(r.status).toBe(201);
      expect(r.body.data.version).toBe(1);
      return r.body.data;
    }
    async function change(
      r: {
        id: string;
        name: string;
        version: number;
        capacity: number;
        active: boolean;
      },
      patch: Record<string, unknown> = {},
      who = owner,
    ) {
      return api("/rooms/" + r.id, "PATCH", who, {
        name: r.name,
        version: r.version,
        capacity: r.capacity,
        active: r.active,
        reason: "Synthetic reviewed room lifecycle change",
        ...patch,
      });
    }
    async function teaching(roomId?: string) {
      const t = await api("/teachers", "POST", owner, {
        userId: actorId,
        teacherCode: "ROOM-TEACHER",
        fullName: "Synthetic room teacher",
      });
      expect(t.status).toBe(201);
      const c = await api("/classes", "POST", owner, {
        code: "ROOM-CLASS",
        name: "Synthetic room class",
        capacity: 5,
        roomId,
        startDate: "2030-01-01",
        endDate: "2030-12-31",
      });
      expect(c.status).toBe(201);
      expect(
        (
          await api(`/classes/${c.body.data.id}/teachers`, "POST", owner, {
            teacherId: t.body.data.id,
            effectiveFrom: "2030-01-01",
          })
        ).status,
      ).toBe(201);
      return { teacher: t.body.data, cls: c.body.data };
    }
    return {
      db,
      tenant,
      foreign,
      ownerId,
      actorId,
      member,
      foreignRoom,
      owner,
      token,
      room,
      change,
      teaching,
    };
  }
  it("versioned class default room changes validate current tenant capacity and preserve existing explicit session assignments", async () => {
    const f = await fixture(),
      old = await f.room("OLD"),
      next = await f.room("NEXT", 8),
      small = await f.room("SMALL", 4),
      inactive = await f.room("INACTIVE");
    expect((await f.change(inactive, { active: false })).status).toBe(200);
    const { cls, teacher } = await f.teaching(old.id);
    const session = await api(
      `/classes/${cls.id}/sessions/extra`,
      "POST",
      f.owner,
      {
        teacherId: teacher.id,
        roomId: old.id,
        startsAt: "2030-06-03T01:00:00Z",
        endsAt: "2030-06-03T02:00:00Z",
      },
    );
    expect(session.status).toBe(201);
    const before = await f.db.classSession.findUniqueOrThrow({
      where: { id: session.body.data.id },
    });
    const input = {
      version: cls.version,
      name: cls.name,
      capacity: 5,
      reason: "Synthetic reviewed default room update",
    };
    for (const [roomId, expected] of [
      [f.foreignRoom.id, 404],
      [inactive.id, 404],
      [small.id, 409],
    ] as const) {
      expect(
        (
          await api(`/classes/${cls.id}`, "PATCH", f.owner, {
            ...input,
            roomId,
          })
        ).status,
      ).toBe(expected);
      expect(
        await f.db.educationClass.findUniqueOrThrow({ where: { id: cls.id } }),
      ).toMatchObject({ version: 1, roomId: old.id });
    }
    const changed = await api(`/classes/${cls.id}`, "PATCH", f.owner, {
      ...input,
      roomId: next.id,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ roomId: next.id, version: 2 });
    expect(
      (
        await api(`/classes/${cls.id}`, "PATCH", f.owner, {
          ...input,
          roomId: null,
        })
      ).status,
    ).toBe(409);
    const cleared = await api(`/classes/${cls.id}`, "PATCH", f.owner, {
      ...input,
      version: 2,
      roomId: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({ roomId: null, version: 3 });
    expect(
      await f.db.classSession.findUniqueOrThrow({ where: { id: before.id } }),
    ).toEqual(before);
    expect(
      await f.db.auditLog.count({
        where: {
          tenantId: f.tenant.id,
          resourceId: cls.id,
          action: "class.updated",
        },
      }),
    ).toBe(2);
  });
  it("legacy inherited future rule or session prevents silent class default room movement until an explicit assignment is reviewed", async () => {
    const f = await fixture(),
      old = await f.room("OLD"),
      next = await f.room("NEXT");
    const { cls, teacher } = await f.teaching(old.id);
    const rule = await api(
      `/classes/${cls.id}/schedule-rules`,
      "POST",
      f.owner,
      {
        teacherId: teacher.id,
        weekday: 1,
        localStart: "08:00",
        localEnd: "09:00",
        validFrom: "2030-06-03",
        validTo: "2030-06-24",
      },
    );
    expect(rule.status).toBe(201);
    await f.db.scheduleRule.update({
      where: { id: rule.body.data.id },
      data: { roomId: null },
    });
    const input = {
      version: cls.version,
      name: cls.name,
      capacity: 5,
      roomId: next.id,
      reason: "Synthetic reviewed inherited room change",
    };
    expect(
      (await api(`/classes/${cls.id}`, "PATCH", f.owner, input)).status,
    ).toBe(409);
    await f.db.scheduleRule.update({
      where: { id: rule.body.data.id },
      data: { roomId: old.id },
    });
    const session = await api(
      `/classes/${cls.id}/sessions/extra`,
      "POST",
      f.owner,
      {
        teacherId: teacher.id,
        startsAt: "2030-06-03T03:00:00Z",
        endsAt: "2030-06-03T04:00:00Z",
      },
    );
    expect(session.status).toBe(201);
    await f.db.classSession.update({
      where: { id: session.body.data.id },
      data: { roomId: null },
    });
    expect(
      (await api(`/classes/${cls.id}`, "PATCH", f.owner, input)).status,
    ).toBe(409);
    expect(
      await f.db.educationClass.findUniqueOrThrow({ where: { id: cls.id } }),
    ).toMatchObject({ roomId: old.id, version: 1 });
    expect(
      await f.db.auditLog.count({
        where: { tenantId: f.tenant.id, action: "class.updated" },
      }),
    ).toBe(0);
    await f.db.classSession.update({
      where: { id: session.body.data.id },
      data: { roomId: old.id },
    });
    const beforeRule = await f.db.scheduleRule.findUniqueOrThrow({
        where: { id: rule.body.data.id },
      }),
      beforeSession = await f.db.classSession.findUniqueOrThrow({
        where: { id: session.body.data.id },
      });
    expect(
      (await api(`/classes/${cls.id}`, "PATCH", f.owner, input)).status,
    ).toBe(200);
    expect(
      await f.db.scheduleRule.findUniqueOrThrow({
        where: { id: beforeRule.id },
      }),
    ).toEqual(beforeRule);
    expect(
      await f.db.classSession.findUniqueOrThrow({
        where: { id: beforeSession.id },
      }),
    ).toEqual(beforeSession);
  });
  it("room directory, detail and history enforce tenant/selected-role scope and expose real filtered paginated data", async () => {
    const f = await fixture(),
      own = await f.room("SCOPED");
    expect((await api("/rooms", "GET", "")).status).toBe(401);
    const list = await api(
      "/rooms?search=SCOPED&page=1&limit=1&active=true",
      "GET",
      f.owner,
    );
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(own.id);
    expect(JSON.stringify(list.body)).not.toContain("FOREIGN_ROOM_MARKER");
    for (const path of [
      "/rooms/" + f.foreignRoom.id,
      "/rooms/" + f.foreignRoom.id + "/history",
    ])
      expect((await api(path, "GET", f.owner)).status).toBe(404);
    expect(
      (
        await f.change(
          { ...own, id: f.foreignRoom.id },
          { name: "Foreign mutation" },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await api("/rooms", "GET", f.owner, undefined, {
          "x-tenant-id": f.foreign.id,
        })
      ).status,
    ).toBe(403);
    for (const role of ["manager", "academic_staff"] as const) {
      const selected = await f.token(f.actorId, role),
        made = await f.room(role.toUpperCase(), 8, selected);
      expect(
        (await f.change(made, { name: "Operational " + role }, selected))
          .status,
      ).toBe(200);
      expect(
        (await api("/rooms/" + own.id + "/history", "GET", selected)).status,
      ).toBe(200);
      expect(
        (await api("/tenant/settings", "PATCH", selected, {})).status,
      ).toBe(403);
    }
    for (const role of ["teacher", "accountant"] as const) {
      const selected = await f.token(f.actorId, role);
      for (const path of [
        "/rooms",
        "/rooms/" + own.id,
        "/rooms/" + own.id + "/history",
      ])
        expect((await api(path, "GET", selected)).status).toBe(403);
      expect(
        (await f.change(own, { name: "Denied role" }, selected)).status,
      ).toBe(403);
    }
    expect(
      await f.db.room.findUniqueOrThrow({ where: { id: f.foreignRoom.id } }),
    ).toEqual(f.foreignRoom);
  });
  it("room validation rejects blank/overposted commands, duplicate codes, invalid integer bounds and nested foreign room references", async () => {
    const f = await fixture(),
      valid = {
        code: "VALID",
        name: "  Synthetic trimmed room  ",
        capacity: 1000,
      };
    for (const body of [
      { ...valid, name: "   " },
      { ...valid, capacity: 0 },
      { ...valid, capacity: 1001 },
      { ...valid, capacity: 1.2 },
      { ...valid, code: "BAD CODE" },
      { ...valid, tenantId: f.foreign.id },
    ])
      expect((await api("/rooms", "POST", f.owner, body)).status).toBe(422);
    const made = await api("/rooms", "POST", f.owner, valid);
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({
      name: "Synthetic trimmed room",
      capacity: 1000,
      version: 1,
    });
    expect((await api("/rooms", "POST", f.owner, valid)).status).toBe(409);
    expect(
      (await f.change(made.body.data, { code: "ILLEGAL-CHANGE" })).status,
    ).toBe(422);
    expect((await f.change(made.body.data, { active: "false" })).status).toBe(
      422,
    );
    expect((await api("/rooms?active=maybe", "GET", f.owner)).status).toBe(422);
    expect(
      (await api("/rooms?page=9999999999999999999", "GET", f.owner)).status,
    ).toBe(422);
    expect(
      (
        await api("/classes", "POST", f.owner, {
          code: "FOREIGN-ROOM",
          name: "Synthetic foreign room class",
          capacity: 5,
          roomId: f.foreignRoom.id,
          startDate: "2030-01-01",
          endDate: "2030-12-31",
        })
      ).status,
    ).toBe(404);
    expect(await f.db.room.count({ where: { tenantId: f.tenant.id } })).toBe(1);
  });
  it("room versions, immutable identity and retained typed history prevent stale/no-op edits without inventing historical actor names", async () => {
    const f = await fixture(),
      first = await f.room();
    expect(
      (
        await f.db.room.update({
          where: { id: first.id },
          data: { version: 999 },
        })
      ).version,
    ).toBe(1);
    const edited = await f.change(first, {
      name: "Reviewed renamed room",
      capacity: 12,
      active: false,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      id: first.id,
      code: first.code,
      version: 2,
      active: false,
    });
    expect((await f.change(first, { name: "Stale name" })).status).toBe(409);
    expect((await f.change(edited.body.data)).status).toBe(409);
    await expect(
      f.db.room.update({ where: { id: first.id }, data: { code: "CHANGED" } }),
    ).rejects.toThrow(/room identity is immutable/);
    await expect(
      f.db.room.update({
        where: { id: first.id },
        data: { tenantId: f.foreign.id },
      }),
    ).rejects.toThrow(/room identity is immutable/);
    const active = await f.change(edited.body.data, { active: true });
    expect(active.status).toBe(200);
    expect(active.body.data.version).toBe(3);
    await f.db.user.update({
      where: { id: f.ownerId },
      data: { displayName: "Current renamed operator" },
    });
    const history = await api(
      "/rooms/" + first.id + "/history",
      "GET",
      f.owner,
    );
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(3);
    expect(
      history.body.data.every(
        (x: { actorName: string; hasDetails: boolean }) =>
          x.actorName === "Synthetic primary room owner" && x.hasDetails,
      ),
    ).toBe(true);
    expect(
      history.body.data.find(
        (x: { after: { version: number } }) => x.after.version === 2,
      ),
    ).toMatchObject({
      before: { name: first.name, active: true, version: 1 },
      after: { name: "Reviewed renamed room", active: false, version: 2 },
      reason: "Synthetic reviewed room lifecycle change",
    });
    expect(
      (await f.db.room.findUniqueOrThrow({ where: { id: first.id } })).tenantId,
    ).toBe(f.tenant.id);
  });
  it("concurrent room edits commit one version and one update audit", async () => {
    const f = await fixture(),
      room = await f.room();
    const results = await Promise.all([
      f.change(room, { name: "Concurrent first" }),
      f.change(room, { name: "Concurrent second" }),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
    const stored = await f.db.room.findUniqueOrThrow({
      where: { id: room.id },
    });
    expect(stored.version).toBe(2);
    expect(["Concurrent first", "Concurrent second"]).toContain(stored.name);
    expect(
      await f.db.auditLog.count({
        where: {
          tenantId: f.tenant.id,
          resourceId: room.id,
          action: "room.updated",
        },
      }),
    ).toBe(1);
  });
  it("room archive and shrink protect default class, future rule and explicit session overrides while cancelled/closed history retains room references", async () => {
    const f = await fixture(),
      home = await f.room("HOME", 20),
      override = await f.room("OVERRIDE", 10),
      weekly = await f.room("WEEKLY", 6),
      t = await f.teaching(home.id);
    const rule = await api(
      `/classes/${t.cls.id}/schedule-rules`,
      "POST",
      f.owner,
      {
        teacherId: t.teacher.id,
        roomId: weekly.id,
        weekday: 1,
        localStart: "10:00",
        localEnd: "11:00",
        validFrom: "2030-06-03",
        validTo: "2030-06-24",
      },
    );
    expect(rule.status).toBe(201);
    const session = await api(
      `/classes/${t.cls.id}/sessions/extra`,
      "POST",
      f.owner,
      {
        teacherId: t.teacher.id,
        roomId: override.id,
        startsAt: "2030-06-04T01:00:00Z",
        endsAt: "2030-06-04T02:00:00Z",
      },
    );
    expect(session.status).toBe(201);
    for (const r of [home, override, weekly]) {
      expect((await f.change(r, { active: false })).status).toBe(409);
      expect((await f.change(r, { capacity: 4 })).status).toBe(409);
    }
    expect(
      (await api("/rooms/" + weekly.id, "GET", f.owner)).body.data.usage,
    ).toMatchObject({ futureActiveRules: 1, requiredCapacity: 5 });
    expect(
      (await api("/rooms/" + override.id, "GET", f.owner)).body.data.usage,
    ).toMatchObject({ upcomingOrOngoingSessions: 1, requiredCapacity: 5 });
    expect(
      (
        await api(`/sessions/${session.body.data.id}/cancel`, "POST", f.owner, {
          sessionVersion: session.body.data.version,
          reason: "Synthetic cancelled booking before room archive",
        })
      ).status,
    ).toBe(201);
    const current = await api("/classes/" + t.cls.id, "GET", f.owner);
    expect(
      (
        await api(`/classes/${t.cls.id}/close`, "POST", f.owner, {
          version: current.body.data.version,
          reason: "Synthetic class closure retains room history",
        })
      ).status,
    ).toBe(201);
    for (const r of [home, override, weekly])
      expect((await f.change(r, { active: false })).status).toBe(200);
    expect(
      await f.db.educationClass.findUniqueOrThrow({ where: { id: t.cls.id } }),
    ).toMatchObject({ status: "CLOSED", roomId: home.id });
    expect(
      await f.db.classSession.findUniqueOrThrow({
        where: { id: session.body.data.id },
      }),
    ).toMatchObject({ status: "CANCELLED", roomId: override.id });
    expect(
      await f.db.scheduleRule.findUniqueOrThrow({
        where: { id: rule.body.data.id },
      }),
    ).toMatchObject({ active: false, roomId: weekly.id });
  });
  it("room history projects only known versioned fields and never returns arbitrary legacy or foreign audit payloads", async () => {
    const f = await fixture(),
      r = await f.room();
    const legacy = await f.db.auditLog.create({
      data: {
        tenantId: f.tenant.id,
        actorUserId: f.ownerId,
        action: "room.created",
        resourceId: r.id,
        traceId: randomUUID(),
        reason: "LEGACY_PRIVATE_REASON",
        metadata: { arbitrary: "LEGACY_PRIVATE_PAYLOAD" },
      },
    });
    const malformed = await f.db.auditLog.create({
      data: {
        tenantId: f.tenant.id,
        actorUserId: f.ownerId,
        action: "room.updated",
        resourceId: r.id,
        traceId: randomUUID(),
        reason: "MALFORMED_PRIVATE_REASON",
        metadata: {
          recordType: "ROOM_CHANGE",
          schemaVersion: 99,
          arbitrary: "MALFORMED_PRIVATE_PAYLOAD",
        },
      },
    });
    const foreign = await f.db.auditLog.create({
      data: {
        tenantId: f.foreign.id,
        action: "room.updated",
        resourceId: r.id,
        traceId: randomUUID(),
        metadata: { arbitrary: "FOREIGN_ROOM_HISTORY" },
      },
    });
    const result = await api("/rooms/" + r.id + "/history", "GET", f.owner);
    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(3);
    expect(JSON.stringify(result.body)).not.toMatch(
      /PRIVATE_PAYLOAD|PRIVATE_REASON|FOREIGN_ROOM_HISTORY/,
    );
    expect(JSON.stringify(result.body)).not.toContain(foreign.id);
    for (const id of [legacy.id, malformed.id])
      expect(
        result.body.data.find((x: { id: string }) => x.id === id),
      ).toMatchObject({
        hasDetails: false,
        actorName: null,
        reason: null,
        before: null,
        after: null,
      });
    expect(
      await f.db.auditLog.findUniqueOrThrow({ where: { id: legacy.id } }),
    ).toEqual(legacy);
    expect(
      await f.db.auditLog.findUniqueOrThrow({ where: { id: malformed.id } }),
    ).toEqual(malformed);
  });
  it("READ_ONLY rooms remain readable while writes stop and actual owner suspension ends the selected manager scope", async () => {
    const f = await fixture(),
      r = await f.room(),
      manager = await f.token(f.actorId, "manager");
    await f.db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    for (const p of ["/rooms", "/rooms/" + r.id, "/rooms/" + r.id + "/history"])
      expect((await api(p, "GET", manager)).status).toBe(200);
    expect((await f.change(r, { name: "Readonly mutation" })).status).toBe(403);
    expect(
      (
        await api("/rooms", "POST", f.owner, {
          code: "DENIED",
          name: "Readonly new room",
          capacity: 1,
        })
      ).status,
    ).toBe(403);
    await f.db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "ACTIVE" },
    });
    expect(
      (
        await api("/staff/" + f.member.id, "PATCH", f.owner, {
          version: f.member.version,
          status: "SUSPENDED",
          reason: "Synthetic actual room manager suspension",
        })
      ).status,
    ).toBe(200);
    expect((await api("/rooms/" + r.id, "GET", manager)).status).toBe(403);
    expect(
      (await f.change(r, { name: "Suspended mutation" }, manager)).status,
    ).toBe(403);
    expect(
      await f.db.room.findUniqueOrThrow({ where: { id: r.id } }),
    ).toMatchObject({ name: r.name, version: 1 });
  });
  it("completed attendance, withdrawn enrollment and closed-class history survive an archived room without holding future space", async () => {
    const f = await fixture(),
      r = await f.room("HISTORY", 10),
      t = await f.teaching(r.id);
    const student = await api("/students", "POST", f.owner, {
      studentCode: "ROOM-HISTORY",
      fullName: "Synthetic historical room learner",
    });
    expect(student.status).toBe(201);
    const enrollment = await api(
      `/classes/${t.cls.id}/enrollments`,
      "POST",
      f.owner,
      { studentId: student.body.data.id, joinedAt: "2030-01-01" },
    );
    expect(enrollment.status).toBe(201);
    const session = await api(
      `/classes/${t.cls.id}/sessions/extra`,
      "POST",
      f.owner,
      {
        teacherId: t.teacher.id,
        startsAt: "2030-06-03T01:00:00Z",
        endsAt: "2030-06-03T02:00:00Z",
      },
    );
    expect(session.status).toBe(201);
    const draft = await api(
      `/sessions/${session.body.data.id}/attendance/draft`,
      "PUT",
      f.owner,
      {
        sessionVersion: session.body.data.version,
        records: [{ studentId: student.body.data.id, status: "PRESENT" }],
      },
    );
    expect(draft.status).toBe(200);
    expect(
      (
        await api(
          `/sessions/${session.body.data.id}/attendance/finalize`,
          "POST",
          f.owner,
          { sessionVersion: draft.body.data.session.version },
        )
      ).status,
    ).toBe(201);
    const beforeSession = await f.db.classSession.findUniqueOrThrow({
      where: { id: session.body.data.id },
    });
    const beforeRoster = await f.db.rosterRow.findMany({
      where: { tenantId: f.tenant.id, sessionId: beforeSession.id },
    });
    const beforeAttendance = await f.db.attendanceRecord.findMany({
      where: { tenantId: f.tenant.id, sessionId: beforeSession.id },
    });
    expect(beforeSession.status).toBe("COMPLETED");
    expect(beforeSession.roomId).toBe(r.id);
    expect(beforeRoster).toHaveLength(1);
    expect(
      (
        await api(
          `/classes/${t.cls.id}/enrollments/${enrollment.body.data.id}/withdraw`,
          "POST",
          f.owner,
          {
            version: enrollment.body.data.version,
            leftAt: "2030-06-04",
            reason: "Synthetic historical enrollment closure",
          },
        )
      ).status,
    ).toBe(201);
    const current = await api("/classes/" + t.cls.id, "GET", f.owner);
    expect(
      (
        await api(`/classes/${t.cls.id}/close`, "POST", f.owner, {
          version: current.body.data.version,
          reason: "Synthetic completed class room retention",
        })
      ).status,
    ).toBe(201);
    const detail = await api("/rooms/" + r.id, "GET", f.owner);
    expect(detail.status).toBe(200);
    expect(detail.body.data.usage).toEqual({
      activeOrDraftClasses: 0,
      futureActiveRules: 0,
      upcomingOrOngoingSessions: 0,
      requiredCapacity: 0,
    });
    expect((await f.change(r, { active: false, capacity: 1 })).status).toBe(
      200,
    );
    expect(
      await f.db.classSession.findUniqueOrThrow({
        where: { id: beforeSession.id },
      }),
    ).toEqual(beforeSession);
    expect(
      await f.db.rosterRow.findMany({
        where: { tenantId: f.tenant.id, sessionId: beforeSession.id },
      }),
    ).toEqual(beforeRoster);
    expect(
      await f.db.attendanceRecord.findMany({
        where: { tenantId: f.tenant.id, sessionId: beforeSession.id },
      }),
    ).toEqual(beforeAttendance);
  });
  it.each(["list", "detail", "history", "create", "update"] as const)(
    "post-lock room %s rejects a scope suspended by actual owner API before the queued operation resumes",
    async (kind) => {
      const f = await fixture(),
        r = await f.room(),
        actor = await f.token(f.actorId, "manager"),
        locker = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        });
      const pending: Promise<unknown>[] = [];
      await locker.connect();
      const snapshot = async () => ({
        rooms: await f.db.room.findMany({
          where: { tenantId: f.tenant.id },
          orderBy: { id: "asc" },
        }),
        audits: await f.db.auditLog.findMany({
          where: {
            tenantId: f.tenant.id,
            action: { in: ["room.created", "room.updated"] },
          },
          orderBy: { id: "asc" },
        }),
      });
      const before = await snapshot();
      const operation = (token: string) =>
        kind === "create"
          ? api("/rooms", "POST", token, {
              code: "QUEUED",
              name: "Queued synthetic room",
              capacity: 5,
            })
          : kind === "update"
            ? f.change(r, { active: false }, token)
            : api(
                kind === "list"
                  ? "/rooms"
                  : "/rooms/" + r.id + (kind === "history" ? "/history" : ""),
                "GET",
                token,
              );
      try {
        await locker.query("BEGIN");
        await locker.query(
          "SELECT id FROM tenants WHERE id=$1::uuid FOR UPDATE",
          [f.tenant.id],
        );
        const pid = (
          await locker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
        ).rows[0]!.pid;
        async function blockedAtLeast(n: number) {
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
        const revoke = api("/staff/" + f.member.id, "PATCH", f.owner, {
          version: f.member.version,
          status: "SUSPENDED",
          reason: "Synthetic queued room scope revocation",
        });
        pending.push(revoke);
        await blockedAtLeast(1);
        const attempted = operation(actor);
        pending.push(attempted);
        await blockedAtLeast(2);
        await locker.query("COMMIT");
        expect((await revoke).status).toBe(200);
        expect((await attempted).status).toBe(403);
        expect(await snapshot()).toEqual(before);
        expect((await operation(f.owner)).status).toBe(
          kind === "create" ? 201 : 200,
        );
      } finally {
        await locker.query("ROLLBACK").catch(() => {});
        await Promise.allSettled(pending);
        await locker.end();
      }
    },
  );
}
