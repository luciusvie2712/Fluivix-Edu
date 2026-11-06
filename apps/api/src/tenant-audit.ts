import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
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
import { safeCsvCell } from "@fluivix/contracts";
import { Db } from "./db";
import { requestClaims } from "./auth.controller";
import { AccessGuard, TenantPermission } from "./guards";
import { type Claims, hasPermission } from "./security";
import type { ApiRequest } from "./http";
import { ErrorResponse } from "./response.dto";
import { financialDay, financialOffset } from "./finance-query";
import {
  TenantAuditQuery,
  TenantAuditResponse,
  TenantAuditCsvResponse,
} from "./tenant-audit.dto";

// Restricted roles use exact actions: future event types never silently broaden access.
const operations = [
  "student.create",
  "student.update",
  "student.deactivate",
  "student.status_change",
  "student.import.preview",
  "student.import.committed",
  "teacher.created",
  "teacher.updated",
  "class.created",
  "class.updated",
  "class.closed",
  "class.teacher.assigned",
  "enrollment.created",
  "enrollment.withdrawn",
  "schedule.rule.created",
  "schedule.rule.replaced",
  "schedule.rule.generated",
  "session.created",
  "session.cancelled",
  "session.rescheduled",
  "attendance.draft",
  "attendance.finalized",
  "attendance.reopened",
  "lesson.updated",
  "room.created",
  "guardian.profile.provision",
  "guardian.link.pending",
  "guardian.link.approved",
  "guardian.link.revoked",
];
const finance = [
  "fee.created",
  "fee.future_terms.recorded",
  "invoice.run.generated",
  "invoice.voided",
  "payment.recorded",
  "payment.reversed",
  "report.collections.exported",
];
type Tx = Prisma.TransactionClient;
@Injectable()
export class TenantAuditService {
  constructor(private db: Db) {}
  private async context(
    tx: Tx,
    c: Claims,
    q: TenantAuditQuery,
    exporting: boolean,
  ) {
    if (!c.tenantId || !c.role) throw new ForbiddenException();
    financialOffset(q);
    if (q.search !== undefined)
      throw new UnprocessableEntityException(
        "Dùng bộ lọc chính xác theo người thực hiện, hành động, tài nguyên hoặc mã truy vết.",
      );
    const days =
      (Date.parse(q.to + "T00:00:00Z") - Date.parse(q.from + "T00:00:00Z")) /
        86400000 +
      1;
    if (!Number.isInteger(days) || days < 1 || days > 366)
      throw new UnprocessableEntityException(
        "Chọn khoảng ngày hợp lệ, tối đa 366 ngày.",
      );
    // Live scope and lock also protect the audited READ_ONLY export transaction.
    await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId}::uuid FOR SHARE`;
    const [tenant, member, session] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: c.tenantId },
        select: { status: true, timezone: true },
      }),
      tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: c.tenantId, userId: c.sub } },
        include: { roles: true, user: { select: { status: true } } },
      }),
      tx.authSession.findFirst({
        where: {
          id: c.sid,
          userId: c.sub,
          selectedTenantId: c.tenantId,
          selectedRole: c.role,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    if (
      !tenant ||
      !["ACTIVE", "PAST_DUE_GRACE", "READ_ONLY"].includes(tenant.status) ||
      !session ||
      member?.status !== "ACTIVE" ||
      member.activationPending ||
      member.user.status !== "ACTIVE" ||
      !member.roles.some((r) => r.role === c.role) ||
      !hasPermission(
        c.role,
        exporting ? "audit.export" : "audit.read",
        member.staffDelegated,
      )
    )
      throw new ForbiddenException(
        "Quyền xem hoặc xuất nhật ký đã thay đổi. Vui lòng tải lại.",
      );
    const scope =
      c.role === "owner"
        ? "ALL"
        : c.role === "manager"
          ? "OPERATIONS"
          : "FINANCE";
    const asOf = new Date();
    const where: Prisma.AuditLogWhereInput = {
      tenantId: c.tenantId,
      createdAt: {
        gte: financialDay(q.from, tenant.timezone),
        lt: financialDay(q.to, tenant.timezone, true),
        lte: asOf,
      },
      AND: [
        ...(scope === "ALL"
          ? []
          : [
              { action: { in: scope === "OPERATIONS" ? operations : finance } },
            ]),
        ...(q.action ? [{ action: q.action }] : []),
      ],
      ...(q.actorId ? { actorUserId: q.actorId } : {}),
      ...(q.resourceId ? { resourceId: q.resourceId } : {}),
      ...(q.traceId ? { traceId: q.traceId } : {}),
    };
    return {
      where,
      view: {
        from: q.from,
        to: q.to,
        timezone: tenant.timezone,
        asOf: asOf.toISOString(),
        scope,
        exportAllowed: hasPermission(
          c.role,
          "audit.export",
          member.staffDelegated,
        ),
      },
    };
  }
  async read(c: Claims, q: TenantAuditQuery, exporting = false, traceId = "") {
    return this.db.$transaction(
      async (tx) => {
        const { where, view } = await this.context(tx, c, q, exporting);
        const total = await tx.auditLog.count({ where });
        if (exporting && total > 5000)
          throw new UnprocessableEntityException(
            "Nhật ký vượt 5.000 dòng. Thu hẹp ngày hoặc bộ lọc trước khi xuất.",
          );
        // Never fetch free-form metadata or reasons: no safe historical payload schema exists.
        const rows = await tx.auditLog.findMany({
          where,
          select: {
            id: true,
            actorUserId: true,
            action: true,
            resourceId: true,
            traceId: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: exporting ? 0 : financialOffset(q),
          take: exporting ? 5000 : q.limit,
        });
        const safe = rows.map((r) => ({
          id: r.id,
          actorId: r.actorUserId,
          action: r.action,
          resourceId: r.resourceId,
          traceId: r.traceId,
          createdAt: r.createdAt.toISOString(),
        }));
        if (!exporting)
          return {
            ...view,
            rows: safe,
            page: {
              page: q.page,
              limit: q.limit,
              total,
              totalPages: Math.ceil(total / q.limit),
            },
          };
        await tx.auditLog.create({
          data: {
            tenantId: c.tenantId!,
            actorUserId: c.sub,
            action: "audit.exported",
            resourceId: c.tenantId!,
            traceId,
            metadata: {
              from: q.from,
              to: q.to,
              timezone: view.timezone,
              scope: view.scope,
              rowCount: safe.length,
              actorId: q.actorId ?? null,
              action: q.action ?? null,
              resourceId: q.resourceId ?? null,
              traceId: q.traceId ?? null,
            },
          },
        });
        const data = [
          [
            "eventId",
            "actorUserId",
            "action",
            "resourceId",
            "traceId",
            "createdAtUtc",
            "tenantTimezone",
          ],
          ...safe.map((r) => [
            r.id,
            r.actorId ?? "",
            r.action,
            r.resourceId,
            r.traceId,
            r.createdAt,
            view.timezone,
          ]),
        ];
        return {
          ...view,
          filename: `fluivixedu-audit-${q.from}-${q.to}.csv`,
          rowCount: safe.length,
          csv:
            "\ufeff" +
            data.map((row) => row.map(safeCsvCell).join(",")).join("\r\n") +
            "\r\n",
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
}
@Controller("audit-logs")
@ApiTags("tenant audit")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class TenantAuditController {
  constructor(private service: TenantAuditService) {}
  @Get()
  @TenantPermission("audit.read")
  @ApiOkResponse({ type: TenantAuditResponse })
  list(@Req() r: ApiRequest, @Query() q: TenantAuditQuery) {
    return this.service.read(requestClaims(r), q);
  }
  @Get("export")
  @TenantPermission("audit.export")
  @ApiOkResponse({ type: TenantAuditCsvResponse })
  export(@Req() r: ApiRequest, @Query() q: TenantAuditQuery) {
    return this.service.read(requestClaims(r), q, true, r.traceId);
  }
}
