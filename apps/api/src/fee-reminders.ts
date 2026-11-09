import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Prisma } from "@prisma/client";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import { Paged, type ApiRequest } from "./http";
import type { Claims } from "./security";
import { lockTenantActor } from "./tenant-actor";
import { lockTenantReader } from "./tenant-reader";
import { requirePlanFeature } from "./subscription-policy";
import { financialOffset } from "./finance-query";
import { reminderPreset } from "./fee-reminder-window";
import { ErrorResponse } from "./response.dto";
import {
  ReminderHistoryQuery,
  ReminderHoldInput,
  ReminderInvoiceResponse,
  ReminderPolicyHistoryResponse,
  ReminderPolicyInput,
  ReminderPolicyResponse,
} from "./fee-reminders.dto";
type Tx = Prisma.TransactionClient;
@Injectable()
export class FeeRemindersService {
  constructor(private db: Db) {}
  private async read(tx: Tx, c: Claims, permission: string) {
    const tenant = await lockTenantReader(tx, c, permission);
    await requirePlanFeature(tx, tenant.tenantId, "finance");
    return tenant;
  }
  private async write(tx: Tx, c: Claims, permission: string) {
    await lockTenantActor(tx, c, permission);
    await requirePlanFeature(tx, c.tenantId!, "finance");
  }
  private async policyView(tx: Tx, tenantId: string, timezone?: string) {
    const p = await tx.feeReminderPolicy.findUnique({ where: { tenantId } });
    return {
      enabled: p?.enabled ?? false,
      version: p?.version ?? 0,
      timezone:
        timezone ??
        (
          await tx.tenant.findUniqueOrThrow({
            where: { id: tenantId },
            select: { timezone: true },
          })
        ).timezone,
      preset: { ...reminderPreset, offsets: [...reminderPreset.offsets] },
      enabledSince: p?.enabledSince?.toISOString() ?? null,
      approvedBy: p?.approvedBy ?? null,
      approvedAt: p?.approvedAt?.toISOString() ?? null,
      approvalRef: p?.approvalRef ?? null,
    };
  }
  async policy(c: Claims) {
    return this.db.$transaction(
      async (tx) => {
        const t = await this.read(tx, c, "finance.reminder.manage");
        return this.policyView(tx, t.tenantId, t.timezone);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  async policyHistory(c: Claims, q: ReminderHistoryQuery) {
    const skip = financialOffset(q);
    if (skip > 2147483647)
      throw new UnprocessableEntityException("Trang vượt phạm vi hỗ trợ.");
    return this.db.$transaction(
      async (tx) => {
        await this.read(tx, c, "finance.reminder.manage");
        const where = { tenantId: c.tenantId! };
        const total = await tx.feeReminderPolicyEvent.count({ where });
        const rows = await tx.feeReminderPolicyEvent.findMany({
          where,
          orderBy: { version: "desc" },
          skip,
          take: q.limit,
        });
        return new Paged(
          rows.map((r) => ({
            id: r.id,
            version: r.version,
            enabled: r.enabled,
            reason: r.reason,
            approvalRef: r.approvalRef,
            actorId: r.actorId,
            createdAt: r.createdAt.toISOString(),
          })),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  async updatePolicy(c: Claims, input: ReminderPolicyInput, traceId: string) {
    if (!input.confirmed || (input.enabled && !input.approvalRef?.trim()))
      throw new UnprocessableEntityException(
        "Xác nhận lịch nhắc và nhập mã tham chiếu phê duyệt trước khi bật.",
      );
    return this.db.$transaction(async (tx) => {
      await this.write(tx, c, "finance.reminder.configure");
      const tenantId = c.tenantId!,
        old = await tx.feeReminderPolicy.findUnique({ where: { tenantId } });
      if ((old?.version ?? 0) !== input.version)
        throw new ConflictException(
          "VERSION_CONFLICT: cấu hình nhắc phí đã thay đổi.",
        );
      if ((old?.enabled ?? false) === input.enabled)
        throw new ConflictException("Trạng thái nhắc phí không thay đổi.");
      const now = new Date(),
        version = (old?.version ?? 0) + 1;
      const data = {
        enabled: input.enabled,
        version,
        enabledSince: input.enabled ? now : null,
        approvedBy: input.enabled ? c.sub : (old?.approvedBy ?? null),
        approvedAt: input.enabled ? now : (old?.approvedAt ?? null),
        approvalRef: input.enabled
          ? input.approvalRef!.trim()
          : (old?.approvalRef ?? null),
        updatedBy: c.sub,
        updatedAt: now,
      };
      if (old) await tx.feeReminderPolicy.update({ where: { tenantId }, data });
      else await tx.feeReminderPolicy.create({ data: { tenantId, ...data } });
      await tx.feeReminderPolicyEvent.create({
        data: {
          tenantId,
          version,
          enabled: input.enabled,
          reason: input.reason.trim(),
          approvalRef: data.approvalRef,
          actorId: c.sub,
        },
      });
      await this.audit(
        tx,
        c,
        "finance.reminder.policy",
        tenantId,
        input.reason.trim(),
        traceId,
        { version, enabled: input.enabled },
      );
      return this.policyView(tx, tenantId);
    });
  }
  private async invoiceExists(tx: Tx, tenantId: string, invoiceId: string) {
    if (
      !(await tx.invoice.findFirst({
        where: { tenantId, id: invoiceId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Không tìm thấy chứng từ.");
  }
  private async invoiceView(
    tx: Tx,
    tenantId: string,
    invoiceId: string,
    q: ReminderHistoryQuery,
  ) {
    const skip = financialOffset(q);
    if (skip > 2147483647)
      throw new UnprocessableEntityException("Trang vượt phạm vi hỗ trợ.");
    const where = { tenantId, invoiceId };
    await this.invoiceExists(tx, tenantId, invoiceId);
    const hold = await tx.invoiceReminderHold.findUnique({
      where: { tenantId_invoiceId: where },
    });
    const [rows, total, stages] = await Promise.all([
      tx.invoiceReminderHoldEvent.findMany({
        where,
        orderBy: { version: "desc" },
        skip,
        take: q.limit,
      }),
      tx.invoiceReminderHoldEvent.count({ where }),
      tx.feeReminderStage.findMany({ where, orderBy: { createdAt: "asc" } }),
    ]);
    const batches = await tx.feeReminderBatch.findMany({
      where: { tenantId, id: { in: stages.map((s) => s.batchId) } },
    });
    const notifications = await tx.notification.findMany({
      where: {
        tenantId,
        type: "FEE_REMINDER",
        entityType: "reminder",
        entityId: { in: stages.map((s) => s.batchId) },
      },
      select: { id: true, entityId: true },
    });
    const deliveries = await tx.pushDelivery.findMany({
      where: {
        tenantId,
        notificationId: { in: notifications.map((n) => n.id) },
        canonical: true,
      },
      select: { notificationId: true, status: true },
    });
    return {
      invoiceId,
      held: hold?.held ?? false,
      category: hold?.category ?? null,
      version: hold?.version ?? 0,
      stages: stages.map((s) => {
        const batch = batches.find((b) => b.id === s.batchId);
        if (!batch)
          throw new ConflictException("Cần kiểm tra lịch sử nhắc phí.");
        const ns = notifications.filter((n) => n.entityId === s.batchId);
        const ids = new Set(ns.map((n) => n.id));
        return {
          stage: s.stage,
          batchId: s.batchId,
          localDay: batch.localDay.toISOString().slice(0, 10),
          timezone: batch.timezone,
          createdAt: s.createdAt.toISOString(),
          inboxRecipients: ns.length,
          deliveryStatuses: [
            ...new Set(
              deliveries
                .filter((d) => ids.has(d.notificationId))
                .map((d) => d.status),
            ),
          ],
        };
      }),
      events: rows.map((r) => ({
        id: r.id,
        version: r.version,
        held: r.held,
        category: r.category,
        reason: r.reason,
        actorId: r.actorId,
        createdAt: r.createdAt.toISOString(),
      })),
      page: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async invoice(c: Claims, id: string, q: ReminderHistoryQuery) {
    financialOffset(q);
    return this.db.$transaction(
      async (tx) => {
        await this.read(tx, c, "finance.reminder.manage");
        return this.invoiceView(tx, c.tenantId!, id, q);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  async hold(c: Claims, id: string, input: ReminderHoldInput, traceId: string) {
    if (
      !input.confirmed ||
      (input.held && !input.category) ||
      (!input.held && input.category)
    )
      throw new UnprocessableEntityException(
        "Xác nhận trạng thái tạm dừng và lý do đối soát.",
      );
    return this.db.$transaction(async (tx) => {
      await this.write(tx, c, "finance.reminder.manage");
      const tenantId = c.tenantId!;
      await this.invoiceExists(tx, tenantId, id);
      const key = { tenantId, invoiceId: id };
      const old = await tx.invoiceReminderHold.findUnique({
        where: { tenantId_invoiceId: key },
      });
      if ((old?.version ?? 0) !== input.version)
        throw new ConflictException(
          "VERSION_CONFLICT: tạm dừng nhắc phí đã thay đổi.",
        );
      if (
        (old?.held ?? false) === input.held &&
        (old?.category ?? null) === (input.category ?? null)
      )
        throw new ConflictException("Trạng thái tạm dừng không thay đổi.");
      const data = {
        held: input.held,
        category: input.held ? input.category! : null,
        version: (old?.version ?? 0) + 1,
        updatedBy: c.sub,
        updatedAt: new Date(),
      };
      if (old)
        await tx.invoiceReminderHold.update({
          where: { tenantId_invoiceId: key },
          data,
        });
      else await tx.invoiceReminderHold.create({ data: { ...key, ...data } });
      await tx.invoiceReminderHoldEvent.create({
        data: {
          ...key,
          held: data.held,
          category: data.category,
          version: data.version,
          reason: input.reason.trim(),
          actorId: c.sub,
        },
      });
      await this.audit(
        tx,
        c,
        "finance.reminder.hold",
        id,
        input.reason.trim(),
        traceId,
        { version: data.version, held: data.held, category: data.category },
      );
      return this.invoiceView(tx, tenantId, id, { page: 1, limit: 20 });
    });
  }
  private async audit(
    tx: Tx,
    c: Claims,
    action: string,
    id: string,
    reason: string,
    traceId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: c.tenantId!,
        actorUserId: c.sub,
        action,
        resourceId: id,
        reason,
        traceId,
        metadata: {
          reminder: metadata,
          actorDisplayName: (
            await tx.user.findUniqueOrThrow({
              where: { id: c.sub },
              select: { displayName: true },
            })
          ).displayName,
        },
      },
    });
  }
}
@ApiTags("finance-reminders")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class FeeRemindersController {
  constructor(private service: FeeRemindersService) {}
  @Get("finance/reminder-policy")
  @TenantPermission("finance.reminder.manage")
  @ApiOkResponse({ type: ReminderPolicyResponse })
  policy(@Req() r: ApiRequest) {
    return this.service.policy(requestClaims(r));
  }
  @Get("finance/reminder-policy/history")
  @TenantPermission("finance.reminder.manage")
  @ApiOkResponse({ type: ReminderPolicyHistoryResponse })
  history(@Req() r: ApiRequest, @Query() q: ReminderHistoryQuery) {
    return this.service.policyHistory(requestClaims(r), q);
  }
  @Patch("finance/reminder-policy")
  @TenantPermission("finance.reminder.configure")
  @ApiOkResponse({ type: ReminderPolicyResponse })
  update(@Req() r: ApiRequest, @Body() input: ReminderPolicyInput) {
    return this.service.updatePolicy(requestClaims(r), input, r.traceId);
  }
  @Get("invoices/:id/reminders")
  @TenantPermission("finance.reminder.manage")
  @ApiOkResponse({ type: ReminderInvoiceResponse })
  invoice(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ReminderHistoryQuery,
  ) {
    return this.service.invoice(requestClaims(r), id, q);
  }
  @Patch("invoices/:id/reminder-hold")
  @TenantPermission("finance.reminder.manage")
  @ApiOkResponse({ type: ReminderInvoiceResponse })
  hold(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReminderHoldInput,
  ) {
    return this.service.hold(requestClaims(r), id, input, r.traceId);
  }
}
