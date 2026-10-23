import { Controller, Get, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import { performance } from "node:perf_hooks";
import { Db } from "./db";
import { PlatformService } from "./platform.service";
import type { ApiRequest } from "./http";
import { MetaDto } from "./response.dto";
export class HealthView {
  @ApiProperty({ format: "date-time" }) checkedAt!: string;
  @ApiProperty() apiProcessUptimeSeconds!: number;
  @ApiProperty() databaseRoundTripMs!: number;
  @ApiProperty() pendingOutboxEvents!: number;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  oldestPendingEventAt!: string | null;
  @ApiProperty() uncertainMailDeliveries!: number;
  @ApiProperty({ enum: ["NOT_CONFIGURED"] }) workerHeartbeat!: "NOT_CONFIGURED";
}
export class HealthResponse {
  @ApiProperty({ type: HealthView }) data!: HealthView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@Controller("platform/system-health")
@ApiTags("platform-operations")
@ApiBearerAuth()
export class PlatformHealthController {
  constructor(
    private readonly db: Db,
    private readonly auth: PlatformService,
  ) {}
  @Get()
  @ApiOkResponse({ type: HealthResponse })
  async health(@Req() req: ApiRequest) {
    await this.auth.authorize(req.headers.authorization);
    const start = performance.now();
    await this.db.$queryRaw`SELECT 1`;
    const databaseRoundTripMs =
      Math.round((performance.now() - start) * 100) / 100;
    const [pendingOutboxEvents, oldest, uncertainMailDeliveries] =
      await this.db.$transaction(
        [
          this.db.outboxEvent.count({ where: { processedAt: null } }),
          this.db.outboxEvent.findFirst({
            where: { processedAt: null },
            orderBy: { createdAt: "asc" },
            select: { createdAt: true },
          }),
          this.db.mailDelivery.count({ where: { status: "UNKNOWN" } }),
        ],
        { isolationLevel: "RepeatableRead" },
      );
    return {
      checkedAt: new Date().toISOString(),
      apiProcessUptimeSeconds: Math.floor(process.uptime()),
      databaseRoundTripMs,
      pendingOutboxEvents,
      oldestPendingEventAt: oldest?.createdAt.toISOString() ?? null,
      uncertainMailDeliveries,
      workerHeartbeat: "NOT_CONFIGURED" as const,
    };
  }
}
