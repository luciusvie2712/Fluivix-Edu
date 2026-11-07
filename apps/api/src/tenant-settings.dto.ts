import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsInt,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
} from "class-validator";
import { MetaDto } from "./response.dto";
import { PlanLimitsDto } from "./platform-tenants.dto";

export class TenantSettingsInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsString() @Matches(/\S/) @Length(1, 150) name!: string;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsEmail()
  @Length(3, 254)
  contactEmail!: string | null;
  @ApiProperty() @IsString() @Length(1, 80) timezone!: string;
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Matches(/\S/)
  @Length(10, 500)
  reason!: string;
}
export class TenantSettingsView {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) contactEmail!: string | null;
  @ApiProperty() timezone!: string;
  @ApiProperty() version!: number;
  @ApiProperty() timezoneChangeAllowed!: boolean;
}
export class TenantSettingsResponse {
  @ApiProperty({ type: TenantSettingsView }) data!: TenantSettingsView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TenantUsageView {
  @ApiProperty() activeStudents!: number;
  @ApiProperty() reservedUsers!: number;
  @ApiProperty() activeOrDraftClasses!: number;
  @ApiProperty({
    type: String,
    description:
      "Exact stored base64 encrypted export payload bytes, including expired payloads awaiting purge. Excludes database rows/indexes/WAL/backups; P0 has no file uploads.",
  })
  managedExportBytes!: string;
  @ApiProperty({ type: PlanLimitsDto, nullable: true })
  limits!: PlanLimitsDto | null;
}
export class TenantUsageResponse {
  @ApiProperty({ type: TenantUsageView }) data!: TenantUsageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
