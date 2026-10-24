import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { ListDto } from "./auth.dto";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import { Paged } from "./http";
import { StudentDetailResponse, StudentListResponse } from "./response.dto";
import { StudentsService } from "./students";

@ApiTags("mobile-people")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller("mobile/guardian/students")
export class MobilePeopleController {
  constructor(
    private db: Db,
    private students: StudentsService,
  ) {}
  @Get()
  @TenantPermission("student.read.linked")
  @ApiOkResponse({ type: StudentListResponse })
  async children(@Req() req: ApiRequest, @Query() query: ListDto) {
    const claims = requestClaims(req);
    const where = {
      tenantId: claims.tenantId!,
      guardianLinks: {
        some: {
          guardianUserId: claims.sub,
          status: "ACTIVE",
          verifiedBy: { not: null },
          verifiedAt: { not: null },
        },
      },
    };
    const [items, total] = await this.db.$transaction([
      this.db.student.findMany({
        where,
        select: { id: true, studentCode: true, fullName: true, status: true },
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      }),
      this.db.student.count({ where }),
    ]);
    return new Paged(items, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  }
  @Get(":id/profile")
  @TenantPermission("student.read.linked")
  @ApiOkResponse({ type: StudentDetailResponse })
  profile(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.students.detail(requestClaims(req), id);
  }
}
