import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import type { ApiRequest } from "./http";
import { requestClaims } from "./auth.controller";
import { currentSubscription, tenantUsage } from "./subscription-policy";
import { PlanView, QuotaUsageView } from "./platform-tenants.dto";
import { planView } from "./platform-tenants.service";
import { MetaDto } from "./response.dto";
class TenantSubscriptionView {
  @ApiProperty({ enum: ["ACTIVE", "PAST_DUE_GRACE", "READ_ONLY"] })
  mode!: string;
  @ApiProperty({ type: PlanView, nullable: true }) plan!: PlanView | null;
  @ApiProperty({ type: String, nullable: true, format: "date-time" }) endsAt!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  graceUntil!: string | null;
  @ApiProperty({ type: QuotaUsageView }) usage!: QuotaUsageView;
}
class TenantSubscriptionResponse {
  @ApiProperty({ type: TenantSubscriptionView }) data!: TenantSubscriptionView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@ApiTags("tenant")
@Controller("tenant")
@UseGuards(AccessGuard)
export class TenantSubscriptionController {
  constructor(private readonly db: Db) {}
  @Get("subscription")
  @TenantPermission("tenant.read")
  @ApiOkResponse({ type: TenantSubscriptionResponse })
  async subscription(@Req() req: ApiRequest) {
    const tenantId = requestClaims(req).tenantId!;
    const current = await currentSubscription(this.db, tenantId),
      tenant = await this.db.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      });
    const mode =
      tenant.status === "READ_ONLY" ||
      !current ||
      current.graceUntil <= new Date()
        ? "READ_ONLY"
        : current.endsAt <= new Date()
          ? "PAST_DUE_GRACE"
          : "ACTIVE";
    return {
      mode,
      plan: current ? planView(current.plan) : null,
      endsAt: current?.endsAt ?? null,
      graceUntil: current?.graceUntil ?? null,
      usage: await tenantUsage(this.db, tenantId),
    };
  }
}
