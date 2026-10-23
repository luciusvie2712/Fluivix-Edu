import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
} from "@nestjs/swagger";
import {
  TokenResponse,
  MessageResponse,
  RevokeResponse,
  ResetResponse,
  ActivationResponse,
  MeResponse,
  TenantsResponse,
  SessionsResponse,
  InviteResponse,
  ErrorResponse,
} from "./response.dto";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import {
  AcceptInvitationDto,
  ContextDto,
  ForgotDto,
  InviteDto,
  LoginDto,
  ResetDto,
} from "./auth.dto";
import { AccessGuard, Public, TenantPermission } from "./guards";
import type { ApiRequest } from "./http";
import type { Claims } from "./security";
export const REFRESH_COOKIE = "__Host-fluivix-refresh";
export function requestClaims(req: ApiRequest): Claims {
  if (!req.claims) throw new UnauthorizedException();
  return req.claims;
}
function cookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 86400000,
  });
}
@ApiTags("identity")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
@ApiResponse({ status: 429, type: ErrorResponse })
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post("auth/login")
  @HttpCode(200)
  @ApiOkResponse({ type: TokenResponse })
  async login(
    @Body() dto: LoginDto,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      dto.email,
      dto.password,
      req.ip ?? "unknown",
    );
    cookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }
  @Public()
  @Post("auth/refresh")
  @HttpCode(200)
  @ApiOkResponse({ type: TokenResponse })
  async refresh(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies: unknown = req.cookies;
    const token =
      cookies && typeof cookies === "object" && REFRESH_COOKIE in cookies
        ? cookies[REFRESH_COOKIE]
        : undefined;
    if (typeof token !== "string") throw new UnauthorizedException();
    const result = await this.auth.refresh(token);
    cookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }
  @Post("auth/logout")
  @HttpCode(200)
  @ApiOkResponse({ type: RevokeResponse })
  async logout(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logout(requestClaims(req));
    res.clearCookie(REFRESH_COOKIE, {
      secure: true,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    return result;
  }
  @Post("auth/logout-all")
  @HttpCode(200)
  @ApiOkResponse({ type: RevokeResponse })
  logoutAll(@Req() req: ApiRequest) {
    return this.auth.logout(requestClaims(req), true);
  }
  @Post("auth/switch-context")
  @HttpCode(200)
  @ApiOkResponse({ type: TokenResponse })
  switchContext(@Body() dto: ContextDto, @Req() req: ApiRequest) {
    return this.auth.switchContext(requestClaims(req), dto.tenantId, dto.role);
  }
  @Public()
  @Post("auth/forgot-password")
  @HttpCode(200)
  @ApiOkResponse({ type: MessageResponse })
  forgot(@Body() dto: ForgotDto, @Req() req: ApiRequest) {
    return this.auth.forgotPassword(dto.email, req.ip ?? "unknown");
  }
  @Public()
  @Post("auth/reset-password")
  @HttpCode(200)
  @ApiOkResponse({ type: ResetResponse })
  reset(@Body() dto: ResetDto, @Req() req: ApiRequest) {
    return this.auth.resetPassword(dto.token, dto.password, req.traceId);
  }
  @Public()
  @Post("auth/accept-invitation")
  @HttpCode(200)
  @ApiOkResponse({ type: ActivationResponse })
  accept(@Body() dto: AcceptInvitationDto, @Req() req: ApiRequest) {
    return this.auth.acceptInvitation(dto, req.traceId);
  }
  @Get("me") @ApiOkResponse({ type: MeResponse }) me(@Req() req: ApiRequest) {
    return this.auth.me(requestClaims(req));
  }
  @Get("tenants") @ApiOkResponse({ type: TenantsResponse }) async tenants(
    @Req() req: ApiRequest,
  ) {
    return (await this.auth.me(requestClaims(req))).memberships;
  }
  @Get("me/sessions") @ApiOkResponse({ type: SessionsResponse }) sessions(
    @Req() req: ApiRequest,
  ) {
    return this.auth.sessions(requestClaims(req));
  }
  @Delete("me/sessions/:id") @ApiOkResponse({ type: RevokeResponse }) revoke(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: ApiRequest,
  ) {
    return this.auth.revokeSession(requestClaims(req), id);
  }
  @TenantPermission("staff.invite")
  @Post("staff")
  @ApiCreatedResponse({ type: InviteResponse })
  invite(@Body() dto: InviteDto, @Req() req: ApiRequest) {
    return this.auth.invite(
      requestClaims(req),
      dto.email,
      dto.role,
      req.traceId,
    );
  }
}
