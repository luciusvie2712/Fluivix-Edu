import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { hasPermission, type Claims } from "./security";
import { requireSubscriptionWrite } from "./subscription-policy";

// Keep the tenant lock through the protected write and audit. Recheck after
// waiting: a guard's earlier permission/session decision may have been revoked.
export async function lockTenantActor(
  tx: Prisma.TransactionClient,
  c: Claims,
  permission: string,
) {
  if (!c.tenantId || !c.role) throw new ForbiddenException();
  await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId}::uuid FOR UPDATE`;
  await requireSubscriptionWrite(tx, c.tenantId);
  const actor = await tx.membership.findUnique({
    where: { tenantId_userId: { tenantId: c.tenantId, userId: c.sub } },
    include: {
      roles: true,
      user: { select: { status: true, displayName: true } },
    },
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
    actor.activationPending ||
    actor.user.status !== "ACTIVE" ||
    !actor.roles.some((r) => r.role === c.role) ||
    !hasPermission(c.role, permission, actor.staffDelegated)
  )
    throw new ForbiddenException(
      "Quyền truy cập đã thay đổi. Vui lòng tải lại.",
    );
  return actor;
}

export async function setActorContext(
  tx: Prisma.TransactionClient,
  c: Claims,
  displayName: string,
  traceId: string,
  reason: string,
) {
  await tx.$queryRaw`SELECT set_config('fluivixedu.actor_id',${c.sub},true),set_config('fluivixedu.actor_name',${displayName},true),set_config('fluivixedu.trace_id',${traceId},true),set_config('fluivixedu.change_reason',${reason},true)`;
}
