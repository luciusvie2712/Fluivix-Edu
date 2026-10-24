import {
  Controller,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { planFlagsSchema } from "@fluivix/contracts";
import { Db } from "./db";
import { TeachingService } from "./teaching.service";
import { GradesService, PublishedGrade } from "./grades";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import { currentSubscription } from "./subscription-policy";
import { ErrorResponse, MetaDto } from "./response.dto";
import { PublishedAttendance, TeachingSessionView } from "./teaching.dto";
import type { ApiRequest } from "./http";
import type { Claims } from "./security";
export class DashboardView {
  @ApiProperty() today!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: Number, nullable: true }) classesCount!: number | null;
  @ApiProperty() linkRequired!: boolean;
  @ApiProperty({ type: Number, nullable: true }) pendingAttendanceCount!:
    | number
    | null;
  @ApiProperty({ type: TeachingSessionView, nullable: true })
  nextSession!: TeachingSessionView | null;
  @ApiProperty({ type: [PublishedAttendance], nullable: true })
  latestAttendance!: PublishedAttendance[] | null;
  @ApiProperty({ type: [PublishedGrade], nullable: true }) latestGrades!:
    | PublishedGrade[]
    | null;
  @ApiProperty({ type: String, nullable: true }) outstandingBalanceVnd!:
    | string
    | null;
}
export class DashboardResponse {
  @ApiProperty({ type: DashboardView }) data!: DashboardView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
@Injectable()
export class MobileDashboardService {
  constructor(
    private db: Db,
    private teaching: TeachingService,
    private grades: GradesService,
  ) {}
  async summary(c: Claims, childId?: string) {
    const tenant = await this.db.tenant.findUniqueOrThrow({
        where: { id: c.tenantId! },
      }),
      today = new Intl.DateTimeFormat("en-CA", {
        timeZone: tenant.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      date = new Date(today + "T00:00:00Z"),
      future = new Date(date.getTime() + 30 * 86400000)
        .toISOString()
        .slice(0, 10),
      past = new Date(date.getTime() - 30 * 86400000)
        .toISOString()
        .slice(0, 10);
    const subscription = await currentSubscription(this.db, c.tenantId!),
      flags = subscription
        ? planFlagsSchema.parse(subscription.plan.featureFlagsJson)
        : null;
    const profileMissing =
      c.role === "student"
        ? !(await this.db.student.findFirst({
            where: { tenantId: c.tenantId!, userId: c.sub },
            select: { id: true },
          }))
        : c.role === "teacher"
          ? !(await this.db.teacher.findFirst({
              where: { tenantId: c.tenantId!, userId: c.sub, status: "ACTIVE" },
              select: { id: true },
            }))
          : false;
    if (profileMissing)
      return {
        today,
        timezone: tenant.timezone,
        linkRequired: true,
        classesCount: null,
        pendingAttendanceCount: null,
        nextSession: null,
        latestAttendance: null,
        latestGrades: null,
        outstandingBalanceVnd: null,
      };
    const classes =
      c.role === "teacher"
        ? await this.teaching.classes(c, { page: 1, limit: 1 })
        : null;
    const studentId =
      c.role === "teacher"
        ? null
        : await this.teaching.subject(this.db, c, childId);
    const count = studentId
      ? await this.db.enrollment.findMany({
          where: {
            tenantId: c.tenantId!,
            studentId,
            joinedAt: { lte: date },
            OR: [{ leftAt: null }, { leftAt: { gte: date } }],
          },
          select: { classId: true },
          distinct: ["classId"],
        })
      : null;
    const schedule = await this.teaching.schedule(
      c,
      { from: today, to: future, page: 1, limit: 100 },
      childId,
    );
    const current = await this.teaching.schedule(
      c,
      { from: today, to: today, page: 1, limit: 100 },
      childId,
    );
    const next =
      schedule.items.find(
        (v) => v.endsAt > new Date().toISOString() && v.status !== "CANCELLED",
      ) ?? null;
    let outstandingBalanceVnd: string | null = null;
    if (c.role === "guardian" && studentId && flags?.finance) {
      const value = await this.db.$queryRaw<
        { balance: string }[]
      >`SELECT COALESCE(sum(i.total_amount_vnd-COALESCE(p.paid,0)),0)::text AS balance FROM invoices i LEFT JOIN (SELECT a.invoice_id,sum(a.amount_vnd) AS paid FROM payment_allocations a JOIN payments p ON p.tenant_id=a.tenant_id AND p.id=a.payment_id AND p.status='CONFIRMED' WHERE a.tenant_id=${c.tenantId!}::uuid GROUP BY a.invoice_id) p ON p.invoice_id=i.id WHERE i.tenant_id=${c.tenantId!}::uuid AND i.student_id=${studentId}::uuid AND i.billing_state='ISSUED'`;
      outstandingBalanceVnd = value[0]!.balance.toString();
    }
    return {
      today,
      timezone: tenant.timezone,
      linkRequired: false,
      classesCount: classes?.page.total ?? count?.length ?? 0,
      pendingAttendanceCount:
        c.role === "teacher"
          ? current.items.filter((s) =>
              ["SCHEDULED", "IN_PROGRESS", "REOPENED"].includes(s.status),
            ).length
          : null,
      nextSession: next,
      latestAttendance:
        studentId && flags?.attendance
          ? (
              await this.teaching.schedule(
                c,
                { from: past, to: today, page: 1, limit: 3 },
                childId,
                true,
              )
            ).items
          : null,
      latestGrades:
        studentId && flags?.grades
          ? (await this.grades.published(c, { page: 1, limit: 3 }, childId))
              .items
          : null,
      outstandingBalanceVnd,
    };
  }
}
@ApiTags("mobile-dashboard")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
export class MobileDashboardController {
  constructor(private service: MobileDashboardService) {}
  @Get("mobile/dashboard")
  @TenantPermission(
    "teaching.read.assigned",
    "teaching.read.own",
    "teaching.read.linked",
  )
  @ApiQuery({ name: "studentId", required: false, type: String })
  @ApiOkResponse({ type: DashboardResponse })
  dashboard(
    @Req() r: ApiRequest,
    @Query("studentId", new ParseUUIDPipe({ optional: true }))
    studentId?: string,
  ) {
    return this.service.summary(requestClaims(r), studentId);
  }
  @Get("mobile/guardian/students/:id/summary")
  @TenantPermission("teaching.read.linked")
  @ApiOkResponse({ type: DashboardResponse })
  child(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.summary(requestClaims(r), id);
  }
}
