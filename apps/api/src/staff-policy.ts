import { ForbiddenException } from "@nestjs/common";
import type { Prisma, Role } from "@prisma/client";
import { hasPermission, type Claims } from "./security";
import { requireSubscriptionWrite } from "./subscription-policy";

export const staffRoles: Role[] = [
  "owner",
  "manager",
  "academic_staff",
  "accountant",
  "teacher",
];
export const managedStaffRoles: Role[] = ["academic_staff", "teacher"];

// The caller holds this lock until the protected mutation and its audit commit.
export async function staffActor(
  tx: Prisma.TransactionClient,
  c: Claims,
  permission: string,
) {
  if (!c.tenantId || !c.role) throw new ForbiddenException();
  await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId}::uuid FOR UPDATE`;
  await requireSubscriptionWrite(tx, c.tenantId);
  const actor = await tx.membership.findUnique({
    where: { tenantId_userId: { tenantId: c.tenantId, userId: c.sub } },
    include: { roles: true, user: { select: { status: true } } },
  });
  const session = await tx.authSession.findFirst({
    where: {
      id: c.sid,
      userId: c.sub,
      selectedTenantId: c.tenantId,
      selectedRole: c.role,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (
    !session ||
    actor?.status !== "ACTIVE" ||
    actor.user.status !== "ACTIVE" ||
    !actor.roles.some((r) => r.role === c.role) ||
    !hasPermission(c.role, permission, actor.staffDelegated)
  )
    throw new ForbiddenException(
      "Quyền quản trị đã thay đổi. Vui lòng tải lại.",
    );
  return actor;
}
