import { randomUUID } from "node:crypto";
import { Db } from "../apps/api/dist/db";
import { hashPassword } from "../apps/api/dist/auth.service";
import { FinanceService } from "../apps/api/dist/finance.service";
import { GradesService } from "../apps/api/dist/grades";
import { TeachingService } from "../apps/api/dist/teaching.service";
import { seed, developmentIds } from "./seed";
export async function seedMobile(db: Db, password: string) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV === "production" ||
    password.length < 16 ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !(url.pathname === "/fluivixedu" || url.pathname.endsWith("_test"))
  )
    throw new Error(
      "Mobile seed requires an explicitly local synthetic database and16+ character password",
    );
  await seed(db, password);
  const owner = await db.user.findUniqueOrThrow({
      where: { email: "owner@example.test" },
    }),
    passwordHash = await hashPassword(password);
  const teacher = await db.user.upsert({
    where: { email: "teacher@example.test" },
    create: {
      email: "teacher@example.test",
      displayName: "Giáo viên kiểm thử",
      passwordHash,
      status: "ACTIVE",
    },
    update: {},
  });
  const studentUser = await db.user.upsert({
    where: { email: "student@example.test" },
    create: {
      email: "student@example.test",
      displayName: "Học viên kiểm thử Mobile",
      passwordHash,
      status: "ACTIVE",
    },
    update: {},
  });
  const guardian = await db.user.upsert({
    where: { email: "guardian@example.test" },
    create: {
      email: "guardian@example.test",
      displayName: "Phụ huynh kiểm thử",
      passwordHash,
      status: "ACTIVE",
    },
    update: {},
  });
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    period = today.slice(0, 7),
    start = new Date(period + "-01T00:00:00Z"),
    end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 3);
  end.setUTCDate(0);
  let primaryClassId = "",
    primaryTeacherId = "",
    firstChildId = "";
  for (const tenantId of [developmentIds.tenantA, developmentIds.tenantB]) {
    for (const [userId, roles] of [
      [teacher.id, ["teacher", "guardian"]],
      [studentUser.id, ["student"]],
      [guardian.id, ["guardian"]],
    ] as const) {
      const membership = await db.membership.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        create: { tenantId, userId, status: "ACTIVE" },
        update: {},
      });
      for (const role of roles)
        await db.membershipRole.upsert({
          where: { membershipId_role: { membershipId: membership.id, role } },
          create: { membershipId: membership.id, role },
          update: {},
        });
    }
    const t = await db.teacher.upsert({
      where: { tenantId_userId: { tenantId, userId: teacher.id } },
      create: {
        tenantId,
        userId: teacher.id,
        teacherCode: "MOBILE-T1",
        fullName: "Giáo viên kiểm thử",
      },
      update: {},
    });
    const cls = await db.educationClass.upsert({
      where: { tenantId_code: { tenantId, code: "MOBILE-" + period } },
      create: {
        tenantId,
        code: "MOBILE-" + period,
        name:
          tenantId === developmentIds.tenantA
            ? "Lớp Mobile kiểm thử A"
            : "Lớp Mobile kiểm thử B",
        capacity: 20,
        startDate: start,
        endDate: end,
      },
      update: {},
    });
    if (
      !(await db.classTeacher.findFirst({
        where: { tenantId, classId: cls.id, teacherId: t.id },
      }))
    )
      await db.classTeacher.create({
        data: {
          tenantId,
          classId: cls.id,
          teacherId: t.id,
          effectiveFrom: cls.startDate,
          effectiveTo: cls.endDate,
        },
      });
    for (let i = 1; i <= 20; i++) {
      const child = await db.student.upsert({
        where: {
          tenantId_studentCode: {
            tenantId,
            studentCode: "MOBILE-" + String(i).padStart(2, "0"),
          },
        },
        create: {
          tenantId,
          studentCode: "MOBILE-" + String(i).padStart(2, "0"),
          fullName: `Học viên Mobile ${String(i).padStart(2, "0")} ${tenantId === developmentIds.tenantA ? "A" : "B"}`,
          ...(i === 1 ? { userId: studentUser.id } : {}),
        },
        update: {},
      });
      if (
        !(await db.enrollment.findFirst({
          where: {
            tenantId,
            classId: cls.id,
            studentId: child.id,
            status: "ACTIVE",
          },
        }))
      )
        await db.enrollment.create({
          data: {
            tenantId,
            classId: cls.id,
            studentId: child.id,
            joinedAt: cls.startDate,
          },
        });
      if (
        i <= 2 &&
        !(await db.guardianLink.findFirst({
          where: {
            tenantId,
            studentId: child.id,
            guardianUserId: guardian.id,
            status: "ACTIVE",
          },
        }))
      )
        await db.guardianLink.create({
          data: {
            tenantId,
            studentId: child.id,
            guardianUserId: guardian.id,
            status: "ACTIVE",
            relationType: "GUARDIAN",
            verifiedBy: owner.id,
            verifiedAt: new Date(),
            verificationMethod:
              "Synthetic development fixture, not a legal verification",
          },
        });
      if (
        i === 2 &&
        !(await db.guardianLink.findFirst({
          where: {
            tenantId,
            studentId: child.id,
            guardianUserId: teacher.id,
            status: "ACTIVE",
          },
        }))
      )
        await db.guardianLink.create({
          data: {
            tenantId,
            studentId: child.id,
            guardianUserId: teacher.id,
            status: "ACTIVE",
            verifiedBy: owner.id,
            verifiedAt: new Date(),
            verificationMethod: "Synthetic multi-role test fixture",
          },
        });
      if (i === 1 && tenantId === developmentIds.tenantA)
        firstChildId = child.id;
    }
    for (let offset = 0; offset < 2; offset++) {
      const local = new Date(today + "T00:00:00Z");
      local.setUTCDate(local.getUTCDate() + offset);
      const scheduledDate = local.toISOString().slice(0, 10),
        startsAt = new Date(scheduledDate + "T11:00:00Z"),
        endsAt = new Date(scheduledDate + "T12:30:00Z");
      if (
        !(await db.classSession.findFirst({
          where: { tenantId, classId: cls.id, startsAt },
        }))
      )
        await db.classSession.create({
          data: {
            tenantId,
            classId: cls.id,
            teacherId: t.id,
            scheduledDate: local,
            startsAt,
            endsAt,
          },
        });
    }
    if (tenantId === developmentIds.tenantA) {
      primaryClassId = cls.id;
      primaryTeacherId = t.id;
    }
  }
  const teaching = new TeachingService(db),
    finance = new FinanceService(db, teaching),
    grades = new GradesService(db, teaching),
    claims = {
      sub: owner.id,
      sid: randomUUID(),
      tenantId: developmentIds.tenantA,
      role: "owner" as const,
    };
  let fee = await db.feePlan.findFirst({
    where: {
      tenantId: claims.tenantId,
      classId: primaryClassId,
      name: "Học phí Mobile kiểm thử " + period,
    },
  });
  if (!fee)
    await finance.fee(
      claims,
      {
        classId: primaryClassId,
        name: "Học phí Mobile kiểm thử " + period,
        billingModel: "MONTHLY",
        amountVnd: "1200000",
        validFrom: period + "-01",
        validTo: end.toISOString().slice(0, 10),
      },
      "synthetic-mobile-seed",
    );
  fee = await db.feePlan.findFirstOrThrow({
    where: {
      tenantId: claims.tenantId,
      classId: primaryClassId,
      name: "Học phí Mobile kiểm thử " + period,
    },
  });
  const dueAt = new Date(period + "-01T00:00:00Z").toISOString();
  await finance.generate(
    claims,
    { feePlanId: fee.id, periodKey: period, dueAt },
    "mobile-seed-run-" + period,
    "synthetic-mobile-seed",
  );
  const invoice = await db.invoice.findFirstOrThrow({
    where: {
      tenantId: claims.tenantId,
      studentId: firstChildId,
      runId: (
        await db.invoiceRun.findUniqueOrThrow({
          where: {
            tenantId_feePlanId_periodKey: {
              tenantId: claims.tenantId,
              feePlanId: fee.id,
              periodKey: period,
            },
          },
        })
      ).id,
    },
  });
  await finance.pay(
    claims,
    {
      studentId: firstChildId,
      method: "CASH",
      receivedAmountVnd: "500000",
      receivedAt: new Date(period + "-01T01:00:00Z").toISOString(),
      allocations: [{ invoiceId: invoice.id, amountVnd: "500000" }],
    },
    "mobile-seed-payment-" + period,
    "synthetic-mobile-seed",
  );
  const teacherClaims = {
    ...claims,
    sub: teacher.id,
    role: "teacher" as const,
  };
  if (
    !(await db.assessment.findFirst({
      where: {
        tenantId: claims.tenantId,
        classId: primaryClassId,
        title: "Kết quả Mobile kiểm thử",
      },
    }))
  ) {
    const assessment = await grades.create(
      teacherClaims,
      primaryClassId,
      { title: "Kết quả Mobile kiểm thử", heldAt: today, maxScore: "10.00" },
      "synthetic-mobile-seed",
    );
    const roster = await grades.results(teacherClaims, assessment.id);
    await grades.save(
      teacherClaims,
      assessment.id,
      {
        version: 1,
        records: roster.rows.map((row) => ({
          studentId: row.studentId,
          score: "8.00",
          comment: "Dữ liệu kiểm thử tổng hợp",
        })),
      },
      "synthetic-mobile-seed",
    );
    await grades.save(
      teacherClaims,
      assessment.id,
      { version: 2, records: [] },
      "synthetic-mobile-seed",
      true,
    );
    await grades.create(
      teacherClaims,
      primaryClassId,
      { title: "Bản nháp không công bố", heldAt: today, maxScore: "10.00" },
      "synthetic-mobile-seed",
    );
  }
  return {
    teacherId: primaryTeacherId,
    classId: primaryClassId,
    childId: firstChildId,
    tenantId: claims.tenantId,
  };
}
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("/tooling/seed-mobile.ts")
) {
  const db = new Db();
  void seedMobile(db, process.env.SEED_PASSWORD ?? "")
    .then(() =>
      console.log(
        "Synthetic mobile fixtures ready: teacher/student/guardian@example.test; existing credentials preserved.",
      ),
    )
    .catch(() => {
      console.error(
        "MOBILE_SEED_FAILED: verify local database, migrations, subscription and explicit password.",
      );
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
