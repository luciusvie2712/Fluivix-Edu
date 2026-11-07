import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { PrivacyRequestsService } from "./privacy-requests";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import { ErrorResponse } from "./response.dto";
import {
  PrivacyAdminRequestResponse,
  PrivacyAdminRequestsResponse,
  PrivacyDecisionInput,
  PrivacyEventsResponse,
  PrivacyFulfillInput,
  PrivacyPageQuery,
  PrivacyRequestsQuery,
  PrivacyVerifyInput,
} from "./privacy.dto";

@ApiTags("privacy-administration")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@TenantPermission("privacy.manage")
@Controller("privacy/admin/requests")
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class PrivacyAdminController {
  constructor(private readonly requests: PrivacyRequestsService) {}
  @Get()
  @ApiOkResponse({ type: PrivacyAdminRequestsResponse })
  list(@Req() r: ApiRequest, @Query() q: PrivacyRequestsQuery) {
    return this.requests.list(requestClaims(r), q, true);
  }
  @Get(":id")
  @ApiOkResponse({ type: PrivacyAdminRequestResponse })
  detail(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.requests.detail(requestClaims(r), id, true);
  }
  @Get(":id/history")
  @ApiOkResponse({ type: PrivacyEventsResponse })
  history(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: PrivacyPageQuery,
  ) {
    return this.requests.history(requestClaims(r), id, q, true);
  }
  @Post(":id/verify")
  @HttpCode(200)
  @ApiOkResponse({ type: PrivacyAdminRequestResponse })
  verify(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PrivacyVerifyInput,
  ) {
    return this.requests.verify(requestClaims(r), id, dto, r.traceId);
  }
  @Post(":id/decision")
  @HttpCode(200)
  @ApiOkResponse({ type: PrivacyAdminRequestResponse })
  decide(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PrivacyDecisionInput,
  ) {
    return this.requests.decide(requestClaims(r), id, dto, r.traceId);
  }
  @Post(":id/fulfill")
  @HttpCode(200)
  @ApiOkResponse({ type: PrivacyAdminRequestResponse })
  fulfill(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PrivacyFulfillInput,
  ) {
    return this.requests.fulfill(requestClaims(r), id, dto, r.traceId);
  }
}
