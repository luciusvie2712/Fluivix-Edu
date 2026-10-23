import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { PlatformService } from "./platform.service";
import { LoginDto } from "./auth.dto";
import type { ApiRequest } from "./http";
import {
  ChallengeResponse,
  PlatformMeResponse,
  PlatformOverviewResponse,
  PlatformRecoverDto,
  PlatformTokenResponse,
  PlatformVerifyDto,
} from "./platform.dto";
import { ErrorResponse, RevokeResponse, TokenResponse } from "./response.dto";
const cookieName = "__Host-fluivix-platform";
function setCookie(res: Response, token: string) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 3600000,
  });
}
@ApiTags("platform-identity")
@ApiBearerAuth()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
@ApiResponse({ status: 429, type: ErrorResponse })
@Controller("platform")
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}
  @Post("auth/login")
  @HttpCode(200)
  @ApiOkResponse({ type: ChallengeResponse })
  login(@Body() dto: LoginDto, @Req() req: ApiRequest) {
    this.platform.requireOrigin(req.headers.origin);
    return this.platform.login(dto.email, dto.password, req.ip ?? "unknown");
  }
  @Post("auth/verify")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformTokenResponse })
  async verify(
    @Body() dto: PlatformVerifyDto,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.platform.requireOrigin(req.headers.origin);
    const result = await this.platform.verify(
      dto.challengeToken,
      dto.code,
      req.traceId,
    );
    setCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      recoveryCodes: result.recoveryCodes,
    };
  }
  @Post("auth/recover")
  @HttpCode(200)
  @ApiOkResponse({ type: ChallengeResponse })
  recover(@Body() dto: PlatformRecoverDto, @Req() req: ApiRequest) {
    this.platform.requireOrigin(req.headers.origin);
    return this.platform.recover(
      dto.challengeToken,
      dto.recoveryCode,
      req.traceId,
    );
  }
  @Post("auth/refresh")
  @HttpCode(200)
  @ApiOkResponse({ type: TokenResponse })
  async refresh(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.platform.requireOrigin(req.headers.origin);
    const cookies: unknown = req.cookies;
    const token =
      cookies && typeof cookies === "object" && cookieName in cookies
        ? cookies[cookieName]
        : "";
    const result = await this.platform.refresh(
      typeof token === "string" ? token : "",
    );
    setCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }
  @Post("auth/logout")
  @HttpCode(200)
  @ApiOkResponse({ type: RevokeResponse })
  async logout(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.platform.requireOrigin(req.headers.origin);
    const result = await this.platform.logout(
      req.headers.authorization,
      req.traceId,
    );
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
    return result;
  }
  @Get("me")
  @ApiOkResponse({ type: PlatformMeResponse })
  async me(@Req() req: ApiRequest) {
    const { id, displayName, role } = await this.platform.authorize(
      req.headers.authorization,
    );
    return { id, displayName, role };
  }
  @Get("overview")
  @ApiOkResponse({ type: PlatformOverviewResponse })
  overview(@Req() req: ApiRequest) {
    return this.platform.overview(req.headers.authorization);
  }
}
