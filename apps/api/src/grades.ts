import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { Prisma } from "@prisma/client";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import { ErrorResponse, MetaDto, PageView } from "./response.dto";
import { ListDto } from "./auth.dto";
import type { ApiRequest } from "./http";
import { Paged } from "./http";
import type { Claims } from "./security";
import { TeachingService } from "./teaching.service";
import { requirePlanFeature } from "./subscription-policy";
import { lockTenantActor } from "./tenant-actor";
import { z } from "zod";
import {
  AssessmentQuery,
  GradeHistoryResponse,
  GradeLifecycleResponse,
} from "./grade-history.dto";

export class AssessmentInput {
  @ApiProperty() @IsString() @Matches(/\S/) @Length(1, 150) title!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  heldAt!: string;
  @ApiProperty({ type: String, example: "10.00" })
  @Matches(/^\d{1,4}(\.\d{1,2})?$/)
  maxScore!: string;
}
export class AssessmentView extends AssessmentInput {
  @ApiProperty() id!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: String, nullable: true }) publishedAt!: string | null;
}
export class AssessmentResponse {
  @ApiProperty({ type: AssessmentView }) data!: AssessmentView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class AssessmentListResponse {
  @ApiProperty({ type: [AssessmentView] }) data!: AssessmentView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class AssessmentVersion {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class AssessmentCorrection extends AssessmentVersion {
  @ApiProperty() @IsString() @Matches(/\S/) @Length(10, 500) reason!: string;
}
export class GradeInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() studentId!: string;
  @ApiProperty({ type: String, nullable: true, example: "8.00" })
  @ValidateIf((_object, value: unknown) => value !== null)
  @Matches(/^\d{1,4}(\.\d{1,2})?$/)
  score!: string | null;
  @ApiProperty() @IsString() @Length(0, 2000) comment!: string;
}
export class GradeBatch extends AssessmentVersion {
  @ApiProperty({ type: [GradeInput] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique((r: GradeInput) => r.studentId)
  @ValidateNested({ each: true })
  @Type(() => GradeInput)
  records!: GradeInput[];
}
export class GradeRow extends GradeInput {
  @ApiProperty() fullName!: string;
  @ApiProperty() studentCode!: string;
}
export class GradeEditor {
  @ApiProperty({ type: AssessmentView }) assessment!: AssessmentView;
  @ApiProperty() className!: string;
  @ApiProperty() classCode!: string;
  @ApiProperty({ type: [GradeRow] }) rows!: GradeRow[];
}
export class GradeEditorResponse {
  @ApiProperty({ type: GradeEditor }) data!: GradeEditor;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PublishedGrade extends AssessmentView {
  @ApiProperty({ type: String, nullable: true }) score!: string | null;
  @ApiProperty() comment!: string;
}
export class PublishedGradesResponse {
  @ApiProperty({ type: [PublishedGrade] }) data!: PublishedGrade[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@Injectable()
export class GradesService {
  constructor(
    private db: Db,
    private teaching: TeachingService,
  ) {}
  private tenant(c: Claims) {
    if (!c.tenantId) throw new ForbiddenException();
    return c.tenantId;
  }
  private view(a: {
    id: string;
    classId: string;
    title: string;
    heldAt: Date;
    maxScore: Prisma.Decimal;
    status: string;
    version: number;
    publishedAt: Date | null;
  }) {
    return {
      id: a.id,
      classId: a.classId,
      title: a.title,
      heldAt: a.heldAt.toISOString().slice(0, 10),
      maxScore: a.maxScore.toFixed(2),
      status: a.status,
      version: a.version,
      publishedAt: a.publishedAt?.toISOString() ?? null,
    };
  }
  private async scope(
    tx: Prisma.TransactionClient,
    c: Claims,
    classId: string,
    heldAt: Date,
  ) {
    this.tenant(c);
    const cls = await tx.educationClass.findFirst({
      where: {
        tenantId: c.tenantId!,
        id: classId,
        startDate: { lte: heldAt },
        endDate: { gte: heldAt },
      },
    });
    if (!cls) throw new NotFoundException("Không tìm thấy lớp học.");
    if (c.role === "teacher") {
      const own = await tx.teacher.findFirst({
        where: { tenantId: c.tenantId!, userId: c.sub, status: "ACTIVE" },
      });
      if (
        !own ||
        !(await tx.classTeacher.findFirst({
          where: {
            tenantId: c.tenantId!,
            classId,
            teacherId: own.id,
            effectiveFrom: { lte: heldAt },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: heldAt } }],
          },
        }))
      )
        throw new NotFoundException(
          "Không được phân công lớp vào ngày đánh giá.",
        );
    } else if (!["owner", "manager", "academic_staff"].includes(c.role ?? ""))
      throw new NotFoundException();
    return cls;
  }
  async create(
    c: Claims,
    classId: string,
    input: AssessmentInput,
    traceId: string,
  ) {
    const maxScore = new Prisma.Decimal(input.maxScore);
    if (maxScore.lte(0))
      throw new UnprocessableEntityException("Thang điểm phải lớn hơn 0.");
    return this.db.$transaction(async (tx) => {
      const actor = await lockTenantActor(
        tx,
        c,
        c.role === "teacher" ? "grade.write.assigned" : "grade.write",
      );
      await requirePlanFeature(tx, c.tenantId!, "grades");
      const heldAt = new Date(input.heldAt + "T00:00:00Z");
      await this.scope(tx, c, classId, heldAt);
      const a = await tx.assessment.create({
        data: {
          tenantId: c.tenantId!,
          classId,
          title: input.title.trim(),
          heldAt,
          maxScore,
          createdBy: c.sub,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId!,
          actorUserId: c.sub,
          action: "assessment.created",
          resourceId: a.id,
          traceId,
          metadata: {
            version: a.version,
            actorDisplayName: actor.user.displayName,
          },
        },
      });
      return this.view(a);
    });
  }
  async list(c: Claims, classId: string, q: AssessmentQuery) {
    this.tenant(c);
    await this.teaching.classDetail(c, classId);
    const intervals =
      c.role === "teacher"
        ? await this.db.classTeacher.findMany({
            where: {
              tenantId: c.tenantId!,
              classId,
              teacher: { userId: c.sub, status: "ACTIVE" },
            },
            select: { effectiveFrom: true, effectiveTo: true },
          })
        : null;
    const where: Prisma.AssessmentWhereInput = {
      tenantId: c.tenantId!,
      classId,
      ...(q.search
        ? { title: { contains: q.search, mode: "insensitive" } }
        : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(intervals
        ? {
            OR: intervals.map((i) => ({
              heldAt: {
                gte: i.effectiveFrom,
                ...(i.effectiveTo ? { lte: i.effectiveTo } : {}),
              },
            })),
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.assessment.findMany({
        where,
        orderBy: [{ heldAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.assessment.count({ where }),
    ]);
    return new Paged(
      rows.map((v) => this.view(v)),
      {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    );
  }
  private async scopedAssessment(
    tx: Prisma.TransactionClient,
    c: Claims,
    id: string,
  ) {
    this.tenant(c);
    const a = await tx.assessment.findFirst({
      where: { tenantId: c.tenantId!, id },
    });
    if (!a) throw new NotFoundException("Không tìm thấy đánh giá.");
    const cls = await this.scope(tx, c, a.classId, a.heldAt);
    return { a, cls };
  }
  private async editor(tx: Prisma.TransactionClient, c: Claims, id: string) {
    const { a, cls } = await this.scopedAssessment(tx, c, id);
    const enrollments = await tx.enrollment.findMany({
      where: {
        tenantId: c.tenantId!,
        classId: a.classId,
        joinedAt: { lte: a.heldAt },
        OR: [{ leftAt: null }, { leftAt: { gte: a.heldAt } }],
      },
      select: { studentId: true },
    });
    const students = await tx.student.findMany({
      where: {
        tenantId: c.tenantId!,
        id: { in: enrollments.map((e) => e.studentId) },
      },
      select: { id: true, fullName: true, studentCode: true },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
    });
    const results = await tx.assessmentResult.findMany({
      where: { tenantId: c.tenantId!, assessmentId: id },
    });
    return {
      assessment: this.view(a),
      className: cls.name,
      classCode: cls.code,
      rows: students.map((s) => {
        const r = results.find((v) => v.studentId === s.id);
        return {
          studentId: s.id,
          fullName: s.fullName,
          studentCode: s.studentCode,
          score: r?.score?.toFixed(2) ?? null,
          comment: r?.comment ?? "",
        };
      }),
    };
  }
  async results(c: Claims, id: string) {
    return this.db.$transaction((tx) => this.editor(tx, c, id));
  }
  async save(
    c: Claims,
    id: string,
    input: GradeBatch,
    traceId: string,
    publish = false,
  ) {
    return this.db.$transaction(async (tx) => {
      const actor = await lockTenantActor(
        tx,
        c,
        c.role === "teacher" ? "grade.write.assigned" : "grade.write",
      );
      await requirePlanFeature(tx, c.tenantId!, "grades");
      await tx.$queryRaw`SELECT id FROM assessments WHERE tenant_id=${c.tenantId!}::uuid AND id=${id}::uuid FOR UPDATE`;
      const editor = await this.editor(tx, c, id),
        a = editor.assessment;
      if (a.version !== input.version)
        throw new ConflictException("VERSION_CONFLICT: đánh giá đã thay đổi.");
      if (a.status !== "DRAFT")
        throw new ConflictException(
          "Kết quả đã công bố. Cần quy trình sửa có quyền và tái công bố.",
        );
      for (const r of input.records) {
        if (!editor.rows.some((row) => row.studentId === r.studentId))
          throw new UnprocessableEntityException(
            "Học viên không thuộc lớp vào ngày đánh giá.",
          );
        if (r.score !== null && new Prisma.Decimal(r.score).gt(a.maxScore))
          throw new UnprocessableEntityException("Điểm vượt thang điểm.");
        if (r.score === null && !r.comment.trim())
          throw new UnprocessableEntityException("Điểm trống cần lý do.");
        const fields = {
          score: r.score === null ? null : new Prisma.Decimal(r.score),
          comment: r.comment,
          gradedBy: c.sub,
          gradedAt: new Date(),
        };
        const previous = await tx.assessmentResult.findUnique({
          where: {
            tenantId_assessmentId_studentId: {
              tenantId: c.tenantId!,
              assessmentId: id,
              studentId: r.studentId,
            },
          },
        });
        await tx.gradeChange.create({
          data: {
            tenantId: c.tenantId!,
            assessmentId: id,
            studentId: r.studentId,
            version: a.version + 1,
            beforeValue: previous
              ? {
                  score: previous.score?.toFixed(2) ?? null,
                  comment: previous.comment,
                }
              : Prisma.JsonNull,
            afterValue: {
              score: fields.score?.toFixed(2) ?? null,
              comment: r.comment,
            },
            actorId: c.sub,
            actorDisplayName: actor.user.displayName,
            traceId,
          },
        });
        await tx.assessmentResult.upsert({
          where: {
            tenantId_assessmentId_studentId: {
              tenantId: c.tenantId!,
              assessmentId: id,
              studentId: r.studentId,
            },
          },
          create: {
            tenantId: c.tenantId!,
            assessmentId: id,
            studentId: r.studentId,
            ...fields,
          },
          update: fields,
        });
      }
      if (publish) {
        const ready = await this.editor(tx, c, id);
        if (
          !ready.rows.length ||
          ready.rows.some((r) => r.score === null && !r.comment.trim())
        )
          throw new UnprocessableEntityException(
            "Cần nhập điểm hoặc lý do cho tất cả học viên.",
          );
      }
      const next = await tx.assessment.update({
        where: { id },
        data: {
          version: { increment: 1 },
          ...(publish ? { status: "PUBLISHED", publishedAt: new Date() } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId!,
          actorUserId: c.sub,
          action: publish ? "grade.published" : "grade.draft.updated",
          resourceId: id,
          traceId,
          metadata: {
            version: next.version,
            actorDisplayName: actor.user.displayName,
          },
        },
      });
      if (publish)
        await tx.outboxEvent.create({
          data: {
            tenantId: c.tenantId!,
            eventType: "GRADE_PUBLISHED",
            aggregateId: id,
            eventVersion: next.version,
            payload: { assessmentId: id },
          },
        });
      return this.editor(tx, c, id);
    });
  }
  async published(c: Claims, q: ListDto, childId?: string) {
    this.tenant(c);
    return this.db.$transaction(
      async (tx) => {
        const studentId = await this.teaching.subject(tx, c, childId);
        return this.publishedRows(tx, c, studentId, q);
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async studentPublished(c: Claims, studentId: string, q: ListDto) {
    this.tenant(c);
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.student.findFirst({
            where: { tenantId: c.tenantId!, id: studentId },
            select: { id: true },
          }))
        )
          throw new NotFoundException("Không tìm thấy học viên.");
        return this.publishedRows(tx, c, studentId, q);
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  private async publishedRows(
    tx: Prisma.TransactionClient,
    c: Claims,
    studentId: string,
    q: ListDto,
  ) {
    const where = {
      tenantId: c.tenantId!,
      status: "PUBLISHED",
      results: { some: { tenantId: c.tenantId!, studentId } },
    };
    const [rows, total] = await Promise.all([
      tx.assessment.findMany({
        where,
        include: {
          results: {
            where: { tenantId: c.tenantId!, studentId },
            select: { score: true, comment: true },
          },
        },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      tx.assessment.count({ where }),
    ]);
    return new Paged(
      rows.map((a) => {
        const r = a.results[0]!;
        return {
          ...this.view(a),
          score: r.score?.toFixed(2) ?? null,
          comment: r.comment,
        };
      }),
      {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    );
  }
  async history(c: Claims, id: string, q: ListDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.scopedAssessment(tx, c, id);
        const where = { tenantId: c.tenantId!, assessmentId: id };
        const [rows, total] = await Promise.all([
          tx.gradeChange.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          tx.gradeChange.count({ where }),
        ]);
        const students = await tx.student.findMany({
          where: {
            tenantId: c.tenantId!,
            id: { in: rows.map((r) => r.studentId) },
          },
          select: { id: true, fullName: true },
        });
        const names = new Map(students.map((s) => [s.id, s.fullName]));
        const snapshot = z
          .object({
            score: z
              .string()
              .regex(/^\d{1,4}(\.\d{1,2})?$/)
              .nullable(),
            comment: z.string().max(2000),
          })
          .strict()
          .nullable();
        const decode = (value: Prisma.JsonValue) => {
          const parsed = snapshot.safeParse(value);
          if (!parsed.success)
            throw new ConflictException(
              "Lịch sử điểm cần được quản trị viên kiểm tra trước khi hiển thị.",
            );
          return parsed.data;
        };
        return new Paged(
          rows.map((row) => {
            const beforeValue = decode(row.beforeValue),
              afterValue = decode(row.afterValue),
              fullName = names.get(row.studentId);
            if (!afterValue || !fullName)
              throw new ConflictException(
                "Không đọc được bản ghi lịch sử trong trung tâm.",
              );
            return {
              id: row.id,
              studentId: row.studentId,
              fullName,
              version: row.version,
              beforeValue,
              afterValue,
              actorUserId: row.actorId,
              actorDisplayName: row.actorDisplayName,
              traceId: row.traceId,
              recordedAt: row.createdAt.toISOString(),
            };
          }),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async lifecycle(c: Claims, id: string, q: ListDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.scopedAssessment(tx, c, id);
        const where = {
          tenantId: c.tenantId!,
          resourceId: id,
          action: {
            in: [
              "assessment.created",
              "grade.draft.updated",
              "grade.published",
              "grade.correction.opened",
            ],
          },
        };
        const [rows, total] = await Promise.all([
          tx.auditLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          tx.auditLog.count({ where }),
        ]);
        return new Paged(
          rows.map((row) => {
            const metadata =
              row.metadata &&
              typeof row.metadata === "object" &&
              !Array.isArray(row.metadata)
                ? row.metadata
                : {};
            return {
              id: row.id,
              action: row.action,
              version:
                typeof metadata.version === "number" ? metadata.version : null,
              actorUserId: row.actorUserId,
              actorDisplayName:
                typeof metadata.actorDisplayName === "string"
                  ? metadata.actorDisplayName
                  : null,
              reason: row.reason,
              traceId: row.traceId,
              recordedAt: row.createdAt.toISOString(),
            };
          }),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async correction(
    c: Claims,
    id: string,
    input: AssessmentCorrection,
    traceId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const actor = await lockTenantActor(tx, c, "grade.correct");
      await requirePlanFeature(tx, c.tenantId!, "grades");
      if (input.reason.trim().length < 10)
        throw new UnprocessableEntityException(
          "Cần ghi nhận lý do mở sửa từ 10 ký tự.",
        );
      const editor = await this.editor(tx, c, id);
      if (
        editor.assessment.status !== "PUBLISHED" ||
        editor.assessment.version !== input.version
      )
        throw new ConflictException(
          "Đánh giá hoặc phiên bản không cho phép mở sửa.",
        );
      const next = await tx.assessment.update({
        where: { id },
        data: { status: "DRAFT", publishedAt: null, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId!,
          actorUserId: c.sub,
          action: "grade.correction.opened",
          resourceId: id,
          traceId,
          reason: input.reason.trim(),
          metadata: {
            version: next.version,
            actorDisplayName: actor.user.displayName,
          },
        },
      });
      return this.editor(tx, c, id);
    });
  }
}
@ApiTags("grades")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class GradesController {
  constructor(private service: GradesService) {}
  @Get("classes/:id/assessments")
  @TenantPermission("grade.write", "grade.write.assigned")
  @ApiOkResponse({ type: AssessmentListResponse })
  list(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: AssessmentQuery,
  ) {
    return this.service.list(requestClaims(req), id, q);
  }
  @Post("classes/:id/assessments")
  @TenantPermission("grade.write", "grade.write.assigned")
  @ApiCreatedResponse({ type: AssessmentResponse })
  create(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssessmentInput,
  ) {
    return this.service.create(requestClaims(req), id, dto, req.traceId);
  }
  @Get("assessments/:id/results")
  @TenantPermission("grade.write", "grade.write.assigned")
  @ApiOkResponse({ type: GradeEditorResponse })
  results(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.results(requestClaims(req), id);
  }
  @Get("assessments/:id/history")
  @TenantPermission("grade.write", "grade.write.assigned")
  @ApiOkResponse({ type: GradeHistoryResponse })
  history(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.history(requestClaims(req), id, q);
  }
  @Get("assessments/:id/lifecycle")
  @TenantPermission("grade.write", "grade.write.assigned")
  @ApiOkResponse({ type: GradeLifecycleResponse })
  lifecycle(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.lifecycle(requestClaims(req), id, q);
  }
  @Get("students/:id/grades")
  @TenantPermission("grade.write")
  @ApiOkResponse({ type: PublishedGradesResponse })
  studentPublished(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.studentPublished(requestClaims(req), id, q);
  }
  @Put("assessments/:id/results")
  @TenantPermission("grade.write", "grade.write.assigned")
  @ApiOkResponse({ type: GradeEditorResponse })
  save(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GradeBatch,
  ) {
    return this.service.save(requestClaims(req), id, dto, req.traceId);
  }
  @Post("assessments/:id/publish")
  @TenantPermission("grade.write", "grade.write.assigned")
  @ApiCreatedResponse({ type: GradeEditorResponse })
  publish(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssessmentVersion,
  ) {
    return this.service.save(
      requestClaims(req),
      id,
      { ...dto, records: [] },
      req.traceId,
      true,
    );
  }
  @Get("mobile/my/grades")
  @TenantPermission("grade.read.own")
  @ApiOkResponse({ type: PublishedGradesResponse })
  mine(@Req() req: ApiRequest, @Query() q: ListDto) {
    return this.service.published(requestClaims(req), q);
  }
  @Get("mobile/guardian/students/:id/grades")
  @TenantPermission("grade.read.linked")
  @ApiOkResponse({ type: PublishedGradesResponse })
  child(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.published(requestClaims(req), q, id);
  }
  @Post("assessments/:id/reopen")
  @TenantPermission("grade.correct")
  @ApiCreatedResponse({ type: GradeEditorResponse })
  correction(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssessmentCorrection,
  ) {
    return this.service.correction(requestClaims(req), id, dto, req.traceId);
  }
}
