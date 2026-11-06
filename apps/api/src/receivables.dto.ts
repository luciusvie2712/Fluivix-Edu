import { ApiProperty } from "@nestjs/swagger";
import { InvoiceListView } from "./invoice.dto";
import { MetaDto, PageView } from "./response.dto";

export class ReceivablesSummaryView {
  @ApiProperty() issuedCount!: number;
  @ApiProperty() outstandingCount!: number;
  @ApiProperty({ type: String }) totalAmountVnd!: string;
  @ApiProperty({ type: String }) paidAmountVnd!: string;
  @ApiProperty({ type: String }) balanceVnd!: string;
  @ApiProperty({ type: String }) overdueAmountVnd!: string;
}
export class ReceivablesView {
  @ApiProperty({ format: "date-time" }) asOf!: string;
  @ApiProperty({ example: "Asia/Ho_Chi_Minh" }) timezone!: string;
  @ApiProperty({ type: ReceivablesSummaryView })
  summary!: ReceivablesSummaryView;
  @ApiProperty({ type: [InvoiceListView] }) invoices!: InvoiceListView[];
  @ApiProperty({ type: PageView }) page!: PageView;
}
export class ReceivablesResponse {
  @ApiProperty({ type: ReceivablesView }) data!: ReceivablesView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
