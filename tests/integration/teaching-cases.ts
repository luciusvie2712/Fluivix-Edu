import { beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

export function teachingCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("teaching, roster and attendance transactions against real PostgreSQL", () => {
    const tenantId = randomUUID(),
      ownerId = randomUUID(),
      teacherUserId = randomUUID(),
      otherTeacherId = randomUUID(),
      studentUserId = randomUUID(),
      guardianId = randomUUID();
    let ownerToken: string,
      teacherToken: string,
      studentToken: string,
      guardianToken: string,
      wrongTeacherToken: string,
      teacherId: string;
    async function api(
      path: string,
      method = "GET",
      body?: unknown,
      token = ownerToken,
      key?: string,
    ) {
      const response = await fetch(getBase() + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    }
    async function context(email: string, role: string) {
      const signed = await api(
        "/mobile/auth/login",
        "POST",
        { email, password },
        "",
      );
      expect(signed.status).toBe(200);
      const selected = await api(
        "/auth/switch-context",
        "POST",
        { tenantId, role },
        signed.body.data.accessToken,
      );
      expect(selected.status).toBe(200);
      return selected.body.data.accessToken as string;
    }
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash();
      const plan = await db.plan.findUniqueOrThrow({
        where: { code: "TEST_PLAN" },
      });
      await db.tenant.create({
        data: {
          id: tenantId,
          slug: "teaching-" + tenantId,
          name: "Synthetic Teaching",
          status: "ACTIVE",
          subscriptionEndsAt: new Date("2028-01-01Z"),
          graceUntil: new Date("2028-02-01Z"),
        },
      });
      await db.subscription.create({
        data: {
          tenantId,
          planId: plan.id,
          startsAt: new Date("2020-01-01Z"),
          endsAt: new Date("2028-01-01Z"),
          graceUntil: new Date("2028-02-01Z"),
        },
      });
      for (const [id, role] of [
        [ownerId, "owner"],
        [teacherUserId, "teacher"],
        [otherTeacherId, "teacher"],
        [studentUserId, "student"],
        [guardianId, "guardian"],
      ] as const) {
        await db.user.create({
          data: {
            id,
            email: id + "@example.test",
            displayName: role,
            status: "ACTIVE",
            passwordHash,
          },
        });
        await db.membership.create({
          data: {
            tenantId,
            userId: id,
            status: "ACTIVE",
            roles: { create: { role } },
          },
        });
      }
      ownerToken = await context(ownerId + "@example.test", "owner");
      teacherToken = await context(teacherUserId + "@example.test", "teacher");
      wrongTeacherToken = await context(
        otherTeacherId + "@example.test",
        "teacher",
      );
      studentToken = await context(studentUserId + "@example.test", "student");
      guardianToken = await context(guardianId + "@example.test", "guardian");
      const teacher = await api("/teachers", "POST", {
        userId: teacherUserId,
        teacherCode: "T1",
        fullName: "Teacher one",
      });
      expect(teacher.status).toBe(201);
      teacherId = teacher.body.data.id;
      expect(
        (
          await api("/teachers", "POST", {
            userId: otherTeacherId,
            teacherCode: "T2",
            fullName: "Teacher two",
          })
        ).status,
      ).toBe(201);
    });
    async function cls(code: string, capacity: number) {
      const result = await api("/classes", "POST", {
        code,
        name: code,
        capacity,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });
      expect(result.status).toBe(201);
      return result.body.data.id as string;
    }
    async function student(code: string, userId?: string) {
      return getDb().student.create({
        data: {
          tenantId,
          studentCode: code,
          fullName: code,
          ...(userId ? { userId } : {}),
        },
      });
    }
    it("serializes the final seat and rejects cross-tenant nested enrollment", async () => {
      const classId = await cls("LAST-SEAT", 1),
        a = await student("SEAT-A"),
        b = await student("SEAT-B");
      const result = await Promise.all(
        [a, b].map((s) =>
          api(`/classes/${classId}/enrollments`, "POST", {
            studentId: s.id,
            joinedAt: "2026-11-01",
          }),
        ),
      );
      expect(result.map((v) => v.status).sort()).toEqual([201, 409]);
      expect(
        await getDb().enrollment.count({ where: { tenantId, classId } }),
      ).toBe(1);
      const foreign = await getDb().student.findFirstOrThrow({
        where: { tenantId: { not: tenantId } },
      });
      expect(
        (
          await api(`/classes/${classId}/enrollments`, "POST", {
            studentId: foreign.id,
            joinedAt: "2026-11-01",
          })
        ).status,
      ).toBe(404);
      await expect(
        getDb().enrollment.create({
          data: {
            tenantId,
            classId,
            studentId: foreign.id,
            joinedAt: new Date("2026-11-01Z"),
          },
        }),
      ).rejects.toThrow();
    });
    it("TC009/010/011/012/024: snapshots20, hides drafts, rejects stale writes, finalizes only confirmed roster, privileged reopen", async () => {
      const classId = await cls("ATTENDANCE-20", 20);
      const students: Awaited<ReturnType<typeof student>>[] = [];
      for (let i = 0; i < 20; i++) {
        const s = await student(
          "ROSTER-" + String(i).padStart(2, "0"),
          i === 0 ? studentUserId : undefined,
        );
        students.push(s);
        expect(
          (
            await api(`/classes/${classId}/enrollments`, "POST", {
              studentId: s.id,
              joinedAt: "2026-11-01",
            })
          ).status,
        ).toBe(201);
      }
      await getDb().guardianLink.create({
        data: {
          tenantId,
          studentId: students[0]!.id,
          guardianUserId: guardianId,
          status: "ACTIVE",
          verifiedBy: ownerId,
          verifiedAt: new Date(),
        },
      });
      expect(
        (
          await api(`/classes/${classId}/teachers`, "POST", {
            teacherId,
            effectiveFrom: "2026-11-01",
            effectiveTo: "2026-12-31",
          })
        ).status,
      ).toBe(201);
      const created = await api(`/classes/${classId}/sessions/extra`, "POST", {
        teacherId,
        startsAt: "2026-11-02T11:00:00Z",
        endsAt: "2026-11-02T12:00:00Z",
      });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect(
        (
          await api(
            `/sessions/${id}/roster`,
            "GET",
            undefined,
            wrongTeacherToken,
          )
        ).status,
      ).toBe(404);
      const read = await api(
        `/sessions/${id}/roster`,
        "GET",
        undefined,
        teacherToken,
      );
      expect(read.status).toBe(200);
      expect(read.body.data.rows).toHaveLength(20);
      const draft = {
        sessionVersion: 1,
        records: students.map((s) => ({ studentId: s.id, status: "PRESENT" })),
      };
      const concurrent = await Promise.all(
        [1, 2].map(() =>
          api(`/sessions/${id}/attendance/draft`, "PUT", draft, teacherToken),
        ),
      );
      expect(concurrent.map((v) => v.status).sort()).toEqual([200, 409]);
      expect(
        await getDb().attendanceRecord.count({
          where: { tenantId, sessionId: id },
        }),
      ).toBe(20);
      const range = "?from=2026-11-01&to=2026-11-30";
      expect(
        (
          await api(
            "/mobile/my/attendance" + range,
            "GET",
            undefined,
            studentToken,
          )
        ).body.data,
      ).toEqual([]);
      expect(
        (
          await api(
            `/mobile/guardian/students/${students[0]!.id}/attendance` + range,
            "GET",
            undefined,
            guardianToken,
          )
        ).body.data,
      ).toEqual([]);
      const unmarked = await api(
        `/sessions/${id}/attendance/draft`,
        "PUT",
        {
          sessionVersion: 2,
          records: [{ studentId: students[0]!.id, status: "UNMARKED" }],
        },
        teacherToken,
      );
      expect(unmarked.status).toBe(200);
      expect(
        (
          await api(
            `/sessions/${id}/attendance/finalize`,
            "POST",
            { sessionVersion: 3 },
            teacherToken,
          )
        ).status,
      ).toBe(422);
      expect(
        (
          await api(
            `/sessions/${id}/attendance/draft`,
            "PUT",
            {
              sessionVersion: 3,
              records: [{ studentId: students[0]!.id, status: "LATE" }],
            },
            teacherToken,
          )
        ).status,
      ).toBe(200);
      const done = await api(
        `/sessions/${id}/attendance/finalize`,
        "POST",
        { sessionVersion: 4 },
        teacherToken,
      );
      expect(done.status).toBe(201);
      expect(done.body.data.session.status).toBe("COMPLETED");
      const totals = await api(
        "/mobile/my/attendance/summary" + range,
        "GET",
        undefined,
        studentToken,
      );
      expect(totals.status).toBe(200);
      expect(totals.body.data.total).toBe(1);
      expect(totals.body.data.attendedPercent).toBe("100.00");
      expect(
        (
          await api(
            "/mobile/my/attendance" + range,
            "GET",
            undefined,
            studentToken,
          )
        ).body.data[0].attendanceStatus,
      ).toBe("LATE");
      expect(
        (
          await api(
            `/sessions/${id}/attendance/draft`,
            "PUT",
            { ...draft, sessionVersion: 5 },
            teacherToken,
          )
        ).status,
      ).toBe(409);
      const reason = {
        sessionVersion: 5,
        reason: "Verified correction required",
      };
      expect(
        (
          await api(
            `/sessions/${id}/attendance/reopen`,
            "POST",
            reason,
            teacherToken,
          )
        ).status,
      ).toBe(403);
      expect(
        (await api(`/sessions/${id}/attendance/reopen`, "POST", reason)).status,
      ).toBe(201);
      expect(
        await getDb().auditLog.count({
          where: {
            tenantId,
            resourceId: id,
            action: "attendance.reopened",
            reason: reason.reason,
          },
        }),
      ).toBe(1);
      await getDb().student.update({
        where: { id: students[0]!.id },
        data: { fullName: "Changed afterwards" },
      });
      expect(
        (
          await api(`/sessions/${id}/roster`, "GET", undefined, teacherToken)
        ).body.data.rows.find(
          (r: { studentId: string }) => r.studentId === students[0]!.id,
        ).fullName,
      ).toBe("ROSTER-00");
      await expect(
        getDb().rosterRow.updateMany({
          where: { tenantId, sessionId: id },
          data: { displayName: "tampered" },
        }),
      ).rejects.toThrow("immutable");
      expect(
        await getDb().outboxEvent.count({
          where: {
            tenantId,
            aggregateId: id,
            eventType: "ATTENDANCE_FINALIZED_ABSENT",
          },
        }),
      ).toBe(1);
    });
    it("TC013/014/025: validates exact decimal grades and publishes only assigned, eligible results", async () => {
      const classId = (
        await getDb().educationClass.findFirstOrThrow({
          where: { tenantId, code: "ATTENDANCE-20" },
        })
      ).id;
      const create = {
        title: "Assessment ten",
        heldAt: "2026-11-02",
        maxScore: "10.00",
      };
      expect(
        (
          await api(
            `/classes/${classId}/assessments`,
            "POST",
            create,
            wrongTeacherToken,
          )
        ).status,
      ).toBe(404);
      const created = await api(
        `/classes/${classId}/assessments`,
        "POST",
        create,
        teacherToken,
      );
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect(
        (await api("/mobile/my/grades", "GET", undefined, studentToken)).body
          .data,
      ).toEqual([]);
      const rows = (
        await api(`/assessments/${id}/results`, "GET", undefined, teacherToken)
      ).body.data.rows as { studentId: string }[];
      expect(rows).toHaveLength(20);
      expect(
        (
          await api(
            `/assessments/${id}/results`,
            "PUT",
            {
              version: 1,
              records: [
                { studentId: rows[0]!.studentId, score: "11.00", comment: "" },
              ],
            },
            teacherToken,
          )
        ).status,
      ).toBe(422);
      expect(
        await getDb().assessmentResult.count({
          where: { tenantId, assessmentId: id },
        }),
      ).toBe(0);
      expect(
        (
          await api(
            `/assessments/${id}/results`,
            "PUT",
            {
              version: 1,
              records: [{ studentId: rows[0]!.studentId, comment: "" }],
            },
            teacherToken,
          )
        ).status,
      ).toBe(422);
      const saved = await api(
        `/assessments/${id}/results`,
        "PUT",
        {
          version: 1,
          records: rows.map((r) => ({
            studentId: r.studentId,
            score: "8.00",
            comment: "Published feedback",
          })),
        },
        teacherToken,
      );
      expect(saved.status).toBe(200);
      expect(
        (await api("/mobile/my/grades", "GET", undefined, studentToken)).body
          .data,
      ).toEqual([]);
      const published = await api(
        `/assessments/${id}/publish`,
        "POST",
        { version: 2 },
        teacherToken,
      );
      expect(published.status).toBe(201);
      const own = await api(
        "/mobile/my/grades",
        "GET",
        undefined,
        studentToken,
      );
      expect(own.status).toBe(200);
      expect(own.body.data).toHaveLength(1);
      expect(own.body.data[0].score).toBe("8.00");
      const child = await getDb().student.findFirstOrThrow({
        where: { tenantId, userId: studentUserId },
      });
      expect(
        (
          await api(
            `/mobile/guardian/students/${child.id}/grades`,
            "GET",
            undefined,
            guardianToken,
          )
        ).body.data[0].score,
      ).toBe("8.00");
      expect(
        (
          await api(
            `/assessments/${id}/results`,
            "PUT",
            { version: 3, records: [] },
            teacherToken,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await api(
            `/assessments/${id}/results`,
            "GET",
            undefined,
            studentToken,
          )
        ).status,
      ).toBe(403);
    });
    it("TC015/016/017/018/026: exact money, repeated invoice run, payment races, rollback, linked receipts and immutable ledger", async () => {
      const db = getDb(),
        classId = (
          await db.educationClass.findFirstOrThrow({
            where: { tenantId, code: "ATTENDANCE-20" },
          })
        ).id;
      const s = await db.student.findFirstOrThrow({
        where: { tenantId, userId: studentUserId },
      });
      const fee = await api("/fee-plans", "POST", {
        classId,
        name: "November tuition",
        billingModel: "MONTHLY",
        amountVnd: "1200000",
        validFrom: "2026-11-01",
        validTo: "2026-12-31",
      });
      expect(fee.status).toBe(201);
      const input = {
          feePlanId: fee.body.data.id,
          periodKey: "2026-11",
          dueAt: "2020-11-10T23:59:00Z",
        },
        runKey = randomUUID();
      const runs = await Promise.all(
        [1, 2].map(() =>
          api("/invoices/generate-run", "POST", input, ownerToken, runKey),
        ),
      );
      expect(runs.map((v) => v.status)).toEqual([201, 201]);
      expect(runs[0]!.body.data).toEqual(runs[1]!.body.data);
      expect(await db.invoice.count({ where: { tenantId } })).toBe(20);
      const invoice = runs[0]!.body.data.invoices.find(
        (i: { studentId: string }) => i.studentId === s.id,
      ) as { id: string };
      const partial = {
        studentId: s.id,
        method: "BANK_TRANSFER",
        receivedAmountVnd: "500000",
        receivedAt: "2026-11-05T03:15:00Z",
        allocations: [{ invoiceId: invoice.id, amountVnd: "500000" }],
      };
      const payKey = randomUUID(),
        paid = await Promise.all(
          [1, 2].map(() =>
            api("/payments", "POST", partial, ownerToken, payKey),
          ),
        );
      expect(paid.map((v) => v.status)).toEqual([201, 201]);
      expect(paid[0]!.body.data).toEqual(paid[1]!.body.data);
      expect(
        await db.payment.count({ where: { tenantId, studentId: s.id } }),
      ).toBe(1);
      expect(paid[0]!.body.data.invoiceBalances[0]).toMatchObject({
        balanceVnd: "700000",
        paymentStatus: "OVERDUE",
      });
      expect(
        (
          await api(
            "/payments",
            "POST",
            { ...partial, receivedAmountVnd: "600000" },
            ownerToken,
            payKey,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await api(
            "/payments",
            "POST",
            {
              ...partial,
              receivedAmountVnd: "100",
              allocations: [{ invoiceId: invoice.id, amountVnd: "500000" }],
            },
            ownerToken,
            randomUUID(),
          )
        ).status,
      ).toBe(422);
      const rest = {
        ...partial,
        receivedAmountVnd: "700000",
        allocations: [{ invoiceId: invoice.id, amountVnd: "700000" }],
      };
      const race = await Promise.all(
        [1, 2].map(() =>
          api("/payments", "POST", rest, ownerToken, randomUUID()),
        ),
      );
      expect(race.map((v) => v.status).sort()).toEqual([201, 422]);
      expect((await api(`/invoices/${invoice.id}`)).body.data).toMatchObject({
        balanceVnd: "0",
        paymentStatus: "PAID",
      });
      expect(
        (
          await api(
            `/payments/${paid[0]!.body.data.id}`,
            "GET",
            undefined,
            guardianToken,
          )
        ).status,
      ).toBe(200);
      const other = await db.invoice.findFirstOrThrow({
        where: { tenantId, studentId: { not: s.id } },
      });
      expect(
        (await api(`/invoices/${other.id}`, "GET", undefined, guardianToken))
          .status,
      ).toBe(404);
      expect(
        (await api(`/invoices/${invoice.id}`, "GET", undefined, teacherToken))
          .status,
      ).toBe(403);
      expect(
        (
          await api(`/invoices/${invoice.id}/void`, "POST", {
            reason: "Attempt void with allocations",
          })
        ).status,
      ).toBe(409);
      await expect(
        db.invoice.update({
          where: { id: invoice.id },
          data: { totalAmountVnd: 1n },
        }),
      ).rejects.toThrow("immutable");
      await expect(
        db.payment.delete({ where: { id: paid[0]!.body.data.id } }),
      ).rejects.toThrow("cannot be deleted");
      const reversed = await api(
        `/payments/${paid[0]!.body.data.id}/reverse`,
        "POST",
        { reason: "Operator confirmed incorrect receipt" },
      );
      expect(reversed.status).toBe(201);
      expect((await api(`/invoices/${invoice.id}`)).body.data.balanceVnd).toBe(
        "500000",
      );
      expect(
        await db.paymentReversal.count({
          where: { tenantId, paymentId: paid[0]!.body.data.id },
        }),
      ).toBe(1);
    });
    it("reschedules and cancels with versioned history; room conflicts are rejected", async () => {
      const db = getDb(),
        classId = (
          await db.educationClass.findFirstOrThrow({
            where: { tenantId, code: "ATTENDANCE-20" },
          })
        ).id;
      const room = await api("/rooms", "POST", {
        code: "R1",
        name: "Room one",
        capacity: 20,
      });
      expect(room.status).toBe(201);
      const slot = {
        teacherId,
        roomId: room.body.data.id,
        startsAt: "2026-11-06T11:00:00Z",
        endsAt: "2026-11-06T12:00:00Z",
      };
      const created = await api(
        `/classes/${classId}/sessions/extra`,
        "POST",
        slot,
      );
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      const change = {
        ...slot,
        startsAt: "2026-11-07T11:00:00Z",
        endsAt: "2026-11-07T12:00:00Z",
        sessionVersion: 1,
        reason: "Change approved by center",
      };
      expect(
        (await api(`/sessions/${id}/reschedule`, "POST", change, teacherToken))
          .status,
      ).toBe(403);
      const changed = await api(`/sessions/${id}/reschedule`, "POST", change);
      expect(changed.status).toBe(201);
      expect(changed.body.data.changeCount).toBe(1);
      expect(
        (await api(`/sessions/${id}/reschedule`, "POST", change)).status,
      ).toBe(409);
      expect(
        (await api(`/classes/${classId}/sessions/extra`, "POST", change))
          .status,
      ).toBe(422);
      const duplicate = {
        ...slot,
        startsAt: change.startsAt,
        endsAt: change.endsAt,
      };
      expect(
        (await api(`/classes/${classId}/sessions/extra`, "POST", duplicate))
          .status,
      ).toBe(409);
      expect(
        (
          await api(`/sessions/${id}/cancel`, "POST", {
            sessionVersion: 2,
            reason: "Cancellation approved by center",
          })
        ).status,
      ).toBe(201);
      expect(
        (await api(`/classes/${classId}/sessions/extra`, "POST", duplicate))
          .status,
      ).toBe(201);
      expect(
        await db.sessionChange.count({ where: { tenantId, sessionId: id } }),
      ).toBe(2);
      await expect(
        db.sessionChange.deleteMany({ where: { tenantId, sessionId: id } }),
      ).rejects.toThrow();
      const summary = await api(
        "/mobile/my/attendance/summary?from=2026-11-01&to=2026-11-30",
        "GET",
        undefined,
        studentToken,
      );
      expect(summary.status).toBe(200);
      expect(summary.body.data.total).toBe(0);
      expect(summary.body.data.attendedPercent).toBeNull();
    });
    it("room-only SQL conflicts and grade/report history remain enforced", async () => {
      const db = getDb(),
        first = await db.classSession.findFirstOrThrow({
          where: { tenantId, status: "SCHEDULED", roomId: { not: null } },
        });
      const classId = await cls("ROOM-ONLY", 20),
        other = await db.teacher.findFirstOrThrow({
          where: { tenantId, userId: otherTeacherId },
        });
      expect(
        (
          await api(`/classes/${classId}/teachers`, "POST", {
            teacherId: other.id,
            effectiveFrom: "2026-11-01",
            effectiveTo: "2026-12-31",
          })
        ).status,
      ).toBe(201);
      const slot = {
        teacherId: other.id,
        roomId: first.roomId,
        startsAt: first.startsAt.toISOString(),
        endsAt: first.endsAt.toISOString(),
      };
      expect(
        (await api(`/classes/${classId}/sessions/extra`, "POST", slot)).status,
      ).toBe(409);
      await expect(
        db.classSession.create({
          data: {
            tenantId,
            classId,
            teacherId: other.id,
            roomId: first.roomId,
            scheduledDate: first.scheduledDate,
            startsAt: first.startsAt,
            endsAt: first.endsAt,
          },
        }),
      ).rejects.toThrow();
      const assessment = await db.assessment.findFirstOrThrow({
        where: { tenantId, status: "PUBLISHED" },
      });
      const correction = {
        version: assessment.version,
        reason: "Verified published score correction",
      };
      expect(
        (
          await api(
            `/assessments/${assessment.id}/reopen`,
            "POST",
            correction,
            teacherToken,
          )
        ).status,
      ).toBe(403);
      expect(
        (await api(`/assessments/${assessment.id}/reopen`, "POST", correction))
          .status,
      ).toBe(201);
      expect(
        (await api("/mobile/my/grades", "GET", undefined, studentToken)).body
          .data,
      ).toEqual([]);
      const records = await db.assessmentResult.findMany({
        where: { tenantId, assessmentId: assessment.id },
      });
      expect(
        (
          await api(
            `/assessments/${assessment.id}/results`,
            "PUT",
            {
              version: assessment.version + 1,
              records: records.map((r) => ({
                studentId: r.studentId,
                score: "8.50",
                comment: "Verified correction",
              })),
            },
            teacherToken,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await api(
            `/assessments/${assessment.id}/publish`,
            "POST",
            { version: assessment.version + 2 },
            teacherToken,
          )
        ).status,
      ).toBe(201);
      const changes = await db.gradeChange.findMany({
        where: {
          tenantId,
          assessmentId: assessment.id,
          version: assessment.version + 2,
        },
      });
      expect(changes).toHaveLength(20);
      expect(changes[0]!.beforeValue).toMatchObject({ score: "8.00" });
      await expect(
        db.gradeChange.deleteMany({
          where: { tenantId, assessmentId: assessment.id },
        }),
      ).rejects.toThrow();
      for (let n = 0; n < 2; n++)
        expect(
          (
            await api(
              `/sessions/${first.id}/lesson-report`,
              "PUT",
              {
                sessionVersion: first.version + n,
                lessonSummary: `Revision ${n}`,
                homeworkText: "Homework",
                teacherNotesPrivate: "Private",
              },
              teacherToken,
            )
          ).status,
        ).toBe(200);
      expect(
        await db.lessonRevision.count({
          where: { tenantId, sessionId: first.id },
        }),
      ).toBe(2);
      await expect(
        db.lessonRevision.deleteMany({
          where: { tenantId, sessionId: first.id },
        }),
      ).rejects.toThrow();
    });
    it("guardian link stays hidden until verified and is denied immediately after revocation", async () => {
      const child = await student("PENDING-CHILD");
      const link = await api(`/students/${child.id}/guardians`, "POST", {
        guardianUserId: guardianId,
        relationType: "PARENT",
      });
      expect(link.status).toBe(201);
      const detail = () =>
        api(
          `/mobile/guardian/students/${child.id}/profile`,
          "GET",
          undefined,
          guardianToken,
        );
      expect((await detail()).status).toBe(404);
      const path = `/students/${child.id}/guardians/${link.body.data.id}/approve`;
      expect(
        (
          await api(
            path,
            "POST",
            { verificationMethod: "Verified synthetic guardian" },
            teacherToken,
          )
        ).status,
      ).toBe(403);
      expect((await api(path, "POST", {})).status).toBe(422);
      expect(
        (
          await api(path, "POST", {
            verificationMethod: "Verified synthetic guardian",
          })
        ).status,
      ).toBe(201);
      expect((await detail()).status).toBe(200);
      expect(
        (
          await api(
            `/students/${child.id}/guardians/${link.body.data.id}`,
            "DELETE",
            { reason: "Synthetic access revocation" },
          )
        ).status,
      ).toBe(200);
      expect((await detail()).status).toBe(404);
    });
    it("TC019/022 technical: materializes once, invalidates rejected device, keeps inbox and reauthorizes after guardian revocation", async () => {
      const db = getDb(),
        s = await db.student.findFirstOrThrow({
          where: { tenantId, userId: studentUserId },
        });
      const payment = await db.payment.findFirstOrThrow({
          where: { tenantId, studentId: s.id, status: "CONFIRMED" },
        }),
        event = await db.outboxEvent.findFirstOrThrow({
          where: {
            tenantId,
            aggregateId: payment.id,
            eventType: "PAYMENT_RECORDED",
          },
        });
      const oldProvider = process.env.PUSH_PROVIDER,
        oldPolicy = process.env.PRIVACY_POLICY_VERSION;
      process.env.PUSH_PROVIDER = "expo";
      process.env.PRIVACY_POLICY_VERSION = "synthetic-policy-v1";
      try {
        await db.privacyConsent.create({
          data: {
            tenantId,
            subjectStudentId: s.id,
            consentingUserId: guardianId,
            policyVersion: "synthetic-policy-v1",
            purposeCode: "NOTIFICATIONS",
            legalBasis: "CONSENT",
            granted: true,
          },
        });
        const prefs = {
          pushEnabled: true,
          attendance: true,
          grades: true,
          finance: true,
          schedule: true,
        };
        expect(
          (
            await api(
              "/me/notification-preferences",
              "PATCH",
              prefs,
              guardianToken,
            )
          ).status,
        ).toBe(200);
        const deviceToken = "ExpoPushToken[synthetic-test-token-123456]";
        expect(
          (
            await api(
              "/mobile/devices/push-token",
              "POST",
              { token: deviceToken, platform: "android" },
              guardianToken,
            )
          ).status,
        ).toBe(201);
        const device = await db.devicePushToken.findFirstOrThrow({
          where: { userId: guardianId },
        });
        expect(device.tokenEncrypted).not.toContain(deviceToken);
        let calls = 0;
        let payload = "";
        const provider: typeof fetch = async (_input, init) => {
          calls++;
          payload = String(init?.body);
          return new Response(
            JSON.stringify({
              data: {
                status: "error",
                details: { error: "DeviceNotRegistered" },
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        };
        const { deliverDomainEvent } = await import(
          "../../apps/worker/dist/notifications.js"
        );
        for (let retry = 0; retry < 3; retry++)
          await deliverDomainEvent(db, event.id, provider);
        expect(calls).toBe(1);
        expect(
          await db.notification.count({
            where: { eventId: event.id, recipientUserId: guardianId },
          }),
        ).toBe(1);
        expect(
          (
            await db.devicePushToken.findUniqueOrThrow({
              where: { id: device.id },
            })
          ).status,
        ).toBe("INVALID");
        const sent = JSON.parse(payload) as {
          data: Record<string, string>;
          title: string;
          body: string;
        };
        expect(Object.keys(sent.data)).toEqual(["notificationId"]);
        expect(payload).not.toContain("700000");
        expect(payload).not.toContain(s.fullName);
        expect(payload).not.toContain(s.id);
        const notification = await db.notification.findFirstOrThrow({
          where: { eventId: event.id, recipientUserId: guardianId },
        });
        expect(
          (
            await api(
              `/notifications/${notification.id}`,
              "GET",
              undefined,
              guardianToken,
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await api(
              `/notifications/${notification.id}`,
              "GET",
              undefined,
              studentToken,
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await api(
              `/notifications/${notification.id}/read`,
              "PATCH",
              {},
              guardianToken,
            )
          ).status,
        ).toBe(200);
        const link = await db.guardianLink.findFirstOrThrow({
          where: { tenantId, guardianUserId: guardianId, studentId: s.id },
        });
        await db.guardianLink.update({
          where: { id: link.id },
          data: { status: "REVOKED" },
        });
        try {
          expect(
            (
              await api(
                `/notifications/${notification.id}`,
                "GET",
                undefined,
                guardianToken,
              )
            ).status,
          ).toBe(404);
          expect(
            (await api("/notifications", "GET", undefined, guardianToken)).body
              .data,
          ).toEqual([]);
        } finally {
          await db.guardianLink.update({
            where: { id: link.id },
            data: { status: "ACTIVE" },
          });
        }
        const foreign = await db.student.findFirstOrThrow({
          where: { tenantId: { not: tenantId } },
        });
        expect(
          (
            await api(
              "/privacy/requests",
              "POST",
              { type: "EXPORT", subjectStudentId: foreign.id },
              guardianToken,
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await api(
              "/privacy/requests",
              "POST",
              { type: "EXPORT", subjectStudentId: s.id },
              studentToken,
            )
          ).status,
        ).toBe(201);
        expect(
          (await api("/auth/logout", "POST", {}, guardianToken)).status,
        ).toBe(200);
        expect(
          (
            await db.devicePushToken.findUniqueOrThrow({
              where: { id: device.id },
            })
          ).status,
        ).toBe("REVOKED");
      } finally {
        if (oldProvider === undefined) delete process.env.PUSH_PROVIDER;
        else process.env.PUSH_PROVIDER = oldProvider;
        if (oldPolicy === undefined) delete process.env.PRIVACY_POLICY_VERSION;
        else process.env.PRIVACY_POLICY_VERSION = oldPolicy;
      }
    });
  });
}
