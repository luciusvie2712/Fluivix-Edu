import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";
export class PlanLimitsDto {
  @ApiProperty() @IsInt() @Min(1) @Max(10000000) maxStudents!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(1000000) maxClasses!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(10000000) maxUsers!: number;
  @ApiProperty({ type: String, description: "Exact decimal byte count" })
  @Matches(/^(0|[1-9]\d{0,18})$/)
  maxStorageBytes!: string;
}
export class PlanFlagsDto {
  @ApiProperty() @IsBoolean() attendance!: boolean;
  @ApiProperty() @IsBoolean() grades!: boolean;
  @ApiProperty() @IsBoolean() finance!: boolean;
  @ApiProperty() @IsBoolean() reports!: boolean;
}
export class CreatePlanDto {
  @ApiProperty() @Matches(/^[A-Z0-9_-]{2,40}$/) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) @Matches(/\S/) name!: string;
  @ApiProperty({
    type: String,
    description: "Exact integer VND decimal string",
  })
  @Matches(/^(0|[1-9]\d{0,18})$/)
  monthlyPriceVnd!: string;
  @ApiProperty({ type: PlanLimitsDto })
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits!: PlanLimitsDto;
  @ApiPropertyOptional({ type: PlanFlagsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanFlagsDto)
  featureFlags?: PlanFlagsDto;
}
export class SubscriptionDatesDto {
  @ApiProperty() @IsUUID() planId!: string;
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  startsAt!: string;
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  endsAt!: string;
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  graceUntil!: string;
}
export class CreateTenantDto extends SubscriptionDatesDto {
  @ApiProperty() @Matches(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/) slug!: string;
  @ApiProperty() @IsString() @Length(1, 150) @Matches(/\S/) name!: string;
  @ApiProperty() @IsEmail() @Length(3, 254) ownerEmail!: string;
  @ApiProperty() @IsString() @Length(1, 80) timezone!: string;
}
export class LifecycleDto {
  @ApiProperty() @IsString() @Length(10, 500) @Matches(/\S/) reason!: string;
}
export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  @Matches(/\S/)
  name?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsEmail()
  @Length(3, 254)
  contactEmail?: string | null;
}
export class PlatformTenantListDto extends ListDto {
  @ApiPropertyOptional({
    enum: [
      "PENDING_ACTIVATION",
      "ACTIVE",
      "PAST_DUE_GRACE",
      "READ_ONLY",
      "SUSPENDED",
      "TERMINATED",
    ],
  })
  @IsOptional()
  @Matches(
    /^(PENDING_ACTIVATION|ACTIVE|PAST_DUE_GRACE|READ_ONLY|SUSPENDED|TERMINATED)$/,
  )
  status?: string;
}
export class PlanView {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String }) monthlyPriceVnd!: string;
  @ApiProperty({ type: PlanLimitsDto }) limits!: PlanLimitsDto;
  @ApiProperty() status!: string;
  @ApiProperty({ type: PlanFlagsDto }) featureFlags!: PlanFlagsDto;
}
export class PlanResponse {
  @ApiProperty({ type: PlanView }) data!: PlanView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PlansResponse {
  @ApiProperty({ type: [PlanView] }) data!: PlanView[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class SubscriptionView {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ type: PlanView }) plan!: PlanView;
  @ApiProperty() status!: string;
  @ApiProperty({ format: "date-time" }) startsAt!: string;
  @ApiProperty({ format: "date-time" }) endsAt!: string;
  @ApiProperty({ format: "date-time" }) graceUntil!: string;
}
export class SubscriptionResponse {
  @ApiProperty({ type: SubscriptionView }) data!: SubscriptionView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class SubscriptionsResponse {
  @ApiProperty({ type: [SubscriptionView] }) data!: SubscriptionView[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PlatformTenantView {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) contactEmail!: string | null;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
}
export class PlatformTenantResponse {
  @ApiProperty({ type: PlatformTenantView }) data!: PlatformTenantView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PlatformTenantsResponse {
  @ApiProperty({ type: [PlatformTenantView] }) data!: PlatformTenantView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class OwnerInvitationView {
  @ApiProperty() email!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
  @ApiProperty({ format: "date-time", type: String, nullable: true }) usedAt!:
    | string
    | null;
}
export class QuotaUsageView {
  @ApiProperty() activeStudents!: number;
  @ApiProperty() reservedUsers!: number;
}
export class PlatformTenantDetailView extends PlatformTenantView {
  @ApiProperty({ type: PlanView, nullable: true })
  currentPlan!: PlanView | null;
  @ApiProperty({ type: QuotaUsageView }) usage!: QuotaUsageView;
  @ApiProperty({ type: OwnerInvitationView, nullable: true })
  ownerInvitation!: OwnerInvitationView | null;
}
export class PlatformTenantDetailResponse {
  @ApiProperty({ type: PlatformTenantDetailView })
  data!: PlatformTenantDetailView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
