import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
@ApiTags("finance")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class FinanceController {
  constructor(private service: FinanceService) {}
  @Post("fee-plans")
  @TenantPermission("finance.invoice.write")
  @ApiCreatedResponse({ type: FeePlanResponse })
  fee(@Req() r: ApiRequest, @Body() dto: FeePlanInput) {
    return this.service.fee(requestClaims(r), dto, r.traceId);
  }
  @Post("invoices/generate-run")
  @TenantPermission("finance.invoice.write")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiCreatedResponse({ type: InvoiceRunResponse })
  generate(
    @Req() r: ApiRequest,
    @Body() dto: InvoiceRunInput,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.generate(requestClaims(r), dto, key, r.traceId);
  }
  @Get("invoices")
  @TenantPermission("finance.read")
  @ApiOkResponse({ type: InvoicesResponse })
  invoices(@Req() r: ApiRequest, @Query() q: FinanceQuery) {
    return this.service.invoices(requestClaims(r), q);
  }
  @Get("invoices/:id")
  @TenantPermission("finance.read", "finance.read.linked")
  @ApiOkResponse({ type: InvoiceResponse })
  invoice(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.invoice(requestClaims(r), id);
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
  @ApiHeader({ name: "Idempotency-Key", required: true })
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
  @ApiOkResponse({ type: PaymentsResponse })
  payments(@Req() r: ApiRequest, @Query() q: FinanceQuery) {
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
  @ApiOkResponse({ type: PaymentResponse })
  payment(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.payment(requestClaims(r), id);
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
