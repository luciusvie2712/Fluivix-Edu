import { ApiProperty, ApiPropertyOptional, PickType } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from "class-validator";
import { ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";
export class ReminderHistoryQuery extends PickType(ListDto, [
  "page",
  "limit",
] as const) {}
export class ReminderPolicyInput {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) version!: number;
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty() @IsBoolean() confirmed!: boolean;
  @ApiProperty() @IsString() @Matches(/\S/) @Length(3, 500) reason!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @Length(3, 200)
  approvalRef?: string;
}
export class ReminderHoldInput {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) version!: number;
  @ApiProperty() @IsBoolean() held!: boolean;
  @ApiProperty() @IsBoolean() confirmed!: boolean;
  @ApiPropertyOptional({ enum: ["MANUAL", "PENDING_RECONCILIATION"] })
  @IsOptional()
  @IsIn(["MANUAL", "PENDING_RECONCILIATION"])
  category?: string;
  @ApiProperty() @IsString() @Matches(/\S/) @Length(3, 500) reason!: string;
}
export class ReminderPresetView {
  @ApiProperty() code!: string;
  @ApiProperty() localStart!: string;
  @ApiProperty() localEnd!: string;
  @ApiProperty() maxStagesPerInvoice!: number;
  @ApiProperty({ type: [Number] }) offsets!: number[];
  @ApiProperty() catchUp!: boolean;
}
export class ReminderPolicyView {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: ReminderPresetView }) preset!: ReminderPresetView;
  @ApiProperty({ type: String, nullable: true }) enabledSince!: string | null;
  @ApiProperty({ type: String, nullable: true }) approvedBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) approvedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) approvalRef!: string | null;
}
export class ReminderPolicyResponse {
  @ApiProperty({ type: ReminderPolicyView }) data!: ReminderPolicyView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ReminderPolicyEventView {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() reason!: string;
  @ApiProperty({ type: String, nullable: true }) approvalRef!: string | null;
  @ApiProperty() actorId!: string;
  @ApiProperty() createdAt!: string;
}
export class ReminderPolicyHistoryResponse {
  @ApiProperty({ type: [ReminderPolicyEventView] })
  data!: ReminderPolicyEventView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ReminderHoldEventView {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty() held!: boolean;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty() reason!: string;
  @ApiProperty() actorId!: string;
  @ApiProperty() createdAt!: string;
}
export class ReminderStageView {
  @ApiProperty({ enum: ["BEFORE_3", "AFTER_1", "AFTER_7"] }) stage!: string;
  @ApiProperty() batchId!: string;
  @ApiProperty() localDay!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() inboxRecipients!: number;
  @ApiProperty({ type: [String] }) deliveryStatuses!: string[];
}
export class ReminderInvoiceView {
  @ApiProperty() invoiceId!: string;
  @ApiProperty() held!: boolean;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [ReminderStageView] }) stages!: ReminderStageView[];
  @ApiProperty({ type: [ReminderHoldEventView] })
  events!: ReminderHoldEventView[];
  @ApiProperty({ type: PageView }) page!: PageView;
}
export class ReminderInvoiceResponse {
  @ApiProperty({ type: ReminderInvoiceView }) data!: ReminderInvoiceView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
