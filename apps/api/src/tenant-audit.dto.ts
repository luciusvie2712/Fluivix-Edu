import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from "class-validator";
import { ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";
export class TenantAuditQuery extends ListDto {
  @ApiProperty({ format: "date" })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to!: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  actorId?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  action?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  resourceId?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  traceId?: string;
}
export class TenantAuditRow {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true }) actorId!:
    | string
    | null;
  @ApiProperty() action!: string;
  @ApiProperty() resourceId!: string;
  @ApiProperty() traceId!: string;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
}
export class TenantAuditContext {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() asOf!: string;
  @ApiProperty({ enum: ["ALL", "OPERATIONS", "FINANCE"] }) scope!:
    | "ALL"
    | "OPERATIONS"
    | "FINANCE";
  @ApiProperty() exportAllowed!: boolean;
}
export class TenantAuditView extends TenantAuditContext {
  @ApiProperty({ type: [TenantAuditRow] }) rows!: TenantAuditRow[];
  @ApiProperty({ type: PageView }) page!: PageView;
}
export class TenantAuditResponse {
  @ApiProperty({ type: TenantAuditView }) data!: TenantAuditView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TenantAuditCsvView extends TenantAuditContext {
  @ApiProperty() csv!: string;
  @ApiProperty() filename!: string;
  @ApiProperty() rowCount!: number;
}
export class TenantAuditCsvResponse {
  @ApiProperty({ type: TenantAuditCsvView }) data!: TenantAuditCsvView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
