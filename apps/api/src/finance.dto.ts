import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";
export class FeePlanInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() classId!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ enum: ["MONTHLY", "COURSE"] })
  @IsIn(["MONTHLY", "COURSE"])
  billingModel!: string;
  @ApiProperty({ type: String, example: "1200000" })
  @Matches(/^(0|[1-9]\d{0,18})$/)
  amountVnd!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  validFrom!: string;
  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  validTo?: string;
}
export class FeePlanView extends FeePlanInput {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
}
export class FeePlanResponse {
  @ApiProperty({ type: FeePlanView }) data!: FeePlanView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class InvoiceRunInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() feePlanId!: string;
  @ApiProperty({ description: "YYYY-MM for monthly, COURSE for whole course" })
  @Matches(/^(\d{4}-(0[1-9]|1[0-2])|COURSE)$/)
  periodKey!: string;
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  dueAt!: string;
}
export class InvoiceView {
  @ApiProperty() id!: string;
  @ApiProperty() studentId!: string;
  @ApiProperty() invoiceNo!: string;
  @ApiProperty({ type: String, example: "1200000" }) totalAmountVnd!: string;
  @ApiProperty({ type: String }) paidAmountVnd!: string;
  @ApiProperty({ type: String }) balanceVnd!: string;
  @ApiProperty() billingState!: string;
  @ApiProperty() paymentStatus!: string;
  @ApiProperty({ format: "date-time" }) dueAt!: string;
  @ApiProperty({ format: "date-time" }) issuedAt!: string;
}
export class InvoiceResponse {
  @ApiProperty({ type: InvoiceView }) data!: InvoiceView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class InvoicesResponse {
  @ApiProperty({ type: [InvoiceView] }) data!: InvoiceView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class InvoiceRunView {
  @ApiProperty() runId!: string;
  @ApiProperty({ type: [InvoiceView] }) invoices!: InvoiceView[];
}
export class InvoiceRunResponse {
  @ApiProperty({ type: InvoiceRunView }) data!: InvoiceRunView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class AllocationInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() invoiceId!: string;
  @ApiProperty({ type: String }) @Matches(/^[1-9]\d{0,18}$/) amountVnd!: string;
}
export class PaymentInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() studentId!: string;
  @ApiProperty({ enum: ["CASH", "BANK_TRANSFER"] })
  @IsIn(["CASH", "BANK_TRANSFER"])
  method!: string;
  @ApiProperty({ type: String })
  @Matches(/^[1-9]\d{0,18}$/)
  receivedAmountVnd!: string;
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  receivedAt!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 150)
  externalReference?: string;
  @ApiProperty({ type: [AllocationInput] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((r: AllocationInput) => r.invoiceId)
  @ValidateNested({ each: true })
  @Type(() => AllocationInput)
  allocations!: AllocationInput[];
}
export class PaymentView {
  @ApiProperty() id!: string;
  @ApiProperty() studentId!: string;
  @ApiProperty() receiptNo!: string;
  @ApiProperty() method!: string;
  @ApiProperty({ type: String }) receivedAmountVnd!: string;
  @ApiProperty({ type: String }) unallocatedAmountVnd!: string;
  @ApiProperty({ format: "date-time" }) receivedAt!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [AllocationInput] }) allocations!: AllocationInput[];
  @ApiProperty({ type: [InvoiceView] }) invoiceBalances!: InvoiceView[];
  @ApiProperty({
    description: "Internal receipt, not a VAT invoice or bank verification",
  })
  receiptNotice!: string;
}
export class PaymentResponse {
  @ApiProperty({ type: PaymentView }) data!: PaymentView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PaymentsResponse {
  @ApiProperty({ type: [PaymentView] }) data!: PaymentView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class FinanceReason {
  @ApiProperty() @IsString() @Length(10, 500) reason!: string;
}
export class FinanceQuery extends ListDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  studentId?: string;
}
