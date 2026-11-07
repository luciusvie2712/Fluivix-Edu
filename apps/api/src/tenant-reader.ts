import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { hasPermission, type Claims } from "./security";

// Read-only counterpart to lockTenantActor. Call inside a READ COMMITTED
// transaction so actor data is current AFTER any canonical tenant lock wait.
// A write must continue to use lockTenantActor/requireSubscriptionWrite.
export async function lockTenantReader(
  tx: Prisma.TransactionClient,
  c: Claims,
  permission: string,
) {
  if (!c.tenantId || !c.role || !c.sid || !c.sub)
    throw new ForbiddenException();
  await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId}::uuid FOR SHARE`;
  const [member, session] = await Promise.all([
    tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: c.tenantId, userId: c.sub } },
      include: {
        roles: true,
        tenant: true,
        user: { select: { status: true } },
      },
    }),
    tx.authSession.findFirst({
      where: {
        id: c.sid,
        userId: c.sub,
        selectedTenantId: c.tenantId,
        selectedRole: c.role,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);
  if (
    !session ||
    !member ||
    member.status !== "ACTIVE" ||
    member.activationPending ||
    member.user.status !== "ACTIVE" ||
    !member.roles.some((r) => r.role === c.role) ||
    !hasPermission(c.role, permission, member.staffDelegated) ||
    !["ACTIVE", "PAST_DUE_GRACE", "READ_ONLY"].includes(member.tenant.status)
  )
    throw new ForbiddenException(
      "Quyền truy cập đã thay đổi. Vui lòng tải lại.",
    );
  return {
    tenantId: member.tenant.id,
    timezone: member.tenant.timezone,
    status: member.tenant.status,
  };
}
