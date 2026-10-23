import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, Length } from "class-validator";
import { MetaDto } from "./response.dto";
export class PlatformVerifyDto {
  @ApiProperty() @IsString() @Length(43, 43) challengeToken!: string;
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}
export class PlatformRecoverDto {
  @ApiProperty() @IsString() @Length(43, 43) challengeToken!: string;
  @ApiProperty() @Matches(/^[a-f0-9]{24}$/) recoveryCode!: string;
}
export class ChallengeView {
  @ApiProperty() challengeToken!: string;
  @ApiProperty() enrollmentRequired!: boolean;
  @ApiProperty({ type: String, nullable: true }) secret!: string | null;
}
export class ChallengeResponse {
  @ApiProperty({ type: ChallengeView }) data!: ChallengeView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PlatformTokenView {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ type: [String] }) recoveryCodes!: string[];
}
export class PlatformTokenResponse {
  @ApiProperty({ type: PlatformTokenView }) data!: PlatformTokenView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PlatformMeView {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ["platform_admin"] }) role!: string;
}
export class PlatformMeResponse {
  @ApiProperty({ type: PlatformMeView }) data!: PlatformMeView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TenantCountView {
  @ApiProperty() status!: string;
  @ApiProperty() count!: number;
}
export class PlatformOverviewView {
  @ApiProperty({ type: [TenantCountView] }) tenantsByStatus!: TenantCountView[];
  @ApiProperty({ format: "date-time" }) observedAt!: string;
}
export class PlatformOverviewResponse {
  @ApiProperty({ type: PlatformOverviewView }) data!: PlatformOverviewView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
