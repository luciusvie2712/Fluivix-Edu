import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ErrorResponse } from "./response.dto";
import { Prisma } from "@prisma/client";
import { Db } from "./db";
import { lockTenantReader } from "./tenant-reader";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import { ListDto } from "./auth.dto";
import { Paged, type ApiRequest } from "./http";
import { hasPermission, type Claims } from "./security";
import { requirePlanFeature } from "./subscription-policy";
import {
  StudentAttendanceQuery,
  StudentAttendanceHistoryResponse,
  StudentEnrollmentHistoryResponse,
} from "./student-history.dto";

// Staff panes do not widen the separate student/guardian/assigned-teacher APIs.
// READ COMMITTED is intentional: re-read the current actor after a lock wait.
async function studentReader(
  tx: Prisma.TransactionClient,
  c: Claims,
  studentId: string,
  attendance: boolean,
) {
  if (!c.role) throw new ForbiddenException();
  const permission = hasPermission(c.role, "student.read")
    ? "student.read"
    : "student.read.limited";
  if (
    !hasPermission(c.role, permission) ||
    (attendance && !hasPermission(c.role, "report.attendance.read"))
  )
    throw new ForbiddenException();
  await lockTenantReader(tx, c, permission);
  if (
    !(await tx.student.findFirst({
      where: { id: studentId, tenantId: c.tenantId! },
      select: { id: true },
    }))
  )
    throw new NotFoundException("Không tìm thấy học viên.");
}
function pagination(q: ListDto, total: number) {
  return {
    page: q.page,
    limit: q.limit,
    total,
    totalPages: Math.ceil(total / q.limit),
  };
}
function offset(q: ListDto) {
  const value = (q.page - 1) * q.limit;
  if (!Number.isSafeInteger(value) || value > 2147483647)
    throw new UnprocessableEntityException("Số trang không hợp lệ.");
  return value;
}
@Injectable()
export class StudentHistoryService {
  constructor(private readonly db: Db) {}
  async enrollments(c: Claims, studentId: string, q: ListDto) {
    const skip = offset(q);
    return this.db.$transaction(async (tx) => {
      await studentReader(tx, c, studentId, false);
      const where = Prisma.sql`e.tenant_id=${c.tenantId!}::uuid AND e.student_id=${studentId}::uuid ${q.search ? Prisma.sql`AND (cls.code ILIKE ${"%" + q.search + "%"} OR cls.name ILIKE ${"%" + q.search + "%"})` : Prisma.empty}`;
      const rows = await tx.$queryRaw<
        {
          id: string;
          classId: string;
          classCode: string;
          className: string;
          classStatus: string;
          status: string;
          version: number;
          joinedAt: string;
          leftAt: string | null;
        }[]
      >`
        SELECT e.id,e.class_id AS "classId",cls.code AS "classCode",cls.name AS "className",cls.status AS "classStatus",e.status,e.version,e.joined_at::text AS "joinedAt",e.left_at::text AS "leftAt"
        FROM enrollments e JOIN classes cls ON cls.tenant_id=e.tenant_id AND cls.id=e.class_id
        WHERE ${where} ORDER BY e.joined_at DESC,e.id ASC LIMIT ${q.limit} OFFSET ${skip}`;
      const [count] = await tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::integer AS n FROM enrollments e JOIN classes cls ON cls.tenant_id=e.tenant_id AND cls.id=e.class_id WHERE ${where}`;
      if (!count) throw new Error("STUDENT_HISTORY_COUNT_UNAVAILABLE");
      return new Paged(rows, pagination(q, count.n));
    });
  }
  async attendance(c: Claims, studentId: string, q: StudentAttendanceQuery) {
    const skip = offset(q),
      days = (Date.parse(q.to) - Date.parse(q.from)) / 86400000;
    if (!Number.isFinite(days) || days < 0 || days > 366)
      throw new UnprocessableEntityException(
        "Chọn khoảng ngày hợp lệ không quá 366 ngày.",
      );
    return this.db.$transaction(async (tx) => {
      await studentReader(tx, c, studentId, true);
      await requirePlanFeature(tx, c.tenantId!, "attendance");
      const from = Prisma.sql`FROM attendance_records a
        JOIN class_sessions s ON s.tenant_id=a.tenant_id AND s.id=a.session_id
        JOIN session_roster_snapshots r ON r.tenant_id=s.tenant_id AND r.session_id=s.id AND r.class_id=s.class_id AND r.student_id=a.student_id
        JOIN classes cls ON cls.tenant_id=s.tenant_id AND cls.id=s.class_id`;
      const where = Prisma.sql`a.tenant_id=${c.tenantId!}::uuid AND a.student_id=${studentId}::uuid AND s.status='COMPLETED' AND s.finalized_at IS NOT NULL AND a.status IN ('PRESENT','LATE','ABSENT_EXCUSED','ABSENT_UNEXCUSED') AND s.scheduled_date>=${q.from}::date AND s.scheduled_date<=${q.to}::date ${q.search ? Prisma.sql`AND (cls.code ILIKE ${"%" + q.search + "%"} OR cls.name ILIKE ${"%" + q.search + "%"})` : Prisma.empty}`;
      const rows = await tx.$queryRaw<
        {
          sessionId: string;
          classId: string;
          classCode: string;
          className: string;
          scheduledDate: string;
          startsAt: Date;
          endsAt: Date;
          status: string;
        }[]
      >`
        SELECT s.id AS "sessionId",s.class_id AS "classId",cls.code AS "classCode",cls.name AS "className",s.scheduled_date::text AS "scheduledDate",s.starts_at AS "startsAt",s.ends_at AS "endsAt",a.status
        ${from} WHERE ${where} ORDER BY s.scheduled_date DESC,s.starts_at DESC,s.id ASC LIMIT ${q.limit} OFFSET ${skip}`;
      const [count] = await tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::integer AS n ${from} WHERE ${where}`;
      if (!count) throw new Error("STUDENT_HISTORY_COUNT_UNAVAILABLE");
      return new Paged(
        rows.map((row) => ({
          ...row,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
        })),
        pagination(q, count.n),
      );
    });
  }
}
@ApiTags("students")
@ApiBearerAuth()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
@Controller("students/:studentId")
@UseGuards(AccessGuard)
export class StudentHistoryController {
  constructor(private readonly service: StudentHistoryService) {}
  @Get("enrollments")
  @TenantPermission("student.read", "student.read.limited")
  @ApiOkResponse({ type: StudentEnrollmentHistoryResponse })
  enrollments(
    @Req() r: ApiRequest,
    @Param("studentId", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.enrollments(requestClaims(r), id, q);
  }
  @Get("attendance")
  @TenantPermission("report.attendance.read")
  @ApiOkResponse({ type: StudentAttendanceHistoryResponse })
  attendance(
    @Req() r: ApiRequest,
    @Param("studentId", ParseUUIDPipe) id: string,
    @Query() q: StudentAttendanceQuery,
  ) {
    return this.service.attendance(requestClaims(r), id, q);
  }
}
