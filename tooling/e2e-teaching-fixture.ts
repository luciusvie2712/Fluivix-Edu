import type { PrismaClient } from "@prisma/client";
import { developmentIds } from "./seed";

/** Only the isolated browser-test server calls this. Never runs in dev/prod seed. */
export async function seedTeachingForE2E(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV !== "test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !url.pathname.endsWith("_test")
  )
    throw new Error(
      "Teaching browser fixture requires an isolated local test DB",
    );
  const owner = await db.user.findUniqueOrThrow({
    where: { email: "inviter@example.test" },
  });
  const teacher = await db.user.create({
    data: {
      email: "teaching-browser@example.test",
      displayName: "Giáo viên kiểm thử Web",
      passwordHash: owner.passwordHash,
      status: "ACTIVE",
    },
  });
  await db.membership.create({
    data: {
      tenantId: developmentIds.tenantA,
      userId: teacher.id,
      status: "ACTIVE",
      roles: { create: { role: "teacher" } },
    },
  });
  await db.teacher.create({
    data: {
      tenantId: developmentIds.tenantA,
      userId: teacher.id,
      teacherCode: "WEB-TEACHER",
      fullName: "Giáo viên kiểm thử Web",
    },
  });
}
