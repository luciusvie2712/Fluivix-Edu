import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  Prisma,
  type FeePlan,
  type Invoice,
  type Payment,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { vndSchema } from "@fluivix/contracts";
import { Db } from "./db";
import { TeachingService } from "./teaching.service";
import type { Claims } from "./security";
import { Paged } from "./http";
import { requirePlanFeature } from "./subscription-policy";
import { lockTenantActor } from "./tenant-actor";
import { ListDto } from "./auth.dto";
import { InvoiceQuery, InvoiceFeeQuery } from "./invoice.dto";
import { invoiceRows, invoiceValueScope } from "./invoice-query";
import { financialOffset, financialTimezone } from "./finance-query";
import { PaymentQuery } from "./payment.dto";
import { paymentIds } from "./payment-query";
import {
  FeePlanInput,
  FeeClassQuery,
  FeePlanQuery,
  FeePlanTermInput,
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
  private tenant(c: Claims) {
    if (!c.tenantId) throw new ForbiddenException();
    return c.tenantId;
  }
  private async lock(tx: Tx, c: Claims, permission = "finance.invoice.write") {
    const actor = await lockTenantActor(tx, c, permission);
    await requirePlanFeature(tx, c.tenantId!, "finance");
    return actor;
  }
  private async today(tx: Tx, c: Claims) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: await financialTimezone(tx, this.tenant(c)),
    }).format(new Date());
  }
  private async feeViews(tx: Tx, c: Claims, rows: FeePlan[]) {
    const today = await this.today(tx, c);
    const classes = await tx.educationClass.findMany({
      where: {
        tenantId: this.tenant(c),
        id: { in: rows.map((r) => r.classId) },
      },
      select: { id: true, code: true, name: true },
    });
    return Promise.all(
      rows.map(async (row) => {
        const cls = classes.find((v) => v.id === row.classId);
        if (!cls)
          throw new ConflictException("Cần kiểm tra phạm vi lớp của biểu phí.");
        const term = await this.effectiveTerms(
          tx,
          row,
          new Date(today + "T00:00:00Z"),
        );
        return {
          id: row.id,
          classId: row.classId,
          classCode: cls.code,
          className: cls.name,
          name: row.name,
          billingModel: row.billingModel,
          amountVnd: row.amountVnd.toString(),
          validFrom: row.validFrom.toISOString().slice(0, 10),
          ...(row.validTo
            ? { validTo: row.validTo.toISOString().slice(0, 10) }
            : {}),
          status: row.status,
          version: row.version,
          effectiveName: term.name,
          effectiveAmountVnd: term.amountVnd.toString(),
          termsAsOf: today,
        };
      }),
    );
  }
  private async effectiveTerms(tx: Tx, fee: FeePlan, periodStart: Date) {
    const term = await tx.feePlanTerm.findFirst({
      where: {
        tenantId: fee.tenantId,
        feePlanId: fee.id,
        effectiveFrom: { lte: periodStart },
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    });
    return term ?? fee;
  }
  private runIntent(input: InvoiceRunInput) {
    return {
      feePlanId: input.feePlanId,
      periodKey: input.periodKey,
      dueAt: qualified(input.dueAt).toISOString(),
    };
  }
  private async runScope(tx: Tx, c: Claims, input: InvoiceRunInput) {
    const fee = await tx.feePlan.findFirst({
      where: {
        tenantId: this.tenant(c),
        id: input.feePlanId,
        status: "ACTIVE",
      },
    });
    if (!fee) throw new NotFoundException("Không tìm thấy biểu phí.");
    if ((fee.billingModel === "COURSE") !== (input.periodKey === "COURSE"))
      throw new UnprocessableEntityException(
        "Kỳ phát hành không phù hợp mô hình phí.",
      );
    let periodStart = fee.validFrom,
      from = fee.validFrom,
      to = fee.validTo ?? new Date("9999-12-31Z");
    if (fee.billingModel === "MONTHLY") {
      periodStart = new Date(input.periodKey + "-01T00:00:00Z");
      const end = new Date(periodStart);
      end.setUTCMonth(end.getUTCMonth() + 1);
      end.setUTCDate(0);
      if (end < fee.validFrom || (fee.validTo && periodStart > fee.validTo))
        throw new UnprocessableEntityException(
          "Kỳ nằm ngoài hiệu lực biểu phí.",
        );
      from = periodStart > fee.validFrom ? periodStart : fee.validFrom;
      to = fee.validTo && fee.validTo < end ? fee.validTo : end;
    }
    const terms = await this.effectiveTerms(tx, fee, periodStart);
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
    const students = await tx.student.findMany({
      where: {
        tenantId: c.tenantId!,
        id: { in: enrolled.map((e) => e.studentId) },
      },
      select: { id: true, studentCode: true, fullName: true },
      orderBy: [{ studentCode: "asc" }, { id: "asc" }],
    });
    const cls = await tx.educationClass.findFirst({
      where: { tenantId: c.tenantId!, id: fee.classId },
      select: { code: true, name: true },
    });
    if (!cls)
      throw new ConflictException("Cần kiểm tra phạm vi lớp của biểu phí.");
    const fingerprint = digest({
      intent: this.runIntent(input),
      planVersion: fee.version,
      terms: { name: terms.name, amountVnd: terms.amountVnd.toString() },
      from: from.toISOString(),
      to: to.toISOString(),
      students: students.map((s) => s.id).sort(),
    });
    return { fee, terms, students, cls, fingerprint };
  }
  private async operationLimit(
    tx: Tx,
    c: Claims,
    operation: "INVOICE_PREVIEW" | "INVOICE_GENERATE",
  ) {
    const rows = await tx.$queryRaw<
      { attempts: number }[]
    >`INSERT INTO finance_operation_limits(tenant_id,user_id,operation,attempts,window_start) VALUES(${this.tenant(c)}::uuid,${c.sub}::uuid,${operation},1,now()) ON CONFLICT(tenant_id,user_id,operation) DO UPDATE SET attempts=CASE WHEN finance_operation_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE finance_operation_limits.attempts+1 END,window_start=CASE WHEN finance_operation_limits.window_start<now()-interval '15 minutes' THEN now() ELSE finance_operation_limits.window_start END RETURNING attempts`;
    if ((rows[0]?.attempts ?? 100) > 30)
      throw new HttpException(
        "Quá số lần xử lý hóa đơn. Vui lòng thử lại sau.",
        429,
      );
  }
  async preview(c: Claims, input: InvoiceRunInput, q: ListDto) {
    // POST preview changes no billing records. Rate counters are the only write;
    // keep them with the canonical actor lock and recheck all scopes.
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, c);
      await this.operationLimit(tx, c, "INVOICE_PREVIEW");
      const scope = await this.runScope(tx, c, input);
      const existing = await tx.invoiceRun.findUnique({
        where: {
          tenantId_feePlanId_periodKey: {
            tenantId: c.tenantId!,
            feePlanId: scope.fee.id,
            periodKey: input.periodKey,
          },
        },
        select: { id: true },
      });
      const total = scope.students.length;
      return {
        feePlanId: scope.fee.id,
        planVersion: scope.fee.version,
        classCode: scope.cls.code,
        className: scope.cls.name,
        periodKey: input.periodKey,
        appliedName: scope.terms.name,
        amountVnd: scope.terms.amountVnd.toString(),
        eligibleCount: total,
        totalAmountVnd: (scope.terms.amountVnd * BigInt(total)).toString(),
        dueAt: qualified(input.dueAt).toISOString(),
        fingerprint: scope.fingerprint,
        existingRunId: existing?.id ?? null,
        students: scope.students
          .slice((q.page - 1) * q.limit, q.page * q.limit)
          .map((s) => ({
            studentId: s.id,
            studentCode: s.studentCode,
            fullName: s.fullName,
          })),
        page: {
          page: q.page,
          limit: q.limit,
          total,
          totalPages: Math.ceil(total / q.limit),
        },
      };
    });
  }
  async invoiceFees(c: Claims, q: InvoiceFeeQuery) {
    return this.db.$transaction(
      async (tx) => {
        const where = {
          tenantId: this.tenant(c),
          ...(q.includeArchived === "true" ? {} : { status: "ACTIVE" }),
          ...(q.search
            ? { name: { contains: q.search, mode: "insensitive" as const } }
            : {}),
        };
        const [fees, total] = await Promise.all([
          tx.feePlan.findMany({
            where,
            orderBy: [{ name: "asc" }, { id: "asc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          tx.feePlan.count({ where }),
        ]);
        const rows = await this.feeViews(tx, c, fees);
        return new Paged(
          rows.map((f) => ({
            id: f.id,
            name: f.name,
            classCode: f.classCode,
            className: f.className,
            billingModel: f.billingModel,
            validFrom: f.validFrom,
            validTo: f.validTo ?? null,
            version: f.version,
          })),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async feeClasses(c: Claims, q: FeeClassQuery) {
    return this.db.$transaction(
      async (tx) => {
        const where = {
          tenantId: this.tenant(c),
          ...(q.includeClosed === "true"
            ? {}
            : { status: { in: ["DRAFT", "ACTIVE"] } }),
          ...(q.search
            ? {
                OR: [
                  {
                    name: { contains: q.search, mode: "insensitive" as const },
                  },
                  {
                    code: { contains: q.search, mode: "insensitive" as const },
                  },
                ],
              }
            : {}),
        };
        const [rows, total] = await Promise.all([
          tx.educationClass.findMany({
            where,
            select: { id: true, code: true, name: true },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          tx.educationClass.count({ where }),
        ]);
        return new Paged(rows, {
          page: q.page,
          limit: q.limit,
          total,
          totalPages: Math.ceil(total / q.limit),
        });
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async fees(c: Claims, q: FeePlanQuery) {
    return this.db.$transaction(
      async (tx) => {
        const where = {
          tenantId: this.tenant(c),
          ...(q.classId ? { classId: q.classId } : {}),
          ...(q.status ? { status: q.status } : {}),
          ...(q.search
            ? { name: { contains: q.search, mode: "insensitive" as const } }
            : {}),
        };
        const [rows, total] = await Promise.all([
          tx.feePlan.findMany({
            where,
            orderBy: [{ name: "asc" }, { id: "asc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          tx.feePlan.count({ where }),
        ]);
        return new Paged(await this.feeViews(tx, c, rows), {
          page: q.page,
          limit: q.limit,
          total,
          totalPages: Math.ceil(total / q.limit),
        });
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  private async scopedFee(tx: Tx, c: Claims, id: string) {
    const row = await tx.feePlan.findFirst({
      where: { tenantId: this.tenant(c), id },
    });
    if (!row) throw new NotFoundException("Không tìm thấy biểu phí.");
    return row;
  }
  async feeDetail(c: Claims, id: string) {
    return this.db.$transaction(
      async (tx) =>
        (await this.feeViews(tx, c, [await this.scopedFee(tx, c, id)]))[0]!,
      { isolationLevel: "RepeatableRead" },
    );
  }
  async feeTerms(c: Claims, id: string, q: ListDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.scopedFee(tx, c, id);
        const where = { tenantId: c.tenantId!, feePlanId: id };
        const [rows, total] = await Promise.all([
          tx.feePlanTerm.findMany({
            where,
            orderBy: [{ version: "desc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          tx.feePlanTerm.count({ where }),
        ]);
        return new Paged(
          rows.map((r) => ({
            id: r.id,
            version: r.version,
            effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
            name: r.name,
            amountVnd: r.amountVnd.toString(),
            reason: r.reason,
            actorUserId: r.createdBy,
            actorDisplayName: r.actorDisplayName,
            traceId: r.traceId,
            recordedAt: r.createdAt.toISOString(),
          })),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async updateFee(
    c: Claims,
    id: string,
    input: FeePlanTermInput,
    traceId: string,
  ) {
    const amountVnd = money(input.amountVnd),
      reason = input.reason.trim();
    if (reason.length < 10)
      throw new UnprocessableEntityException(
        "Lý do cần ít nhất 10 ký tự sau khi bỏ khoảng trắng.",
      );
    return this.db.$transaction(async (tx) => {
      const actor = await this.lock(tx, c, "finance.fee.write"),
        row = await this.scopedFee(tx, c, id);
      if (row.version !== input.version)
        throw new ConflictException("VERSION_CONFLICT: biểu phí đã thay đổi.");
      if (row.status !== "ACTIVE")
        throw new ConflictException("Biểu phí không còn hoạt động.");
      const from = row.validFrom.toISOString().slice(0, 10),
        to = row.validTo?.toISOString().slice(0, 10);
      if (
        input.effectiveFrom <= (await this.today(tx, c)) ||
        input.effectiveFrom < from ||
        (to && input.effectiveFrom > to)
      )
        throw new UnprocessableEntityException(
          "Điều khoản phải có hiệu lực trong tương lai và trong thời hạn biểu phí.",
        );
      if (
        row.billingModel === "MONTHLY" &&
        !input.effectiveFrom.endsWith("-01")
      )
        throw new UnprocessableEntityException(
          "Biểu phí tháng thay đổi từ ngày đầu tháng; không tự động tính phí lẻ.",
        );
      if (
        row.billingModel === "COURSE" &&
        (input.effectiveFrom !== from ||
          (await tx.invoiceRun.count({
            where: { tenantId: c.tenantId!, feePlanId: id },
          })))
      )
        throw new ConflictException(
          "Biểu phí khóa chỉ thay đổi trước khi phát hành và áp dụng toàn khóa.",
        );
      const next = await tx.feePlan.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await tx.feePlanTerm.create({
        data: {
          tenantId: c.tenantId!,
          feePlanId: id,
          version: next.version,
          effectiveFrom: new Date(input.effectiveFrom + "T00:00:00Z"),
          name: input.name.trim(),
          amountVnd,
          reason,
          createdBy: c.sub,
          actorDisplayName: actor.user.displayName,
          traceId,
        },
      });
      await this.audit(tx, c, "fee.future_terms.recorded", id, traceId, reason);
      return (await this.feeViews(tx, c, [next]))[0]!;
    });
  }
  private async audit(
    tx: Tx,
    c: Claims,
    action: string,
    id: string,
    traceId: string,
    reason?: string,
  ) {
    const actor = await tx.user.findUnique({
      where: { id: c.sub },
      select: { displayName: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: c.tenantId!,
        actorUserId: c.sub,
        action,
        resourceId: id,
        traceId,
        metadata: { actorDisplayName: actor?.displayName ?? null },
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
      await this.lock(tx, c, "finance.fee.write");
      const cls = await tx.educationClass.findFirst({
        where: { tenantId: c.tenantId!, id: input.classId },
      });
      if (!cls) throw new NotFoundException("Không tìm thấy lớp.");
      if (cls.status === "CLOSED")
        throw new ConflictException("Lớp đã đóng không nhận biểu phí mới.");
      const row = await tx.feePlan.create({
        data: {
          tenantId: c.tenantId!,
          classId: input.classId,
          name: input.name.trim(),
          billingModel: input.billingModel,
          amountVnd,
          validFrom: new Date(input.validFrom + "T00:00:00Z"),
          validTo: input.validTo
            ? new Date(input.validTo + "T00:00:00Z")
            : null,
        },
      });
      await this.audit(tx, c, "fee.created", row.id, traceId);
      return (await this.feeViews(tx, c, [row]))[0]!;
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
        const { fee, terms, students, fingerprint } = await this.runScope(
          tx,
          c,
          input,
        );
        let run = await tx.invoiceRun.findUnique({
          where: {
            tenantId_feePlanId_periodKey: {
              tenantId: c.tenantId!,
              feePlanId: fee.id,
              periodKey: input.periodKey,
            },
          },
        });
        if (
          run &&
          run.requestHash !== digest(this.runIntent(input)) &&
          run.requestHash !==
            digest({
              feePlanId: input.feePlanId,
              periodKey: input.periodKey,
              dueAt: input.dueAt,
            })
        )
          throw new ConflictException(
            "Kỳ phát hành đã tồn tại với nội dung khác.",
          );
        if (!run) {
          if (
            input.previewFingerprint &&
            input.previewFingerprint !== fingerprint
          )
            throw new ConflictException(
              "PREVIEW_CHANGED: Biểu phí hoặc học viên đã thay đổi. Xem trước và xác nhận lại.",
            );
          if (!students.length)
            throw new UnprocessableEntityException(
              "Không có học viên đủ điều kiện để phát hành.",
            );
          await this.operationLimit(tx, c, "INVOICE_GENERATE");
          run = await tx.invoiceRun.create({
            data: {
              tenantId: c.tenantId!,
              feePlanId: fee.id,
              periodKey: input.periodKey,
              requestHash: digest(this.runIntent(input)),
              createdBy: c.sub,
            },
          });
          for (const e of students) {
            const row = await tx.invoice.create({
              data: {
                tenantId: c.tenantId!,
                studentId: e.id,
                runId: run.id,
                invoiceNo: "INV-" + randomUUID(),
                totalAmountVnd: terms.amountVnd,
                dueAt,
                createdBy: c.sub,
              },
            });
            await tx.invoiceItem.create({
              data: {
                tenantId: c.tenantId!,
                invoiceId: row.id,
                feePlanId: fee.id,
                description: terms.name + " · " + input.periodKey,
                totalAmountVnd: terms.amountVnd,
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
      await this.lock(tx, c, "finance.payment.write");
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
  async invoices(c: Claims, q: InvoiceQuery, childId?: string) {
    return this.db.$transaction(
      async (tx) => {
        const studentId =
          c.role === "guardian"
            ? await this.teaching.subject(tx, c, childId)
            : q.studentId;
        return invoiceRows(tx, this.tenant(c), q, studentId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async receivables(c: Claims, q: InvoiceQuery) {
    const tenant = this.tenant(c);
    financialOffset(q);
    return this.db.$transaction(
      async (tx) => {
        await requirePlanFeature(tx, tenant, "finance");
        const timezone = (
          await tx.tenant.findUniqueOrThrow({
            where: { id: tenant },
            select: { timezone: true },
          })
        ).timezone;
        const now = new Date(),
          { scoped, status } = invoiceValueScope(
            tenant,
            q,
            timezone,
            undefined,
            undefined,
            now,
          );
        const [totals, rows] = await Promise.all([
          tx.$queryRaw<
            {
              issued_count: bigint;
              outstanding_count: bigint;
              total_amount: string;
              paid_amount: string;
              balance_amount: string;
              overdue_amount: string;
            }[]
          >(Prisma.sql`${scoped}
          SELECT count(*) AS issued_count,count(*) FILTER (WHERE balance>0) AS outstanding_count,
            coalesce(sum(total_amount_vnd),0)::text AS total_amount,
            coalesce(sum(paid_amount),0)::text AS paid_amount,
            coalesce(sum(balance),0)::text AS balance_amount,
            coalesce(sum(balance) FILTER (WHERE balance>0 AND due_at<${now}),0)::text AS overdue_amount
          FROM valued WHERE billing_state='ISSUED' AND ${status}`),
          invoiceRows(tx, tenant, q, undefined, undefined, now, true),
        ]);
        const total = totals[0]!;
        return {
          asOf: now.toISOString(),
          timezone,
          summary: {
            issuedCount: Number(total.issued_count),
            outstandingCount: Number(total.outstanding_count),
            totalAmountVnd: total.total_amount,
            paidAmountVnd: total.paid_amount,
            balanceVnd: total.balance_amount,
            overdueAmountVnd: total.overdue_amount,
          },
          invoices: rows.items,
          page: rows.page,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async invoice(c: Claims, id: string) {
    return this.db.$transaction(
      async (tx) => {
        this.tenant(c);
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
        const result = await invoiceRows(
          tx,
          c.tenantId!,
          { page: 1, limit: 1 },
          undefined,
          [id],
        );
        if (!result.items[0])
          throw new NotFoundException("Không tìm thấy chứng từ.");
        return {
          ...result.items[0],
          voidReason: c.role === "guardian" ? null : row.voidReason,
          itemsCount: await tx.invoiceItem.count({
            where: { tenantId: c.tenantId!, invoiceId: id },
          }),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async invoiceItems(c: Claims, id: string, q: ListDto) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.invoice.findFirst({
          where: { tenantId: this.tenant(c), id },
          select: { id: true },
        });
        if (!row) throw new NotFoundException("Không tìm thấy chứng từ.");
        const where = { tenantId: c.tenantId!, invoiceId: id };
        const [rows, total] = await Promise.all([
          tx.invoiceItem.findMany({
            where,
            orderBy: { id: "asc" },
            skip: (q.page - 1) * q.limit,
            take: q.limit,
            select: { id: true, description: true, totalAmountVnd: true },
          }),
          tx.invoiceItem.count({ where }),
        ]);
        return new Paged(
          rows.map((r) => ({
            ...r,
            totalAmountVnd: r.totalAmountVnd.toString(),
          })),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async invoiceHistory(c: Claims, id: string, q: ListDto) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.invoice.findFirst({
          where: { tenantId: this.tenant(c), id },
          select: { runId: true },
        });
        if (!row) throw new NotFoundException("Không tìm thấy chứng từ.");
        const where = {
          tenantId: c.tenantId!,
          OR: [
            { resourceId: id, action: "invoice.voided" },
            { resourceId: row.runId, action: "invoice.run.generated" },
          ],
        };
        const [rows, total] = await Promise.all([
          tx.auditLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          tx.auditLog.count({ where }),
        ]);
        return new Paged(
          rows.map((r) => ({
            id: r.id,
            action: r.action,
            actorUserId: r.actorUserId,
            actorDisplayName:
              r.metadata &&
              typeof r.metadata === "object" &&
              !Array.isArray(r.metadata) &&
              typeof r.metadata.actorDisplayName === "string"
                ? r.metadata.actorDisplayName
                : null,
            reason: r.reason,
            traceId: r.traceId,
            recordedAt: r.createdAt.toISOString(),
          })),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  private async receiptView(tx: Tx, p: Payment, guardian: boolean) {
    const [base, student, centre, recorded, reversed, reversal] =
      await Promise.all([
        this.paymentView(tx, p),
        tx.student.findFirstOrThrow({
          where: { tenantId: p.tenantId, id: p.studentId },
          select: { studentCode: true, fullName: true },
        }),
        tx.tenant.findUniqueOrThrow({
          where: { id: p.tenantId },
          select: { name: true, timezone: true },
        }),
        tx.auditLog.findFirst({
          where: {
            tenantId: p.tenantId,
            resourceId: p.id,
            action: "payment.recorded",
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        guardian
          ? null
          : tx.auditLog.findFirst({
              where: {
                tenantId: p.tenantId,
                resourceId: p.id,
                action: "payment.reversed",
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            }),
        guardian
          ? null
          : tx.paymentReversal.findFirst({
              where: { tenantId: p.tenantId, paymentId: p.id },
            }),
      ]);
    const name = (row: { metadata: Prisma.JsonValue } | null) =>
      row?.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata) &&
      typeof row.metadata.actorDisplayName === "string"
        ? row.metadata.actorDisplayName
        : null;
    return {
      ...base,
      ...student,
      centreName: centre.name,
      timezone: centre.timezone,
      externalReference: guardian ? null : p.externalReference,
      receivedBy: guardian ? null : p.receivedBy,
      receiverDisplayName: guardian ? null : name(recorded),
      reversalReason: reversal?.reason ?? null,
      reversalActorName: name(reversed),
      reversedAt: reversal?.createdAt.toISOString() ?? null,
    };
  }
  async paymentHistory(c: Claims, id: string, q: ListDto) {
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.payment.findFirst({
            where: { tenantId: this.tenant(c), id },
            select: { id: true },
          }))
        )
          throw new NotFoundException("Không tìm thấy phiếu thu.");
        const where = {
          tenantId: c.tenantId!,
          resourceId: id,
          action: { in: ["payment.recorded", "payment.reversed"] },
        };
        const [rows, total] = await Promise.all([
          tx.auditLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          tx.auditLog.count({ where }),
        ]);
        return new Paged(
          rows.map((r) => ({
            id: r.id,
            action: r.action,
            actorUserId: r.actorUserId,
            actorDisplayName:
              r.metadata &&
              typeof r.metadata === "object" &&
              !Array.isArray(r.metadata) &&
              typeof r.metadata.actorDisplayName === "string"
                ? r.metadata.actorDisplayName
                : null,
            reason: r.reason,
            traceId: r.traceId,
            recordedAt: r.createdAt.toISOString(),
          })),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async payments(c: Claims, q: PaymentQuery, childId?: string) {
    this.tenant(c);
    return this.db.$transaction(
      async (tx) => {
        const studentId =
            c.role === "guardian"
              ? await this.teaching.subject(tx, c, childId)
              : q.studentId,
          selected = await paymentIds(tx, c.tenantId!, q, studentId);
        const rows = await tx.payment.findMany({
            where: { tenantId: c.tenantId!, id: { in: selected.ids } },
            orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
          }),
          total = selected.total;
        return new Paged(
          await Promise.all(
            rows.map((p) => this.receiptView(tx, p, c.role === "guardian")),
          ),
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
    this.tenant(c);
    return this.db.$transaction(
      async (tx) => {
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
        return this.receiptView(tx, p, c.role === "guardian");
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async voidInvoice(c: Claims, id: string, reason: string, traceId: string) {
    reason = reason.trim();
    if (reason.length < 10)
      throw new UnprocessableEntityException(
        "Lý do cần ít nhất 10 ký tự sau khi bỏ khoảng trắng.",
      );
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
    reason = reason.trim();
    if (reason.length < 10)
      throw new UnprocessableEntityException(
        "Lý do cần ít nhất 10 ký tự sau khi bỏ khoảng trắng.",
      );
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, c, "finance.payment.write");
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
