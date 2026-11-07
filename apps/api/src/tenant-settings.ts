import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Patch,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Prisma } from "@prisma/client";
import { isNamedIanaTimezone, planLimitsSchema } from "@fluivix/contracts";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import { hasPermission, type Claims } from "./security";
import { lockTenantActor } from "./tenant-actor";
import {
  currentSubscription,
  managedExportBytes,
  tenantUsage,
} from "./subscription-policy";
import {
  TenantSettingsInput,
  TenantSettingsResponse,
  TenantUsageResponse,
} from "./tenant-settings.dto";

async function timezoneHeld(tx: Prisma.TransactionClient, tenantId: string) {
  const [students, classes, runs, payments] = await Promise.all([
    tx.student.count({ where: { tenantId } }),
    tx.educationClass.count({ where: { tenantId } }),
    tx.invoiceRun.count({ where: { tenantId } }),
    tx.payment.count({ where: { tenantId } }),
  ]);
  return students + classes + runs + payments > 0;
}
async function readActor(tx: Prisma.TransactionClient, c: Claims) {
  if (!c.tenantId || !c.role || !hasPermission(c.role, "tenant.read"))
    throw new ForbiddenException();
  // Share the same canonical tenant row used by profile/quota/revocation writes.
  await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId}::uuid FOR SHARE`;
  const [member, session] = await Promise.all([
    tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: c.tenantId, userId: c.sub } },
      include: {
        roles: true,
        tenant: true,
        user: { select: { status: true } },
      },
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
    !session ||
    !member ||
    member.status !== "ACTIVE" ||
    member.activationPending ||
    member.user.status !== "ACTIVE" ||
    !member.roles.some((r) => r.role === c.role) ||
    !["ACTIVE", "PAST_DUE_GRACE", "READ_ONLY"].includes(member.tenant.status)
  )
    throw new ForbiddenException(
      "Quyền truy cập đã thay đổi. Vui lòng tải lại.",
    );
}
@Injectable()
export class TenantSettingsService {
  constructor(private readonly db: Db) {}
  async read(c: Claims) {
    return this.db.$transaction(async (tx) => {
      await readActor(tx, c);
      const t = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId! },
      });
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        contactEmail: t.contactEmail,
        timezone: t.timezone,
        version: t.settingsVersion,
        timezoneChangeAllowed: !(await timezoneHeld(tx, t.id)),
      };
    });
  }
  async usage(c: Claims) {
    return this.db.$transaction(async (tx) => {
      await readActor(tx, c);
      const tenantId = c.tenantId!,
        current = await currentSubscription(tx, tenantId);
      return {
        ...(await tenantUsage(tx, tenantId)),
        activeOrDraftClasses: await tx.educationClass.count({
          where: { tenantId, status: { in: ["ACTIVE", "DRAFT"] } },
        }),
        managedExportBytes: (await managedExportBytes(tx, tenantId)).toString(),
        limits: current
          ? planLimitsSchema.parse(current.plan.limitsJson)
          : null,
      };
    });
  }
  async update(c: Claims, input: TenantSettingsInput, traceId: string) {
    if (!isNamedIanaTimezone(input.timezone))
      throw new UnprocessableEntityException("Múi giờ IANA không hợp lệ.");
    const reason = input.reason.trim();
    if (reason.length < 10)
      throw new UnprocessableEntityException("Nêu lý do từ 10 ký tự.");
    return this.db.$transaction(async (tx) => {
      await lockTenantActor(tx, c, "tenant.settings.write");
      const t = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId! },
      });
      if (t.settingsVersion !== input.version)
        throw new ConflictException(
          "Cấu hình đã thay đổi. Dữ liệu bạn nhập chưa được lưu.",
        );
      const zones = await tx.$queryRaw<
        { supported: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_timezone_names WHERE lower(name)=lower(${input.timezone}) AND name NOT LIKE 'posix/%' AND name NOT LIKE 'right/%') AS supported`;
      if (!zones[0]?.supported)
        throw new UnprocessableEntityException(
          "Múi giờ IANA chưa được cơ sở dữ liệu hỗ trợ.",
        );
      const held = await timezoneHeld(tx, t.id);
      if (t.timezone !== input.timezone && held)
        throw new ConflictException(
          "Trung tâm đã có học viên, lớp hoặc chứng từ. Giữ nguyên múi giờ để bảo toàn ngày nghiệp vụ, lịch và lịch sử tài chính; cần quy trình chuyển đổi được duyệt riêng.",
        );
      const next = {
        name: input.name.trim(),
        contactEmail: input.contactEmail?.trim().toLowerCase() ?? null,
        timezone: input.timezone,
      };
      if (
        next.name === t.name &&
        next.contactEmail === t.contactEmail &&
        next.timezone === t.timezone
      )
        throw new ConflictException("Không có thay đổi để lưu.");
      const updated = await tx.tenant.update({
        where: { id: t.id },
        data: next,
      });
      await tx.auditLog.create({
        data: {
          tenantId: t.id,
          actorUserId: c.sub,
          resourceId: t.id,
          action: "tenant.settings.updated",
          traceId,
          reason,
          metadata: {
            before: {
              name: t.name,
              contactEmail: t.contactEmail,
              timezone: t.timezone,
              version: t.settingsVersion,
            },
            after: { ...next, version: updated.settingsVersion },
          },
        },
      });
      return {
        id: t.id,
        slug: t.slug,
        ...next,
        version: updated.settingsVersion,
        timezoneChangeAllowed: !held,
      };
    });
  }
}
@ApiTags("tenant")
@Controller("tenant")
@UseGuards(AccessGuard)
export class TenantSettingsController {
  constructor(private readonly service: TenantSettingsService) {}
  @Get("settings")
  @TenantPermission("tenant.read")
  @ApiOkResponse({ type: TenantSettingsResponse })
  read(@Req() req: ApiRequest) {
    return this.service.read(requestClaims(req));
  }
  @Patch("settings")
  @TenantPermission("tenant.settings.write")
  @ApiOkResponse({ type: TenantSettingsResponse })
  update(@Req() req: ApiRequest, @Body() body: TenantSettingsInput) {
    return this.service.update(requestClaims(req), body, req.traceId);
  }
  @Get("usage")
  @TenantPermission("tenant.read")
  @ApiOkResponse({ type: TenantUsageResponse })
  usage(@Req() req: ApiRequest) {
    return this.service.usage(requestClaims(req));
  }
}
