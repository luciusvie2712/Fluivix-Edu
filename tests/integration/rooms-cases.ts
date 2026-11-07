import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export function roomsCases(
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
  it("class capacity respects an active future rule override room before generation; exact fitting capacity still generates valid sessions", async () => {
    const db = getDb(),
      stamp = randomUUID();
    const plan = await db.plan.findUniqueOrThrow({
      where: { code: "TEST_PLAN" },
    });
    const tenant = await db.tenant.create({
      data: {
        slug: "rule-room-" + stamp,
        name: "Synthetic rule override capacity",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
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
    const user = await db.user.create({
      data: {
        email: "rule-room-" + stamp + "@example.test",
        displayName: "Synthetic rule operator",
        passwordHash: await hash(),
        status: "ACTIVE",
      },
    });
    await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }, { role: "teacher" }] },
      },
    });
    const login = await api("/mobile/auth/login", "POST", "", {
      email: user.email,
      password,
    });
    expect(login.status).toBe(200);
    const chosen = await api(
      "/auth/switch-context",
      "POST",
      login.body.data.accessToken,
      { tenantId: tenant.id, role: "owner" },
    );
    expect(chosen.status).toBe(200);
    const token = chosen.body.data.accessToken;
    const large = await api("/rooms", "POST", token, {
      code: "DEFAULT",
      name: "Synthetic large default",
      capacity: 20,
    });
    expect(large.status).toBe(201);
    const small = await api("/rooms", "POST", token, {
      code: "OVERRIDE",
      name: "Synthetic smaller override",
      capacity: 6,
    });
    expect(small.status).toBe(201);
    const teacher = await api("/teachers", "POST", token, {
      userId: user.id,
      teacherCode: "RULE-ROOM",
      fullName: "Synthetic assigned teacher",
    });
    expect(teacher.status).toBe(201);
    const cls = await api("/classes", "POST", token, {
      code: "RULE-ROOM",
      name: "Synthetic rule-room class",
      roomId: large.body.data.id,
      capacity: 5,
      startDate: "2030-01-01",
      endDate: "2030-12-31",
    });
    expect(cls.status).toBe(201);
    expect(cls.body.data.roomId).toBe(large.body.data.id);
    expect(
      (
        await api(`/classes/${cls.body.data.id}/teachers`, "POST", token, {
          teacherId: teacher.body.data.id,
          effectiveFrom: "2030-01-01",
        })
      ).status,
    ).toBe(201);
    const rule = await api(
      `/classes/${cls.body.data.id}/schedule-rules`,
      "POST",
      token,
      {
        teacherId: teacher.body.data.id,
        roomId: small.body.data.id,
        weekday: 1,
        localStart: "10:00",
        localEnd: "11:00",
        validFrom: "2030-06-03",
        validTo: "2030-06-24",
      },
    );
    expect(rule.status).toBe(201);
    const before = await db.educationClass.findUniqueOrThrow({
      where: { id: cls.body.data.id },
    });
    const beforeRule = await db.scheduleRule.findUniqueOrThrow({
      where: { id: rule.body.data.id },
    });
    expect(
      await db.classSession.count({
        where: { tenantId: tenant.id, classId: before.id },
      }),
    ).toBe(0);
    const input = {
      version: before.version,
      name: before.name,
      capacity: 8,
      reason: "Synthetic proposed class capacity review",
    };
    expect(
      (await api(`/classes/${before.id}`, "PATCH", token, input)).status,
    ).toBe(409);
    expect(
      await db.educationClass.findUniqueOrThrow({ where: { id: before.id } }),
    ).toEqual(before);
    expect(
      await db.scheduleRule.findUniqueOrThrow({ where: { id: beforeRule.id } }),
    ).toEqual(beforeRule);
    expect(
      await db.auditLog.count({
        where: { tenantId: tenant.id, action: "class.updated" },
      }),
    ).toBe(0);
    const fitting = await api(`/classes/${before.id}`, "PATCH", token, {
      ...input,
      capacity: 6,
    });
    expect(fitting.status).toBe(200);
    expect(fitting.body.data).toMatchObject({
      capacity: 6,
      version: before.version + 1,
      roomId: large.body.data.id,
    });
    const generated = await api(
      `/classes/${before.id}/schedule-rules/${beforeRule.id}/generate`,
      "POST",
      token,
      { from: "2030-06-03", to: "2030-06-24" },
    );
    expect(generated.status).toBe(201);
    const sessions = await db.classSession.findMany({
      where: { tenantId: tenant.id, classId: before.id },
    });
    expect(sessions).toHaveLength(4);
    expect(sessions.every((s) => s.roomId === small.body.data.id)).toBe(true);
    expect(
      await db.scheduleRule.findUniqueOrThrow({ where: { id: beforeRule.id } }),
    ).toEqual(beforeRule);
  });
}
