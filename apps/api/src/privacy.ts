import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
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
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from "class-validator";
import { Db } from "./db";
import { TeachingService } from "./teaching.service";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import { ErrorResponse, MetaDto } from "./response.dto";
import type { ApiRequest } from "./http";
import type { Claims } from "./security";
export class ConsentInput {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  subjectStudentId?: string;
  @ApiProperty() @IsString() @Length(1, 100) policyVersion!: string;
  @ApiProperty({ enum: ["NOTIFICATIONS"] })
  @IsIn(["NOTIFICATIONS"])
  purposeCode!: string;
  @ApiProperty() @IsBoolean() granted!: boolean;
}
export class ConsentView {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) subjectStudentId!:
    | string
    | null;
  @ApiProperty() policyVersion!: string;
  @ApiProperty() purposeCode!: string;
  @ApiProperty() granted!: boolean;
  @ApiProperty({ format: "date-time" }) capturedAt!: string;
  @ApiProperty({ type: String, nullable: true }) revokedAt!: string | null;
}
export class ConsentResponse {
  @ApiProperty({ type: ConsentView }) data!: ConsentView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ConsentsResponse {
  @ApiProperty({ type: [ConsentView] }) data!: ConsentView[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PolicyView {
  @ApiProperty() configured!: boolean;
  @ApiProperty({ type: String, nullable: true }) version!: string | null;
  @ApiProperty({ type: String, nullable: true }) noticeUrl!: string | null;
}
export class PolicyResponse {
  @ApiProperty({ type: PolicyView }) data!: PolicyView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PrivacyRequestInput {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  subjectStudentId?: string;
  @ApiProperty({ enum: ["ACCESS", "CORRECT", "EXPORT", "ERASE", "WITHDRAW"] })
  @IsIn(["ACCESS", "CORRECT", "EXPORT", "ERASE", "WITHDRAW"])
  type!: string;
}
export class PrivacyRequestView {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
}
export class PrivacyRequestResponse {
  @ApiProperty({ type: PrivacyRequestView }) data!: PrivacyRequestView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@Injectable()
export class PrivacyService {
  constructor(
    private db: Db,
    private teaching: TeachingService,
  ) {}
  policy() {
    const version = process.env.PRIVACY_POLICY_VERSION,
      noticeUrl = process.env.PRIVACY_NOTICE_URL;
    return {
      configured: !!version && !!noticeUrl && /^https:\/\//.test(noticeUrl),
      version: version ?? null,
      noticeUrl: noticeUrl ?? null,
    };
  }
  private consentView(row: {
    id: string;
    subjectStudentId: string | null;
    policyVersion: string;
    purposeCode: string;
    granted: boolean;
    capturedAt: Date;
    revokedAt: Date | null;
  }) {
    return {
      id: row.id,
      subjectStudentId: row.subjectStudentId,
      policyVersion: row.policyVersion,
      purposeCode: row.purposeCode,
      granted: row.granted,
      capturedAt: row.capturedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }
  async consents(c: Claims) {
    const rows = await this.db.privacyConsent.findMany({
      where: { tenantId: c.tenantId!, consentingUserId: c.sub },
      orderBy: { capturedAt: "desc" },
      take: 100,
    });
    return rows.map((r) => this.consentView(r));
  }
  async consent(c: Claims, input: ConsentInput, traceId: string) {
    const policy = this.policy();
    if (!policy.configured || input.policyVersion !== policy.version)
      throw new ForbiddenException(
        "Chính sách quyền riêng tư chưa cấu hình hoặc đã thay đổi.",
      );
    return this.db.$transaction(async (tx) => {
      const subjectStudentId = input.subjectStudentId
        ? await this.teaching.subject(tx, c, input.subjectStudentId)
        : c.role === "student"
          ? await this.teaching.subject(tx, c)
          : null;
      if (c.role === "guardian" && !input.subjectStudentId)
        throw new ForbiddenException("Chọn học viên có liên kết hợp lệ.");
      await tx.$queryRaw`SELECT id FROM tenant_memberships WHERE tenant_id=${c.tenantId!}::uuid AND user_id=${c.sub}::uuid FOR UPDATE`;
      await tx.privacyConsent.updateMany({
        where: {
          tenantId: c.tenantId!,
          consentingUserId: c.sub,
          subjectStudentId,
          purposeCode: input.purposeCode,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const r = await tx.privacyConsent.create({
        data: {
          tenantId: c.tenantId!,
          consentingUserId: c.sub,
          subjectStudentId,
          policyVersion: policy.version!,
          purposeCode: input.purposeCode,
          legalBasis: "CONSENT",
          granted: input.granted,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId!,
          actorUserId: c.sub,
          action: input.granted
            ? "privacy.consent.granted"
            : "privacy.consent.withdrawn",
          resourceId: r.id,
          traceId,
        },
      });
      return this.consentView(r);
    });
  }
  async request(c: Claims, input: PrivacyRequestInput, traceId: string) {
    return this.db.$transaction(async (tx) => {
      if (input.subjectStudentId)
        await this.teaching.subject(tx, c, input.subjectStudentId);
      const r = await tx.dataSubjectRequest.create({
        data: {
          tenantId: c.tenantId!,
          requesterUserId: c.sub,
          subjectStudentId: input.subjectStudentId ?? null,
          type: input.type,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId!,
          actorUserId: c.sub,
          action: "privacy.request.received",
          resourceId: r.id,
          traceId,
        },
      });
      return {
        id: r.id,
        type: r.type,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }
  async detail(c: Claims, id: string) {
    const r = await this.db.dataSubjectRequest.findFirst({
      where: { tenantId: c.tenantId!, requesterUserId: c.sub, id },
    });
    if (!r) throw new ForbiddenException("Không có quyền xem yêu cầu.");
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
@ApiTags("privacy")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@TenantPermission("notification.read")
@Controller("privacy")
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class PrivacyController {
  constructor(private service: PrivacyService) {}
  @Get("policy") @ApiOkResponse({ type: PolicyResponse }) policy() {
    return this.service.policy();
  }
  @Get("consents") @ApiOkResponse({ type: ConsentsResponse }) consents(
    @Req() r: ApiRequest,
  ) {
    return this.service.consents(requestClaims(r));
  }
  @Post("consents") @ApiCreatedResponse({ type: ConsentResponse }) consent(
    @Req() r: ApiRequest,
    @Body() dto: ConsentInput,
  ) {
    return this.service.consent(requestClaims(r), dto, r.traceId);
  }
  @Post("requests")
  @ApiCreatedResponse({ type: PrivacyRequestResponse })
  request(@Req() r: ApiRequest, @Body() dto: PrivacyRequestInput) {
    return this.service.request(requestClaims(r), dto, r.traceId);
  }
  @Get("requests/:id") @ApiOkResponse({ type: PrivacyRequestResponse }) detail(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(requestClaims(r), id);
  }
}
