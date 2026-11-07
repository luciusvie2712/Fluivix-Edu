import { ForbiddenException, ConflictException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { planFlagsSchema, planLimitsSchema } from "@fluivix/contracts";
type Database = Prisma.TransactionClient | PrismaClient;
export async function tenantUsage(db: Database, tenantId: string) {
  const [activeStudents, reservedUsers] = await Promise.all([
    db.student.count({ where: { tenantId, status: "ACTIVE" } }),
    db.membership.count({
      where: { tenantId, status: { in: ["ACTIVE", "INVITED"] } },
    }),
  ]);
  return { activeStudents, reservedUsers };
}
export async function requirePlanFeature(
  db: Database,
  tenantId: string,
  feature: "attendance" | "grades" | "finance" | "reports",
) {
  const subscription = await currentSubscription(db, tenantId);
  if (
    !subscription ||
    !planFlagsSchema.parse(subscription.plan.featureFlagsJson)[feature]
  )
    throw new ForbiddenException("Gói hiện tại không bao gồm tính năng này.");
}
export async function currentSubscription(
  db: Database,
  tenantId: string,
  now = new Date(),
) {
  return db.subscription.findFirst({
    where: { tenantId, status: "ACTIVE", startsAt: { lte: now } },
    orderBy: { endsAt: "desc" },
    include: { plan: true },
  });
}
export async function requireSubscriptionWrite(
  db: Database,
  tenantId: string,
  allowPending = false,
) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  if (
    !tenant ||
    ![
      "ACTIVE",
      "PAST_DUE_GRACE",
      ...(allowPending ? ["PENDING_ACTIVATION"] : []),
    ].includes(tenant.status)
  )
    throw new ForbiddenException("Trung tâm không cho phép ghi dữ liệu.");
  const current = await currentSubscription(db, tenantId);
  if (!current || current.graceUntil <= new Date())
    throw new ForbiddenException("Trung tâm đang ở chế độ chỉ đọc.");
  return current;
}
// Caller holds the tenant row lock for every activation and quota mutation.
export async function assertQuota(
  tx: Prisma.TransactionClient,
  tenantId: string,
  kind: "students" | "users" | "classes",
  additional = 1,
  allowPending = false,
) {
  const current = await requireSubscriptionWrite(tx, tenantId, allowPending);
  const limits = planLimitsSchema.parse(current.plan.limitsJson);
  const used =
    kind === "students"
      ? await tx.student.count({ where: { tenantId, status: "ACTIVE" } })
      : kind === "classes"
        ? await tx.educationClass.count({
            where: { tenantId, status: { in: ["ACTIVE", "DRAFT"] } },
          })
        : await tx.membership.count({
            where: { tenantId, status: { in: ["ACTIVE", "INVITED"] } },
          });
  const max =
    kind === "students"
      ? limits.maxStudents
      : kind === "classes"
        ? limits.maxClasses
        : limits.maxUsers;
  if (used + additional > max)
    throw new ConflictException(
      "Đã đạt giới hạn gói dịch vụ. Liên hệ quản trị để nâng gói.",
    );
}

// Logical managed content bytes, not a claim about physical database size.
// Expired but unpurged payloads still occupy the quota until actually cleared.
export async function managedExportBytes(db: Database, tenantId: string) {
  const [row] = await db.$queryRaw<{ bytes: bigint }[]>`
    SELECT COALESCE(sum(octet_length(ciphertext)),0)::bigint AS bytes
    FROM privacy_export_artifacts WHERE tenant_id=${tenantId}::uuid AND ciphertext IS NOT NULL
  `;
  return row?.bytes ?? 0n;
}
// Caller holds the canonical tenant lock until payload creation and audit commit.
export async function assertManagedStorageQuota(
  tx: Prisma.TransactionClient,
  tenantId: string,
  additional: number,
) {
  const subscription = await requireSubscriptionWrite(tx, tenantId);
  const limits = planLimitsSchema.parse(subscription.plan.limitsJson);
  if (
    (await managedExportBytes(tx, tenantId)) + BigInt(additional) >
    BigInt(limits.maxStorageBytes)
  ) {
    throw new ConflictException(
      "Đã đạt giới hạn lưu nội dung bản xuất tạm. Chờ nội dung hết hạn được dọn hoặc liên hệ quản trị về hạn mức. Yêu cầu chưa được thực thi.",
    );
  }
}
