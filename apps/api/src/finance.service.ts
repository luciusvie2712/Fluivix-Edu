import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, type Invoice, type Payment } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { vndSchema } from "@fluivix/contracts";
import { Db } from "./db";
import { TeachingService } from "./teaching.service";
import type { Claims } from "./security";
import { Paged } from "./http";
import {
  requirePlanFeature,
  requireSubscriptionWrite,
} from "./subscription-policy";
import {
  FeePlanInput,
  FinanceQuery,
  InvoiceRunInput,
  PaymentInput,
} from "./finance.dto";
type Tx = Prisma.TransactionClient;
const digest = (value: unknown): string =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, v: unknown) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            )
          : v,
      ),
    )
    .digest("hex");
function money(value: string) {
  const parsed = vndSchema.safeParse(value);
  if (!parsed.success)
    throw new UnprocessableEntityException("Số tiền VND không hợp lệ.");
  return BigInt(parsed.data);
}
function qualified(value: string) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new UnprocessableEntityException("Thời gian cần có múi giờ.");
  return new Date(value);
}
@Injectable()
export class FinanceService {
  constructor(
    private db: Db,
    private teaching: TeachingService,
  ) {}
  private async lock(tx: Tx, c: Claims) {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId!}::uuid FOR UPDATE`;
    await requireSubscriptionWrite(tx, c.tenantId!);
    await requirePlanFeature(tx, c.tenantId!, "finance");
  }
  private async audit(
    tx: Tx,
    c: Claims,
    action: string,
    id: string,
    traceId: string,
    reason?: string,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: c.tenantId!,
        actorUserId: c.sub,
        action,
        resourceId: id,
        traceId,
        ...(reason ? { reason } : {}),
      },
    });
  }
  private key(value: string | undefined) {
    if (!value || !/^[A-Za-z0-9_-]{8,100}$/.test(value))
      throw new UnprocessableEntityException(
        "Cần Idempotency-Key từ 8 đến 100 ký tự.",
      );
    return value;
  }
  private async prior(
    tx: Tx,
    c: Claims,
    operation: string,
    key: string,
    input: unknown,
  ) {
    const row = await tx.idempotencyRecord.findUnique({
      where: {
        tenantId_userId_operation_key: {
          tenantId: c.tenantId!,
          userId: c.sub,
          operation,
          key,
        },
      },
    });
    if (row && row.requestHash !== digest(input))
      throw new ConflictException(
        "IDEMPOTENCY_KEY_REUSED: nội dung không trùng lần trước.",
      );
    return row?.response;
  }
  private async remember(
    tx: Tx,
    c: Claims,
    operation: string,
    key: string,
    input: unknown,
    response: Prisma.InputJsonValue,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        tenantId: c.tenantId!,
        userId: c.sub,
        operation,
        key,
        requestHash: digest(input),
        response,
      },
    });
  }
  async fee(c: Claims, input: FeePlanInput, traceId: string) {
    const amountVnd = money(input.amountVnd);
    if (input.validTo && input.validTo < input.validFrom)
      throw new UnprocessableEntityException("Khoảng hiệu lực không hợp lệ.");
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, c);
      const cls = await tx.educationClass.findFirst({
        where: { tenantId: c.tenantId!, id: input.classId },
      });
      if (!cls) throw new NotFoundException("Không tìm thấy lớp.");
      const row = await tx.feePlan.create({
        data: {
          tenantId: c.tenantId!,
          classId: input.classId,
          name: input.name,
          billingModel: input.billingModel,
          amountVnd,
          validFrom: new Date(input.validFrom + "T00:00:00Z"),
          validTo: input.validTo
            ? new Date(input.validTo + "T00:00:00Z")
            : null,
        },
      });
      await this.audit(tx, c, "fee.created", row.id, traceId);
      return {
        id: row.id,
        classId: row.classId,
        name: row.name,
        billingModel: row.billingModel,
        amountVnd: row.amountVnd.toString(),
        validFrom: row.validFrom.toISOString().slice(0, 10),
        ...(row.validTo
          ? { validTo: row.validTo.toISOString().slice(0, 10) }
          : {}),
        status: row.status,
      };
    });
  }
  private async invoiceView(tx: Tx, row: Invoice) {
    const values = await tx.$queryRaw<
      { paid: bigint }[]
    >`SELECT COALESCE(sum(a.amount_vnd),0)::bigint AS paid FROM payment_allocations a JOIN payments p ON p.tenant_id=a.tenant_id AND p.id=a.payment_id WHERE a.tenant_id=${row.tenantId}::uuid AND a.invoice_id=${row.id}::uuid AND p.status='CONFIRMED'`;
    const paid = values[0]!.paid,
      balance = row.totalAmountVnd - paid;
    return {
      id: row.id,
      studentId: row.studentId,
      invoiceNo: row.invoiceNo,
      totalAmountVnd: row.totalAmountVnd.toString(),
      paidAmountVnd: paid.toString(),
      balanceVnd: balance.toString(),
      billingState: row.billingState,
      paymentStatus:
        row.billingState === "VOID"
          ? "VOID"
          : balance === 0n
            ? "PAID"
            : row.dueAt < new Date()
              ? "OVERDUE"
              : paid > 0n
                ? "PARTIAL"
                : "UNPAID",
      dueAt: row.dueAt.toISOString(),
      issuedAt: row.issuedAt.toISOString(),
    };
  }
  async generate(
    c: Claims,
    input: InvoiceRunInput,
    keyInput: string | undefined,
    traceId: string,
  ) {
    const key = this.key(keyInput),
      dueAt = qualified(input.dueAt);
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, c);
        const prior = await this.prior(tx, c, "invoice-run", key, input);
        if (prior) return prior;
        const fee = await tx.feePlan.findFirst({
          where: {
            tenantId: c.tenantId!,
            id: input.feePlanId,
            status: "ACTIVE",
          },
        });
        if (!fee) throw new NotFoundException("Không tìm thấy biểu phí.");
        if ((fee.billingModel === "COURSE") !== (input.periodKey === "COURSE"))
          throw new UnprocessableEntityException(
            "Kỳ phát hành không phù hợp mô hình phí.",
          );
        let from = fee.validFrom,
          to = fee.validTo ?? new Date("9999-12-31Z");
        if (fee.billingModel === "MONTHLY") {
          from = new Date(input.periodKey + "-01T00:00:00Z");
          to = new Date(from);
          to.setUTCMonth(to.getUTCMonth() + 1);
          to.setUTCDate(0);
          if (to < fee.validFrom || (fee.validTo && from > fee.validTo))
            throw new UnprocessableEntityException(
              "Kỳ nằm ngoài hiệu lực biểu phí.",
            );
        }
        let run = await tx.invoiceRun.findUnique({
          where: {
            tenantId_feePlanId_periodKey: {
              tenantId: c.tenantId!,
              feePlanId: fee.id,
              periodKey: input.periodKey,
            },
          },
        });
        if (run && run.requestHash !== digest(input))
          throw new ConflictException(
            "Kỳ phát hành đã tồn tại với nội dung khác.",
          );
        if (!run) {
          run = await tx.invoiceRun.create({
            data: {
              tenantId: c.tenantId!,
              feePlanId: fee.id,
              periodKey: input.periodKey,
              requestHash: digest(input),
              createdBy: c.sub,
            },
          });
          const enrolled = await tx.enrollment.findMany({
            where: {
              tenantId: c.tenantId!,
              classId: fee.classId,
              joinedAt: { lte: to },
              OR: [{ leftAt: null }, { leftAt: { gte: from } }],
            },
            select: { studentId: true },
            distinct: ["studentId"],
          });
          for (const e of enrolled) {
            const row = await tx.invoice.create({
              data: {
                tenantId: c.tenantId!,
                studentId: e.studentId,
                runId: run.id,
                invoiceNo: "INV-" + randomUUID(),
                totalAmountVnd: fee.amountVnd,
                dueAt,
                createdBy: c.sub,
              },
            });
            await tx.invoiceItem.create({
              data: {
                tenantId: c.tenantId!,
                invoiceId: row.id,
                feePlanId: fee.id,
                description: fee.name + " · " + input.periodKey,
                totalAmountVnd: fee.amountVnd,
              },
            });
            await tx.outboxEvent.create({
              data: {
                tenantId: c.tenantId!,
                eventType: "INVOICE_ISSUED",
                aggregateId: row.id,
                eventVersion: 1,
                payload: { invoiceId: row.id },
              },
            });
          }
          await this.audit(tx, c, "invoice.run.generated", run.id, traceId);
        }
        const invoices = await tx.invoice.findMany({
            where: { tenantId: c.tenantId!, runId: run.id },
            orderBy: { id: "asc" },
          }),
          response = {
            runId: run.id,
            invoices: await Promise.all(
              invoices.map((row) => this.invoiceView(tx, row)),
            ),
          };
        await this.remember(tx, c, "invoice-run", key, input, response);
        return response;
      },
      { timeout: 30000 },
    );
  }
  private async paymentView(tx: Tx, p: Payment) {
    const allocations = await tx.paymentAllocation.findMany({
      where: { tenantId: p.tenantId, paymentId: p.id },
      orderBy: { invoiceId: "asc" },
    });
    const invoices = await tx.invoice.findMany({
      where: {
        tenantId: p.tenantId,
        id: { in: allocations.map((v) => v.invoiceId) },
      },
      orderBy: { id: "asc" },
    });
    return {
      id: p.id,
      studentId: p.studentId,
      receiptNo: p.receiptNo,
      method: p.method,
      receivedAmountVnd: p.receivedAmountVnd.toString(),
      unallocatedAmountVnd: (
        p.receivedAmountVnd - allocations.reduce((a, r) => a + r.amountVnd, 0n)
      ).toString(),
      receivedAt: p.receivedAt.toISOString(),
      status: p.status,
      allocations: allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amountVnd: a.amountVnd.toString(),
      })),
      invoiceBalances: await Promise.all(
        invoices.map((i) => this.invoiceView(tx, i)),
      ),
      receiptNotice:
        "Phiếu thu nội bộ, không phải hóa đơn VAT; ghi nhận của trung tâm, không xác minh ngân hàng.",
    };
  }
  async pay(
    c: Claims,
    input: PaymentInput,
    keyInput: string | undefined,
    traceId: string,
  ) {
    const key = this.key(keyInput),
      amount = money(input.receivedAmountVnd),
      receivedAt = qualified(input.receivedAt);
    const allocated = input.allocations.reduce(
      (a, r) => a + money(r.amountVnd),
      0n,
    );
    if (allocated > amount)
      throw new UnprocessableEntityException("Phân bổ vượt số tiền nhận.");
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, c);
      const prior = await this.prior(tx, c, "payment", key, input);
      if (prior) return prior;
      if (
        !(await tx.student.findFirst({
          where: { tenantId: c.tenantId!, id: input.studentId },
        }))
      )
        throw new NotFoundException("Không tìm thấy học viên.");
      for (const a of [...input.allocations].sort((a, b) =>
        a.invoiceId.localeCompare(b.invoiceId),
      )) {
        await tx.$queryRaw`SELECT id FROM invoices WHERE tenant_id=${c.tenantId!}::uuid AND id=${a.invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({
          where: {
            tenantId: c.tenantId!,
            id: a.invoiceId,
            studentId: input.studentId,
            billingState: "ISSUED",
          },
        });
        if (!invoice)
          throw new NotFoundException(
            "Chứng từ không thuộc học viên hoặc không còn hiệu lực.",
          );
        if (
          money(a.amountVnd) >
          BigInt((await this.invoiceView(tx, invoice)).balanceVnd)
        )
          throw new UnprocessableEntityException(
            "Phân bổ vượt công nợ còn lại.",
          );
      }
      const p = await tx.payment.create({
        data: {
          tenantId: c.tenantId!,
          studentId: input.studentId,
          receiptNo: "RCPT-" + randomUUID(),
          method: input.method,
          receivedAmountVnd: amount,
          receivedAt,
          receivedBy: c.sub,
          externalReference: input.externalReference ?? null,
        },
      });
      await tx.paymentAllocation.createMany({
        data: input.allocations.map((a) => ({
          tenantId: c.tenantId!,
          studentId: input.studentId,
          paymentId: p.id,
          invoiceId: a.invoiceId,
          amountVnd: money(a.amountVnd),
        })),
      });
      await this.audit(tx, c, "payment.recorded", p.id, traceId);
      await tx.outboxEvent.create({
        data: {
          tenantId: c.tenantId!,
          eventType: "PAYMENT_RECORDED",
          aggregateId: p.id,
          eventVersion: 1,
          payload: { paymentId: p.id },
        },
      });
      const response = await this.paymentView(tx, p);
      await this.remember(tx, c, "payment", key, input, response);
      return response;
    });
  }
  async invoices(c: Claims, q: FinanceQuery, childId?: string) {
    return this.db.$transaction(
      async (tx) => {
        const studentId =
          c.role === "guardian"
            ? await this.teaching.subject(tx, c, childId)
            : q.studentId;
        const where = {
          tenantId: c.tenantId!,
          ...(studentId ? { studentId } : {}),
        };
        const rows = await tx.invoice.findMany({
            where,
            orderBy: [{ dueAt: "desc" }, { id: "asc" }],
            take: q.limit,
            skip: (q.page - 1) * q.limit,
          }),
          total = await tx.invoice.count({ where });
        return new Paged(
          await Promise.all(rows.map((r) => this.invoiceView(tx, r))),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async invoice(c: Claims, id: string) {
    return this.db.$transaction(async (tx) => {
      // Guardian lookup is constrained to verified linked students before fetching money.
      const linked =
        c.role === "guardian"
          ? await tx.guardianLink.findMany({
              where: {
                tenantId: c.tenantId!,
                guardianUserId: c.sub,
                status: "ACTIVE",
                verifiedAt: { not: null },
                verifiedBy: { not: null },
              },
              select: { studentId: true },
            })
          : null;
      const row = await tx.invoice.findFirst({
        where: {
          tenantId: c.tenantId!,
          id,
          ...(linked
            ? { studentId: { in: linked.map((v) => v.studentId) } }
            : {}),
        },
      });
      if (!row) throw new NotFoundException("Không tìm thấy chứng từ.");
      return this.invoiceView(tx, row);
    });
  }
  async payments(c: Claims, q: FinanceQuery, childId?: string) {
    return this.db.$transaction(
      async (tx) => {
        const studentId =
            c.role === "guardian"
              ? await this.teaching.subject(tx, c, childId)
              : q.studentId,
          where = {
            tenantId: c.tenantId!,
            ...(studentId ? { studentId } : {}),
          };
        const rows = await tx.payment.findMany({
            where,
            orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
            take: q.limit,
            skip: (q.page - 1) * q.limit,
          }),
          total = await tx.payment.count({ where });
        return new Paged(
          await Promise.all(rows.map((p) => this.paymentView(tx, p))),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async payment(c: Claims, id: string) {
    return this.db.$transaction(async (tx) => {
      const linked =
        c.role === "guardian"
          ? await tx.guardianLink.findMany({
              where: {
                tenantId: c.tenantId!,
                guardianUserId: c.sub,
                status: "ACTIVE",
                verifiedAt: { not: null },
                verifiedBy: { not: null },
              },
              select: { studentId: true },
            })
          : null;
      const p = await tx.payment.findFirst({
        where: {
          tenantId: c.tenantId!,
          id,
          ...(linked
            ? { studentId: { in: linked.map((v) => v.studentId) } }
            : {}),
        },
      });
      if (!p) throw new NotFoundException("Không tìm thấy phiếu thu.");
      return this.paymentView(tx, p);
    });
  }
  async voidInvoice(c: Claims, id: string, reason: string, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, c);
      await tx.$queryRaw`SELECT id FROM invoices WHERE tenant_id=${c.tenantId!}::uuid AND id=${id}::uuid FOR UPDATE`;
      const row = await tx.invoice.findFirst({
        where: { tenantId: c.tenantId!, id, billingState: "ISSUED" },
      });
      if (!row) throw new NotFoundException();
      if (BigInt((await this.invoiceView(tx, row)).paidAmountVnd) > 0n)
        throw new ConflictException(
          "Chứng từ còn thanh toán có hiệu lực; cần xử lý giao dịch trước.",
        );
      const next = await tx.invoice.update({
        where: { id },
        data: { billingState: "VOID", voidReason: reason },
      });
      await this.audit(tx, c, "invoice.voided", id, traceId, reason);
      return this.invoiceView(tx, next);
    });
  }
  async reverse(c: Claims, id: string, reason: string, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, c);
      await tx.$queryRaw`SELECT id FROM payments WHERE tenant_id=${c.tenantId!}::uuid AND id=${id}::uuid FOR UPDATE`;
      const p = await tx.payment.findFirst({
        where: { tenantId: c.tenantId!, id, status: "CONFIRMED" },
      });
      if (!p)
        throw new ConflictException("Giao dịch không tồn tại hoặc đã đảo.");
      await tx.paymentReversal.create({
        data: {
          tenantId: c.tenantId!,
          paymentId: id,
          reason,
          approvedBy: c.sub,
        },
      });
      const next = await tx.payment.update({
        where: { id },
        data: { status: "REVERSED" },
      });
      await this.audit(tx, c, "payment.reversed", id, traceId, reason);
      return this.paymentView(tx, next);
    });
  }
}
