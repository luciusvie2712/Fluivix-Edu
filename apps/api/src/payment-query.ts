import { UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { wallClockUtc } from "@fluivix/contracts";
import type { PaymentQuery } from "./payment.dto";

export async function paymentIds(
  tx: Prisma.TransactionClient,
  tenant: string,
  q: PaymentQuery,
  subject?: string,
) {
  if (q.from && q.to && q.from > q.to)
    throw new UnprocessableEntityException(
      "Khoảng ngày nhận tiền không hợp lệ.",
    );
  const where = [Prisma.sql`p.tenant_id=${tenant}::uuid`];
  if (subject ?? q.studentId)
    where.push(Prisma.sql`p.student_id=${subject ?? q.studentId}::uuid`);
  if (q.status) where.push(Prisma.sql`p.status=${q.status}`);
  if (q.method) where.push(Prisma.sql`p.method=${q.method}`);
  if (q.from)
    where.push(
      Prisma.sql`p.received_at>=${wallClockUtc(q.from, "00:00", "Asia/Ho_Chi_Minh")}`,
    );
  if (q.to) {
    const next = new Date(q.to + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    where.push(
      Prisma.sql`p.received_at<${wallClockUtc(next.toISOString().slice(0, 10), "00:00", "Asia/Ho_Chi_Minh")}`,
    );
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
      Prisma.sql`SELECT p.id ${scoped} ORDER BY p.received_at DESC,p.id ASC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
    ),
    tx.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT count(*) AS total ${scoped}`,
    ),
  ]);
  return { ids: rows.map((r) => r.id), total: Number(counts[0]?.total ?? 0n) };
}
