import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  ApiProperty,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiPropertyOptional,
  PartialType,
} from "@nestjs/swagger";
import {
  StudentResponse,
  StudentListResponse,
  StudentDetailResponse,
} from "./response.dto";
import { Paged } from "./http";
import {
  IsString,
  Length,
  Matches,
  IsOptional,
  IsEmail,
  IsISO8601,
  IsInt,
  Min,
  IsIn,
} from "class-validator";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import { hasPermission, type Claims } from "./security";
import { ListDto } from "./auth.dto";
import { assertQuota, requireSubscriptionWrite } from "./subscription-policy";
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
  @ApiPropertyOptional({ type: String, nullable: true, format: "date" })
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  dateOfBirth?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 254 })
  @IsOptional()
  @IsEmail()
  @Length(1, 254)
  contactEmail?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 30 })
  @IsOptional()
  @IsString()
  @Matches(/^(?=.*\d)[+\d ()-]{7,30}$/)
  contactPhone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notesPrivate?: string | null;
}
export class UpdateStudentDto extends PartialType(CreateStudentDto, {
  skipNullProperties: false,
}) {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ enum: ["ACTIVE", "PAUSED", "GRADUATED"] })
  @IsOptional()
  @IsIn(["ACTIVE", "PAUSED", "GRADUATED"])
  status?: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(10, 500)
  reason?: string;
}
export class DeactivateStudentDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  reason!: string;
}
export class StudentListQuery extends ListDto {
  @ApiPropertyOptional({ enum: ["ACTIVE", "PAUSED", "GRADUATED", "INACTIVE"] })
  @IsOptional()
  @IsIn(["ACTIVE", "PAUSED", "GRADUATED", "INACTIVE"])
  status?: string;
}
function tenantDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((part) => parts.find((entry) => entry.type === part)?.value)
    .join("-");
}
function privateFields(dto: Partial<CreateStudentDto>, today: string) {
  if (dto.dateOfBirth && dto.dateOfBirth > today)
    throw new UnprocessableEntityException("Ngày sinh không được ở tương lai.");
  return {
    ...(dto.dateOfBirth !== undefined
      ? {
          dateOfBirth: dto.dateOfBirth
            ? new Date(dto.dateOfBirth + "T00:00:00Z")
            : null,
        }
      : {}),
    ...(dto.contactEmail !== undefined
      ? { contactEmail: dto.contactEmail?.trim().toLowerCase() ?? null }
      : {}),
    ...(dto.contactPhone !== undefined
      ? { contactPhone: dto.contactPhone?.trim() ?? null }
      : {}),
    ...(dto.notesPrivate !== undefined
      ? { notesPrivate: dto.notesPrivate?.trim() ?? null }
      : {}),
  };
}
@Injectable()
export class StudentsService {
  constructor(private readonly db: Db) {}
  async list(claims: Claims, query: StudentListQuery) {
    const where = {
      tenantId: claims.tenantId!,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                fullName: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
              {
                studentCode: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
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
        dateOfBirth: true,
        contactEmail: true,
        contactPhone: true,
        notesPrivate: true,
        version: true,
        enrolledAt: true,
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
      version: student.version,
      enrolledAt: student.enrolledAt.toISOString().slice(0, 10),
      ...(claims.role && hasPermission(claims.role, "student.write")
        ? {
            dateOfBirth:
              student.dateOfBirth?.toISOString().slice(0, 10) ?? null,
            contactEmail: student.contactEmail,
            contactPhone: student.contactPhone,
            notesPrivate: student.notesPrivate,
          }
        : {}),
    };
  }
  async create(claims: Claims, dto: CreateStudentDto, traceId: string) {
    return this.db.$transaction(async (tx) => {
      const [tenant] = await tx.$queryRaw<
        Array<{ timezone: string }>
      >`SELECT timezone FROM tenants WHERE id = ${claims.tenantId}::uuid FOR UPDATE`;
      if (!tenant) throw new NotFoundException();
      const today = tenantDate(tenant.timezone);
      await assertQuota(tx, claims.tenantId!, "students");
      const student = await tx.student.create({
        data: {
          tenantId: claims.tenantId!,
          studentCode: dto.studentCode,
          fullName: dto.fullName.trim(),
          enrolledAt: new Date(today + "T00:00:00Z"),
          ...privateFields(dto, today),
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
  async update(
    claims: Claims,
    id: string,
    dto: UpdateStudentDto | DeactivateStudentDto,
    traceId: string,
    deactivate = false,
  ) {
    return this.db.$transaction(async (tx) => {
      const [tenant] = await tx.$queryRaw<
        Array<{ timezone: string }>
      >`SELECT timezone FROM tenants WHERE id = ${claims.tenantId}::uuid FOR UPDATE`;
      if (!tenant) throw new NotFoundException();
      await requireSubscriptionWrite(tx, claims.tenantId!);
      const student = await tx.student.findFirst({
        where: { tenantId: claims.tenantId!, id },
      });
      if (!student) throw new NotFoundException("Không tìm thấy học viên.");
      if (student.version !== dto.version)
        throw new ConflictException(
          "Hồ sơ đã thay đổi. Tải lại trước khi lưu.",
        );
      const patch = dto instanceof UpdateStudentDto ? dto : null;
      if (patch && patch.status === null)
        throw new UnprocessableEntityException("Trạng thái không hợp lệ.");
      const status = deactivate
        ? "INACTIVE"
        : (patch?.status ?? student.status);
      if (
        status !== student.status &&
        (!dto.reason || dto.reason.trim().length < 10)
      )
        throw new UnprocessableEntityException(
          "Nêu lý do thay đổi trạng thái từ 10 ký tự.",
        );
      if (deactivate && student.status === "INACTIVE")
        throw new ConflictException("Học viên đã ngưng hoạt động.");
      if (status === "ACTIVE" && student.status !== "ACTIVE")
        await assertQuota(tx, claims.tenantId!, "students");
      if (
        patch &&
        ![patch.studentCode, patch.fullName, patch.status].some(
          (value) => value !== undefined,
        ) &&
        [
          patch.dateOfBirth,
          patch.contactEmail,
          patch.contactPhone,
          patch.notesPrivate,
        ].every((value) => value === undefined)
      )
        throw new UnprocessableEntityException("Chọn thông tin cần cập nhật.");
      await tx.student.update({
        where: { tenantId_id: { tenantId: claims.tenantId!, id } },
        data: {
          status,
          version: { increment: 1 },
          ...(patch ? privateFields(patch, tenantDate(tenant.timezone)) : {}),
          ...(patch?.studentCode !== undefined
            ? { studentCode: patch.studentCode }
            : {}),
          ...(patch?.fullName !== undefined
            ? { fullName: patch.fullName.trim() }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: claims.tenantId!,
          actorUserId: claims.sub,
          action: deactivate
            ? "student.deactivate"
            : status !== student.status
              ? "student.status_change"
              : "student.update",
          resourceId: id,
          traceId,
          reason: status !== student.status ? dto.reason!.trim() : null,
        },
      });
      return { updated: true };
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
  list(@Req() req: ApiRequest, @Query() query: StudentListQuery) {
    return this.students.list(requestClaims(req), query);
  }
  @TenantPermission(
    "student.read",
    "student.read.limited",
    "student.read.own",
    "student.read.linked",
  )
  @Get(":id")
  @ApiOkResponse({ type: StudentDetailResponse })
  detail(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.students.detail(requestClaims(req), id);
  }
  @TenantPermission("student.write")
  @Post()
  @ApiCreatedResponse({ type: StudentResponse })
  create(@Req() req: ApiRequest, @Body() dto: CreateStudentDto) {
    return this.students.create(requestClaims(req), dto, req.traceId);
  }
  @TenantPermission("student.write")
  @Patch(":id")
  @ApiOkResponse({ type: StudentDetailResponse })
  async update(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    await this.students.update(requestClaims(req), id, dto, req.traceId);
    return this.students.detail(requestClaims(req), id);
  }
  @TenantPermission("student.write")
  @Post(":id/deactivate")
  @ApiCreatedResponse({ type: StudentDetailResponse })
  async deactivate(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DeactivateStudentDto,
  ) {
    await this.students.update(requestClaims(req), id, dto, req.traceId, true);
    return this.students.detail(requestClaims(req), id);
  }
}
