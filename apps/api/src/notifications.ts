import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
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
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { IsBoolean, IsIn, Matches } from "class-validator";
import { Prisma } from "@prisma/client";
import { sealToken } from "@fluivix/server-crypto";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import { ListDto } from "./auth.dto";
import type { ApiRequest } from "./http";
import { Paged } from "./http";
import type { Claims } from "./security";
import { hashToken } from "./security";
import {
  ErrorResponse,
  MetaDto,
  PageView,
  RevokeResponse,
} from "./response.dto";
export class PreferencesInput {
  @ApiProperty() @IsBoolean() pushEnabled!: boolean;
  @ApiProperty() @IsBoolean() attendance!: boolean;
  @ApiProperty() @IsBoolean() grades!: boolean;
  @ApiProperty() @IsBoolean() finance!: boolean;
  @ApiProperty() @IsBoolean() schedule!: boolean;
}
export class PreferencesResponse {
  @ApiProperty({ type: PreferencesInput }) data!: PreferencesInput;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PushInput {
  @ApiProperty({ description: "Expo token from native OS permission flow" })
  @Matches(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/)
  token!: string;
  @ApiProperty({ enum: ["android", "ios"] })
  @IsIn(["android", "ios"])
  platform!: string;
}
export class NotificationView {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ type: String, nullable: true }) readAt!: string | null;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) subjectStudentId!:
    | string
    | null;
}
export class NotificationResponse {
  @ApiProperty({ type: NotificationView }) data!: NotificationView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class NotificationsResponse {
  @ApiProperty({ type: [NotificationView] }) data!: NotificationView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@Injectable()
export class NotificationsService {
  constructor(private db: Db) {}
  async scope(c: Claims): Promise<Prisma.NotificationWhereInput> {
    const ids =
      c.role === "guardian"
        ? (
            await this.db.guardianLink.findMany({
              where: {
                tenantId: c.tenantId!,
                guardianUserId: c.sub,
                status: "ACTIVE",
                verifiedAt: { not: null },
                verifiedBy: { not: null },
              },
              select: { studentId: true },
            })
          ).map((r) => r.studentId)
        : c.role === "student"
          ? (
              await this.db.student.findMany({
                where: { tenantId: c.tenantId!, userId: c.sub },
                select: { id: true },
              })
            ).map((r) => r.id)
          : [];
    return {
      tenantId: c.tenantId!,
      recipientUserId: c.sub,
      recipientRole: c.role!,
      ...(c.role === "guardian" || c.role === "student"
        ? { subjectStudentId: { in: ids } }
        : {}),
    };
  }
  private view(n: {
    id: string;
    type: string;
    entityType: string;
    entityId: string;
    subjectStudentId: string | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      type: n.type,
      entityType: n.entityType,
      entityId: n.entityId,
      subjectStudentId: n.subjectStudentId,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  }
  async list(c: Claims, q: ListDto) {
    const where = await this.scope(c);
    const [rows, total] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.notification.count({ where }),
    ]);
    return new Paged(
      rows.map((n) => this.view(n)),
      {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    );
  }
  async detail(c: Claims, id: string, mark = false) {
    const where = { AND: [await this.scope(c), { id }] };
    const n = await this.db.notification.findFirst({ where });
    if (!n) throw new NotFoundException("Thông báo không còn khả dụng.");
    if (mark && !n.readAt)
      await this.db.notification.updateMany({
        where,
        data: { readAt: new Date() },
      });
    return this.view({
      ...n,
      readAt: mark ? (n.readAt ?? new Date()) : n.readAt,
    });
  }
  async preferences(c: Claims, input?: PreferencesInput) {
    const where = { tenantId_userId: { tenantId: c.tenantId!, userId: c.sub } };
    const value = input
      ? await this.db.notificationPreference.upsert({
          where,
          create: { tenantId: c.tenantId!, userId: c.sub, ...input },
          update: input,
        })
      : await this.db.notificationPreference.findUnique({ where });
    return {
      pushEnabled: value?.pushEnabled ?? false,
      attendance: value?.attendance ?? true,
      grades: value?.grades ?? true,
      finance: value?.finance ?? true,
      schedule: value?.schedule ?? true,
    };
  }
  async device(c: Claims, input?: PushInput) {
    const s = await this.db.authSession.findFirstOrThrow({
      where: { id: c.sid, userId: c.sub, revokedAt: null, consumedAt: null },
    });
    if (s.clientType !== "MOBILE")
      throw new ForbiddenException(
        "Chỉ ứng dụng di động được đăng ký thiết bị.",
      );
    if (input)
      await this.db.devicePushToken.upsert({
        where: { tokenHash: hashToken(input.token) },
        create: {
          userId: c.sub,
          familyId: s.familyId,
          tokenHash: hashToken(input.token),
          tokenEncrypted: sealToken(input.token),
          platform: input.platform,
        },
        update: {
          userId: c.sub,
          familyId: s.familyId,
          tokenEncrypted: sealToken(input.token),
          platform: input.platform,
          status: "ACTIVE",
        },
      });
    else
      await this.db.devicePushToken.updateMany({
        where: { userId: c.sub, familyId: s.familyId },
        data: { status: "REVOKED" },
      });
    return { revoked: !input };
  }
}
@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@TenantPermission("notification.read")
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class NotificationsController {
  constructor(private service: NotificationsService) {}
  @Get("notifications")
  @ApiOkResponse({ type: NotificationsResponse })
  list(@Req() r: ApiRequest, @Query() q: ListDto) {
    return this.service.list(requestClaims(r), q);
  }
  @Get("notifications/:id")
  @ApiOkResponse({ type: NotificationResponse })
  detail(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(requestClaims(r), id);
  }
  @Patch("notifications/:id/read")
  @ApiOkResponse({ type: NotificationResponse })
  read(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(requestClaims(r), id, true);
  }
  @Get("me/notification-preferences")
  @ApiOkResponse({ type: PreferencesResponse })
  preferences(@Req() r: ApiRequest) {
    return this.service.preferences(requestClaims(r));
  }
  @Patch("me/notification-preferences")
  @ApiOkResponse({ type: PreferencesResponse })
  update(@Req() r: ApiRequest, @Body() dto: PreferencesInput) {
    return this.service.preferences(requestClaims(r), dto);
  }
  @Post("mobile/devices/push-token")
  @ApiCreatedResponse({ type: RevokeResponse })
  register(@Req() r: ApiRequest, @Body() dto: PushInput) {
    return this.service.device(requestClaims(r), dto);
  }
  @Delete("mobile/devices/push-token")
  @ApiOkResponse({ type: RevokeResponse })
  remove(@Req() r: ApiRequest) {
    return this.service.device(requestClaims(r));
  }
}
