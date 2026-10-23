import {
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiProperty,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from "@nestjs/swagger";
import { StudentResponse, StudentListResponse } from "./response.dto";
import { Paged } from "./http";
import { IsString, Length, Matches } from "class-validator";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import type { Claims } from "./security";
import { ListDto } from "./auth.dto";
import { assertQuota } from "./subscription-policy";
export class CreateStudentDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Za-z0-9_-]+$/)
  studentCode!: string;
  @ApiProperty({ maxLength: 150 })
  @IsString()
  @Length(1, 150)
  @Matches(/\S/)
  fullName!: string;
}
@Injectable()
export class StudentsService {
  constructor(private readonly db: Db) {}
  async list(claims: Claims, query: ListDto) {
    const where = {
      tenantId: claims.tenantId!,
      ...(query.search
        ? { fullName: { contains: query.search, mode: "insensitive" as const } }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.student.findMany({
        where,
        select: { id: true, studentCode: true, fullName: true, status: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
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
  async detail(claims: Claims, id: string) {
    const student = await this.db.student.findFirst({
      where: { id, tenantId: claims.tenantId! },
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        status: true,
        userId: true,
      },
    });
    if (!student) throw new NotFoundException("Không tìm thấy học viên.");
    if (claims.role === "student" && student.userId !== claims.sub)
      throw new NotFoundException("Không tìm thấy học viên.");
    if (claims.role === "guardian") {
      const linked = await this.db.guardianLink.findFirst({
        where: {
          tenantId: claims.tenantId!,
          studentId: id,
          guardianUserId: claims.sub,
          status: "ACTIVE",
          verifiedAt: { not: null },
          verifiedBy: { not: null },
        },
      });
      if (!linked) throw new NotFoundException("Không tìm thấy học viên.");
    }
    return {
      id: student.id,
      studentCode: student.studentCode,
      fullName: student.fullName,
      status: student.status,
    };
  }
  async create(claims: Claims, dto: CreateStudentDto, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${claims.tenantId}::uuid FOR UPDATE`;
      await assertQuota(tx, claims.tenantId!, "students");
      const student = await tx.student.create({
        data: {
          tenantId: claims.tenantId!,
          studentCode: dto.studentCode,
          fullName: dto.fullName.trim(),
        },
        select: { id: true, studentCode: true, fullName: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: claims.tenantId!,
          actorUserId: claims.sub,
          action: "student.create",
          resourceId: student.id,
          traceId,
        },
      });
      return student;
    });
  }
}
@ApiTags("students")
@UseGuards(AccessGuard)
@Controller("students")
export class StudentsController {
  constructor(private readonly students: StudentsService) {}
  @TenantPermission("student.read", "student.read.limited")
  @Get()
  @ApiOkResponse({ type: StudentListResponse })
  list(@Req() req: ApiRequest, @Query() query: ListDto) {
    return this.students.list(requestClaims(req), query);
  }
  @TenantPermission(
    "student.read",
    "student.read.limited",
    "student.read.own",
    "student.read.linked",
  )
  @Get(":id")
  @ApiOkResponse({ type: StudentResponse })
  detail(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.students.detail(requestClaims(req), id);
  }
  @TenantPermission("student.write")
  @Post()
  @ApiCreatedResponse({ type: StudentResponse })
  create(@Req() req: ApiRequest, @Body() dto: CreateStudentDto) {
    return this.students.create(requestClaims(req), dto, req.traceId);
  }
}
