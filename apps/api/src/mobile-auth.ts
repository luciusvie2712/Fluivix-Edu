import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { IsString, Length } from "class-validator";
import { LoginDto } from "./auth.dto";
import { AuthService } from "./auth.service";
import { ErrorResponse, MetaDto, TokenDto } from "./response.dto";
import type { ApiRequest } from "./http";

export class NativeRefreshDto {
  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Length(43, 43)
  refreshToken!: string;
}
export class NativeTokens extends TokenDto {
  @ApiProperty({
    description: "Store only in OS SecureStore. Rotated at every refresh.",
  })
  refreshToken!: string;
}
export class NativeTokenResponse {
  @ApiProperty({ type: NativeTokens }) data!: NativeTokens;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@ApiTags("native-identity")
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
@ApiResponse({ status: 429, type: ErrorResponse })
@Controller("mobile/auth")
export class MobileAuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("login")
  @HttpCode(200)
  @ApiOkResponse({ type: NativeTokenResponse })
  login(@Body() dto: LoginDto, @Req() req: ApiRequest) {
    return this.auth.login(
      dto.email,
      dto.password,
      req.ip ?? "unknown",
      "MOBILE",
    );
  }
  @Post("refresh")
  @HttpCode(200)
  @ApiOkResponse({ type: NativeTokenResponse })
  async refresh(@Body() dto: NativeRefreshDto, @Req() req: ApiRequest) {
    await this.auth.limit("native-refresh-ip", req.ip ?? "unknown");
    return this.auth.refresh(dto.refreshToken, "MOBILE");
  }
}
