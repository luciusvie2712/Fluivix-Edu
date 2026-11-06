import { UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { financialDay, financialOffset } from "./finance-query";
import type { PaymentQuery } from "./payment.dto";

export async function paymentIds(
  tx: Prisma.TransactionClient,
  tenant: string,
  q: PaymentQuery,
  subject?: string,
) {
  const offset = financialOffset(q);
  if (q.from && q.to && q.from > q.to)
    throw new UnprocessableEntityException(
      "Khoảng ngày nhận tiền không hợp lệ.",
    );
  const where = [Prisma.sql`p.tenant_id=${tenant}::uuid`];
  if (subject ?? q.studentId)
    where.push(Prisma.sql`p.student_id=${subject ?? q.studentId}::uuid`);
  if (q.status) where.push(Prisma.sql`p.status=${q.status}`);
  if (q.method) where.push(Prisma.sql`p.method=${q.method}`);
  if (q.from) where.push(Prisma.sql`p.received_at>=${financialDay(q.from)}`);
  if (q.to) {
    where.push(Prisma.sql`p.received_at<${financialDay(q.to, true)}`);
  }
  if (q.search) {
    const pattern = "%" + q.search.replace(/[\\%_]/g, "\\$&") + "%";
    where.push(
      Prisma.sql`(p.receipt_no ILIKE ${pattern} OR s.student_code ILIKE ${pattern} OR s.full_name ILIKE ${pattern})`,
    );
  }
  const scoped = Prisma.sql`FROM payments p JOIN student_profiles s ON s.tenant_id=p.tenant_id AND s.id=p.student_id WHERE ${Prisma.join(where, " AND ")}`;
  const [rows, counts] = await Promise.all([
    tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT p.id ${scoped} ORDER BY p.received_at DESC,p.id ASC LIMIT ${q.limit} OFFSET ${offset}`,
    ),
    tx.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT count(*) AS total ${scoped}`,
    ),
  ]);
  return { ids: rows.map((r) => r.id), total: Number(counts[0]?.total ?? 0n) };
}
