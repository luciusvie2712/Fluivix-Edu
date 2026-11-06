import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsIn, IsOptional, Matches } from "class-validator";
import { FinanceQuery, PaymentView } from "./finance.dto";
import { MetaDto, PageView } from "./response.dto";

export class PaymentQuery extends FinanceQuery {
  @ApiPropertyOptional({ enum: ["CASH", "BANK_TRANSFER"] })
  @IsOptional()
  @IsIn(["CASH", "BANK_TRANSFER"])
  method?: string;
  @ApiPropertyOptional({ enum: ["CONFIRMED", "REVERSED"] })
  @IsOptional()
  @IsIn(["CONFIRMED", "REVERSED"])
  status?: string;
  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from?: string;
  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to?: string;
}
export class PaymentReceiptView extends PaymentView {
  @ApiProperty() studentCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({
    description: "Current centre name, not an issue-time snapshot",
  })
  centreName!: string;
  @ApiProperty({ type: String, nullable: true }) externalReference!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) receivedBy!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Actual recorded actor snapshot; unknown legacy names and Guardian reads are null",
  })
  receiverDisplayName!: string | null;
  @ApiProperty({ type: String, nullable: true }) reversalReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) reversalActorName!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) reversedAt!: string | null;
}
export class PaymentReceiptResponse {
  @ApiProperty({ type: PaymentReceiptView }) data!: PaymentReceiptView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PaymentReceiptListResponse {
  @ApiProperty({ type: [PaymentReceiptView] }) data!: PaymentReceiptView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
