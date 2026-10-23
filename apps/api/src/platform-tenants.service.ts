import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, type Plan, TenantStatus } from "@prisma/client";
import {
  planFlagsSchema,
  planLimitsSchema,
  vndSchema,
} from "@fluivix/contracts";
import { sealToken } from "@fluivix/server-crypto";
import { Db } from "./db";
import { PlatformService } from "./platform.service";
import {
  CreatePlanDto,
  CreateTenantDto,
  LifecycleDto,
  PlatformTenantListDto,
  SubscriptionDatesDto,
  UpdateTenantDto,
} from "./platform-tenants.dto";
import { Paged } from "./http";
import { hashToken, newToken } from "./security";
import { currentSubscription, tenantUsage } from "./subscription-policy";
import { AuthService } from "./auth.service";
export function planView(plan: Plan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    monthlyPriceVnd: plan.monthlyPriceVnd.toString(),
    limits: planLimitsSchema.parse(plan.limitsJson),
    status: plan.status,
    featureFlags: planFlagsSchema.parse(plan.featureFlagsJson),
  };
}
const tenantSelect = {
  id: true,
  slug: true,
  name: true,
  timezone: true,
  status: true,
  contactEmail: true,
  createdAt: true,
} as const;
function dates(dto: SubscriptionDatesDto) {
  if (
    ![dto.startsAt, dto.endsAt, dto.graceUntil].every((value) =>
      /T.*(Z|[+-]\d{2}:\d{2})$/.test(value),
    )
  )
    throw new UnprocessableEntityException("Thời gian cần có múi giờ.");
  const startsAt = new Date(dto.startsAt),
    endsAt = new Date(dto.endsAt),
    graceUntil = new Date(dto.graceUntil);
  if (!(startsAt < endsAt && endsAt <= graceUntil))
    throw new UnprocessableEntityException(
      "Ngày bắt đầu, kết thúc và ân hạn không hợp lệ.",
    );
  return { startsAt, endsAt, graceUntil };
}
@Injectable()
export class PlatformTenantsService {
  constructor(
    private readonly db: Db,
    private readonly platform: PlatformService,
    private readonly auth: AuthService,
  ) {}
  async plans(authorization: string | undefined) {
    await this.platform.authorize(authorization);
    return (await this.db.plan.findMany({ orderBy: { code: "asc" } })).map(
      planView,
    );
  }
  async createPlan(
    authorization: string | undefined,
    dto: CreatePlanDto,
    traceId: string,
  ) {
    const actor = await this.platform.authorize(authorization);
    const price = vndSchema.safeParse(dto.monthlyPriceVnd),
      limits = planLimitsSchema.safeParse(dto.limits);
    if (!price.success || !limits.success)
      throw new UnprocessableEntityException(
        "Giá hoặc giới hạn gói không hợp lệ.",
      );
    return this.db.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          code: dto.code,
          name: dto.name.trim(),
          monthlyPriceVnd: BigInt(price.data),
          limitsJson: limits.data,
          featureFlagsJson: planFlagsSchema.parse(
            dto.featureFlags ?? {
              attendance: true,
              grades: true,
              finance: true,
              reports: true,
            },
          ),
        },
      });
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: "plan.create",
          resourceId: plan.id,
          traceId,
        },
      });
      return planView(plan);
    });
  }
  async tenants(
    authorization: string | undefined,
    query: PlatformTenantListDto,
  ) {
    await this.platform.authorize(authorization);
    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status as TenantStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { slug: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.db.$transaction([
      this.db.tenant.count({ where }),
      this.db.tenant.findMany({
        where,
        select: tenantSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return new Paged(rows, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  }
  async detail(authorization: string | undefined, id: string) {
    await this.platform.authorize(authorization);
    const row = await this.db.tenant.findUnique({
      where: { id },
      select: tenantSelect,
    });
    if (!row) throw new NotFoundException();
    const invitation = await this.db.invitation.findFirst({
      where: { tenantId: id, role: "owner" },
      orderBy: { expiresAt: "desc" },
      select: { email: true, expiresAt: true, usedAt: true },
    });
    const current = await currentSubscription(this.db, id);
    return {
      ...row,
      ownerInvitation: invitation,
      currentPlan: current ? planView(current.plan) : null,
      usage: await tenantUsage(this.db, id),
    };
  }
  async resendOwner(
    authorization: string | undefined,
    id: string,
    traceId: string,
  ) {
    const actor = await this.platform.authorize(authorization);
    await this.auth.limit("platform-owner-resend", actor.id + ":" + id);
    const raw = newToken(),
      encryptedToken = sealToken(raw);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${id}::uuid FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) throw new NotFoundException();
      if (tenant.status !== "PENDING_ACTIVATION")
        throw new ConflictException(
          "Chỉ gửi lại khi trung tâm đang chờ kích hoạt.",
        );
      const owner = await tx.membership.findFirst({
        where: {
          tenantId: id,
          status: "INVITED",
          roles: { some: { role: "owner" } },
        },
        include: { user: { select: { email: true } } },
      });
      if (!owner)
        throw new ConflictException("Không có owner đang chờ lời mời.");
      await tx.invitation.updateMany({
        where: {
          tenantId: id,
          email: owner.user.email,
          role: "owner",
          usedAt: null,
        },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      const invitation = await tx.invitation.create({
        data: {
          tenantId: id,
          email: owner.user.email,
          role: "owner",
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + 86400000),
          invitedBy: actor.id,
        },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: id,
          eventType: "INVITATION_CREATED",
          aggregateId: invitation.id,
          eventVersion: 1,
          payload: { encryptedToken },
        },
      });
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: "tenant.owner_invitation.resent",
          resourceId: id,
          traceId,
        },
      });
      return { invitationId: invitation.id, expiresAt: invitation.expiresAt };
    });
  }
  async createTenant(
    authorization: string | undefined,
    dto: CreateTenantDto,
    traceId: string,
  ) {
    const actor = await this.platform.authorize(authorization),
      period = dates(dto);
    try {
      new Intl.DateTimeFormat("vi-VN", { timeZone: dto.timezone });
    } catch {
      throw new UnprocessableEntityException("Múi giờ IANA không hợp lệ.");
    }
    if (period.startsAt > new Date() || period.endsAt <= new Date())
      throw new UnprocessableEntityException(
        "Thuê bao mở trung tâm cần đang hiệu lực.",
      );
    const raw = newToken(),
      encryptedToken = sealToken(raw),
      email = dto.ownerEmail.trim().toLowerCase();
    return this.db.$transaction(async (tx) => {
      const plan = await tx.plan.findFirst({
        where: { id: dto.planId, status: "ACTIVE" },
      });
      if (!plan) throw new NotFoundException("Gói không khả dụng.");
      const owner = await tx.user.upsert({
        where: { email },
        create: { email, displayName: email, status: "INVITED" },
        update: {},
      });
      if (!["ACTIVE", "INVITED"].includes(owner.status))
        throw new ConflictException("Tài khoản owner không khả dụng.");
      const tenant = await tx.tenant.create({
        data: {
          slug: dto.slug,
          name: dto.name.trim(),
          timezone: dto.timezone,
          subscriptionEndsAt: period.endsAt,
          graceUntil: period.graceUntil,
        },
      });
      const subscription = await tx.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, ...period },
      });
      await tx.subscriptionEvent.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          type: "CREATED",
          payload: { planId: plan.id },
          actorId: actor.id,
        },
      });
      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          status: "INVITED",
          roles: { create: { role: "owner" } },
        },
      });
      const invite = await tx.invitation.create({
        data: {
          tenantId: tenant.id,
          email,
          role: "owner",
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + 86400000),
          invitedBy: actor.id,
        },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: tenant.id,
          eventType: "INVITATION_CREATED",
          aggregateId: invite.id,
          eventVersion: 1,
          payload: { encryptedToken },
        },
      });
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: "tenant.create",
          resourceId: tenant.id,
          traceId,
        },
      });
      return tx.tenant.findUniqueOrThrow({
        where: { id: tenant.id },
        select: tenantSelect,
      });
    });
  }
  async update(
    authorization: string | undefined,
    id: string,
    dto: UpdateTenantDto,
    traceId: string,
  ) {
    const actor = await this.platform.authorize(authorization);
    if (!dto.name && dto.contactEmail === undefined)
      throw new UnprocessableEntityException("Chọn thông tin cần cập nhật.");
    return this.db.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) throw new NotFoundException();
      const result = await tx.tenant.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.contactEmail !== undefined
            ? { contactEmail: dto.contactEmail?.trim().toLowerCase() ?? null }
            : {}),
        },
        select: tenantSelect,
      });
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: "tenant.update",
          resourceId: id,
          traceId,
        },
      });
      return result;
    });
  }
  async lifecycle(
    authorization: string | undefined,
    id: string,
    dto: LifecycleDto,
    suspend: boolean,
    traceId: string,
  ) {
    const actor = await this.platform.authorize(authorization),
      reason = dto.reason.trim();
    if (reason.length < 10)
      throw new UnprocessableEntityException("Nêu lý do từ 10 ký tự.");
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${id}::uuid FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) throw new NotFoundException();
      if (tenant.status === "TERMINATED")
        throw new ConflictException("Trung tâm đã chấm dứt.");
      if (
        (suspend && tenant.status === "SUSPENDED") ||
        (!suspend && tenant.status !== "SUSPENDED")
      )
        throw new ConflictException("Trạng thái trung tâm đã thay đổi.");
      const subscription = await currentSubscription(tx, id),
        owner = await tx.membership.findFirst({
          where: {
            tenantId: id,
            status: "ACTIVE",
            roles: { some: { role: "owner" } },
          },
        });
      const status = suspend
        ? "SUSPENDED"
        : !owner
          ? "PENDING_ACTIVATION"
          : !subscription || subscription.graceUntil <= new Date()
            ? "READ_ONLY"
            : subscription.endsAt <= new Date()
              ? "PAST_DUE_GRACE"
              : "ACTIVE";
      const result = await tx.tenant.update({
        where: { id },
        data: { status },
        select: tenantSelect,
      });
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: suspend ? "tenant.suspend" : "tenant.reactivate",
          resourceId: id,
          traceId,
          reason,
        },
      });
      return result;
    });
  }
  async subscriptions(authorization: string | undefined, id: string) {
    await this.detail(authorization, id);
    return (
      await this.db.subscription.findMany({
        where: { tenantId: id },
        include: { plan: true },
        orderBy: { startsAt: "desc" },
      })
    ).map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      graceUntil: row.graceUntil,
      plan: planView(row.plan),
    }));
  }
  async assignSubscription(
    authorization: string | undefined,
    id: string,
    dto: SubscriptionDatesDto,
    traceId: string,
  ) {
    const actor = await this.platform.authorize(authorization),
      period = dates(dto);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${id}::uuid FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) throw new NotFoundException();
      if (tenant.status === "TERMINATED")
        throw new ConflictException("Trung tâm đã chấm dứt.");
      const plan = await tx.plan.findFirst({
        where: { id: dto.planId, status: "ACTIVE" },
      });
      if (!plan) throw new NotFoundException("Gói không khả dụng.");
      const overlapping = await tx.subscription.findFirst({
        where: {
          tenantId: id,
          status: "ACTIVE",
          startsAt: { lt: period.endsAt },
          endsAt: { gt: period.startsAt },
        },
      });
      if (overlapping)
        throw new ConflictException(
          "Kỳ thuê bao bị chồng lấn. Chọn kỳ nối tiếp.",
        );
      const row = await tx.subscription.create({
        data: { tenantId: id, planId: plan.id, ...period },
      });
      if (
        period.startsAt <= new Date() &&
        period.graceUntil > new Date() &&
        ["ACTIVE", "PAST_DUE_GRACE", "READ_ONLY"].includes(tenant.status)
      )
        await tx.tenant.update({
          where: { id },
          data: {
            status: period.endsAt > new Date() ? "ACTIVE" : "PAST_DUE_GRACE",
            subscriptionEndsAt: period.endsAt,
            graceUntil: period.graceUntil,
          },
        });
      await tx.subscriptionEvent.create({
        data: {
          tenantId: id,
          subscriptionId: row.id,
          type: "ASSIGNED",
          payload: { planId: plan.id },
          actorId: actor.id,
        },
      });
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: "subscription.assign",
          resourceId: row.id,
          traceId,
        },
      });
      return {
        id: row.id,
        tenantId: row.tenantId,
        status: row.status,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        graceUntil: row.graceUntil,
        plan: planView(plan),
      };
    });
  }
}
