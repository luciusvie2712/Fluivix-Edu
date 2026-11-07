import { expect, it } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export function teachingActorCases(
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
        Authorization: "Bearer " + token,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function fixture(role: "manager" | "teacher") {
    const db = getDb(),
      tenantId = randomUUID(),
      owner = randomUUID(),
      actor = randomUUID(),
      passwordHash = await hash();
    const plan = await db.plan.findUniqueOrThrow({
      where: { code: "TEST_PLAN" },
    });
    await db.tenant.create({
      data: {
        id: tenantId,
        slug: "post-lock-" + tenantId,
        name: "Synthetic post-lock centre",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    await db.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        startsAt: new Date("2020-01-01Z"),
        endsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    for (const id of [owner, actor])
      await db.user.create({
        data: {
          id,
          email: id + "@example.test",
          displayName: "Synthetic post-lock actor",
          passwordHash,
          status: "ACTIVE",
        },
      });
    await db.membership.create({
      data: {
        tenantId,
        userId: owner,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }, { role: "teacher" }] },
      },
    });
    const membership = await db.membership.create({
      data: {
        tenantId,
        userId: actor,
        status: "ACTIVE",
        roles: { create: [{ role: "manager" }, { role: "teacher" }] },
      },
    });
    const teacher = await db.teacher.create({
      data: {
        tenantId,
        userId: actor,
        teacherCode: "POST-LOCK",
        fullName: "Synthetic post-lock teacher",
      },
    });
    const cls = await db.educationClass.create({
      data: {
        tenantId,
        code: "POST-LOCK-BASE",
        name: "Synthetic post-lock class",
        capacity: 4,
        status: "ACTIVE",
        startDate: new Date("2020-01-01Z"),
        endDate: new Date("2040-01-01Z"),
      },
    });
    await db.classTeacher.create({
      data: {
        tenantId,
        classId: cls.id,
        teacherId: teacher.id,
        effectiveFrom: new Date("2020-01-01Z"),
      },
    });
    const student = await db.student.create({
      data: {
        tenantId,
        studentCode: "POST-LOCK",
        fullName: "Synthetic post-lock student",
      },
    });
    await db.enrollment.create({
      data: {
        tenantId,
        classId: cls.id,
        studentId: student.id,
        joinedAt: new Date("2020-01-01Z"),
      },
    });
    const session = await db.classSession.create({
      data: {
        tenantId,
        classId: cls.id,
        teacherId: teacher.id,
        scheduledDate: new Date("2030-06-03Z"),
        startsAt: new Date("2030-06-03T01:00Z"),
        endsAt: new Date("2030-06-03T02:00Z"),
      },
    });
    async function login(
      userId: string,
      chosenRole: "owner" | "manager" | "teacher",
    ) {
      const signed = await api("/mobile/auth/login", "POST", "", {
        email: userId + "@example.test",
        password,
      });
      expect(signed.status).toBe(200);
      const chosen = await api(
        "/auth/switch-context",
        "POST",
        signed.body.data.accessToken,
        { tenantId, role: chosenRole },
      );
      expect(chosen.status).toBe(200);
      return chosen.body.data.accessToken as string;
    }
    return {
      db,
      tenantId,
      owner,
      actor,
      membership,
      teacher,
      cls,
      student,
      session,
      ownerToken: await login(owner, "owner"),
      actorToken: await login(actor, role),
    };
  }
  it.each(["room", "class", "attendance-finalize", "rule-generate"] as const)(
    "teaching post-lock %s rejects an actor suspended through the actual owner API before the queued write resumes",
    async (kind) => {
      const f = await fixture(
        kind === "attendance-finalize" ? "teacher" : "manager",
      );
      let operation: (token: string) => ReturnType<typeof api>;
      if (kind === "room")
        operation = (token) =>
          api("/rooms", "POST", token, {
            code: "POST-LOCK-CREATE",
            name: "Synthetic queued room",
            capacity: 20,
          });
      else if (kind === "class")
        operation = (token) =>
          api("/classes", "POST", token, {
            code: "POST-LOCK-CREATE",
            name: "Synthetic queued class",
            capacity: 4,
            startDate: "2030-06-01",
            endDate: "2030-07-01",
          });
      else if (kind === "attendance-finalize") {
        const draft = await api(
          `/sessions/${f.session.id}/attendance/draft`,
          "PUT",
          f.actorToken,
          {
            sessionVersion: 1,
            records: [{ studentId: f.student.id, status: "PRESENT" }],
          },
        );
        expect(draft.status).toBe(200);
        operation = (token) =>
          api(`/sessions/${f.session.id}/attendance/finalize`, "POST", token, {
            sessionVersion: draft.body.data.session.version,
          });
      } else {
        // Suspending the command actor must not invalidate the actual scheduled
        // teacher; the positive owner command still needs a valid domain slot.
        const scheduledTeacher = await f.db.teacher.create({
          data: {
            tenantId: f.tenantId,
            userId: f.owner,
            teacherCode: "POST-LOCK-SCHEDULED",
            fullName: "Synthetic eligible scheduled teacher",
          },
        });
        await f.db.classTeacher.create({
          data: {
            tenantId: f.tenantId,
            classId: f.cls.id,
            teacherId: scheduledTeacher.id,
            effectiveFrom: new Date("2020-01-01Z"),
          },
        });
        const rule = await api(
          `/classes/${f.cls.id}/schedule-rules`,
          "POST",
          f.ownerToken,
          {
            teacherId: scheduledTeacher.id,
            weekday: 1,
            localStart: "10:00",
            localEnd: "11:00",
            validFrom: "2030-06-03",
            validTo: "2030-06-10",
          },
        );
        expect(rule.status).toBe(201);
        operation = (token) =>
          api(
            `/classes/${f.cls.id}/schedule-rules/${rule.body.data.id}/generate`,
            "POST",
            token,
            { from: "2030-06-10", to: "2030-06-10" },
          );
      }
      async function snapshot() {
        return {
          rooms: await f.db.room.count({ where: { tenantId: f.tenantId } }),
          classes: await f.db.educationClass.count({
            where: { tenantId: f.tenantId },
          }),
          sessions: await f.db.classSession.findMany({
            where: { tenantId: f.tenantId },
            orderBy: { id: "asc" },
          }),
          outbox: await f.db.outboxEvent.count({
            where: { tenantId: f.tenantId },
          }),
          actorAudit: await f.db.auditLog.count({
            where: { tenantId: f.tenantId, actorUserId: f.actor },
          }),
        };
      }
      const before = await snapshot(),
        locker = new Client({ connectionString: process.env.DATABASE_URL });
      const pending: Promise<unknown>[] = [];
      await locker.connect();
      try {
        await locker.query("BEGIN");
        await locker.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
          f.tenantId,
        ]);
        const pid = (
          await locker.query<{ id: number }>("SELECT pg_backend_pid() AS id")
        ).rows[0]!.id;
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
        const revoke = api(`/staff/${f.membership.id}`, "PATCH", f.ownerToken, {
          version: f.membership.version,
          status: "SUSPENDED",
          reason: "Synthetic actual post-lock actor revocation",
        });
        pending.push(revoke);
        await blockedAtLeast(1);
        const attempted = operation(f.actorToken);
        pending.push(attempted);
        await blockedAtLeast(2);
        await locker.query("COMMIT");
        expect((await revoke).status).toBe(200);
        expect(
          (
            await f.db.membership.findUniqueOrThrow({
              where: { id: f.membership.id },
            })
          ).status,
        ).toBe("SUSPENDED");
        expect((await attempted).status).toBe(403);
        expect(await snapshot()).toEqual(before);
        // The same valid domain command still works for the current owner.
        expect((await operation(f.ownerToken)).status).toBe(201);
      } finally {
        await locker.query("ROLLBACK").catch(() => {});
        await Promise.allSettled(pending);
        await locker.end();
      }
    },
  );
}
