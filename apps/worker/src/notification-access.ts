import {
  Prisma,
  type Notification,
  type NotificationPreference,
} from "@prisma/client";
import {
  notificationAudienceSql,
  notificationSubjectsSql,
} from "../../api/dist/notification-policy";
import { configuredPrivacyPolicy } from "../../api/dist/privacy-policy";
type Tx = Prisma.TransactionClient;
export type Audience = Pick<
  Notification,
  "tenantId" | "recipientUserId" | "recipientRole" | "subjectStudentId"
> &
  Partial<Pick<Notification, "type" | "entityType" | "entityId">>;
function audienceSource(n: Audience) {
  if (!n.type || !n.entityType || !n.entityId) return null;
  return Prisma.sql`(VALUES (
    ${n.tenantId}::uuid,${n.recipientUserId}::uuid,${n.recipientRole}::"Role",
    ${n.type}::text,${n.entityType}::text,${n.entityId}::uuid
  )) AS n(tenant_id,recipient_user_id,recipient_role,type,entity_type,entity_id)`;
}
export async function consentFor(
  db: Tx,
  n: Audience,
  subjects: (string | null)[],
) {
  const policy = configuredPrivacyPolicy();
  const version = policy.configured ? policy.version : null;
  if (!version || !subjects.length) return false;
  return !!(await db.privacyConsent.findFirst({
    where: {
      tenantId: n.tenantId,
      consentingUserId: n.recipientUserId,
      policyVersion: version,
      purposeCode: "NOTIFICATIONS",
      granted: true,
      revokedAt: null,
      OR: subjects.map((subjectStudentId) => ({ subjectStudentId })),
    },
    select: { id: true },
  }));
}
export async function authorizedNotificationSubjects(db: Tx, n: Audience) {
  const source = audienceSource(n);
  if (!source) return [];
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT a.id FROM ${source} CROSS JOIN LATERAL (${notificationSubjectsSql()}) a
    WHERE ${notificationAudienceSql()} ORDER BY a.id
  `);
  return rows.map((row) => row.id);
}
export async function notificationAuthorized(db: Tx, n: Audience) {
  const source = audienceSource(n);
  if (!source) return false;
  return (
    (
      await db.$queryRaw<{ allowed: number }[]>(Prisma.sql`
    SELECT 1 AS allowed FROM ${source} WHERE ${notificationAudienceSql()} LIMIT 1
  `)
    ).length > 0
  );
}

export function categoryEnabled(
  type: string,
  pref: NotificationPreference | null,
) {
  switch (type) {
    case "CLASS_SCHEDULE_CHANGED":
      return pref?.schedule ?? true;
    case "ATTENDANCE_FINALIZED_ABSENT":
      return pref?.attendance ?? true;
    case "GRADE_PUBLISHED":
      return pref?.grades ?? true;
    case "FEE_REMINDER":
    case "INVOICE_ISSUED":
    case "PAYMENT_RECORDED":
      return pref?.finance ?? true;
    default:
      return false;
  }
}
