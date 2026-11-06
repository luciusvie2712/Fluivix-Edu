import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import { ErrorResponse } from "./response.dto";
import {
  FeePlanInput,
  FeeClassQuery,
  FeePlanQuery,
  FeePlanTermInput,
  FeePlansResponse,
  FeePlanTermsResponse,
  FinanceClassesResponse,
  FeePlanResponse,
  FinanceQuery,
  FinanceReason,
  InvoiceResponse,
  InvoiceRunInput,
  InvoiceRunResponse,
  InvoicesResponse,
  PaymentInput,
  PaymentResponse,
  PaymentsResponse,
} from "./finance.dto";
import { FinanceService } from "./finance.service";
import { ListDto } from "./auth.dto";
import {
  PaymentQuery,
  PaymentReceiptResponse,
  PaymentReceiptListResponse,
} from "./payment.dto";
import {
  InvoiceQuery,
  InvoiceListResponse,
  InvoiceDetailResponse,
  InvoiceItemsResponse,
  InvoicePreviewResponse,
  InvoiceFeeOptionsResponse,
  FinancialHistoryResponse,
  InvoiceFeeQuery,
} from "./invoice.dto";
@ApiTags("finance")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
@ApiResponse({ status: 429, type: ErrorResponse })
export class FinanceController {
  constructor(private service: FinanceService) {}
  @Post("fee-plans")
  @TenantPermission("finance.fee.write")
  @ApiCreatedResponse({ type: FeePlanResponse })
  fee(@Req() r: ApiRequest, @Body() dto: FeePlanInput) {
    return this.service.fee(requestClaims(r), dto, r.traceId);
  }
  @Get("fee-plans")
  @TenantPermission("finance.fee.write")
  @ApiOkResponse({ type: FeePlansResponse })
  fees(@Req() r: ApiRequest, @Query() q: FeePlanQuery) {
    return this.service.fees(requestClaims(r), q);
  }
  @Get("fee-plans/classes")
  @TenantPermission("finance.fee.write")
  @ApiOkResponse({ type: FinanceClassesResponse })
  feeClasses(@Req() r: ApiRequest, @Query() q: FeeClassQuery) {
    return this.service.feeClasses(requestClaims(r), q);
  }
  @Get("fee-plans/:id")
  @TenantPermission("finance.fee.write")
  @ApiOkResponse({ type: FeePlanResponse })
  feeDetail(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.feeDetail(requestClaims(r), id);
  }
  @Get("fee-plans/:id/terms")
  @TenantPermission("finance.fee.write")
  @ApiOkResponse({ type: FeePlanTermsResponse })
  feeTerms(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.feeTerms(requestClaims(r), id, q);
  }
  @Patch("fee-plans/:id")
  @TenantPermission("finance.fee.write")
  @ApiOkResponse({ type: FeePlanResponse })
  updateFee(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FeePlanTermInput,
  ) {
    return this.service.updateFee(requestClaims(r), id, dto, r.traceId);
  }
  @Post("invoices/generate-run")
  @TenantPermission("finance.invoice.write")
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiCreatedResponse({ type: InvoiceRunResponse })
  generate(
    @Req() r: ApiRequest,
    @Body() dto: InvoiceRunInput,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.generate(requestClaims(r), dto, key, r.traceId);
  }
  @Post("invoices/preview-run")
  @TenantPermission("finance.invoice.write")
  @ApiCreatedResponse({ type: InvoicePreviewResponse })
  preview(
    @Req() r: ApiRequest,
    @Body() dto: InvoiceRunInput,
    @Query() q: ListDto,
  ) {
    return this.service.preview(requestClaims(r), dto, q);
  }
  @Get("invoices/fee-options")
  @TenantPermission("finance.invoice.write")
  @ApiOkResponse({ type: InvoiceFeeOptionsResponse })
  invoiceFees(@Req() r: ApiRequest, @Query() q: InvoiceFeeQuery) {
    return this.service.invoiceFees(requestClaims(r), q);
  }
  @Get("invoices")
  @TenantPermission("finance.read")
  @ApiOkResponse({ type: InvoiceListResponse })
  invoices(@Req() r: ApiRequest, @Query() q: InvoiceQuery) {
    return this.service.invoices(requestClaims(r), q);
  }
  @Get("invoices/:id")
  @TenantPermission("finance.read", "finance.read.linked")
  @ApiOkResponse({ type: InvoiceDetailResponse })
  invoice(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.invoice(requestClaims(r), id);
  }
  @Get("invoices/:id/items")
  @TenantPermission("finance.read")
  @ApiOkResponse({ type: InvoiceItemsResponse })
  invoiceItems(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.invoiceItems(requestClaims(r), id, q);
  }
  @Get("invoices/:id/history")
  @TenantPermission("finance.read")
  @ApiOkResponse({ type: FinancialHistoryResponse })
  invoiceHistory(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.invoiceHistory(requestClaims(r), id, q);
  }
  @Get("mobile/guardian/students/:id/invoices")
  @TenantPermission("finance.read.linked")
  @ApiOkResponse({ type: InvoicesResponse })
  childInvoices(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: FinanceQuery,
  ) {
    return this.service.invoices(requestClaims(r), q, id);
  }
  @Post("invoices/:id/void")
  @TenantPermission("finance.invoice.write")
  @ApiCreatedResponse({ type: InvoiceResponse })
  voidInvoice(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FinanceReason,
  ) {
    return this.service.voidInvoice(
      requestClaims(r),
      id,
      dto.reason,
      r.traceId,
    );
  }
  @Post("payments")
  @TenantPermission("finance.payment.write")
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiCreatedResponse({ type: PaymentResponse })
  pay(
    @Req() r: ApiRequest,
    @Body() dto: PaymentInput,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.pay(requestClaims(r), dto, key, r.traceId);
  }
  @Get("payments")
  @TenantPermission("finance.read")
  @ApiOkResponse({ type: PaymentReceiptListResponse })
  payments(@Req() r: ApiRequest, @Query() q: PaymentQuery) {
    return this.service.payments(requestClaims(r), q);
  }
  @Get("mobile/guardian/students/:id/payments")
  @TenantPermission("finance.read.linked")
  @ApiOkResponse({ type: PaymentsResponse })
  childPayments(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: FinanceQuery,
  ) {
    return this.service.payments(requestClaims(r), q, id);
  }
  @Get("payments/:id")
  @TenantPermission("finance.read", "finance.read.linked")
  @ApiOkResponse({ type: PaymentReceiptResponse })
  payment(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.payment(requestClaims(r), id);
  }
  @Get("payments/:id/history")
  @TenantPermission("finance.read")
  @ApiOkResponse({ type: FinancialHistoryResponse })
  paymentHistory(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.paymentHistory(requestClaims(r), id, q);
  }
  @Post("payments/:id/reverse")
  @TenantPermission("finance.payment.write")
  @ApiCreatedResponse({ type: PaymentResponse })
  reverse(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FinanceReason,
  ) {
    return this.service.reverse(requestClaims(r), id, dto.reason, r.traceId);
  }
}
