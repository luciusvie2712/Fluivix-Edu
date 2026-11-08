import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { PrismaClient, Role } from "@prisma/client";

export function studentHistoryCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  async function api(
    path: string,
    method = "GET",
    token = "",
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
      passwordHash = await hash();
    const plan = await db.plan.findUniqueOrThrow({
      where: { code: "TEST_PLAN" },
    });
    const tenant = await db.tenant.create({
      data: {
        slug: "student-history-" + stamp,
        name: "Synthetic history centre",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    const subscription = await db.subscription.create({
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
        email: "history-owner-" + stamp + "@example.test",
        displayName: "Synthetic history owner",
        passwordHash,
        status: "ACTIVE",
      },
    });
    const actor = await db.user.create({
      data: {
        email: "history-actor-" + stamp + "@example.test",
        displayName: "Synthetic multi-role history operator",
        passwordHash,
        status: "ACTIVE",
      },
    });
    await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }] },
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
      const signed = await api("/mobile/auth/login", "POST", "", {
        email: user.email,
        password,
      });
      expect(signed.status).toBe(200);
      const chosen = await api(
        "/auth/switch-context",
        "POST",
        signed.body.data.accessToken,
        { tenantId: tenant.id, role },
      );
      expect(chosen.status).toBe(200);
      return chosen.body.data.accessToken as string;
    }
    const ownerToken = await token(owner.id, "owner");
    async function student(code: string) {
      const result = await api("/students", "POST", ownerToken, {
        studentCode: code,
        fullName: "Synthetic learner " + code,
        notesPrivate: "PRIVATE_HISTORY_NOTES",
        contactEmail: "private-history@example.test",
      });
      expect(result.status).toBe(201);
      return result.body.data;
    }
    const selected = await student("SELECTED"),
      other = await student("OTHER");
    async function cls(code: string) {
      const result = await api("/classes", "POST", ownerToken, {
        code,
        name: "Synthetic class " + code,
        capacity: 5,
        startDate: "2030-01-01",
        endDate: "2030-12-31",
      });
      expect(result.status).toBe(201);
      return result.body.data;
    }
    const first = await cls("HISTORY-ONE"),
      second = await cls("HISTORY-TWO"),
      unrelated = await cls("OTHER_LEARNER_CLASS");
    async function enroll(
      classId: string,
      studentId: string,
      joinedAt: string,
    ) {
      const result = await api(
        `/classes/${classId}/enrollments`,
        "POST",
        ownerToken,
        { studentId, joinedAt },
      );
      expect(result.status).toBe(201);
      return result.body.data;
    }
    const firstEnrollment = await enroll(first.id, selected.id, "2030-01-01"),
      secondEnrollment = await enroll(second.id, selected.id, "2030-02-01");
    await enroll(unrelated.id, other.id, "2030-01-01");
    const teacherResult = await api("/teachers", "POST", ownerToken, {
      userId: actor.id,
      teacherCode: "HISTORY-TEACHER",
      fullName: "Synthetic assigned history teacher",
    });
    expect(teacherResult.status).toBe(201);
    const teacher = teacherResult.body.data;
    expect(
      (
        await api(`/classes/${first.id}/teachers`, "POST", ownerToken, {
          teacherId: teacher.id,
          effectiveFrom: "2030-01-01",
        })
      ).status,
    ).toBe(201);
    const foreign = await db.tenant.create({
      data: {
        slug: "foreign-history-" + stamp,
        name: "FOREIGN_HISTORY_CENTRE",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    const foreignStudent = await db.student.create({
      data: {
        tenantId: foreign.id,
        studentCode: "FOREIGN",
        fullName: "FOREIGN_HISTORY_LEARNER",
      },
    });
    async function session(day = "2030-06-03") {
      const result = await api(
        `/classes/${first.id}/sessions/extra`,
        "POST",
        ownerToken,
        {
          teacherId: teacher.id,
          startsAt: day + "T01:00:00Z",
          endsAt: day + "T02:00:00Z",
        },
      );
      expect(result.status).toBe(201);
      return result.body.data;
    }
    async function draft(id: string, status = "PRESENT") {
      const current = await api(`/sessions/${id}`, "GET", ownerToken);
      expect(current.status).toBe(200);
      const result = await api(
        `/sessions/${id}/attendance/draft`,
        "PUT",
        ownerToken,
        {
          sessionVersion: current.body.data.version,
          records: [{ studentId: selected.id, status }],
        },
      );
      expect(result.status).toBe(200);
      return result.body.data;
    }
    async function publish(id: string) {
      const current = await api(`/sessions/${id}`, "GET", ownerToken);
      expect(current.status).toBe(200);
      const result = await api(
        `/sessions/${id}/attendance/finalize`,
        "POST",
        ownerToken,
        { sessionVersion: current.body.data.version },
      );
      expect(result.status).toBe(201);
      return result.body.data;
    }
    const enrollPath = `/students/${selected.id}/enrollments`,
      attendancePath = `/students/${selected.id}/attendance?from=2030-06-01&to=2030-06-30`;
    return {
      db,
      tenant,
      subscription,
      owner,
      actor,
      member,
      ownerToken,
      token,
      selected,
      other,
      first,
      second,
      unrelated,
      firstEnrollment,
      secondEnrollment,
      teacher,
      foreign,
      foreignStudent,
      session,
      draft,
      publish,
      enrollPath,
      attendancePath,
    };
  }
  it("selected-student enrollment history is real searched pagination with no other learner or tenant rows", async () => {
    const f = await fixture();
    const result = await api(
      f.enrollPath + "?page=1&limit=1",
      "GET",
      f.ownerToken,
    );
    expect(result.status).toBe(200);
    expect(result.body.page).toMatchObject({
      total: 2,
      totalPages: 2,
      page: 1,
      limit: 1,
    });
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0]).toMatchObject({
      id: f.secondEnrollment.id,
      classId: f.second.id,
      classCode: "HISTORY-TWO",
      classStatus: "ACTIVE",
      joinedAt: "2030-02-01",
      leftAt: null,
      status: "ACTIVE",
    });
    const next = await api(
      f.enrollPath + "?page=2&limit=1",
      "GET",
      f.ownerToken,
    );
    expect(next.status).toBe(200);
    expect(next.body.data[0].id).toBe(f.firstEnrollment.id);
    const filtered = await api(
      f.enrollPath + "?search=HISTORY-ONE",
      "GET",
      f.ownerToken,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.page.total).toBe(1);
    expect(filtered.body.data[0].classId).toBe(f.first.id);
    for (const value of [result, next, filtered])
      expect(JSON.stringify(value.body)).not.toMatch(
        /PRIVATE_HISTORY|private-history|OTHER_LEARNER_CLASS|FOREIGN_HISTORY/,
      );
    expect(
      (
        await api(
          `/students/${f.foreignStudent.id}/enrollments`,
          "GET",
          f.ownerToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (await api(`/students/${randomUUID()}/enrollments`, "GET", f.ownerToken))
        .status,
    ).toBe(404);
    expect(
      (
        await api(f.enrollPath, "GET", f.ownerToken, undefined, {
          "X-Tenant-Id": f.foreign.id,
        })
      ).status,
    ).toBe(403);
  });
  it("student history uses the selected role only: limited accountant enrollment is allowed, academic attendance is denied to teacher/student/guardian", async () => {
    const f = await fixture();
    await f.db.student.update({
      where: { id: f.selected.id },
      data: { userId: f.actor.id },
    });
    for (const role of [
      "manager",
      "academic_staff",
      "accountant",
      "teacher",
      "student",
      "guardian",
    ] as const) {
      const token = await f.token(f.actor.id, role),
        allowed = ["manager", "academic_staff", "accountant"].includes(role);
      const enrollment = await api(f.enrollPath, "GET", token);
      expect(enrollment.status).toBe(allowed ? 200 : 403);
      const attendance = await api(f.attendancePath, "GET", token);
      expect(attendance.status).toBe(
        ["manager", "academic_staff"].includes(role) ? 200 : 403,
      );
      expect(JSON.stringify(enrollment.body)).not.toContain(
        "PRIVATE_HISTORY_NOTES",
      );
    }
  });
  it("student attendance history publishes only finalized roster records and hides an actual reopened draft until refinalized", async () => {
    const f = await fixture(),
      session = await f.session();
    await f.draft(session.id);
    let result = await api(f.attendancePath, "GET", f.ownerToken);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([]);
    expect(result.body.page.total).toBe(0);
    let current = await api(`/sessions/${session.id}`, "GET", f.ownerToken);
    expect(
      (
        await api(
          `/sessions/${session.id}/lesson-report`,
          "PUT",
          f.ownerToken,
          {
            sessionVersion: current.body.data.version,
            lessonSummary: "Synthetic published summary",
            homeworkText: "Synthetic public homework",
            teacherNotesPrivate: "PRIVATE_HISTORY_TEACHER_NOTE",
          },
        )
      ).status,
    ).toBe(200);
    await f.publish(session.id);
    result = await api(f.attendancePath, "GET", f.ownerToken);
    expect(result.status).toBe(200);
    expect(result.body.page.total).toBe(1);
    expect(result.body.data[0]).toMatchObject({
      sessionId: session.id,
      classId: f.first.id,
      status: "PRESENT",
      scheduledDate: "2030-06-03",
      startsAt: "2030-06-03T01:00:00.000Z",
    });
    expect(JSON.stringify(result.body)).not.toMatch(
      /PRIVATE_HISTORY|teacherNotes|lessonSummary|homework/,
    );
    current = await api(`/sessions/${session.id}`, "GET", f.ownerToken);
    expect(
      (
        await api(
          `/sessions/${session.id}/attendance/reopen`,
          "POST",
          f.ownerToken,
          {
            sessionVersion: current.body.data.version,
            reason: "Synthetic reviewed attendance correction",
          },
        )
      ).status,
    ).toBe(201);
    result = await api(f.attendancePath, "GET", f.ownerToken);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([]);
    await f.draft(session.id, "LATE");
    await f.publish(session.id);
    result = await api(f.attendancePath, "GET", f.ownerToken);
    expect(result.status).toBe(200);
    expect(result.body.data[0].status).toBe("LATE");
  });
  it("staff student history validates bounded dates/pages and rejects anonymous, overposted, foreign and nonexistent resources", async () => {
    const f = await fixture();
    for (const path of [f.enrollPath, f.attendancePath])
      expect((await api(path)).status).toBe(401);
    for (const query of [
      "from=0000-01-01&to=2030-01-01",
      "from=2030-02-30&to=2030-03-01",
      "from=2030-06-30&to=2030-06-01",
      "from=2028-01-01&to=2030-01-01",
      "from=2030-01-01&to=2030-01-02&includePrivate=true",
    ])
      expect(
        (
          await api(
            `/students/${f.selected.id}/attendance?${query}`,
            "GET",
            f.ownerToken,
          )
        ).status,
      ).toBe(422);
    expect(
      (await api(f.enrollPath + "?page=9007199254740991", "GET", f.ownerToken))
        .status,
    ).toBe(422);
    expect(
      (
        await api(
          `/students/${f.foreignStudent.id}/attendance?from=2030-01-01&to=2030-01-02`,
          "GET",
          f.ownerToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await api(
          `/students/${randomUUID()}/attendance?from=2030-01-01&to=2030-01-02`,
          "GET",
          f.ownerToken,
        )
      ).status,
    ).toBe(404);
  });
  it("withdrawn enrollment and closed-class finalized attendance remain available without mutating historical rows", async () => {
    const f = await fixture(),
      session = await f.session();
    await f.draft(session.id);
    await f.publish(session.id);
    const before = await f.db.attendanceRecord.findMany({
      where: { tenantId: f.tenant.id, sessionId: session.id },
    });
    expect(
      (
        await api(
          `/classes/${f.first.id}/enrollments/${f.firstEnrollment.id}/withdraw`,
          "POST",
          f.ownerToken,
          {
            version: f.firstEnrollment.version,
            leftAt: "2030-06-04",
            reason: "Synthetic student history withdrawal",
          },
        )
      ).status,
    ).toBe(201);
    const current = await api(`/classes/${f.first.id}`, "GET", f.ownerToken);
    expect(
      (
        await api(`/classes/${f.first.id}/close`, "POST", f.ownerToken, {
          version: current.body.data.version,
          reason: "Synthetic completed class history retention",
        })
      ).status,
    ).toBe(201);
    const result = await api(f.enrollPath, "GET", f.ownerToken);
    expect(result.status).toBe(200);
    expect(
      result.body.data.find(
        (row: { id: string }) => row.id === f.firstEnrollment.id,
      ),
    ).toMatchObject({
      status: "WITHDRAWN",
      classStatus: "CLOSED",
      leftAt: "2030-06-04",
    });
    const history = await api(f.attendancePath, "GET", f.ownerToken);
    expect(history.status).toBe(200);
    expect(history.body.page.total).toBe(1);
    expect(
      await f.db.attendanceRecord.findMany({
        where: { tenantId: f.tenant.id, sessionId: session.id },
      }),
    ).toEqual(before);
  });
  it("READ_ONLY histories stay readable while actual owner suspension immediately stops the selected manager", async () => {
    const f = await fixture(),
      manager = await f.token(f.actor.id, "manager");
    await f.db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    for (const path of [f.enrollPath, f.attendancePath])
      expect((await api(path, "GET", manager)).status).toBe(200);
    await f.db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "ACTIVE" },
    });
    expect(
      (
        await api(`/staff/${f.member.id}`, "PATCH", f.ownerToken, {
          version: f.member.version,
          status: "SUSPENDED",
          reason: "Synthetic reviewed history access suspension",
        })
      ).status,
    ).toBe(200);
    for (const path of [f.enrollPath, f.attendancePath])
      expect((await api(path, "GET", manager)).status).toBe(403);
  });
  it("an attendance-disabled subscribed plan rejects history instead of fabricating an empty result while enrollment metadata remains readable", async () => {
    const f = await fixture(),
      plan = await f.db.plan.create({
        data: {
          code: "HISTORY-NOATT-" + randomUUID().slice(0, 8).toUpperCase(),
          name: "Synthetic no attendance plan",
          monthlyPriceVnd: 0n,
          limitsJson: {
            maxStudents: 1000,
            maxUsers: 1000,
            maxClasses: 100,
            maxStorageBytes: "1073741824",
          },
          featureFlagsJson: {
            attendance: false,
            grades: true,
            finance: true,
            reports: true,
          },
        },
      });
    await f.db.subscription.update({
      where: { id: f.subscription.id },
      data: { planId: plan.id },
    });
    expect((await api(f.attendancePath, "GET", f.ownerToken)).status).toBe(403);
    const result = await api(f.enrollPath, "GET", f.ownerToken);
    expect(result.status).toBe(200);
    expect(result.body.page.total).toBe(2);
  });
  it.each(["enrollments", "attendance"] as const)(
    "post-lock student %s history rejects an actual owner-revoked manager after the queued read resumes",
    async (kind) => {
      const f = await fixture(),
        manager = await f.token(f.actor.id, "manager"),
        locker = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        }),
        pending: Promise<unknown>[] = [];
      const path = kind === "enrollments" ? f.enrollPath : f.attendancePath;
      const before = await f.db.enrollment.findMany({
        where: { tenantId: f.tenant.id },
        orderBy: { id: "asc" },
      });
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
        const revoke = api(`/staff/${f.member.id}`, "PATCH", f.ownerToken, {
          version: f.member.version,
          status: "SUSPENDED",
          reason: "Synthetic queued student history revocation",
        });
        pending.push(revoke);
        await blocked(1);
        const attempted = api(path, "GET", manager);
        pending.push(attempted);
        await blocked(2);
        await locker.query("COMMIT");
        expect((await revoke).status).toBe(200);
        expect((await attempted).status).toBe(403);
        expect(
          await f.db.enrollment.findMany({
            where: { tenantId: f.tenant.id },
            orderBy: { id: "asc" },
          }),
        ).toEqual(before);
        expect((await api(path, "GET", f.ownerToken)).status).toBe(200);
      } finally {
        await locker.query("ROLLBACK").catch(() => {});
        await Promise.allSettled(pending);
        await locker.end();
      }
    },
  );
}
