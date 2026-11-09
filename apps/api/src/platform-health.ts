import { ErrorResponse } from "./response.dto";
import { Controller, Get, Req } from "@nestjs/common";
import {
  ApiResponse,
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
import {
  readWorkerHealth,
  workerHealthStatuses,
  type WorkerHealthStatus,
} from "./worker-health";
import {
  operationalQueues,
  type OperationalQueue,
} from "./worker-telemetry-config";
export class OperationalQueueView {
  @ApiProperty({ enum: [...operationalQueues] }) name!: OperationalQueue;
  @ApiProperty({ enum: ["RUNNING", "DISABLED", "UNAVAILABLE"] })
  consumers!: "RUNNING" | "DISABLED" | "UNAVAILABLE";
  @ApiProperty() runningWorkers!: number;
  @ApiProperty() disabledWorkers!: number;
  @ApiProperty() paused!: boolean;
  @ApiProperty() waiting!: number;
  @ApiProperty() active!: number;
  @ApiProperty() delayed!: number;
  @ApiProperty() failed!: number;
  @ApiProperty() prioritized!: number;
  @ApiProperty() waitingChildren!: number;
  @ApiProperty() completed!: number;
}
export class WorkerHealthView {
  @ApiProperty({ enum: [...workerHealthStatuses] }) status!: WorkerHealthStatus;
  @ApiProperty({ type: Number, nullable: true }) freshWorkers!: number | null;
  @ApiProperty({ type: Number, nullable: true }) staleWorkers!: number | null;
  @ApiProperty({ type: Number, nullable: true }) invalidWorkers!: number | null;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  lastHeartbeatAt!: string | null;
  @ApiProperty({ type: [OperationalQueueView] })
  queues!: OperationalQueueView[];
}
export class HealthView {
  @ApiProperty({ format: "date-time" }) checkedAt!: string;
  @ApiProperty() apiProcessUptimeSeconds!: number;
  @ApiProperty() databaseRoundTripMs!: number;
  @ApiProperty() pendingOutboxEvents!: number;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  oldestPendingEventAt!: string | null;
  @ApiProperty() uncertainMailDeliveries!: number;
  @ApiProperty({ enum: [...workerHealthStatuses] })
  workerHeartbeat!: WorkerHealthStatus;
  @ApiProperty({ type: WorkerHealthView }) worker!: WorkerHealthView;
}
export class HealthResponse {
  @ApiProperty({ type: HealthView }) data!: HealthView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@Controller("platform/system-health")
@ApiTags("platform-operations")
@ApiBearerAuth("platformBearer")
@ApiResponse({ status: 401, type: ErrorResponse })
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
    const worker = await readWorkerHealth();
    return {
      checkedAt: new Date().toISOString(),
      apiProcessUptimeSeconds: Math.floor(process.uptime()),
      databaseRoundTripMs,
      pendingOutboxEvents,
      oldestPendingEventAt: oldest?.createdAt.toISOString() ?? null,
      uncertainMailDeliveries,
      workerHeartbeat: worker.status,
      worker,
    };
  }
}
