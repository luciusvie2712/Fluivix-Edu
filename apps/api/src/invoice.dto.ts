import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsOptional, IsUUID, Matches } from "class-validator";
import { InvoiceView, FinanceQuery } from "./finance.dto";
import { MetaDto, PageView } from "./response.dto";
import { ListDto } from "./auth.dto";

export class InvoiceFeeQuery extends ListDto {
  @ApiPropertyOptional({ enum: ["true", "false"] })
  @IsOptional()
  @IsIn(["true", "false"])
  includeArchived?: string;
}

export class InvoiceQuery extends FinanceQuery {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  classId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  feePlanId?: string;
  @ApiPropertyOptional({
    enum: ["UNPAID", "PARTIAL", "PAID", "OVERDUE", "VOID"],
  })
  @IsOptional()
  @IsIn(["UNPAID", "PARTIAL", "PAID", "OVERDUE", "VOID"])
  paymentStatus?: string;
  @ApiPropertyOptional({ description: "YYYY-MM or COURSE" })
  @IsOptional()
  @Matches(/^(\d{4}-(0[1-9]|1[0-2])|COURSE)$/)
  periodKey?: string;
  @ApiPropertyOptional({
    format: "date",
    description: "Inclusive due-date boundary in Asia/Ho_Chi_Minh",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from?: string;
  @ApiPropertyOptional({
    format: "date",
    description: "Inclusive due-date boundary in Asia/Ho_Chi_Minh",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to?: string;
}
export class InvoiceListView extends InvoiceView {
  @ApiProperty() studentCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() classCode!: string;
  @ApiProperty() className!: string;
  @ApiProperty() feePlanId!: string;
  @ApiProperty() periodKey!: string;
  @ApiProperty() billingModel!: string;
}
export class InvoiceListResponse {
  @ApiProperty({ type: [InvoiceListView] }) data!: InvoiceListView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class InvoiceDetailView extends InvoiceListView {
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Internal reason is redacted for Guardian",
  })
  voidReason!: string | null;
  @ApiProperty() itemsCount!: number;
}
export class InvoiceDetailResponse {
  @ApiProperty({ type: InvoiceDetailView }) data!: InvoiceDetailView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class InvoiceItemView {
  @ApiProperty() id!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String }) totalAmountVnd!: string;
}
export class InvoiceItemsResponse {
  @ApiProperty({ type: [InvoiceItemView] }) data!: InvoiceItemView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class InvoiceFeeOptionView {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() classCode!: string;
  @ApiProperty() className!: string;
  @ApiProperty() billingModel!: string;
  @ApiProperty({ format: "date" }) validFrom!: string;
  @ApiProperty({ type: String, nullable: true, format: "date" }) validTo!:
    | string
    | null;
  @ApiProperty() version!: number;
}
export class InvoiceFeeOptionsResponse {
  @ApiProperty({ type: [InvoiceFeeOptionView] }) data!: InvoiceFeeOptionView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class InvoicePreviewStudent {
  @ApiProperty() studentId!: string;
  @ApiProperty() studentCode!: string;
  @ApiProperty() fullName!: string;
}
export class InvoicePreviewView {
  @ApiProperty() feePlanId!: string;
  @ApiProperty() planVersion!: number;
  @ApiProperty() classCode!: string;
  @ApiProperty() className!: string;
  @ApiProperty() periodKey!: string;
  @ApiProperty() appliedName!: string;
  @ApiProperty({ type: String }) amountVnd!: string;
  @ApiProperty() eligibleCount!: number;
  @ApiProperty({ type: String }) totalAmountVnd!: string;
  @ApiProperty() dueAt!: string;
  @ApiProperty() fingerprint!: string;
  @ApiProperty({ type: String, nullable: true }) existingRunId!: string | null;
  @ApiProperty({ type: [InvoicePreviewStudent] })
  students!: InvoicePreviewStudent[];
  @ApiProperty({ type: PageView }) page!: PageView;
}
export class InvoicePreviewResponse {
  @ApiProperty({ type: InvoicePreviewView }) data!: InvoicePreviewView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class FinancialHistoryView {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ type: String, nullable: true }) actorUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorDisplayName!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty() traceId!: string;
  @ApiProperty() recordedAt!: string;
}
export class FinancialHistoryResponse {
  @ApiProperty({ type: [FinancialHistoryView] }) data!: FinancialHistoryView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
