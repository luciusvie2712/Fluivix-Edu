import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import { IsString, Length, validateSync } from "class-validator";
import { Prisma, type StudentImport } from "@prisma/client";
import { Db } from "./db";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import type { Claims } from "./security";
import { MetaDto } from "./response.dto";
import { CreateStudentDto, privateFields, tenantDate } from "./students";
import { assertQuota, requireSubscriptionWrite } from "./subscription-policy";
import { CSV_MAX_BYTES, parseStudentCsv } from "./student-csv";

export class StudentCsvInput {
  @ApiProperty({
    description: "UTF-8 CSV text; max 512 KiB, 5000 rows; atomic commit",
  })
  @IsString()
  @Length(1, CSV_MAX_BYTES)
  csv!: string;
}
export class ImportRowView {
  @ApiProperty() row!: number;
  @ApiProperty() studentCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String] }) errors!: string[];
}
export class ImportView {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() rowCount!: number;
  @ApiProperty() errorCount!: number;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ type: [ImportRowView] }) rows!: ImportRowView[];
}
export class ImportResponse {
  @ApiProperty({ type: ImportView }) data!: ImportView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}

@Injectable()
export class StudentImportsService {
  constructor(private db: Db) {}
  private async validateRows(
    tx: Prisma.TransactionClient,
    tenantId: string,
    rows: Array<Record<string, string>>,
  ) {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const today = tenantDate(tenant.timezone),
      seen = new Set<string>();
    const existing = new Set(
      (
        await tx.student.findMany({
          where: {
            tenantId,
            studentCode: { in: rows.map((row) => row.studentCode ?? "") },
          },
          select: { studentCode: true },
        })
      ).map((row) => row.studentCode),
    );
    return rows.map((row, index) => {
      const dto = Object.assign(new CreateStudentDto(), row);
      const errors = validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      }).map((error) => `INVALID_${error.property}`);
      if (row.dateOfBirth && row.dateOfBirth > today)
        errors.push("INVALID_dateOfBirth");
      if (seen.has(row.studentCode ?? "")) errors.push("DUPLICATE_IN_FILE");
      if (existing.has(row.studentCode ?? ""))
        errors.push("DUPLICATE_IN_TENANT");
      seen.add(row.studentCode ?? "");
      return {
        row: index + 2,
        studentCode: row.studentCode ?? "",
        fullName: row.fullName ?? "",
        errors,
      };
    });
  }
  private view(job: StudentImport, rows: ImportRowView[] = []) {
    return {
      id: job.id,
      status: job.status,
      rowCount: job.rowCount,
      errorCount: job.errorCount,
      expiresAt: job.expiresAt.toISOString(),
      rows,
    };
  }
  async preview(c: Claims, input: StudentCsvInput, traceId: string) {
    let rows: Array<Record<string, string>>;
    try {
      rows = parseStudentCsv(input.csv);
    } catch (error) {
      throw new UnprocessableEntityException(
        error instanceof Error ? error.message : "CSV_INVALID",
      );
    }
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId!}::uuid FOR UPDATE`;
        await requireSubscriptionWrite(tx, c.tenantId!);
        // Expired previews are never readable and are purged on the next import operation.
        await tx.studentImport.updateMany({
          where: {
            tenantId: c.tenantId!,
            status: "PREVIEW",
            expiresAt: { lte: new Date() },
          },
          data: { rowsJson: Prisma.DbNull, status: "EXPIRED" },
        });
        if (
          (await tx.studentImport.count({
            where: { tenantId: c.tenantId!, actorId: c.sub, status: "PREVIEW" },
          })) >= 10
        )
          throw new ConflictException(
            "Tối đa 10 preview đang mở; hoàn tất hoặc chờ hết hạn trước khi tạo thêm.",
          );
        const preview = await this.validateRows(tx, c.tenantId!, rows);
        const job = await tx.studentImport.create({
          data: {
            tenantId: c.tenantId!,
            actorId: c.sub,
            rowsJson: rows,
            rowCount: rows.length,
            errorCount: preview.filter((row) => row.errors.length).length,
            expiresAt: new Date(Date.now() + 24 * 3600000),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: c.tenantId!,
            actorUserId: c.sub,
            action: "student.import.preview",
            resourceId: job.id,
            traceId,
          },
        });
        return this.view(job, preview);
      },
      { timeout: 15000 },
    );
  }
  async detail(c: Claims, id: string) {
    return this.db.$transaction(async (tx) => {
      const job = await tx.studentImport.findFirst({
        where: { tenantId: c.tenantId!, actorId: c.sub, id },
      });
      if (
        !job ||
        (job.status === "PREVIEW" && job.expiresAt.getTime() <= Date.now())
      )
        throw new NotFoundException("Import không tồn tại hoặc đã hết hạn.");
      if (job.status !== "PREVIEW") return this.view(job);
      const preview = await this.validateRows(
        tx,
        c.tenantId!,
        job.rowsJson as Array<Record<string, string>>,
      );
      return {
        ...this.view(job, preview),
        errorCount: preview.filter((row) => row.errors.length).length,
      };
    });
  }
  async commit(c: Claims, id: string, traceId: string) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId!}::uuid FOR UPDATE`;
        await requireSubscriptionWrite(tx, c.tenantId!);
        const job = await tx.studentImport.findFirst({
          where: { tenantId: c.tenantId!, actorId: c.sub, id },
        });
        if (!job) throw new NotFoundException("Không tìm thấy import.");
        if (job.status === "COMMITTED") return this.view(job);
        if (job.status !== "PREVIEW" || job.expiresAt.getTime() <= Date.now())
          throw new ConflictException("Import hết hạn; cần preview lại.");
        const rows = job.rowsJson as Array<Record<string, string>>;
        const preview = await this.validateRows(tx, c.tenantId!, rows);
        if (preview.some((row) => row.errors.length))
          throw new ConflictException(
            "IMPORT_HAS_ERRORS: toàn bộ batch chưa được ghi; xem lại preview.",
          );
        await assertQuota(tx, c.tenantId!, "students", rows.length);
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: c.tenantId! },
        });
        const today = tenantDate(tenant.timezone);
        await tx.student.createMany({
          data: rows.map((row) => ({
            tenantId: c.tenantId!,
            studentCode: row.studentCode!,
            fullName: row.fullName!,
            ...privateFields(Object.assign(new CreateStudentDto(), row), today),
          })),
        });
        const result = await tx.studentImport.update({
          where: { id },
          data: {
            status: "COMMITTED",
            rowsJson: Prisma.DbNull,
            errorCount: 0,
            committedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: c.tenantId!,
            actorUserId: c.sub,
            action: "student.import.committed",
            resourceId: id,
            traceId,
          },
        });
        return this.view(result);
      },
      { timeout: 15000 },
    );
  }
}

@ApiTags("students-import")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller("students/imports")
export class StudentImportsController {
  constructor(private service: StudentImportsService) {}
  @Post()
  @TenantPermission("student.write")
  @ApiCreatedResponse({ type: ImportResponse })
  preview(@Req() r: ApiRequest, @Body() body: StudentCsvInput) {
    return this.service.preview(requestClaims(r), body, r.traceId);
  }
  @Get(":id")
  @TenantPermission("student.write")
  @ApiOkResponse({ type: ImportResponse })
  detail(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(requestClaims(r), id);
  }
  @Post(":id/commit")
  @TenantPermission("student.write")
  @ApiCreatedResponse({ type: ImportResponse })
  commit(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.commit(requestClaims(r), id, r.traceId);
  }
}
