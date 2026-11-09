import { Prisma } from "@prisma/client";

// Fixed SQL aliases only. Financial facts are recomputed, never copied to push.
export function reminderInvoiceEligibleSql() {
  return Prisma.sql`i.billing_state='ISSUED'
    AND i.total_amount_vnd > COALESCE((
      SELECT sum(a.amount_vnd) FROM payment_allocations a
      JOIN payments p ON p.tenant_id=a.tenant_id AND p.id=a.payment_id
      WHERE a.tenant_id=i.tenant_id AND a.invoice_id=i.id AND p.status='CONFIRMED'
    ),0)
    AND NOT EXISTS (SELECT 1 FROM invoice_reminder_holds h
      WHERE h.tenant_id=i.tenant_id AND h.invoice_id=i.id AND h.held)`;
}
// Batch b. Caller holds tenant SHARE (claim) or UPDATE (generation) lock.
// Historical inbox authorization is separate: a past reminder is not current debt.
export function reminderBatchReadySql(now = new Date()) {
  return Prisma.sql`b.window_starts_at<=${now} AND b.window_ends_at>${now}
    AND EXISTS (SELECT 1 FROM fee_reminder_policies fp
      WHERE fp.tenant_id=b.tenant_id AND fp.enabled
        AND fp.enabled_since<=b.window_starts_at)
    AND EXISTS (SELECT 1 FROM tenants t
      JOIN LATERAL (SELECT s.grace_until,p.feature_flags_json FROM subscriptions s
        JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=t.id
          AND s.status='ACTIVE' AND s.starts_at<=${now}
        ORDER BY s.ends_at DESC LIMIT 1) sub ON true
      WHERE t.id=b.tenant_id AND t.status IN ('ACTIVE','PAST_DUE_GRACE')
        AND sub.grace_until>${now} AND sub.feature_flags_json->>'finance'='true')
    AND EXISTS (SELECT 1 FROM fee_reminder_stages rs
      JOIN invoices i ON i.tenant_id=rs.tenant_id AND i.id=rs.invoice_id AND i.student_id=rs.student_id
      WHERE rs.tenant_id=b.tenant_id AND rs.batch_id=b.id AND rs.student_id=b.student_id
        AND ${reminderInvoiceEligibleSql()})`;
}
export async function reminderBatchReady(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  now = new Date(),
) {
  return (
    (
      await tx.$queryRaw<
        { id: string }[]
      >`SELECT b.id FROM fee_reminder_batches b
    WHERE b.tenant_id=${tenantId}::uuid AND b.id=${id}::uuid AND ${reminderBatchReadySql(now)}`
    ).length > 0
  );
}
