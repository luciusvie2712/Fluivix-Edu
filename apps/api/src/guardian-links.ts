import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import { IsIn, IsString, IsUUID, Length } from "class-validator";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { AuthService } from "./auth.service";
import { ForgotDto, ListDto } from "./auth.dto";
import { requestClaims } from "./auth.controller";
import type { Claims } from "./security";
import type { ApiRequest } from "./http";
import { Paged } from "./http";
import {
  ErrorResponse,
  InviteResponse,
  MetaDto,
  PageView,
} from "./response.dto";
import { requireSubscriptionWrite } from "./subscription-policy";
export class LinkInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() guardianUserId!: string;
  @ApiProperty({ enum: ["PARENT", "GUARDIAN", "OTHER"] })
  @IsIn(["PARENT", "GUARDIAN", "OTHER"])
  relationType!: string;
}
export class VerifyLink {
  @ApiProperty() @IsString() @Length(10, 500) verificationMethod!: string;
}
export class RevokeLink {
  @ApiProperty() @IsString() @Length(10, 500) reason!: string;
}
export class GuardianLinkView {
  @ApiProperty() id!: string;
  @ApiProperty() guardianUserId!: string;
  @ApiProperty() studentId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() relationType!: string;
  @ApiProperty({ type: String, nullable: true }) verifiedAt!: string | null;
}
export class GuardianLinkResponse {
  @ApiProperty({ type: GuardianLinkView }) data!: GuardianLinkView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GuardianLinksResponse {
  @ApiProperty({ type: [GuardianLinkView] }) data!: GuardianLinkView[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GuardianUserView {
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
}
export class GuardiansResponse {
  @ApiProperty({ type: [GuardianUserView] }) data!: GuardianUserView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@Injectable()
export class GuardianLinksService {
  constructor(private db: Db) {}
  private view(r: {
    id: string;
    guardianUserId: string;
    studentId: string;
    status: string;
    relationType: string;
    verifiedAt: Date | null;
  }) {
    return {
      id: r.id,
      guardianUserId: r.guardianUserId,
      studentId: r.studentId,
      status: r.status,
      relationType: r.relationType,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
    };
  }
  async directory(c: Claims, q: ListDto) {
    const where = {
      tenantId: c.tenantId!,
      status: "ACTIVE" as const,
      roles: { some: { role: "guardian" as const } },
      ...(q.search
        ? {
            user: {
              OR: [
                {
                  displayName: {
                    contains: q.search,
                    mode: "insensitive" as const,
                  },
                },
                { email: { contains: q.search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.membership.findMany({
        where,
        select: {
          user: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { id: "asc" },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.membership.count({ where }),
    ]);
    return new Paged(
      rows.map((r) => ({
        userId: r.user.id,
        displayName: r.user.displayName,
        email: r.user.email,
      })),
      {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    );
  }
  async links(c: Claims, studentId: string) {
    if (
      !(await this.db.student.findFirst({
        where: { tenantId: c.tenantId!, id: studentId },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    return (
      await this.db.guardianLink.findMany({
        where: { tenantId: c.tenantId!, studentId },
        orderBy: { id: "asc" },
      })
    ).map((r) => this.view(r));
  }
  async mutate(
    c: Claims,
    studentId: string,
    traceId: string,
    input: LinkInput | VerifyLink | RevokeLink,
    linkId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId!}::uuid FOR UPDATE`;
      await requireSubscriptionWrite(tx, c.tenantId!);
      if (
        !(await tx.student.findFirst({
          where: { tenantId: c.tenantId!, id: studentId },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Không tìm thấy học viên.");
      if ("guardianUserId" in input) {
        const member = await tx.membership.findFirst({
          where: {
            tenantId: c.tenantId!,
            userId: input.guardianUserId,
            status: "ACTIVE",
            roles: { some: { role: "guardian" } },
          },
        });
        if (!member)
          throw new NotFoundException(
            "Phụ huynh cần kích hoạt lời mời trong trung tâm trước.",
          );
        if (
          await tx.guardianLink.findFirst({
            where: {
              tenantId: c.tenantId!,
              studentId,
              guardianUserId: input.guardianUserId,
              status: { in: ["PENDING", "ACTIVE"] },
            },
          })
        )
          throw new ConflictException("Đã có quan hệ đang chờ hoặc hoạt động.");
        const r = await tx.guardianLink.create({
          data: {
            tenantId: c.tenantId!,
            studentId,
            guardianUserId: input.guardianUserId,
            relationType: input.relationType,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: c.tenantId!,
            actorUserId: c.sub,
            action: "guardian.link.pending",
            resourceId: r.id,
            traceId,
          },
        });
        return this.view(r);
      }
      const old = await tx.guardianLink.findFirst({
        where: { tenantId: c.tenantId!, id: linkId!, studentId },
      });
      if (!old) throw new NotFoundException("Không tìm thấy quan hệ.");
      const approve = "verificationMethod" in input;
      if (approve && old.status !== "PENDING")
        throw new ConflictException("Chỉ duyệt quan hệ đang chờ xác minh.");
      const r = await tx.guardianLink.update({
        where: { id: old.id },
        data: approve
          ? {
              status: "ACTIVE",
              verifiedBy: c.sub,
              verifiedAt: new Date(),
              verificationMethod: input.verificationMethod,
            }
          : { status: "REVOKED" },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId!,
          actorUserId: c.sub,
          action: approve ? "guardian.link.approved" : "guardian.link.revoked",
          resourceId: r.id,
          traceId,
          reason: approve ? input.verificationMethod : input.reason,
        },
      });
      return this.view(r);
    });
  }
}
@ApiTags("guardian-links")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@TenantPermission("guardian.manage")
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class GuardianLinksController {
  constructor(
    private service: GuardianLinksService,
    private auth: AuthService,
  ) {}
  @Get("guardians") @ApiOkResponse({ type: GuardiansResponse }) directory(
    @Req() r: ApiRequest,
    @Query() q: ListDto,
  ) {
    return this.service.directory(requestClaims(r), q);
  }
  @Post("guardians/invite")
  @ApiCreatedResponse({ type: InviteResponse })
  invite(@Req() r: ApiRequest, @Body() dto: ForgotDto) {
    return this.auth.invite(requestClaims(r), dto.email, "guardian", r.traceId);
  }
  @Get("students/:id/guardians")
  @ApiOkResponse({ type: GuardianLinksResponse })
  links(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.links(requestClaims(r), id);
  }
  @Post("students/:id/guardians")
  @ApiCreatedResponse({ type: GuardianLinkResponse })
  create(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: LinkInput,
  ) {
    return this.service.mutate(requestClaims(r), id, r.traceId, dto);
  }
  @Post("students/:id/guardians/:linkId/approve")
  @ApiCreatedResponse({ type: GuardianLinkResponse })
  approve(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("linkId", ParseUUIDPipe) linkId: string,
    @Body() dto: VerifyLink,
  ) {
    return this.service.mutate(requestClaims(r), id, r.traceId, dto, linkId);
  }
  @Delete("students/:id/guardians/:linkId")
  @ApiOkResponse({ type: GuardianLinkResponse })
  revoke(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("linkId", ParseUUIDPipe) linkId: string,
    @Body() dto: RevokeLink,
  ) {
    return this.service.mutate(requestClaims(r), id, r.traceId, dto, linkId);
  }
}
