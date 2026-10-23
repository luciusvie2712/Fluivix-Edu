import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { PlatformTenantsService } from "./platform-tenants.service";
import {
  CreatePlanDto,
  CreateTenantDto,
  LifecycleDto,
  PlanResponse,
  PlansResponse,
  PlatformTenantListDto,
  PlatformTenantResponse,
  PlatformTenantDetailResponse,
  PlatformTenantsResponse,
  SubscriptionDatesDto,
  SubscriptionResponse,
  SubscriptionsResponse,
  UpdateTenantDto,
} from "./platform-tenants.dto";
import type { ApiRequest } from "./http";
import { PlatformService } from "./platform.service";
import { ErrorResponse, InviteResponse } from "./response.dto";
@ApiTags("platform-tenants")
@ApiBearerAuth()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
@Controller("platform")
export class PlatformTenantsController {
  constructor(
    private readonly service: PlatformTenantsService,
    private readonly auth: PlatformService,
  ) {}
  @Get("plans") @ApiOkResponse({ type: PlansResponse }) plans(
    @Req() req: ApiRequest,
  ) {
    return this.service.plans(req.headers.authorization);
  }
  @Post("plans") @ApiCreatedResponse({ type: PlanResponse }) createPlan(
    @Req() req: ApiRequest,
    @Body() dto: CreatePlanDto,
  ) {
    this.auth.requireOrigin(req.headers.origin);
    return this.service.createPlan(req.headers.authorization, dto, req.traceId);
  }
  @Get("tenants") @ApiOkResponse({ type: PlatformTenantsResponse }) list(
    @Req() req: ApiRequest,
    @Query() dto: PlatformTenantListDto,
  ) {
    return this.service.tenants(req.headers.authorization, dto);
  }
  @Post("tenants") @ApiCreatedResponse({ type: PlatformTenantResponse }) create(
    @Req() req: ApiRequest,
    @Body() dto: CreateTenantDto,
  ) {
    this.auth.requireOrigin(req.headers.origin);
    return this.service.createTenant(
      req.headers.authorization,
      dto,
      req.traceId,
    );
  }
  @Get("tenants/:id")
  @ApiOkResponse({ type: PlatformTenantDetailResponse })
  detail(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(req.headers.authorization, id);
  }
  @Post("tenants/:id/resend-owner-invitation")
  @ApiCreatedResponse({ type: InviteResponse })
  resend(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    this.auth.requireOrigin(req.headers.origin);
    return this.service.resendOwner(req.headers.authorization, id, req.traceId);
  }
  @Patch("tenants/:id") @ApiOkResponse({ type: PlatformTenantResponse }) update(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    this.auth.requireOrigin(req.headers.origin);
    return this.service.update(req.headers.authorization, id, dto, req.traceId);
  }
  @Post("tenants/:id/suspend")
  @ApiCreatedResponse({ type: PlatformTenantResponse })
  suspend(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: LifecycleDto,
  ) {
    this.auth.requireOrigin(req.headers.origin);
    return this.service.lifecycle(
      req.headers.authorization,
      id,
      dto,
      true,
      req.traceId,
    );
  }
  @Post("tenants/:id/reactivate")
  @ApiCreatedResponse({ type: PlatformTenantResponse })
  reactivate(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: LifecycleDto,
  ) {
    this.auth.requireOrigin(req.headers.origin);
    return this.service.lifecycle(
      req.headers.authorization,
      id,
      dto,
      false,
      req.traceId,
    );
  }
  @Get("tenants/:id/subscriptions")
  @ApiOkResponse({ type: SubscriptionsResponse })
  subscriptions(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.subscriptions(req.headers.authorization, id);
  }
  @Post("tenants/:id/subscriptions")
  @ApiCreatedResponse({ type: SubscriptionResponse })
  assign(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SubscriptionDatesDto,
  ) {
    this.auth.requireOrigin(req.headers.origin);
    return this.service.assignSubscription(
      req.headers.authorization,
      id,
      dto,
      req.traceId,
    );
  }
}
