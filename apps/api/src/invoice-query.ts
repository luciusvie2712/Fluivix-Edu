import { UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  financialDay,
  financialOffset,
  financialTimezone,
} from "./finance-query";
import { Paged } from "./http";
import type { InvoiceQuery, InvoiceListView } from "./invoice.dto";

type RawInvoice = {
  id: string;
  student_id: string;
  invoice_no: string;
  total_amount_vnd: string;
  paid_amount_vnd: string;
  balance_vnd: string;
  billing_state: string;
  payment_status: string;
  due_at: Date;
  issued_at: Date;
  student_code: string;
  full_name: string;
  class_id: string;
  class_code: string;
  class_name: string;
  fee_plan_id: string;
  period_key: string;
  billing_model: string;
};
export function invoiceValueScope(
  tenantId: string,
  q: InvoiceQuery,
  timezone: string,
  subject?: string,
  onlyIds?: string[],
  now = new Date(),
) {
  if (q.from && q.to && q.from > q.to)
    throw new UnprocessableEntityException("Khoảng ngày đến hạn không hợp lệ.");
  const conditions = [Prisma.sql`i.tenant_id=${tenantId}::uuid`];
  const studentId = subject ?? q.studentId;
  if (studentId) conditions.push(Prisma.sql`i.student_id=${studentId}::uuid`);
  if (q.classId) conditions.push(Prisma.sql`f.class_id=${q.classId}::uuid`);
  if (q.feePlanId) conditions.push(Prisma.sql`f.id=${q.feePlanId}::uuid`);
  if (q.periodKey) conditions.push(Prisma.sql`r.period_key=${q.periodKey}`);
  if (onlyIds) {
    if (!onlyIds.length) conditions.push(Prisma.sql`FALSE`);
    else
      conditions.push(
        Prisma.sql`i.id IN (${Prisma.join(onlyIds.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
  }
  if (q.from)
    conditions.push(Prisma.sql`i.due_at>=${financialDay(q.from, timezone)}`);
  if (q.to) {
    conditions.push(Prisma.sql`i.due_at<${financialDay(q.to, timezone, true)}`);
  }
  if (q.search) {
    const pattern = "%" + q.search.replace(/[\\%_]/g, "\\$&") + "%";
    conditions.push(
      Prisma.sql`(i.invoice_no ILIKE ${pattern} OR s.student_code ILIKE ${pattern} OR s.full_name ILIKE ${pattern})`,
    );
  }
  const scoped = Prisma.sql`
    WITH scoped AS (
      SELECT i.*,s.student_code,s.full_name,f.class_id,c.code AS class_code,c.name AS class_name,
        f.id AS fee_plan_id,r.period_key,f.billing_model
      FROM invoices i
      JOIN student_profiles s ON s.tenant_id=i.tenant_id AND s.id=i.student_id
      JOIN invoice_runs r ON r.tenant_id=i.tenant_id AND r.id=i.run_id
      JOIN fee_plans f ON f.tenant_id=r.tenant_id AND f.id=r.fee_plan_id
      JOIN classes c ON c.tenant_id=f.tenant_id AND c.id=f.class_id
      WHERE ${Prisma.join(conditions, " AND ")}
    ), paid AS (
      SELECT a.invoice_id,sum(a.amount_vnd) AS amount
      FROM payment_allocations a
      JOIN scoped i ON i.tenant_id=a.tenant_id AND i.id=a.invoice_id
      JOIN payments p ON p.tenant_id=a.tenant_id AND p.id=a.payment_id AND p.status='CONFIRMED'
      WHERE a.tenant_id=${tenantId}::uuid GROUP BY a.invoice_id
    ), valued AS (
      SELECT i.*,coalesce(paid.amount,0) AS paid_amount,
        i.total_amount_vnd-coalesce(paid.amount,0) AS balance,
        CASE WHEN i.billing_state='VOID' THEN 'VOID'
          WHEN i.total_amount_vnd-coalesce(paid.amount,0)=0 THEN 'PAID'
          WHEN i.due_at<${now} THEN 'OVERDUE'
          WHEN coalesce(paid.amount,0)>0 THEN 'PARTIAL' ELSE 'UNPAID' END AS payment_status
      FROM scoped i LEFT JOIN paid ON paid.invoice_id=i.id
    )`;
  const status = q.paymentStatus
    ? Prisma.sql`payment_status=${q.paymentStatus}`
    : Prisma.sql`TRUE`;
  return { scoped, status };
}
export async function invoiceRows(
  tx: Prisma.TransactionClient,
  tenantId: string,
  q: InvoiceQuery,
  subject?: string,
  onlyIds?: string[],
  now = new Date(),
  outstandingOnly = false,
): Promise<Paged<InvoiceListView>> {
  const offset = financialOffset(q);
  const timezone = await financialTimezone(tx, tenantId);
  const { scoped, status } = invoiceValueScope(
    tenantId,
    q,
    timezone,
    subject,
    onlyIds,
    now,
  );
  const included = outstandingOnly
    ? Prisma.sql`${status} AND billing_state='ISSUED' AND balance>0`
    : status;
  const [rows, counts] = await Promise.all([
    tx.$queryRaw<RawInvoice[]>(Prisma.sql`${scoped}
      SELECT id,student_id,invoice_no,total_amount_vnd::text,paid_amount::text AS paid_amount_vnd,
        balance::text AS balance_vnd,billing_state,payment_status,due_at,issued_at,student_code,
        full_name,class_id,class_code,class_name,fee_plan_id,period_key,billing_model
      FROM valued WHERE ${included} ORDER BY due_at DESC,id ASC LIMIT ${q.limit} OFFSET ${offset}`),
    tx.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`${scoped} SELECT count(*) AS total FROM valued WHERE ${included}`,
    ),
  ]);
  const total = Number(counts[0]?.total ?? 0n);
  return new Paged(
    rows.map((r) => ({
      id: r.id,
      timezone,
      studentId: r.student_id,
      invoiceNo: r.invoice_no,
      totalAmountVnd: r.total_amount_vnd,
      paidAmountVnd: r.paid_amount_vnd,
      balanceVnd: r.balance_vnd,
      billingState: r.billing_state,
      paymentStatus: r.payment_status,
      dueAt: r.due_at.toISOString(),
      issuedAt: r.issued_at.toISOString(),
      studentCode: r.student_code,
      fullName: r.full_name,
      classId: r.class_id,
      classCode: r.class_code,
      className: r.class_name,
      feePlanId: r.fee_plan_id,
      periodKey: r.period_key,
      billingModel: r.billing_model,
    })),
    {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
  );
}
