import { beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

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
    it("TC007: recurring preview detects conflict, atomic commit rechecks, retries and concurrent generation are idempotent", async () => {
      const db = getDb(),
        classId = await cls("RECURRING", 20),
        other = await cls("RECURRING-CONFLICT", 20);
      for (const id of [classId, other])
        expect(
          (
            await api(`/classes/${id}/teachers`, "POST", {
              teacherId,
              effectiveFrom: "2026-11-01",
              effectiveTo: "2026-12-31",
            })
          ).status,
        ).toBe(201);
      const path = `/classes/${classId}/schedule-rules`;
      const body = {
        teacherId,
        weekday: 1,
        localStart: "06:00",
        localEnd: "07:00",
        validFrom: "2026-11-01",
        validTo: "2026-11-30",
      };
      expect((await api(path, "POST", body, teacherToken)).status).toBe(403);
      expect(
        (await api(path, "POST", { ...body, localEnd: "05:00" })).status,
      ).toBe(422);
      const ruleCount = await db.scheduleRule.count({
        where: { tenantId, classId },
      });
      const auditCount = await db.auditLog.count({
        where: { tenantId, action: "schedule.rule.created" },
      });
      const draft = await api(path + "/preview", "POST", body);
      expect(draft.status).toBe(200);
      expect(draft.body.data.candidates).toHaveLength(5);
      expect(
        await db.scheduleRule.count({ where: { tenantId, classId } }),
      ).toBe(ruleCount);
      expect(
        await db.auditLog.count({
          where: { tenantId, action: "schedule.rule.created" },
        }),
      ).toBe(auditCount);
      expect(
        (await api(path + "/preview", "POST", body, teacherToken)).status,
      ).toBe(403);
      const rule = await api(path, "POST", body);
      expect(rule.status).toBe(201);
      expect(rule.body.data.timezone).toBe("Asia/Ho_Chi_Minh");
      const ruleId = rule.body.data.id as string,
        window = { from: "2026-11-01", to: "2026-11-30" };
      const previewPath = `${path}/${ruleId}/preview?from=${window.from}&to=${window.to}`;
      const preview = await api(previewPath);
      expect(preview.status).toBe(200);
      expect(preview.body.data.candidates).toHaveLength(5);
      expect(preview.body.data.candidates[0]).toMatchObject({
        scheduledDate: "2026-11-02",
        startsAt: "2026-11-01T23:00:00.000Z",
        status: "AVAILABLE",
      });
      expect(
        await db.classSession.count({ where: { scheduleRuleId: ruleId } }),
      ).toBe(0);
      // A competing schedule arrives after the successful preview.
      const extra = await api(`/classes/${other}/sessions/extra`, "POST", {
        teacherId,
        startsAt: "2026-11-01T23:00:00Z",
        endsAt: "2026-11-02T00:00:00Z",
      });
      expect(extra.status).toBe(201);
      expect((await api(previewPath)).body.data.candidates[0].status).toBe(
        "CONFLICT",
      );
      expect(
        (await api(path + "/preview", "POST", body)).body.data.candidates[0]
          .status,
      ).toBe("CONFLICT");
      expect((await api(path, "POST", body)).status).toBe(409);
      expect(
        await db.scheduleRule.count({ where: { tenantId, classId } }),
      ).toBe(1);
      expect(
        (await api(`${path}/${ruleId}/generate`, "POST", window)).status,
      ).toBe(409);
      expect(
        await db.classSession.count({ where: { scheduleRuleId: ruleId } }),
      ).toBe(0);
      expect(
        (
          await api(`/sessions/${extra.body.data.id}/cancel`, "POST", {
            sessionVersion: 1,
            reason: "Synthetic recurring conflict resolved",
          })
        ).status,
      ).toBe(201);
      const generated = await Promise.all(
        [1, 2].map(() => api(`${path}/${ruleId}/generate`, "POST", window)),
      );
      expect(generated.map((v) => v.status)).toEqual([201, 201]);
      expect(generated.map((v) => v.body.data.created).sort()).toEqual([0, 5]);
      expect(
        await db.classSession.count({
          where: { scheduleRuleId: ruleId, sessionType: "REGULAR" },
        }),
      ).toBe(5);
      const first = await db.classSession.findFirstOrThrow({
        where: { scheduleRuleId: ruleId },
        orderBy: { scheduledDate: "asc" },
      });
      await db.classSession.update({
        where: { id: first.id },
        data: { changeCount: 1, version: 2 },
      });
      expect(
        (await api(`${path}/${ruleId}/generate`, "POST", window)).body.data
          .skipped,
      ).toBe(5);
      expect(
        (await db.classSession.findUniqueOrThrow({ where: { id: first.id } }))
          .version,
      ).toBe(2);
      expect(
        (
          await api(
            `/classes/${other}/schedule-rules/${ruleId}/preview?from=2026-11-01&to=2026-11-30`,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(`${path}/${ruleId}/generate`, "POST", {
            from: "2026-11-01",
            to: "2027-02-01",
          })
        ).status,
      ).toBe(422);
    });
    it("TC003: CSV100 previews five invalid rows, atomic commit, duplicate retry, fresh collision and tenant/role isolation", async () => {
      const db = getDb(),
        header = "studentCode,fullName,contactEmail\n";
      const lines = Array.from(
        { length: 100 },
        (_, i) => `CSV${i},Synthetic learner ${i},learner${i}@example.test`,
      );
      for (let i = 0; i < 5; i++)
        lines[i] = `CSV${i},Synthetic learner ${i},invalid-email`;
      const invalid = await api("/students/imports", "POST", {
        csv: header + lines.join("\n"),
      });
      expect(invalid.status).toBe(201);
      expect(invalid.body.data).toMatchObject({
        rowCount: 100,
        errorCount: 5,
        status: "PREVIEW",
      });
      expect(
        (
          await api(
            `/students/imports/${invalid.body.data.id}/commit`,
            "POST",
            {},
          )
        ).status,
      ).toBe(409);
      expect(
        await db.student.count({
          where: { tenantId, studentCode: { startsWith: "CSV" } },
        }),
      ).toBe(0);
      expect(
        (
          await api(
            "/students/imports",
            "POST",
            { csv: header + "X,Name,name@example.test" },
            teacherToken,
          )
        ).status,
      ).toBe(403);
      const foreignMembership = await db.membership.findFirstOrThrow({
        where: { tenantId: { not: tenantId } },
      });
      const foreign = await db.studentImport.create({
        data: {
          tenantId: foreignMembership.tenantId,
          actorId: foreignMembership.userId,
          rowCount: 1,
          errorCount: 0,
          rowsJson: [
            { studentCode: "FOREIGN_IMPORT", fullName: "Foreign synthetic" },
          ],
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      expect((await api(`/students/imports/${foreign.id}`)).status).toBe(404);
      expect(
        (await api(`/students/imports/${foreign.id}/commit`, "POST", {}))
          .status,
      ).toBe(404);
      const valid = await api("/students/imports", "POST", {
        csv: "studentCode,fullName\nCSVGOOD1,Synthetic one\nCSVGOOD2,Synthetic two",
      });
      const id = valid.body.data.id as string;
      expect(valid.status).toBe(201);
      const committed = await Promise.all(
        [1, 2].map(() => api(`/students/imports/${id}/commit`, "POST", {})),
      );
      expect(committed.map((v) => v.status)).toEqual([201, 201]);
      expect(committed.map((v) => v.body.data.status)).toEqual([
        "COMMITTED",
        "COMMITTED",
      ]);
      expect(
        await db.student.count({
          where: { tenantId, studentCode: { in: ["CSVGOOD1", "CSVGOOD2"] } },
        }),
      ).toBe(2);
      expect(
        (await db.studentImport.findUniqueOrThrow({ where: { id } })).rowsJson,
      ).toBeNull();
      expect(
        await db.auditLog.count({
          where: {
            tenantId,
            resourceId: id,
            action: "student.import.committed",
          },
        }),
      ).toBe(1);
      const stale = await api("/students/imports", "POST", {
        csv: "studentCode,fullName\nCSVCOLLIDE,First\nCSVROLLBACK,Second",
      });
      await student("CSVCOLLIDE");
      expect(
        (await api(`/students/imports/${stale.body.data.id}`)).body.data
          .errorCount,
      ).toBe(1);
      expect(
        (
          await api(
            `/students/imports/${stale.body.data.id}/commit`,
            "POST",
            {},
          )
        ).status,
      ).toBe(409);
      expect(
        await db.student.count({
          where: { tenantId, studentCode: "CSVROLLBACK" },
        }),
      ).toBe(0);
      // Same tenant, different actor cannot inspect or commit the preview.
      await db.membershipRole.create({
        data: {
          membershipId: (
            await db.membership.findFirstOrThrow({
              where: { tenantId, userId: otherTeacherId },
            })
          ).id,
          role: "academic_staff",
        },
      });
      const staffToken = await context(
        otherTeacherId + "@example.test",
        "academic_staff",
      );
      expect(
        (
          await api(
            `/students/imports/${stale.body.data.id}`,
            "GET",
            undefined,
            staffToken,
          )
        ).status,
      ).toBe(404);
      await db.studentImport.update({
        where: { id: stale.body.data.id },
        data: { expiresAt: new Date(0) },
      });
      expect(
        (await api(`/students/imports/${stale.body.data.id}`)).status,
      ).toBe(404);
      expect(
        (
          await api(
            `/students/imports/${stale.body.data.id}/commit`,
            "POST",
            {},
          )
        ).status,
      ).toBe(409);
    });
    it("class and teacher lifecycle: optimistic writes, effective withdrawal, re-enroll, capacity and closed-class safety", async () => {
      const db = getDb(),
        classId = await cls("LIFECYCLE", 1),
        s = await student("LIFECYCLE-STUDENT");
      const enrollment = await api(`/classes/${classId}/enrollments`, "POST", {
        studentId: s.id,
        joinedAt: "2026-11-01",
      });
      expect(enrollment.status).toBe(201);
      const withdrawPath = `/classes/${classId}/enrollments/${enrollment.body.data.id}/withdraw`;
      expect(
        (
          await api(withdrawPath, "POST", {
            version: 1,
            leftAt: "2026-11-10",
            reason: "Synthetic withdrawal for lifecycle test",
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await api(withdrawPath, "POST", {
            version: 1,
            leftAt: "2026-11-10",
            reason: "Synthetic duplicate withdrawal test",
          })
        ).status,
      ).toBe(409);
      const another = await student("LIFECYCLE-SEAT");
      expect(
        (
          await api(`/classes/${classId}/enrollments`, "POST", {
            studentId: another.id,
            joinedAt: "2026-11-10",
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await api(`/classes/${classId}/enrollments`, "POST", {
            studentId: s.id,
            joinedAt: "2026-11-11",
          })
        ).status,
      ).toBe(201);
      const reason = "Synthetic lifecycle version validation";
      expect(
        (
          await api(`/classes/${classId}`, "PATCH", {
            version: 1,
            name: "Updated",
            capacity: 2,
            reason,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api(`/classes/${classId}`, "PATCH", {
            version: 1,
            name: "Stale",
            capacity: 1,
            reason,
          })
        ).status,
      ).toBe(409);
      expect(
        (await api(`/classes/${classId}/close`, "POST", { version: 2, reason }))
          .status,
      ).toBe(409);
      const empty = await cls("LIFECYCLE-CLOSE", 2);
      expect(
        (await api(`/classes/${empty}/close`, "POST", { version: 1, reason }))
          .status,
      ).toBe(201);
      expect(
        (
          await api(`/classes/${empty}/enrollments`, "POST", {
            studentId: s.id,
            joinedAt: "2026-11-01",
          })
        ).status,
      ).toBe(404);
      const profile = await db.teacher.findFirstOrThrow({
        where: { tenantId, userId: otherTeacherId },
      });
      expect(
        (
          await api(`/teachers/${profile.id}`, "PATCH", {
            version: 1,
            fullName: "Inactive synthetic teacher",
            status: "INACTIVE",
            reason,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api(`/classes/${classId}/teachers`, "POST", {
            teacherId: profile.id,
            effectiveFrom: "2026-11-01",
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await api(`/teachers/${profile.id}`, "PATCH", {
            version: 1,
            fullName: "Stale",
            status: "ACTIVE",
            reason,
          })
        ).status,
      ).toBe(409);
      expect(
        (await api(`/teachers/${profile.id}`, "GET", undefined, teacherToken))
          .status,
      ).toBe(403);
      expect(
        (await api("/teachers?limit=20&page=1")).body.data.length,
      ).toBeGreaterThanOrEqual(2);
      // Restore independent fixture for later existing scheduling tests.
      await db.teacher.update({
        where: { id: profile.id },
        data: { status: "ACTIVE" },
      });
    });
    it("TC029: new lifecycle, recurring, calendar and directory routes keep tenant/object scope and READ_ONLY enforcement", async () => {
      const db = getDb(),
        foreignMembership = await db.membership.findFirstOrThrow({
          where: { tenantId: { not: tenantId } },
        });
      const foreignTenant = foreignMembership.tenantId;
      const foreignRoom = await db.room.create({
        data: {
          tenantId: foreignTenant,
          code: "FOREIGN-SCOPE",
          name: "Foreign synthetic room",
          capacity: 10,
        },
      });
      const foreignTeacher = await db.teacher.create({
        data: {
          tenantId: foreignTenant,
          userId: foreignMembership.userId,
          teacherCode: "FOREIGN-SCOPE",
          fullName: "Foreign synthetic teacher",
        },
      });
      const foreignClass = await db.educationClass.create({
        data: {
          tenantId: foreignTenant,
          code: "FOREIGN-SCOPE",
          name: "Foreign synthetic class",
          capacity: 10,
          startDate: new Date("2026-11-01Z"),
          endDate: new Date("2026-12-31Z"),
        },
      });
      const foreignRuleId = randomUUID();
      const foreignRule = await db.scheduleRule.create({
        data: {
          id: foreignRuleId,
          lineageId: foreignRuleId,
          tenantId: foreignTenant,
          classId: foreignClass.id,
          teacherId: foreignTeacher.id,
          weekday: 1,
          localStart: "09:00",
          localEnd: "10:00",
          validFrom: new Date("2026-11-01Z"),
          validTo: new Date("2026-11-30Z"),
          timezone: "Asia/Ho_Chi_Minh",
        },
      });
      const ownClass = await cls("RULE-FK-NEGATIVE", 2);
      await expect(
        db.classSession.create({
          data: {
            tenantId,
            classId: ownClass,
            teacherId,
            scheduleRuleId: foreignRule.id,
            ruleOccurrenceDate: new Date("2026-12-20Z"),
            sessionType: "REGULAR",
            scheduledDate: new Date("2026-12-20Z"),
            startsAt: new Date("2026-12-20T01:00:00Z"),
            endsAt: new Date("2026-12-20T02:00:00Z"),
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
      const reason = "Synthetic negative isolation test";
      const requests: Array<[string, string, unknown?]> = [
        [`/teachers/${foreignTeacher.id}`, "GET"],
        [
          `/teachers/${foreignTeacher.id}`,
          "PATCH",
          {
            version: 1,
            fullName: "Attempted change",
            status: "INACTIVE",
            reason,
          },
        ],
        [
          `/classes/${foreignClass.id}`,
          "PATCH",
          { version: 1, name: "Attempted change", capacity: 10, reason },
        ],
        [`/classes/${foreignClass.id}/close`, "POST", { version: 1, reason }],
        [`/classes/${foreignClass.id}/schedule-rules`, "GET"],
        [
          `/classes/${foreignClass.id}/schedule-rules/${foreignRule.id}/preview?from=2026-11-01&to=2026-11-30`,
          "GET",
        ],
        [
          `/classes/${foreignClass.id}/schedule-rules/${foreignRule.id}/generate`,
          "POST",
          { from: "2026-11-01", to: "2026-11-30" },
        ],
        [
          `/classes/${foreignClass.id}/sessions?from=2026-11-01&to=2026-11-30`,
          "GET",
        ],
      ];
      for (const [path, method, body] of requests)
        expect((await api(path, method, body)).status, path).toBe(404);
      expect(
        (
          await api(
            `/schedule?from=2026-11-01&to=2026-11-30&classId=${foreignClass.id}`,
          )
        ).body.data,
      ).toEqual([]);
      expect(
        (await api("/rooms")).body.data.every(
          (row: { id: string }) => row.id !== foreignRoom.id,
        ),
      ).toBe(true);
      await db.tenant.update({
        where: { id: tenantId },
        data: { status: "READ_ONLY" },
      });
      try {
        expect((await api("/teachers")).status).toBe(200);
        expect(
          (
            await api("/students/imports", "POST", {
              csv: "studentCode,fullName\nREADONLY,Blocked",
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await api(`/classes/${foreignClass.id}/close`, "POST", {
              version: 1,
              reason,
            })
          ).status,
        ).toBe(403);
      } finally {
        await db.tenant.update({
          where: { id: tenantId },
          data: { status: "ACTIVE" },
        });
      }
      const { purgeExpiredImports } = await import(
        "../../apps/worker/dist/import-retention.js"
      );
      await purgeExpiredImports(db);
      expect(
        await db.studentImport.count({
          where: { status: "PREVIEW", expiresAt: { lte: new Date() } },
        }),
      ).toBe(0);
      const expired = await db.studentImport.findMany({
        where: { status: "EXPIRED" },
        select: { rowsJson: true },
      });
      expect(expired.length).toBeGreaterThan(0);
      expect(expired.every((job) => job.rowsJson === null)).toBe(true);
    });
    it("TC027: replaces only future untouched occurrences, preserves manual/snapshotted/completed lessons, and rolls back a conflicting edit", async () => {
      const db = getDb(),
        classId = await cls("RECURRING-REVISIONS", 5);
      expect(
        (
          await api(`/classes/${classId}/teachers`, "POST", {
            teacherId,
            effectiveFrom: "2026-11-01",
            effectiveTo: "2026-12-31",
          })
        ).status,
      ).toBe(201);
      const ruleInput = {
        teacherId,
        weekday: 1,
        localStart: "08:00",
        localEnd: "09:00",
        validFrom: "2026-11-01",
        validTo: "2026-12-07",
      };
      const oldRule = (
        await api(`/classes/${classId}/schedule-rules`, "POST", ruleInput)
      ).body.data;
      const basePath = `/classes/${classId}/schedule-rules/${oldRule.id}`;
      expect(
        (
          await api(basePath + "/generate", "POST", {
            from: "2026-11-01",
            to: "2026-12-07",
          })
        ).status,
      ).toBe(201);
      const rows = await db.classSession.findMany({
        where: { tenantId, scheduleRuleId: oldRule.id },
        orderBy: { ruleOccurrenceDate: "asc" },
      });
      expect(rows).toHaveLength(6);
      const s = await student("REVISION-ROSTER");
      expect(
        (
          await api(`/classes/${classId}/enrollments`, "POST", {
            studentId: s.id,
            joinedAt: "2026-11-01",
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await api(`/sessions/${rows[1]!.id}/reschedule`, "POST", {
            teacherId,
            sessionVersion: 1,
            startsAt: "2026-11-10T01:00:00Z",
            endsAt: "2026-11-10T02:00:00Z",
            reason: "Manual date move must retain original occurrence",
          })
        ).status,
      ).toBe(201);
      // Retrying old generation must not resurrect Monday9 after the manual Tuesday move.
      expect(
        (
          await api(basePath + "/generate", "POST", {
            from: "2026-11-01",
            to: "2026-11-30",
          })
        ).body.data.created,
      ).toBe(0);
      for (const index of [2, 3]) {
        expect(
          (
            await api(`/sessions/${rows[index]!.id}/attendance/draft`, "PUT", {
              sessionVersion: 1,
              records: [{ studentId: s.id, status: "PRESENT" }],
            })
          ).status,
        ).toBe(200);
      }
      expect(
        (
          await api(`/sessions/${rows[3]!.id}/attendance/finalize`, "POST", {
            sessionVersion: 2,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await api(`/sessions/${rows[5]!.id}/lesson-report`, "PUT", {
            sessionVersion: 1,
            lessonSummary:
              "Prepared lesson must not disappear after rule replacement",
            homeworkText: "",
            teacherNotesPrivate: "",
          })
        ).status,
      ).toBe(200);
      const before = await db.classSession.findMany({
        where: {
          id: { in: [rows[1]!.id, rows[2]!.id, rows[3]!.id, rows[5]!.id] },
        },
        orderBy: { id: "asc" },
      });
      const replacementInput = {
        ...ruleInput,
        version: 1,
        validFrom: "2026-11-09",
        localStart: "10:00",
        localEnd: "11:00",
        reason: "Change remaining recurring lessons from next week",
      };
      expect(
        (await api(basePath, "PATCH", replacementInput, teacherToken)).status,
      ).toBe(403);
      const changed = await api(basePath, "PATCH", replacementInput);
      expect(changed.status).toBe(200);
      expect(changed.body.data.lineageId).toBe(oldRule.id);
      expect(changed.body.data.id).not.toBe(oldRule.id);
      const history = await api(
        `/classes/${classId}/schedule-rules/${changed.body.data.id}/history`,
      );
      expect(history.status).toBe(200);
      expect(history.body.data).toHaveLength(1);
      expect(history.body.data[0]).toMatchObject({
        before: { classId, localStart: "08:00", active: true },
        after: { classId, localStart: "10:00", active: true },
        actorId: ownerId,
      });
      expect(
        (
          await api(
            `/classes/${classId}/schedule-rules/${changed.body.data.id}/history`,
            "GET",
            undefined,
            teacherToken,
          )
        ).status,
      ).toBe(403);
      const after = await db.classSession.findMany({
        where: { id: { in: before.map((v) => v.id) } },
        orderBy: { id: "asc" },
      });
      expect(after).toEqual(before);
      expect(
        (
          await db.classSession.findUniqueOrThrow({
            where: { id: rows[4]!.id },
          })
        ).status,
      ).toBe("CANCELLED");
      expect(
        (
          await db.classSession.findUniqueOrThrow({
            where: { id: rows[0]!.id },
          })
        ).version,
      ).toBe(1);
      const newSession = await db.classSession.findFirstOrThrow({
        where: { scheduleRuleId: changed.body.data.id },
      });
      expect(newSession.scheduledDate.toISOString().slice(0, 10)).toBe(
        "2026-11-30",
      );
      expect(newSession.startsAt.toISOString()).toBe(
        "2026-11-30T03:00:00.000Z",
      );
      const preview = await api(
        `/classes/${classId}/schedule-rules/${changed.body.data.id}/preview?from=2026-11-09&to=2026-12-07`,
      );
      expect(
        preview.body.data.candidates.filter(
          (v: { status: string }) => v.status === "PRESERVED",
        ),
      ).toHaveLength(4);
      expect((await api(basePath, "PATCH", replacementInput)).status).toBe(409);
      expect(
        await db.scheduleRuleRevision.count({
          where: { tenantId, ruleId: oldRule.id },
        }),
      ).toBe(1);
      await expect(
        db.$executeRaw`UPDATE schedule_rule_revisions SET reason='forbidden history rewrite' WHERE tenant_id=${tenantId}::uuid AND rule_id=${oldRule.id}::uuid`,
      ).rejects.toThrow();
      await expect(
        db.classSession.update({
          where: { id: rows[1]!.id },
          data: { ruleOccurrenceDate: new Date("2026-11-10Z") },
        }),
      ).rejects.toThrow();
      const other = await cls("REVISION-COMMIT-CONFLICT", 2);
      expect(
        (
          await api(`/classes/${other}/teachers`, "POST", {
            teacherId,
            effectiveFrom: "2026-11-01",
            effectiveTo: "2026-12-31",
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await api(`/classes/${other}/sessions/extra`, "POST", {
            teacherId,
            startsAt: "2026-11-30T05:00:00Z",
            endsAt: "2026-11-30T06:00:00Z",
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await api(
            `/classes/${classId}/schedule-rules/${changed.body.data.id}`,
            "PATCH",
            {
              ...replacementInput,
              version: 1,
              validFrom: "2026-11-30",
              localStart: "12:00",
              localEnd: "13:00",
            },
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await db.classSession.findUniqueOrThrow({
            where: { id: newSession.id },
          })
        ).status,
      ).toBe("SCHEDULED");
      expect(
        (
          await db.scheduleRule.findUniqueOrThrow({
            where: { id: changed.body.data.id },
          })
        ).version,
      ).toBe(1);
      expect(
        await db.scheduleRule.count({ where: { tenantId, classId } }),
      ).toBe(2);
    });
    it("rolling recurring jobs run through real Redis/BullMQ, dedupe retry, advance the60day horizon and recheck subscription", async () => {
      const db = getDb(),
        classId = await cls("ROLLING-JOB", 2);
      expect(
        (
          await api(`/classes/${classId}/teachers`, "POST", {
            teacherId,
            effectiveFrom: "2026-11-01",
            effectiveTo: "2026-12-31",
          })
        ).status,
      ).toBe(201);
      const rule = (
        await api(`/classes/${classId}/schedule-rules`, "POST", {
          teacherId,
          weekday: 4,
          localStart: "05:00",
          localEnd: "06:00",
          validFrom: "2026-11-01",
          validTo: "2026-12-31",
        })
      ).body.data;
      const requireWorker = createRequire(
        path.resolve("apps/worker/package.json"),
      );
      const { Queue, Worker } = requireWorker(
        "bullmq",
      ) as typeof import("../../apps/worker/node_modules/bullmq");
      const { enqueueSchedulePage, generateScheduledRule } = await import(
        "../../apps/worker/dist/schedule-jobs.js"
      );
      const redis = new URL(
        process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6385",
      );
      const connection = {
        host: redis.hostname,
        port: Number(redis.port || "6379"),
        ...(redis.password
          ? { password: decodeURIComponent(redis.password) }
          : {}),
      };
      const prefix = "schedule-test-" + randomUUID();
      const queue = new Queue<{ ruleId: string }>("schedule-generation", {
        connection,
        prefix,
      });
      let now = new Date("2026-11-01T00:00:00Z");
      const worker = new Worker<{ ruleId: string }>(
        "schedule-generation",
        (job) => generateScheduledRule(db, job.data.ruleId, now),
        { connection, prefix },
      );
      try {
        await worker.waitUntilReady();
        await enqueueSchedulePage(db, queue, undefined, now);
        const firstId = `${rule.id}-1-2026-11-01`;
        await expect
          .poll(async () => (await queue.getJob(firstId))?.getState(), {
            timeout: 10000,
          })
          .toBe("completed");
        expect(
          await db.classSession.count({ where: { scheduleRuleId: rule.id } }),
        ).toBe(8);
        await enqueueSchedulePage(db, queue, undefined, now);
        expect(
          await db.classSession.count({ where: { scheduleRuleId: rule.id } }),
        ).toBe(8);
        now = new Date("2026-11-02T00:00:00Z");
        await enqueueSchedulePage(db, queue, undefined, now);
        await expect
          .poll(
            async () =>
              (await queue.getJob(`${rule.id}-1-2026-11-02`))?.getState(),
            { timeout: 10000 },
          )
          .toBe("completed");
        expect(
          await db.classSession.count({ where: { scheduleRuleId: rule.id } }),
        ).toBe(9);
        const audits = await db.auditLog.findMany({
          where: {
            tenantId,
            resourceId: rule.id,
            action: "schedule.rule.generated",
          },
        });
        expect(audits).toHaveLength(2);
        expect(audits.every((v) => v.actorUserId === null)).toBe(true);
        const timezone = (
          await db.tenant.findUniqueOrThrow({ where: { id: tenantId } })
        ).timezone;
        const privateMarker = "Invalid/PRIVATE_FAILURE_SENTINEL";
        await db.tenant.update({
          where: { id: tenantId },
          data: { timezone: privateMarker },
        });
        try {
          const failure = await queue.add(
            "generate",
            { ruleId: rule.id },
            { jobId: "sanitized-failure-" + randomUUID() },
          );
          await expect
            .poll(async () => (await queue.getJob(failure.id!))?.getState(), {
              timeout: 10000,
            })
            .toBe("failed");
          const storedFailure = await queue.getJob(failure.id!);
          expect(storedFailure?.failedReason).toBe(
            "SCHEDULE_GENERATION_FAILED",
          );
          expect(JSON.stringify(storedFailure?.asJSON())).not.toContain(
            privateMarker,
          );
        } finally {
          await db.tenant.update({
            where: { id: tenantId },
            data: { timezone },
          });
        }
        await db.tenant.update({
          where: { id: tenantId },
          data: { status: "READ_ONLY" },
        });
        try {
          await expect(generateScheduledRule(db, rule.id, now)).rejects.toThrow(
            "SCHEDULE_POLICY_REQUIRES_REVIEW",
          );
        } finally {
          await db.tenant.update({
            where: { id: tenantId },
            data: { status: "ACTIVE" },
          });
        }
      } finally {
        await worker.close();
        await queue.obliterate({ force: true }); // this test's random, isolated queue prefix only
        await queue.close();
      }
    });
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
