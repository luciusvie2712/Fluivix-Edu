import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma, type Role } from "@prisma/client";
import { hasPermission, type Claims } from "./security";
import { lockTenantActor, setActorContext } from "./tenant-actor";

export type PrivacyTx = Prisma.TransactionClient;
export async function privacyActor(
  tx: PrivacyTx,
  c: Claims,
  write: boolean,
  permission = "privacy.self",
) {
  if (!c.tenantId || !c.role) throw new ForbiddenException();
  if (write) await lockTenantActor(tx, c, permission);
  const rows = await tx.$queryRaw<
    { displayName: string; staffDelegated: boolean }[]
  >(Prisma.sql`
    SELECT u.display_name AS "displayName",m.staff_delegated AS "staffDelegated"
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    JOIN tenant_memberships m ON m.user_id=u.id AND m.tenant_id=${c.tenantId}::uuid
    JOIN membership_roles mr ON mr.membership_id=m.id AND mr.role=${c.role}::"Role"
    JOIN tenants t ON t.id=m.tenant_id
    WHERE s.id=${c.sid}::uuid AND s.user_id=${c.sub}::uuid AND s.selected_tenant_id=m.tenant_id AND s.selected_role=mr.role
      AND s.consumed_at IS NULL AND s.revoked_at IS NULL AND s.expires_at>now()
      AND u.status='ACTIVE' AND m.status='ACTIVE' AND NOT m.activation_pending
      AND t.status IN ('ACTIVE','PAST_DUE_GRACE','READ_ONLY')
    ${write ? Prisma.sql`FOR SHARE OF s,m,u` : Prisma.empty}
  `);
  const actor = rows[0];
  if (!actor || !hasPermission(c.role, permission, actor.staffDelegated))
    throw new ForbiddenException(
      "Quyền truy cập đã thay đổi. Vui lòng tải lại.",
    );
  return actor;
}
export async function privacyWriteActor(
  tx: PrivacyTx,
  c: Claims,
  traceId: string,
  reason: string,
  permission = "privacy.self",
) {
  const actor = await privacyActor(tx, c, true, permission);
  await setActorContext(tx, c, actor.displayName, traceId, reason);
  return actor;
}
export async function privacySubjectAllowed(
  tx: PrivacyTx,
  tenantId: string,
  userId: string,
  role: Role,
  subjectStudentId: string | null,
  readOnly = false,
) {
  const [row] = await tx.$queryRaw<{ allowed: boolean }[]>`
    SELECT privacy_subject_is_authorized(${tenantId}::uuid,${userId}::uuid,${subjectStudentId}::uuid,${role}::"Role",${readOnly}) AS allowed
  `;
  return !!row?.allowed;
}
export async function requirePrivacySubject(
  tx: PrivacyTx,
  tenantId: string,
  userId: string,
  role: Role,
  subjectStudentId: string | null,
  readOnly = false,
) {
  if (
    !(await privacySubjectAllowed(
      tx,
      tenantId,
      userId,
      role,
      subjectStudentId,
      readOnly,
    ))
  )
    throw new NotFoundException(
      "Người yêu cầu hoặc phạm vi dữ liệu không còn được phép.",
    );
}
