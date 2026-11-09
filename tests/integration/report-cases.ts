import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  reportSessions,
  reportCollections,
} from "../../apps/api/src/report-queries";
export function reportCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("operational reporting from actual scoped PostgreSQL data", () => {
    const tenant = randomUUID(),
      foreign = randomUUID(),
      cls = randomUUID(),
      cashClass = randomUUID(),
      teacher = randomUUID();
    const roles = [
      "owner",
      "manager",
      "academic_staff",
      "accountant",
      "teacher",
      "guardian",
      "student",
      "foreignOwner",
    ] as const;
    type Actor = (typeof roles)[number];
    const users = Object.fromEntries(
      roles.map((r) => [r, randomUUID()]),
    ) as Record<Actor, string>;
    const tokens: Partial<Record<Actor, string>> = {};
    const student = randomUUID(),
      paused = randomUUID();
    const starts = [
      "2026-10-31T16:00:00Z",
      "2026-10-31T17:00:00Z",
      "2026-11-02T02:00:00Z",
      "2026-11-03T02:00:00Z",
      "2026-11-04T02:00:00Z",
      "2026-11-05T02:00:00Z",
      "2026-11-06T02:00:00Z",
      "2026-11-30T16:00:00Z",
      "2026-11-30T17:00:00Z",
    ];
    const statuses = [
      "COMPLETED",
      "COMPLETED",
      "IN_PROGRESS",
      "REOPENED",
      "CANCELLED",
      "COMPLETED",
      "COMPLETED",
      "SCHEDULED",
      "COMPLETED",
    ];
    async function api(
      route: string,
      method = "GET",
      body?: unknown,
      actor: Actor = "owner",
      key?: string,
    ) {
      const response = await fetch(getBase() + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(tokens[actor]
            ? { Authorization: "Bearer " + tokens[actor] }
            : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    }
    async function signIn(actor: Actor, tenantId: string, role: string) {
      const result = await api(
        "/auth/login",
        "POST",
        { email: users[actor] + "@example.test", password },
        actor,
      );
      expect(result.status).toBe(200);
      tokens[actor] = result.body.data.accessToken;
      const selected = await api(
        "/auth/switch-context",
        "POST",
        { tenantId, role },
        actor,
      );
      expect(selected.status).toBe(200);
      tokens[actor] = selected.body.data.accessToken;
    }
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash(),
        source = await db.plan.findUniqueOrThrow({
          where: { code: "TEST_PLAN" },
        });
      // Isolate setup logins from the previous synthetic scenario's IP budget.
      await db.$executeRaw`DELETE FROM auth_rate_limits`;
      const plan = await db.plan.create({
        data: {
          code: "RPT-" + tenant.slice(0, 30),
          name: "Synthetic reporting plan",
          monthlyPriceVnd: 0n,
          limitsJson: source.limitsJson as Prisma.InputJsonValue,
          featureFlagsJson: {
            attendance: true,
            grades: true,
            finance: true,
            reports: true,
          },
        },
      });
      for (const id of [tenant, foreign]) {
        await db.tenant.create({
          data: {
            id,
            slug: "report-" + id,
            name: "Synthetic reporting centre",
            status: "ACTIVE",
            subscriptionEndsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
        await db.subscription.create({
          data: {
            tenantId: id,
            planId: plan.id,
            startsAt: new Date("2020-01-01Z"),
            endsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
      }
      for (const actor of roles) {
        const role = actor === "foreignOwner" ? "owner" : actor,
          tenantId = actor === "foreignOwner" ? foreign : tenant;
        await db.user.create({
          data: {
            id: users[actor],
            email: users[actor] + "@example.test",
            displayName: "Synthetic report " + actor,
            passwordHash,
            status: "ACTIVE",
          },
        });
        await db.membership.create({
          data: {
            tenantId,
            userId: users[actor],
            status: "ACTIVE",
            roles: { create: { role } },
          },
        });
        await signIn(actor, tenantId, role);
      }
      await db.teacher.create({
        data: {
          id: teacher,
          tenantId: tenant,
          userId: users.teacher,
          teacherCode: "RPT-TEACHER",
          fullName: "Report teacher",
        },
      });
      for (const id of [cls, cashClass])
        await db.educationClass.create({
          data: {
            id,
            tenantId: tenant,
            code: "RPT-" + id.slice(0, 8),
            name:
              id === cls
                ? '=HYPERLINK("https://example.test","report")'
                : "Second collection class",
            capacity: 10,
            status: "ACTIVE",
            startDate: new Date("2020-01-01Z"),
            endDate: new Date("2040-01-01Z"),
          },
        });
      await db.classTeacher.create({
        data: {
          tenantId: tenant,
          classId: cls,
          teacherId: teacher,
          effectiveFrom: new Date("2020-01-01Z"),
          effectiveTo: new Date("2040-01-01Z"),
        },
      });
      const enrollments = [];
      for (const id of [student, paused]) {
        await db.student.create({
          data: {
            id,
            tenantId: tenant,
            studentCode: "RPT-" + id.slice(0, 8),
            fullName:
              id === student
                ? "Learner without login"
                : "Historical paused learner",
            status: id === paused ? "PAUSED" : "ACTIVE",
            notesPrivate: "REPORT_PRIVATE_NOTE_MUST_NEVER_LEAK",
          },
        });
        enrollments.push(
          await db.enrollment.create({
            data: {
              tenantId: tenant,
              classId: cls,
              studentId: id,
              joinedAt: new Date("2020-01-01Z"),
            },
          }),
        );
      }
      for (let n = 0; n < starts.length; n++) {
        const start = new Date(starts[n]!),
          session = await db.classSession.create({
            data: {
              tenantId: tenant,
              classId: cls,
              teacherId: teacher,
              scheduledDate: new Date(
                start.toISOString().slice(0, 10) + "T00:00:00Z",
              ),
              startsAt: start,
              endsAt: new Date(start.getTime() + 30 * 60000),
              status: statuses[n]!,
              ...(n === 6 ||
              statuses[n] === "IN_PROGRESS" ||
              statuses[n] === "SCHEDULED" ||
              statuses[n] === "CANCELLED"
                ? {}
                : { finalizedAt: new Date(), finalizedBy: users.owner }),
            },
          });
        for (let k = 0; k < enrollments.length; k++) {
          const enrollment = enrollments[k]!;
          await db.rosterRow.create({
            data: {
              tenantId: tenant,
              sessionId: session.id,
              classId: cls,
              studentId: enrollment.studentId,
              enrollmentId: enrollment.id,
              displayName: "Synthetic roster learner",
            },
          });
          await db.attendanceRecord.create({
            data: {
              tenantId: tenant,
              sessionId: session.id,
              studentId: enrollment.studentId,
              status:
                n === 5
                  ? k === 0
                    ? "ABSENT_EXCUSED"
                    : "ABSENT_UNEXCUSED"
                  : n === 1 && k === 1
                    ? "LATE"
                    : "PRESENT",
              note: "REPORT_PRIVATE_ATTENDANCE_NOTE",
              markedBy: users.owner,
              markedAt: new Date(),
            },
          });
        }
      }
    });
    const range = "from=2026-11-01&to=2026-11-30";
    it("November Vietnam dashboard and published attendance use actual starts, explicit denominators and current active identities", async () => {
      const result = await api(`/reports/dashboard?${range}&classId=${cls}`);
      expect(result.status).toBe(200);
      const data = result.body.data;
      expect(data).toMatchObject({
        timezone: "Asia/Ho_Chi_Minh",
        activeStudents: 1,
        activeTeachers: 1,
        activeClasses: 1,
        sessions: { expectedSessions: 6, cancelledSessions: 1 },
      });
      const asOf = Date.parse(data.asOf),
        included = [1, 2, 3, 5, 6, 7],
        eligible = included.filter(
          (i) => Date.parse(starts[i]!) + 30 * 60000 <= asOf,
        ),
        completed = eligible.filter((i) => i === 1 || i === 5);
      expect(data.sessions.upcomingSessions).toBe(6 - eligible.length);
      expect(data.attendance).toMatchObject({
        finalizedSessions: 2,
        eligibleSessions: eligible.length,
        completedEligibleSessions: completed.length,
        completionRateBps: eligible.length
          ? Math.round((completed.length * 10000) / eligible.length)
          : null,
        rosterCount: 4,
        presentCount: 1,
        lateCount: 1,
        excusedCount: 1,
        unexcusedCount: 1,
        presenceRateBps: 5000,
      });
      expect(data.days).toHaveLength(30);
      expect(data.days[0]).toMatchObject({
        day: "2026-11-01",
        expectedSessions: 1,
      });
      expect(data.days.at(-1)).toMatchObject({
        day: "2026-11-30",
        expectedSessions: 1,
      });
      expect(
        data.days.reduce(
          (n: number, r: { expectedSessions: number }) =>
            n + r.expectedSessions,
          0,
        ),
      ).toBe(6);
      const attendance = await api(
        `/reports/attendance?${range}&classId=${cls}`,
      );
      expect(attendance.body.data.summary).toEqual(data.attendance);
      expect(attendance.body.data.classes).toHaveLength(1);
      expect(JSON.stringify(result.body)).not.toContain("REPORT_PRIVATE");
      const empty = await api(
        `/reports/attendance?${range}&classId=${cashClass}`,
      );
      expect(empty.body.data.summary).toMatchObject({
        finalizedSessions: 0,
        rosterCount: 0,
        completionRateBps: null,
        presenceRateBps: null,
      });
      await getDb().membership.update({
        where: { tenantId_userId: { tenantId: tenant, userId: users.teacher } },
        data: { status: "SUSPENDED" },
      });
      expect(
        (await api(`/reports/dashboard?${range}&classId=${cls}`)).body.data
          .activeTeachers,
      ).toBe(0);
      await getDb().membership.update({
        where: { tenantId_userId: { tenantId: tenant, userId: users.teacher } },
        data: { status: "ACTIVE" },
      });
    });
    async function invoice(
      classId: string,
      amount: bigint,
      issuedAt: Date,
      dueAt: Date,
      voided = false,
    ) {
      return getDb().$transaction(async (tx) => {
        const fee = await tx.feePlan.create({
          data: {
            tenantId: tenant,
            classId,
            name: "Report immutable fee " + randomUUID().slice(0, 8),
            billingModel: "MONTHLY",
            amountVnd: amount,
            validFrom: new Date("2020-01-01Z"),
          },
        });
        const run = await tx.invoiceRun.create({
          data: {
            tenantId: tenant,
            feePlanId: fee.id,
            periodKey: "2026-11",
            requestHash: "a".repeat(64),
            createdBy: users.owner,
          },
        });
        const row = await tx.invoice.create({
          data: {
            tenantId: tenant,
            studentId: student,
            runId: run.id,
            invoiceNo: "RPT-INV-" + randomUUID(),
            issuedAt,
            dueAt,
            totalAmountVnd: amount,
            createdBy: users.owner,
            ...(voided
              ? {
                  billingState: "VOID",
                  voidReason: "Synthetic voided report invoice",
                }
              : {}),
          },
        });
        await tx.invoiceItem.create({
          data: {
            tenantId: tenant,
            invoiceId: row.id,
            feePlanId: fee.id,
            description: fee.name,
            totalAmountVnd: amount,
          },
        });
        return row;
      });
    }
    it("collections distinguish issue, receipt and current due axes, exact large sums, class allocations and reversal", async () => {
      const big = 9007199254740993n;
      const a = await invoice(
        cls,
        big,
        new Date("2026-10-31T17:00Z"),
        new Date("2026-11-15T00:00Z"),
      );
      const b = await invoice(
        cashClass,
        1000000n,
        new Date("2026-11-30T16:59:59Z"),
        new Date("2026-11-16T00:00Z"),
      );
      await invoice(
        cls,
        500000n,
        new Date("2026-11-30T17:00Z"),
        new Date("2026-11-16T00:00Z"),
      );
      await invoice(
        cls,
        20000n,
        new Date("2026-11-05T00:00Z"),
        new Date("2026-11-05T00:00Z"),
        true,
      );
      const pay = async (
        receivedAt: string,
        allocations: { invoiceId: string; amountVnd: string }[],
        amount = "100000",
      ) => {
        const result = await api(
          "/payments",
          "POST",
          {
            studentId: student,
            method: "CASH",
            receivedAmountVnd: amount,
            receivedAt,
            allocations,
          },
          "accountant",
          randomUUID(),
        );
        expect(result.status).toBe(201);
        return result.body.data;
      };
      await pay(
        "2026-10-31T17:00Z",
        [
          { invoiceId: a.id, amountVnd: "200000" },
          { invoiceId: b.id, amountVnd: "300000" },
        ],
        "600000",
      );
      const reversed = await pay("2026-11-30T16:59:59Z", [
        { invoiceId: b.id, amountVnd: "100000" },
      ]);
      await pay("2026-11-30T17:00Z", [
        { invoiceId: a.id, amountVnd: "100000" },
      ]);
      expect(
        (
          await api(
            `/payments/${reversed.id}/reverse`,
            "POST",
            { reason: "Actual reversal excluded from current collections" },
            "accountant",
          )
        ).status,
      ).toBe(201);
      const result = await api(`/finance/reports/collections?${range}`);
      expect(result.status).toBe(200);
      expect(result.body.data).toMatchObject({
        basis: "RECEIVED",
        summary: {
          issuedCount: 2,
          issuedAmountVnd: String(big + 1000000n),
          receiptCount: 1,
          collectedAmountVnd: "600000",
          allocatedAmountVnd: "500000",
          unallocatedAmountVnd: "100000",
          balanceVnd: String(big + 900000n),
        },
      });
      expect(result.body.data.days[0]).toMatchObject({
        day: "2026-11-01",
        collectedAmountVnd: "600000",
        issuedAmountVnd: String(big),
      });
      expect(result.body.data.days.at(-1)).toMatchObject({
        day: "2026-11-30",
        collectedAmountVnd: "0",
        issuedAmountVnd: "1000000",
      });
      const filtered = await api(
        `/finance/reports/collections?${range}&classId=${cls}`,
      );
      expect(filtered.body.data).toMatchObject({
        basis: "CLASS_ALLOCATED",
        summary: {
          issuedCount: 1,
          issuedAmountVnd: String(big),
          receiptCount: 1,
          collectedAmountVnd: "200000",
          allocatedAmountVnd: "200000",
          unallocatedAmountVnd: null,
          balanceVnd: String(big + 200000n),
        },
      });
      const debt = await api(
        `/finance/reports/receivables?${range}&classId=${cls}`,
      );
      expect(filtered.body.data.summary.balanceVnd).toBe(
        debt.body.data.summary.balanceVnd,
      );
      const dashboard = await api(`/reports/dashboard?${range}&classId=${cls}`);
      expect(dashboard.body.data.finance).toEqual(
        filtered.body.data.asOf === dashboard.body.data.finance.asOf
          ? filtered.body.data
          : { ...filtered.body.data, asOf: dashboard.body.data.finance.asOf },
      );
    });
    it("report exports contain only authorized aggregates, neutralize formulas, audit actual filters and work readonly", async () => {
      const db = getDb();
      const result = await api(
        `/reports/attendance/export?${range}&classId=${cls}`,
      );
      expect(result.status).toBe(200);
      expect(result.body.data.rowCount).toBe(1);
      expect(result.body.data.csv).toContain(
        '"\'=HYPERLINK(""https://example.test""',
      );
      expect(result.body.data.csv).not.toContain("REPORT_PRIVATE");
      expect(result.body.data.filename).toBe(
        "fluivixedu-attendance-2026-11-01-2026-11-30.csv",
      );
      const audit = await db.auditLog.findFirstOrThrow({
        where: {
          tenantId: tenant,
          action: "report.attendance.exported",
          traceId: result.body.meta.traceId,
        },
      });
      expect(audit.actorUserId).toBe(users.owner);
      expect(audit.metadata).toMatchObject({
        from: "2026-11-01",
        to: "2026-11-30",
        classId: cls,
        rowCount: 1,
        timezone: "Asia/Ho_Chi_Minh",
      });
      await db.tenant.update({
        where: { id: tenant },
        data: { status: "READ_ONLY" },
      });
      try {
        expect(
          (
            await api(
              `/reports/enrollments/export?${range}&classId=${cls}`,
              "GET",
              undefined,
              "accountant",
            )
          ).status,
        ).toBe(200);
        const cash = await api(
          `/finance/reports/collections/export?${range}&classId=${cls}`,
          "GET",
          undefined,
          "accountant",
        );
        expect(cash.status).toBe(200);
        expect(cash.body.data.csv).toContain('"CLASS_ALLOCATED"');
        expect(cash.body.data.csv).not.toContain("REPORT_PRIVATE");
        expect(
          (
            await api(
              `/reports/attendance/export?${range}`,
              "GET",
              undefined,
              "accountant",
            )
          ).status,
        ).toBe(403);
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("operational reports enforce resource/role scopes, literal search, validation and live revocation", async () => {
      for (const actor of ["manager", "academic_staff"] as const) {
        const result = await api(
          `/reports/dashboard?${range}`,
          "GET",
          undefined,
          actor,
        );
        expect(result.status).toBe(200);
        expect(result.body.data.finance).toBeNull();
        expect(
          (
            await api(
              `/finance/reports/collections?${range}`,
              "GET",
              undefined,
              actor,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await api(
              `/finance/reports/collections/export?${range}`,
              "GET",
              undefined,
              actor,
            )
          ).status,
        ).toBe(403);
      }
      const accountant = await api(
        `/reports/dashboard?${range}`,
        "GET",
        undefined,
        "accountant",
      );
      expect(accountant.body.data.attendance).toBeNull();
      expect(accountant.body.data.finance).not.toBeNull();
      for (const actor of ["teacher", "student", "guardian"] as const)
        for (const route of [
          "/reports/dashboard",
          "/reports/attendance",
          "/reports/enrollments",
          "/reports/attendance/export",
          "/reports/enrollments/export",
          "/finance/reports/collections",
          "/finance/reports/collections/export",
        ])
          expect(
            (await api(`${route}?${range}`, "GET", undefined, actor)).status,
          ).toBe(403);
      const foreignRead = await api(
        `/reports/dashboard?${range}&classId=${cls}`,
        "GET",
        undefined,
        "foreignOwner",
      );
      expect(foreignRead.status).toBe(200);
      expect(foreignRead.body.data).toMatchObject({
        activeStudents: 0,
        activeClasses: 0,
        sessions: { expectedSessions: 0 },
      });
      expect(foreignRead.body.data.finance.summary.balanceVnd).toBe("0");
      const literal = await api(`/reports/enrollments?${range}&search=%25`);
      expect(literal.body.data.page.total).toBe(0);
      const overlap = await api(`/reports/enrollments?${range}&classId=${cls}`);
      expect(overlap.body.data).toMatchObject({
        enrollmentCount: 2,
        studentCount: 2,
        page: { total: 1 },
      });
      for (const route of [
        "/reports/dashboard",
        "/reports/attendance",
        "/reports/enrollments",
        "/finance/reports/collections",
      ]) {
        for (const query of [
          "from=2026-12-01&to=2026-11-01",
          "from=2025-01-01&to=2026-12-31",
          "from=9999-12-31&to=9999-12-31",
          range + "&page=100000000000000000000",
          range + "&tenantId=" + foreign,
        ])
          expect((await api(route + "?" + query)).status, route + query).toBe(
            422,
          );
      }
      await getDb().membership.update({
        where: { tenantId_userId: { tenantId: tenant, userId: users.manager } },
        data: { status: "SUSPENDED" },
      });
      expect(
        (await api(`/reports/dashboard?${range}`, "GET", undefined, "manager"))
          .status,
      ).toBe(403);
      expect(
        (
          await api(
            `/reports/attendance/export?${range}`,
            "GET",
            undefined,
            "manager",
          )
        ).status,
      ).toBe(403);
    });
    it("report plan flags remain independent and bounded exports reject oversized scopes without audit success", async () => {
      const db = getDb(),
        source = await db.plan.findUniqueOrThrow({
          where: { code: "TEST_PLAN" },
        }),
        original = tokens.owner;
      if (!original) throw new Error("Report owner fixture session missing");
      async function centre(flags: {
        attendance: boolean;
        grades: boolean;
        finance: boolean;
        reports: boolean;
      }) {
        const id = randomUUID();
        const plan = await db.plan.create({
          data: {
            code: "RPT-FLAG-" + id.slice(0, 25),
            name: "Immutable report feature fixture",
            monthlyPriceVnd: 0n,
            limitsJson: {
              ...(source.limitsJson as Prisma.JsonObject),
              maxClasses: 10000,
            } as Prisma.InputJsonValue,
            featureFlagsJson: flags,
          },
        });
        await db.tenant.create({
          data: {
            id,
            slug: "report-flag-" + id,
            name: "Report feature centre",
            status: "ACTIVE",
            subscriptionEndsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
        await db.subscription.create({
          data: {
            tenantId: id,
            planId: plan.id,
            startsAt: new Date("2020-01-01Z"),
            endsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
        await db.membership.create({
          data: {
            tenantId: id,
            userId: users.owner,
            status: "ACTIVE",
            roles: { create: { role: "owner" } },
          },
        });
        await signIn("owner", id, "owner");
        return id;
      }
      try {
        for (const flags of [
          { attendance: false, grades: true, finance: true, reports: true },
          { attendance: true, grades: true, finance: false, reports: true },
          { attendance: true, grades: true, finance: true, reports: false },
        ]) {
          await centre(flags);
          const dashboard = await api(`/reports/dashboard?${range}`);
          expect(dashboard.status).toBe(flags.reports ? 200 : 403);
          if (flags.reports) {
            expect(dashboard.body.data.attendance === null).toBe(
              !flags.attendance,
            );
            expect(dashboard.body.data.finance === null).toBe(!flags.finance);
          }
          expect((await api(`/reports/attendance?${range}`)).status).toBe(
            flags.reports && flags.attendance ? 200 : 403,
          );
          expect(
            (await api(`/finance/reports/collections?${range}`)).status,
          ).toBe(flags.finance ? 200 : 403);
          expect(
            (await api(`/finance/reports/collections/export?${range}`)).status,
          ).toBe(flags.finance ? 200 : 403);
        }
        const large = await centre({
          attendance: true,
          grades: true,
          finance: true,
          reports: true,
        });
        await db.educationClass.createMany({
          data: Array.from({ length: 5001 }, (_, n) => ({
            tenantId: large,
            code: "EXPORT-" + String(n).padStart(5, "0"),
            name: "Synthetic export limit class",
            capacity: 1,
            status: "ACTIVE",
            startDate: new Date("2020-01-01Z"),
            endDate: new Date("2040-01-01Z"),
          })),
        });
        for (const route of [
          "/reports/attendance/export",
          "/reports/enrollments/export",
        ])
          expect((await api(route + "?" + range)).status).toBe(422);
        expect(
          await db.auditLog.count({
            where: {
              tenantId: large,
              action: {
                in: [
                  "report.attendance.exported",
                  "report.enrollments.exported",
                ],
              },
            },
          }),
        ).toBe(0);
        const selected = await db.educationClass.findFirstOrThrow({
          where: { tenantId: large },
          orderBy: { code: "asc" },
          select: { id: true, code: true },
        });
        for (const kind of ["attendance", "enrollments"]) {
          const scoped = await api(
            `/reports/${kind}/export?${range}&classId=${selected.id}`,
          );
          expect(scoped.status).toBe(200);
          expect(scoped.body.data.rowCount).toBe(1);
          expect(scoped.body.data.csv).toContain(selected.code);
          const recorded = await db.auditLog.findFirstOrThrow({
            where: { tenantId: large, traceId: scoped.body.meta.traceId },
          });
          expect(recorded.action).toBe(`report.${kind}.exported`);
          expect(recorded.metadata).toMatchObject({
            classId: selected.id,
            rowCount: 1,
          });
        }
      } finally {
        tokens.owner = original;
      }
    });
    it("named IANA tenant calendars share DST daily buckets and reject raw offsets independently in SQL", async () => {
      const db = getDb();
      for (const zone of ["+07:00", "-05:00", "Not/A_Timezone"]) {
        await expect(
          db.tenant.update({ where: { id: tenant }, data: { timezone: zone } }),
        ).rejects.toThrow("named IANA");
        expect(
          (await db.tenant.findUniqueOrThrow({ where: { id: tenant } }))
            .timezone,
        ).toBe("Asia/Ho_Chi_Minh");
      }
      await db.tenant.update({
        where: { id: tenant },
        data: { timezone: "America/New_York" },
      });
      try {
        for (const [day, from, to] of [
          ["2026-03-08", "2026-03-08T05:00Z", "2026-03-09T04:00Z"],
          ["2026-11-01", "2026-11-01T04:00Z", "2026-11-02T05:00Z"],
        ]) {
          const result = await api(
            `/reports/dashboard?from=${day}&to=${day}&classId=${cls}`,
          );
          expect(result.status).toBe(200);
          expect(result.body.data.timezone).toBe("America/New_York");
          expect(result.body.data.days).toHaveLength(1);
          expect(result.body.data.days[0].day).toBe(day);
          const expected = starts.filter(
            (start, i) =>
              Date.parse(start) >= Date.parse(from!) &&
              Date.parse(start) < Date.parse(to!) &&
              statuses[i] !== "CANCELLED",
          ).length;
          expect(result.body.data.sessions.expectedSessions).toBe(expected);
          expect(result.body.data.days[0].expectedSessions).toBe(expected);
        }
        // Database session timezone must not remove a calendar label from an
        // unrelated tenant's report (Apia skipped2011-12-30; New York did not).
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL TIME ZONE 'Pacific/Apia'`;
          const q = {
            from: "2011-12-29",
            to: "2011-12-31",
            page: 1,
            limit: 20,
            classId: cls,
          };
          const scope = {
            tenant,
            timezone: "America/New_York",
            from: q.from,
            to: q.to,
            start: new Date("2011-12-29T05:00Z"),
            end: new Date("2012-01-01T05:00Z"),
            asOf: new Date(),
            today: "2026-11-07",
          };
          expect(
            (await reportSessions(tx, scope, q)).days.map((d) => d.day),
          ).toEqual(["2011-12-29", "2011-12-30", "2011-12-31"]);
          expect(
            (await reportCollections(tx, scope, q)).days.map((d) => d.day),
          ).toEqual(["2011-12-29", "2011-12-30", "2011-12-31"]);
        });
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { timezone: "Asia/Ho_Chi_Minh" },
        });
      }
    });
  });
}
