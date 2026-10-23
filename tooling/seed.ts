import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../apps/api/dist/auth.service";
export const developmentIds = {
  tenantA: "10000000-0000-4000-8000-000000000001",
  tenantB: "10000000-0000-4000-8000-000000000002",
};
export async function seed(db: PrismaClient, password: string) {
  if (process.env.NODE_ENV === "production" || password.length < 12)
    throw new Error(
      "Synthetic seed requires non-production mode and an explicit strong seed password",
    );
  const passwordHash = await hashPassword(password);
  const plan = await db.plan.upsert({
    where: { code: "SYNTHETIC_TEST" },
    create: {
      code: "SYNTHETIC_TEST",
      name: "Gói kiểm thử",
      monthlyPriceVnd: 0n,
      limitsJson: {
        maxStudents: 1000,
        maxUsers: 1000,
        maxClasses: 100,
        maxStorageBytes: "1073741824",
      },
      featureFlagsJson: {
        attendance: true,
        grades: true,
        finance: true,
        reports: true,
      },
    },
    update: {},
  });
  await db.platformUser.upsert({
    where: { email: "platform@example.test" },
    create: {
      email: "platform@example.test",
      displayName: "Vận hành kiểm thử",
      passwordHash,
      recoveryHashes: [],
    },
    update: {},
  });
  await db.platformUser.upsert({
    where: { email: "platform-onboarding@example.test" },
    create: {
      email: "platform-onboarding@example.test",
      displayName: "Vận hành onboarding kiểm thử",
      passwordHash,
      recoveryHashes: [],
    },
    update: {},
  });
  const owner = await db.user.upsert({
    where: { email: "owner@example.test" },
    create: {
      email: "owner@example.test",
      displayName: "Chủ trung tâm kiểm thử",
      passwordHash,
      status: "ACTIVE",
    },
    update: {},
  });
  const inviter = await db.user.upsert({
    where: { email: "inviter@example.test" },
    create: {
      email: "inviter@example.test",
      displayName: "Người mời kiểm thử",
      passwordHash,
      status: "ACTIVE",
    },
    update: {},
  });
  for (const [id, slug, name] of [
    [developmentIds.tenantA, "test-center-a", "Trung tâm kiểm thử A"],
    [developmentIds.tenantB, "test-center-b", "Trung tâm kiểm thử B"],
  ]) {
    if (!id || !slug || !name) throw new Error("Incomplete fixture");
    await db.tenant.upsert({
      where: { id },
      create: {
        id,
        slug,
        name,
        status: "ACTIVE",
        subscriptionEndsAt: new Date(Date.now() + 86400000 * 30),
        graceUntil: new Date(Date.now() + 86400000 * 37),
      },
      update: {},
    });
    if (!(await db.subscription.findFirst({ where: { tenantId: id } })))
      await db.subscription.create({
        data: {
          tenantId: id,
          planId: plan.id,
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() + 86400000 * 30),
          graceUntil: new Date(Date.now() + 86400000 * 37),
        },
      });
    await db.membership.upsert({
      where: { tenantId_userId: { tenantId: id, userId: owner.id } },
      create: {
        tenantId: id,
        userId: owner.id,
        status: "ACTIVE",
        roles: { create: { role: "owner" } },
      },
      update: {},
    });
    await db.membership.upsert({
      where: { tenantId_userId: { tenantId: id, userId: inviter.id } },
      create: {
        tenantId: id,
        userId: inviter.id,
        status: "ACTIVE",
        roles: { create: { role: "owner" } },
      },
      update: {},
    });
    await db.student.upsert({
      where: {
        tenantId_studentCode: { tenantId: id, studentCode: "TEST-001" },
      },
      create: {
        tenantId: id,
        studentCode: "TEST-001",
        fullName: slug.endsWith("a")
          ? "Học viên kiểm thử A"
          : "Học viên kiểm thử B",
      },
      update: {},
    });
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tooling/seed.ts")) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !["/fluivixedu", "/fluivixedu_test"].includes(url.pathname)
  )
    throw new Error(
      "Seed is restricted to named local development/test databases",
    );
  const db = new PrismaClient();
  void seed(db, process.env.SEED_PASSWORD ?? "").finally(() =>
    db.$disconnect(),
  );
}
