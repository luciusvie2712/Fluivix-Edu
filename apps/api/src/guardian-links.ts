import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ForgotDto, ListDto } from "./auth.dto";
import { requestClaims } from "./auth.controller";
import { AccessGuard, TenantPermission } from "./guards";
import type { ApiRequest } from "./http";
import { ErrorResponse, InviteResponse } from "./response.dto";
import { GuardianLinksService } from "./guardian.service";
import {
  GuardianDirectoryQuery,
  GuardianHistoryResponse,
  GuardianInvitationsResponse,
  GuardianLinkResponse,
  GuardianLinksQuery,
  GuardianLinksResponse,
  GuardianProvisionInput,
  GuardianUserResponse,
  GuardiansResponse,
  LinkInput,
  RevokeLink,
  VerifyLink,
} from "./guardian.dto";
export { GuardianLinksService } from "./guardian.service";
export * from "./guardian.dto";
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
  constructor(private service: GuardianLinksService) {}
  @Get("guardians") @ApiOkResponse({ type: GuardiansResponse }) directory(
    @Req() r: ApiRequest,
    @Query() q: GuardianDirectoryQuery,
  ) {
    return this.service.directory(requestClaims(r), q);
  }
  @Post("guardians")
  @ApiCreatedResponse({ type: GuardianUserResponse })
  provision(@Req() r: ApiRequest, @Body() d: GuardianProvisionInput) {
    return this.service.provision(requestClaims(r), d, r.traceId);
  }
  @Post("guardians/invite")
  @ApiCreatedResponse({ type: InviteResponse })
  inviteEmail(@Req() r: ApiRequest, @Body() d: ForgotDto) {
    return this.service.inviteEmail(requestClaims(r), d.email, r.traceId);
  }
  @Get("guardians/:userId")
  @ApiOkResponse({ type: GuardianUserResponse })
  detail(@Req() r: ApiRequest, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.service.detail(requestClaims(r), userId);
  }
  @Get("guardians/:userId/links")
  @ApiOkResponse({ type: GuardianLinksResponse })
  profileLinks(
    @Req() r: ApiRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Query() q: GuardianLinksQuery,
  ) {
    return this.service.profileLinks(requestClaims(r), userId, q);
  }
  @Get("guardians/:userId/invitations")
  @ApiOkResponse({ type: GuardianInvitationsResponse })
  invitations(
    @Req() r: ApiRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Query() q: ListDto,
  ) {
    return this.service.invitations(requestClaims(r), userId, q);
  }
  @Post("guardians/:userId/invite")
  @ApiCreatedResponse({ type: InviteResponse })
  invite(@Req() r: ApiRequest, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.service.invite(requestClaims(r), userId, r.traceId);
  }
  @Post("guardians/:userId/invitations/:invitationId/resend")
  @ApiCreatedResponse({ type: InviteResponse })
  resend(
    @Req() r: ApiRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ) {
    return this.service.invite(
      requestClaims(r),
      userId,
      r.traceId,
      invitationId,
    );
  }
  @Get("students/:id/guardians")
  @ApiOkResponse({ type: GuardianLinksResponse })
  links(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: GuardianLinksQuery,
  ) {
    return this.service.links(requestClaims(r), id, q);
  }
  @Post("students/:id/guardians")
  @ApiCreatedResponse({ type: GuardianLinkResponse })
  create(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: LinkInput,
  ) {
    return this.service.mutate(requestClaims(r), id, r.traceId, d);
  }
  @Post("students/:id/guardians/:linkId/approve")
  @ApiCreatedResponse({ type: GuardianLinkResponse })
  approve(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("linkId", ParseUUIDPipe) linkId: string,
    @Body() d: VerifyLink,
  ) {
    return this.service.mutate(requestClaims(r), id, r.traceId, d, linkId);
  }
  @Delete("students/:id/guardians/:linkId")
  @ApiOkResponse({ type: GuardianLinkResponse })
  revoke(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("linkId", ParseUUIDPipe) linkId: string,
    @Body() d: RevokeLink,
  ) {
    return this.service.mutate(requestClaims(r), id, r.traceId, d, linkId);
  }
  @Get("students/:id/guardians/:linkId/history")
  @ApiOkResponse({ type: GuardianHistoryResponse })
  history(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("linkId", ParseUUIDPipe) linkId: string,
    @Query() q: ListDto,
  ) {
    return this.service.history(requestClaims(r), id, linkId, q);
  }
}
