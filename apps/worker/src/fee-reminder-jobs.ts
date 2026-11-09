import { Prisma, type PrismaClient } from "@prisma/client";
import { configuredPrivacyPolicy } from "../../api/dist/privacy-policy";
import {
  requirePlanFeature,
  requireSubscriptionWrite,
} from "../../api/dist/subscription-policy";
import {
  reminderDueRanges,
  reminderWindow,
  type ReminderStage,
} from "../../api/dist/fee-reminder-window";
import { reminderInvoiceEligibleSql } from "../../api/dist/fee-reminder-predicates";
type Candidate = { id: string; studentId: string; stage: ReminderStage };
// Invoice alias i. A relationship is never treated as notifications consent.
function recipientAvailable(policyVersion: string) {
  return Prisma.sql`EXISTS (SELECT 1 FROM guardian_student_links l
 JOIN tenant_memberships m ON m.tenant_id=l.tenant_id AND m.user_id=l.guardian_user_id
 JOIN users u ON u.id=m.user_id
 JOIN membership_roles mr ON mr.membership_id=m.id AND mr.role='guardian'
 LEFT JOIN notification_preferences np ON np.tenant_id=m.tenant_id AND np.user_id=m.user_id
 WHERE l.tenant_id=i.tenant_id AND l.student_id=i.student_id
 AND l.status='ACTIVE' AND l.verified_at IS NOT NULL AND l.verified_by IS NOT NULL
 AND m.status='ACTIVE' AND NOT m.activation_pending AND u.status='ACTIVE' AND COALESCE(np.finance,true)
 AND EXISTS (SELECT 1 FROM privacy_consents pc
   WHERE pc.tenant_id=m.tenant_id AND pc.consenting_user_id=m.user_id
     AND pc.subject_student_id=i.student_id AND pc.purpose_code='NOTIFICATIONS'
     AND pc.policy_version=${policyVersion} AND pc.granted AND pc.revoked_at IS NULL))`;
}
function eligibility(
  tenantId: string,
  timezone: string,
  day: string,
  start: Date,
  version: string,
) {
  const ranges = reminderDueRanges(day, timezone);
  const due = Prisma.join(
    ranges.map(
      (r) => Prisma.sql`(i.due_at>=${r.start} AND i.due_at<${r.end}
   AND NOT EXISTS (SELECT 1 FROM fee_reminder_stages s WHERE s.tenant_id=i.tenant_id AND s.invoice_id=i.id AND s.stage=${r.stage}))`,
    ),
    " OR ",
  );
  const stage = Prisma.sql`CASE ${Prisma.join(
    ranges.map(
      (r) =>
        Prisma.sql`WHEN i.due_at>=${r.start} AND i.due_at<${r.end} THEN ${r.stage}`,
    ),
    " ",
  )} END`;
  const scope = Prisma.sql`i.tenant_id=${tenantId}::uuid AND i.issued_at<=${start}
   AND (${due}) AND ${reminderInvoiceEligibleSql()} AND ${recipientAvailable(version)}`;
  const noPriorBatch = Prisma.sql`NOT EXISTS (SELECT 1 FROM fee_reminder_batches b WHERE b.tenant_id=i.tenant_id
     AND b.student_id=i.student_id AND b.local_day=${new Date(day + "T00:00:00Z")}::date)`;
  return { scope, stage, noPriorBatch };
}
export async function generateFeeReminderTenant(
  db: PrismaClient,
  tenantId: string,
  clock: () => Date = () => new Date(),
) {
  const privacy = configuredPrivacyPolicy();
  if (!privacy.configured || !privacy.version) return { batches: 0, stages: 0 };
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { timezone: true },
      });
      const policy = await tx.feeReminderPolicy.findUnique({
        where: { tenantId },
      });
      if (!tenant || !policy?.enabled || !policy.enabledSince)
        return { batches: 0, stages: 0 };
      const window = reminderWindow(clock(), tenant.timezone);
      if (!window || policy.enabledSince > window.start)
        return { batches: 0, stages: 0 };
      await requireSubscriptionWrite(tx, tenantId);
      await requirePlanFeature(tx, tenantId, "finance");
      const q = eligibility(
        tenantId,
        tenant.timezone,
        window.day,
        window.start,
        privacy.version!,
      );
      const students = await tx.$queryRaw<
        { id: string }[]
      >`SELECT DISTINCT i.student_id AS id FROM invoices i
    WHERE ${q.scope} AND ${q.noPriorBatch} ORDER BY i.student_id LIMIT 20`;
      if (!students.length || clock() >= window.end)
        return { batches: 0, stages: 0 };
      const batches = new Map<string, string>();
      let stages = 0,
        cursor: string | undefined;
      // Bounded keyset pages, complete child cohorts. No invoice-count business cap.
      // All batches and stages roll back if the time/transaction budget is exhausted.
      while (true) {
        if (clock() >= window.end) throw new Error("REMINDER_WINDOW_CLOSED");
        const rows: Candidate[] = await tx.$queryRaw<
          Candidate[]
        >`SELECT i.id,i.student_id AS "studentId",${q.stage} AS stage
     FROM invoices i WHERE ${q.scope}
       AND i.student_id IN (${Prisma.join(students.map((v) => Prisma.sql`${v.id}::uuid`))})
       ${cursor ? Prisma.sql`AND i.id>${cursor}::uuid` : Prisma.empty}
     ORDER BY i.id LIMIT 500`;
        if (!rows.length) break;
        for (const studentId of new Set(rows.map((r) => r.studentId))) {
          if (batches.has(studentId)) continue;
          const b = await tx.feeReminderBatch.create({
            data: {
              tenantId,
              studentId,
              localDay: new Date(window.day + "T00:00:00Z"),
              timezone: tenant.timezone,
              policyVersion: policy.version,
              windowStartsAt: window.start,
              windowEndsAt: window.end,
            },
          });
          batches.set(studentId, b.id);
        }
        await tx.feeReminderStage.createMany({
          data: rows.map((r) => {
            const batchId = batches.get(r.studentId);
            if (!batchId) throw new Error("REMINDER_BATCH_MISSING");
            return {
              tenantId,
              invoiceId: r.id,
              studentId: r.studentId,
              stage: r.stage,
              batchId,
            };
          }),
        });
        stages += rows.length;
        cursor = rows[rows.length - 1]!.id;
        if (rows.length < 500) break;
      }
      for (const batchId of batches.values()) {
        if (clock() >= window.end) throw new Error("REMINDER_WINDOW_CLOSED");
        await tx.outboxEvent.create({
          data: {
            tenantId,
            eventType: "FEE_REMINDER",
            aggregateId: batchId,
            eventVersion: 1,
            payload: {},
          },
        });
      }
      if (clock() >= window.end) throw new Error("REMINDER_WINDOW_CLOSED");
      return { batches: batches.size, stages };
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}
export async function enqueueFeeReminderPage(db: PrismaClient, after?: string) {
  const policies = await db.feeReminderPolicy.findMany({
    where: { enabled: true, ...(after ? { tenantId: { gt: after } } : {}) },
    select: { tenantId: true },
    orderBy: { tenantId: "asc" },
    take: 10,
  });
  for (const policy of policies) {
    try {
      await generateFeeReminderTenant(db, policy.tenantId);
    } catch {
      console.error(JSON.stringify({ code: "FEE_REMINDER_DISPATCH_FAILED" }));
    }
  }
  return {
    cursor:
      policies.length === 10
        ? policies[policies.length - 1]!.tenantId
        : undefined,
  };
}
