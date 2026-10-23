import {
  Controller,
  Get,
  Injectable,
  Query,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from "class-validator";
import type { Prisma } from "@prisma/client";
import { ListDto } from "./auth.dto";
import { Db } from "./db";
import { Paged, type ApiRequest } from "./http";
import { PlatformService } from "./platform.service";
import { ErrorResponse, MetaDto, PageView } from "./response.dto";

export class AuditQueryDto extends ListDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  actorId?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  action?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  resourceId?: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  until?: string;
}
export class PlatformAuditView {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) actorId!: string;
  @ApiProperty() action!: string;
  @ApiProperty() resourceId!: string;
  @ApiProperty() traceId!: string;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
}
export class PlatformAuditResponse {
  @ApiProperty({ type: [PlatformAuditView] }) data!: PlatformAuditView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@Injectable()
export class PlatformAuditService {
  constructor(
    private readonly db: Db,
    private readonly platform: PlatformService,
  ) {}
  async list(authorization: string | undefined, query: AuditQueryDto) {
    await this.platform.authorize(authorization);
    if (query.search !== undefined)
      throw new UnprocessableEntityException(
        "Chọn bộ lọc hành động, người thực hiện, tài nguyên hoặc thời gian.",
      );
    for (const value of [query.from, query.until]) {
      if (value && !/T.*(Z|[+-]\d{2}:\d{2})$/.test(value))
        throw new UnprocessableEntityException("Thời gian cần có múi giờ.");
    }
    if (
      query.from &&
      query.until &&
      new Date(query.from) >= new Date(query.until)
    )
      throw new UnprocessableEntityException(
        "Thời gian bắt đầu phải trước thời gian kết thúc.",
      );
    const where: Prisma.PlatformAuditWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.from || query.until
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.until ? { lt: new Date(query.until) } : {}),
            },
          }
        : {}),
    };
    // Deliberate allowlist: never serialize arbitrary payloads, reasons, identities or secrets.
    const [total, rows] = await this.db.$transaction(
      [
        this.db.platformAudit.count({ where }),
        this.db.platformAudit.findMany({
          where,
          select: {
            id: true,
            actorId: true,
            action: true,
            resourceId: true,
            traceId: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return new Paged(rows, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  }
}
@Controller("platform/audit-logs")
@ApiTags("platform-audit")
@ApiBearerAuth()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class PlatformAuditController {
  constructor(private readonly service: PlatformAuditService) {}
  @Get()
  @ApiOkResponse({ type: PlatformAuditResponse })
  list(@Req() req: ApiRequest, @Query() query: AuditQueryDto) {
    return this.service.list(req.headers.authorization, query);
  }
}
