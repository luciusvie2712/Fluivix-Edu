import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { MembershipStatus, Prisma, Role } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";
import { Db } from "./db";
import { ListDto } from "./auth.dto";
import { AuthService } from "./auth.service";
import { requestClaims } from "./auth.controller";
import { AccessGuard, TenantPermission } from "./guards";
import { Paged, type ApiRequest } from "./http";
import {
  ErrorResponse,
  InviteResponse,
  MetaDto,
  PageView,
} from "./response.dto";
import { permissions, type Claims } from "./security";
import { assertQuota } from "./subscription-policy";
import { managedStaffRoles, staffActor, staffRoles } from "./staff-policy";

export class StaffQuery extends ListDto {
  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}
export class StaffChange {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  reason!: string;
}
export class StaffUpdate extends StaffChange {
  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() staffDelegated?: boolean;
}
export class StaffRoleChange extends StaffChange {
  @ApiProperty({ enum: Role, enumName: "Role" }) @IsEnum(Role) role!: Role;
}
export class EffectiveRole {
  @ApiProperty({ enum: Role, enumName: "Role" }) role!: Role;
  @ApiProperty({ type: [String] }) permissions!: string[];
}
export class StaffView {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: MembershipStatus }) status!: MembershipStatus;
  @ApiProperty() version!: number;
  @ApiProperty() staffDelegated!: boolean;
  @ApiProperty() activationPending!: boolean;
  @ApiProperty({ type: [EffectiveRole] }) roles!: EffectiveRole[];
}
export class StaffResponse {
  @ApiProperty({ type: StaffView }) data!: StaffView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class StaffListResponse {
  @ApiProperty({ type: [StaffView] }) data!: StaffView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PermissionCatalogResponse {
  @ApiProperty({ type: [EffectiveRole] }) data!: EffectiveRole[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class StaffInvitationView {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: Role, enumName: "Role" }) role!: Role;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ enum: ["PENDING", "EXPIRED", "ACCEPTED", "REVOKED"] })
  status!: string;
}
export class StaffInvitationsResponse {
  @ApiProperty({ type: [StaffInvitationView] }) data!: StaffInvitationView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
const include = {
  roles: true,
  user: { select: { id: true, email: true, displayName: true, status: true } },
} as const;
type Member = Prisma.MembershipGetPayload<{ include: typeof include }>;
function effective(role: Role, delegated = false): EffectiveRole {
  return {
    role,
    permissions: [
      ...permissions[role],
      ...(role === "manager" && delegated
        ? ["staff.invite", "staff.manage"]
        : []),
    ],
  };
}
function view(m: Member): StaffView {
  return {
    id: m.id,
    userId: m.userId,
    // A pending invitation must not reveal an existing global identity's name
    // before that person has accepted membership in this tenant.
    displayName: m.activationPending ? m.user.email : m.user.displayName,
    email: m.user.email,
    status: m.status,
    version: m.version,
    staffDelegated: m.staffDelegated,
    activationPending: m.activationPending,
    roles: m.roles.map((r) => ({
      role: r.role,
      permissions:
        m.status === "ACTIVE" &&
        !m.activationPending &&
        m.user.status === "ACTIVE"
          ? effective(r.role, m.staffDelegated).permissions
          : [],
    })),
  };
}
@Injectable()
export class StaffService {
  constructor(
    private db: Db,
    private auth: AuthService,
  ) {}
  catalog() {
    return Object.values(Role).map((r) => effective(r));
  }
  async list(c: Claims, q: StaffQuery) {
    const where: Prisma.MembershipWhereInput = {
      tenantId: c.tenantId!,
      roles: { some: { role: { in: staffRoles } } },
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { user: { email: { contains: q.search, mode: "insensitive" } } },
              {
                activationPending: false,
                user: {
                  displayName: { contains: q.search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.membership.findMany({
        where,
        include,
        orderBy: { id: "asc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.membership.count({ where }),
    ]);
    return new Paged(rows.map(view), {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    });
  }
  private async member(tx: Prisma.TransactionClient, c: Claims, id: string) {
    const m = await tx.membership.findFirst({
      where: {
        id,
        tenantId: c.tenantId!,
        roles: { some: { role: { in: staffRoles } } },
      },
      include,
    });
    if (!m)
      throw new NotFoundException("Không tìm thấy nhân sự trong trung tâm.");
    return m;
  }
  async detail(c: Claims, id: string) {
    return view(await this.member(this.db, c, id));
  }
  private version(m: Member, v: number) {
    if (m.version !== v)
      throw new ConflictException(
        "Dữ liệu đã thay đổi. Tải lại trước khi lưu.",
      );
  }
  private async invalidateInvitations(
    tx: Prisma.TransactionClient,
    c: Claims,
    m: Member,
    role?: Role,
  ) {
    await tx.invitation.updateMany({
      where: {
        tenantId: c.tenantId!,
        email: m.user.email,
        usedAt: null,
        revokedAt: null,
        ...(role ? { role } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
  private async lastOwner(tx: Prisma.TransactionClient, m: Member) {
    if (
      m.status === "ACTIVE" &&
      m.roles.some((r) => r.role === "owner") &&
      (await tx.membership.count({
        where: {
          tenantId: m.tenantId,
          id: { not: m.id },
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          roles: { some: { role: "owner" } },
        },
      })) === 0
    )
      throw new ConflictException(
        "Phải giữ ít nhất một chủ trung tâm đang hoạt động.",
      );
  }
  async update(c: Claims, id: string, d: StaffUpdate, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await staffActor(tx, c, "staff.manage");
      const m = await this.member(tx, c, id);
      this.version(m, d.version);
      if (d.status === undefined && d.staffDelegated === undefined)
        throw new ConflictException("Chọn thay đổi hợp lệ.");
      if (
        c.role !== "owner" &&
        (m.userId === c.sub ||
          m.staffDelegated ||
          m.roles.some((r) => !managedStaffRoles.includes(r.role)) ||
          d.staffDelegated !== undefined)
      )
        throw new ForbiddenException();
      if (
        d.staffDelegated !== undefined &&
        (m.userId === c.sub || !m.roles.some((r) => r.role === "manager"))
      )
        throw new ForbiddenException(
          "Chỉ chủ trung tâm được ủy quyền cho quản lý khác.",
        );
      if (d.status && d.status !== "ACTIVE") await this.lastOwner(tx, m);
      if (d.status === "INVITED" && m.status !== "INVITED") {
        if (!m.activationPending)
          throw new ConflictException(
            "Thành viên đã xác nhận lời mời; chọn trạng thái hoạt động để khôi phục.",
          );
        await assertQuota(tx, m.tenantId, "users", 1);
      }
      if (d.status === "ACTIVE" && m.status !== "ACTIVE") {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: m.userId },
        });
        if (user.status !== "ACTIVE" || m.activationPending)
          throw new ConflictException(
            "Nhân sự cần tự xác nhận lời mời trước khi hoạt động.",
          );
        await assertQuota(tx, m.tenantId, "users", 1);
      }
      const changed = await tx.membership.update({
        where: { id: m.id },
        data: {
          ...(d.status ? { status: d.status } : {}),
          ...(d.staffDelegated !== undefined
            ? { staffDelegated: d.staffDelegated }
            : {}),
          version: { increment: 1 },
        },
        include,
      });
      if (d.status && d.status !== "ACTIVE")
        await this.invalidateInvitations(tx, c, m);
      await tx.auditLog.create({
        data: {
          tenantId: m.tenantId,
          actorUserId: c.sub,
          action: "staff.update",
          resourceId: m.id,
          traceId,
          reason: d.reason,
          metadata: {
            reason: d.reason,
            before: { status: m.status, staffDelegated: m.staffDelegated },
            after: {
              status: changed.status,
              staffDelegated: changed.staffDelegated,
            },
            version: changed.version,
          },
        },
      });
      return view(changed);
    });
  }
  async role(
    c: Claims,
    id: string,
    d: StaffChange,
    role: Role,
    remove: boolean,
    traceId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await staffActor(tx, c, "staff.roles");
      const m = await this.member(tx, c, id);
      this.version(m, d.version);
      if (!remove && m.userId === c.sub)
        throw new ForbiddenException("Không tự cấp thêm vai trò.");
      if (remove && m.roles.some((r) => r.role === role)) {
        if (m.roles.length === 1)
          throw new ConflictException(
            "Nhân sự cần ít nhất một vai trò. Thu hồi tư cách thành viên để ngừng truy cập.",
          );
        if (role === "owner") await this.lastOwner(tx, m);
        await tx.membershipRole.delete({
          where: { membershipId_role: { membershipId: m.id, role } },
        });
        await this.invalidateInvitations(tx, c, m, role);
      } else if (!remove) {
        await tx.membershipRole.upsert({
          where: { membershipId_role: { membershipId: m.id, role } },
          create: { membershipId: m.id, role },
          update: {},
        });
      } else throw new NotFoundException("Vai trò không còn tồn tại.");
      const changed = await tx.membership.update({
        where: { id: m.id },
        data: {
          version: { increment: 1 },
          ...(remove && role === "manager" ? { staffDelegated: false } : {}),
        },
        include,
      });
      await tx.auditLog.create({
        data: {
          tenantId: m.tenantId,
          actorUserId: c.sub,
          action: remove ? "staff.role.revoke" : "staff.role.assign",
          resourceId: m.id,
          traceId,
          reason: d.reason,
          metadata: { role, reason: d.reason, version: changed.version },
        },
      });
      return view(changed);
    });
  }
  async invitations(c: Claims, q: ListDto) {
    const where: Prisma.InvitationWhereInput = {
      tenantId: c.tenantId!,
      role: { in: staffRoles },
      ...(q.search
        ? { email: { contains: q.search, mode: "insensitive" } }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.invitation.findMany({
        where,
        orderBy: [{ expiresAt: "desc" }, { id: "asc" }],
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.invitation.count({ where }),
    ]);
    return new Paged(
      rows.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
        status: i.usedAt
          ? "ACCEPTED"
          : i.revokedAt
            ? "REVOKED"
            : i.expiresAt <= new Date()
              ? "EXPIRED"
              : "PENDING",
      })),
      {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    );
  }
  async resend(c: Claims, id: string, traceId: string) {
    const i = await this.db.invitation.findFirst({
      where: { id, tenantId: c.tenantId!, role: { in: staffRoles } },
    });
    if (!i) throw new NotFoundException();
    if (i.usedAt || i.revokedAt)
      throw new ConflictException(
        "Lời mời đã dùng hoặc thu hồi. Tạo lời mời mới nếu cần.",
      );
    return this.auth.invite(c, i.email, i.role, traceId, id);
  }
}
@ApiTags("staff")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class StaffController {
  constructor(private service: StaffService) {}
  @Get("permissions")
  @TenantPermission("permissions.read")
  @ApiOkResponse({ type: PermissionCatalogResponse })
  catalog() {
    return this.service.catalog();
  }
  @Get("staff")
  @TenantPermission("staff.read")
  @ApiOkResponse({ type: StaffListResponse })
  list(@Req() r: ApiRequest, @Query() q: StaffQuery) {
    return this.service.list(requestClaims(r), q);
  }
  @Get("staff/invitations")
  @TenantPermission("staff.read")
  @ApiOkResponse({ type: StaffInvitationsResponse })
  invitations(@Req() r: ApiRequest, @Query() q: ListDto) {
    return this.service.invitations(requestClaims(r), q);
  }
  @Post("staff/invitations/:id/resend")
  @TenantPermission("staff.invite")
  @ApiCreatedResponse({ type: InviteResponse })
  resend(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.resend(requestClaims(r), id, r.traceId);
  }
  @Get("staff/:id")
  @TenantPermission("staff.read")
  @ApiOkResponse({ type: StaffResponse })
  detail(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(requestClaims(r), id);
  }
  @Patch("staff/:id")
  @TenantPermission("staff.manage")
  @ApiOkResponse({ type: StaffResponse })
  update(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: StaffUpdate,
  ) {
    return this.service.update(requestClaims(r), id, d, r.traceId);
  }
  @Post("staff/:id/roles")
  @TenantPermission("staff.roles")
  @ApiCreatedResponse({ type: StaffResponse })
  add(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: StaffRoleChange,
  ) {
    return this.service.role(requestClaims(r), id, d, d.role, false, r.traceId);
  }
  @Delete("staff/:id/roles/:roleId")
  @TenantPermission("staff.roles")
  @ApiOkResponse({ type: StaffResponse })
  remove(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("roleId", new ParseEnumPipe(Role)) role: Role,
    @Body() d: StaffChange,
  ) {
    return this.service.role(requestClaims(r), id, d, role, true, r.traceId);
  }
}
