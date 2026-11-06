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
  ApiBody,
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
  notificationAudienceSql,
  notificationSubjectsSql,
} from "./notification-policy";
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
export class NotificationDeliveryStatusView {
  @ApiProperty({
    description:
      "Provider status; SENT means provider handoff, not device display. RETRY_EXHAUSTED projects a retained legacy pending row with five attempts.",
  })
  status!: string;
  @ApiProperty({ minimum: 1 }) count!: number;
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
  @ApiProperty({ type: [String] }) subjectStudentIds!: string[];
  @ApiProperty({ type: [NotificationDeliveryStatusView] })
  deliveryStatuses!: NotificationDeliveryStatusView[];
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
type InboxRow = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  readAt: Date | null;
  createdAt: Date;
  subjectStudentIds: string[];
  deliveryStatuses: NotificationDeliveryStatusView[];
};
@Injectable()
export class NotificationsService {
  constructor(private db: Db) {}
  private scope(c: Claims) {
    if (!c.tenantId || !c.role) throw new ForbiddenException();
    return Prisma.sql`n.tenant_id=${c.tenantId}::uuid
      AND n.recipient_user_id=${c.sub}::uuid
      AND n.recipient_role=${c.role}::"Role"
      AND ${notificationAudienceSql()}`;
  }
  private async assertContext(
    tx: Prisma.TransactionClient,
    c: Claims,
    lock: boolean,
    exclusiveSession = false,
  ) {
    if (!c.tenantId || !c.role) throw new ForbiddenException();
    if (lock)
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId}::uuid FOR SHARE`;
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT s.id FROM auth_sessions s JOIN users u ON u.id=s.user_id
      JOIN tenant_memberships m ON m.tenant_id=${c.tenantId}::uuid AND m.user_id=u.id
      JOIN membership_roles r ON r.membership_id=m.id AND r.role=${c.role}::"Role"
      JOIN tenants t ON t.id=m.tenant_id
      WHERE s.id=${c.sid}::uuid AND s.user_id=${c.sub}::uuid
        AND s.selected_tenant_id=m.tenant_id AND s.selected_role=r.role
        AND s.consumed_at IS NULL AND s.revoked_at IS NULL AND s.expires_at>now()
        AND u.status='ACTIVE' AND m.status='ACTIVE' AND NOT m.activation_pending
        AND t.status IN ('ACTIVE','PAST_DUE_GRACE','READ_ONLY')
      ${lock ? (exclusiveSession ? Prisma.sql`FOR UPDATE OF s FOR SHARE OF m,u` : Prisma.sql`FOR SHARE OF s,m,u`) : Prisma.empty}
    `);
    if (!rows.length)
      throw new ForbiddenException("Ngữ cảnh không còn được phép truy cập.");
  }
  private eventRows(
    tx: Prisma.TransactionClient,
    c: Claims,
    limit: number,
    offset: number,
    eventId?: string,
  ) {
    return tx.$queryRaw<InboxRow[]>(Prisma.sql`
      WITH allowed AS (
        SELECT n.id,n.event_id,n.type,n.entity_type,n.entity_id,
          (SELECT min(z.read_at) FROM notifications z
            WHERE z.tenant_id=n.tenant_id AND z.recipient_user_id=n.recipient_user_id
              AND z.event_id=n.event_id) AS read_at,
          (SELECT min(z.created_at) FROM notifications z
            WHERE z.tenant_id=n.tenant_id AND z.recipient_user_id=n.recipient_user_id
              AND z.event_id=n.event_id) AS created_at,
          ARRAY(SELECT a.id FROM (${notificationSubjectsSql()}) a ORDER BY a.id) AS subjects
        FROM notifications n WHERE ${this.scope(c)}
          ${eventId ? Prisma.sql`AND n.event_id=${eventId}::uuid` : Prisma.empty}
      ), events AS (
        SELECT DISTINCT ON (event_id) * FROM allowed ORDER BY event_id,id
      )
      SELECT id,type,entity_type AS "entityType",entity_id AS "entityId",
        read_at AS "readAt",created_at AS "createdAt",subjects AS "subjectStudentIds",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('status',s.status,'count',s.count) ORDER BY s.status)
          FROM (SELECT p.status,count(*)::integer AS count FROM (
            SELECT DISTINCT ON (d.device_id)
              CASE WHEN d.status='PENDING' AND d.attempts>=5 THEN 'RETRY_EXHAUSTED' ELSE d.status END AS status
            FROM notification_deliveries d
            WHERE d.tenant_id=${c.tenantId!}::uuid AND d.recipient_user_id=${c.sub}::uuid
              AND d.event_id=events.event_id
            -- Keep real historical handoff/uncertain outcomes visible even when
            -- the retained row is a noncanonical legacy audience duplicate.
            ORDER BY d.device_id,CASE d.status WHEN 'SENT' THEN 0 WHEN 'ACCEPTED' THEN 1
              WHEN 'UNKNOWN' THEN 2 WHEN 'SENDING' THEN 3 WHEN 'PENDING' THEN 4 ELSE 5 END,
              d.canonical DESC,d.id
          ) p GROUP BY p.status) s),'[]'::jsonb) AS "deliveryStatuses"
      FROM events ORDER BY created_at DESC,event_id ASC LIMIT ${limit} OFFSET ${offset}
    `);
  }
  private view(n: InboxRow) {
    return {
      id: n.id,
      type: n.type,
      entityType: n.entityType,
      entityId: n.entityId,
      // The recorded representative is historical, never an authorization grant.
      subjectStudentId: n.subjectStudentIds[0] ?? null,
      subjectStudentIds: n.subjectStudentIds,
      deliveryStatuses: n.deliveryStatuses,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  }
  async list(c: Claims, q: ListDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.assertContext(tx, c, false);
        const rows = await this.eventRows(
          tx,
          c,
          q.limit,
          (q.page - 1) * q.limit,
        );
        const [count] = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`
          SELECT count(DISTINCT n.event_id)::integer AS total FROM notifications n WHERE ${this.scope(c)}
        `);
        const total = count?.total ?? 0;
        return new Paged(
          rows.map((n) => this.view(n)),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  async detail(c: Claims, id: string, mark = false) {
    return this.db.$transaction(async (tx) => {
      await this.assertContext(tx, c, mark);
      // Legacy/push IDs are aliases only within this actual recipient's event.
      const owned = await tx.notification.findFirst({
        where: { tenantId: c.tenantId!, recipientUserId: c.sub, id },
        select: { eventId: true },
      });
      if (!owned) throw new NotFoundException("Thông báo không còn khả dụng.");
      let rows = await this.eventRows(tx, c, 1, 0, owned.eventId);
      if (!rows[0])
        throw new NotFoundException("Thông báo không còn khả dụng.");
      if (mark) {
        await tx.notification.updateMany({
          where: {
            tenantId: c.tenantId!,
            recipientUserId: c.sub,
            eventId: owned.eventId,
            readAt: null,
          },
          data: { readAt: new Date() },
        });
        rows = await this.eventRows(tx, c, 1, 0, owned.eventId);
      }
      if (!rows[0])
        throw new NotFoundException("Thông báo không còn khả dụng.");
      return this.view(rows[0]);
    });
  }
  async preferences(c: Claims, input?: PreferencesInput) {
    return this.db.$transaction(async (tx) => {
      await this.assertContext(tx, c, !!input);
      const where = {
        tenantId_userId: { tenantId: c.tenantId!, userId: c.sub },
      };
      const value = input
        ? await tx.notificationPreference.upsert({
            where,
            create: { tenantId: c.tenantId!, userId: c.sub, ...input },
            update: input,
          })
        : await tx.notificationPreference.findUnique({ where });
      return {
        pushEnabled: value?.pushEnabled ?? false,
        attendance: value?.attendance ?? true,
        grades: value?.grades ?? true,
        finance: value?.finance ?? true,
        schedule: value?.schedule ?? true,
      };
    });
  }
  async device(c: Claims, input?: PushInput) {
    return this.db.$transaction(async (tx) => {
      await this.assertContext(tx, c, true, true);
      const s = await tx.authSession.findFirstOrThrow({
        where: { id: c.sid, userId: c.sub, revokedAt: null, consumedAt: null },
      });
      if (s.clientType !== "MOBILE")
        throw new ForbiddenException(
          "Chỉ ứng dụng di động được đăng ký thiết bị.",
        );
      if (input) {
        // One current OS token per login family/platform. Old registrations
        // remain recorded and revoked, including a genuine token change.
        await tx.devicePushToken.updateMany({
          where: {
            userId: c.sub,
            familyId: s.familyId,
            platform: input.platform,
            status: "ACTIVE",
            tokenHash: { not: hashToken(input.token) },
          },
          data: { status: "REVOKED" },
        });
        await tx.devicePushToken.upsert({
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
      } else
        await tx.devicePushToken.updateMany({
          where: { userId: c.sub, familyId: s.familyId },
          data: { status: "REVOKED" },
        });
      return { revoked: !input };
    });
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
  @ApiBody({
    required: false,
    schema: { type: "object", additionalProperties: false },
  })
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
