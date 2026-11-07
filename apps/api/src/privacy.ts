import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Db } from "./db";
import { TeachingService } from "./teaching.service";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import { ErrorResponse } from "./response.dto";
import type { ApiRequest } from "./http";
import type { Claims } from "./security";
import { configuredPrivacyPolicy } from "./privacy-policy";
import {
  ConsentInput,
  ConsentResponse,
  ConsentsResponse,
  ConsentView,
  PolicyResponse,
  PrivacyRequestInput,
  PrivacyRequestResponse,
  PrivacyRequestsQuery,
  PrivacyRequestsResponse,
  PrivacyVersionInput,
  PrivacyPageQuery,
  PrivacyEventsResponse,
  PrivacyExportResponse,
} from "./privacy.dto";
import type { Role } from "@prisma/client";
import { privacyActor, privacyWriteActor } from "./privacy-access";
import { PrivacyRequestsService } from "./privacy-requests";
@Injectable()
export class PrivacyService {
  constructor(
    private db: Db,
    private teaching: TeachingService,
  ) {}
  policy() {
    return configuredPrivacyPolicy();
  }
  private consentView(row: {
    id: string;
    subjectStudentId: string | null;
    policyVersion: string;
    purposeCode: string;
    granted: boolean;
    capturedAt: Date;
    revokedAt: Date | null;
    captureMethod: string | null;
    capturedRole: Role | null;
  }): ConsentView {
    return {
      id: row.id,
      subjectStudentId: row.subjectStudentId,
      policyVersion: row.policyVersion,
      purposeCode: row.purposeCode,
      granted: row.granted,
      capturedAt: row.capturedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      captureMethod: row.captureMethod,
      capturedRole: row.capturedRole,
    };
  }
  async consents(c: Claims) {
    return this.db.$transaction(async (tx) => {
      await privacyActor(tx, c, false);
      const rows = await tx.privacyConsent.findMany({
        where: { tenantId: c.tenantId!, consentingUserId: c.sub },
        orderBy: { capturedAt: "desc" },
        take: 100,
      });
      return rows.map((r) => this.consentView(r));
    });
  }
  async consent(c: Claims, input: ConsentInput, traceId: string) {
    const policy = this.policy();
    if (!policy.configured || input.policyVersion !== policy.version)
      throw new ForbiddenException(
        "Chính sách quyền riêng tư chưa cấu hình hoặc đã thay đổi.",
      );
    return this.db.$transaction(async (tx) => {
      await privacyWriteActor(
        tx,
        c,
        traceId,
        input.granted
          ? "Ghi nhận đồng ý thông báo theo phiên bản chính sách"
          : "Rút đồng ý thông báo theo phiên bản chính sách",
      );
      const currentPolicy = this.policy();
      if (
        !currentPolicy.configured ||
        currentPolicy.version !== input.policyVersion
      )
        throw new ForbiddenException("Chính sách quyền riêng tư đã thay đổi.");
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
          policyVersion: currentPolicy.version!,
          purposeCode: input.purposeCode,
          legalBasis: "CONSENT",
          granted: input.granted,
          captureMethod: "AUTHENTICATED_SELF_SERVICE",
          capturedRole: c.role!,
          evidenceRef: traceId,
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

  async withdrawOwn(c: Claims, id: string, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await privacyWriteActor(
        tx,
        c,
        traceId,
        "Chủ thể rút bản đồng ý đã ghi nhận của chính mình",
      );
      const old = await tx.privacyConsent.findFirst({
        where: { tenantId: c.tenantId!, consentingUserId: c.sub, id },
      });
      if (!old)
        throw new NotFoundException(
          "Không tìm thấy bản đồng ý trong phạm vi được phép.",
        );
      if (old.revokedAt) return this.consentView(old);
      const updated = await tx.privacyConsent.update({
        where: { id: old.id },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId!,
          actorUserId: c.sub,
          action: "privacy.consent.withdrawn",
          resourceId: old.id,
          traceId,
        },
      });
      return this.consentView(updated);
    });
  }
}
@ApiTags("privacy")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@TenantPermission("privacy.self")
@Controller("privacy")
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 410, type: ErrorResponse })
@ApiResponse({ status: 503, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class PrivacyController {
  constructor(
    private service: PrivacyService,
    private requests: PrivacyRequestsService,
  ) {}
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
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description:
      "Reuse the same key after a lost create response; changed content conflicts.",
  })
  @ApiCreatedResponse({ type: PrivacyRequestResponse })
  request(@Req() r: ApiRequest, @Body() dto: PrivacyRequestInput) {
    return this.requests.create(
      requestClaims(r),
      dto,
      r.traceId,
      r.get("Idempotency-Key"),
    );
  }
  @Post("consents/:id/withdraw")
  @HttpCode(200)
  @ApiBody({
    required: false,
    schema: { type: "object", additionalProperties: false },
  })
  @ApiOkResponse({ type: ConsentResponse })
  withdraw(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.withdrawOwn(requestClaims(r), id, r.traceId);
  }
  @Get("requests")
  @ApiOkResponse({ type: PrivacyRequestsResponse })
  list(@Req() r: ApiRequest, @Query() q: PrivacyRequestsQuery) {
    return this.requests.list(requestClaims(r), q);
  }
  @Post("requests/:id/confirm-scope")
  @HttpCode(200)
  @ApiOkResponse({ type: PrivacyRequestResponse })
  confirm(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PrivacyVersionInput,
  ) {
    return this.requests.confirmScope(requestClaims(r), id, dto, r.traceId);
  }
  @Get("requests/:id/history")
  @ApiOkResponse({ type: PrivacyEventsResponse })
  history(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: PrivacyPageQuery,
  ) {
    return this.requests.history(requestClaims(r), id, q);
  }
  @Get("requests/:id/export")
  @ApiOkResponse({ type: PrivacyExportResponse })
  download(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.requests.download(requestClaims(r), id, r.traceId);
  }
  @Get("requests/:id") @ApiOkResponse({ type: PrivacyRequestResponse }) detail(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.requests.detail(requestClaims(r), id);
  }
}
