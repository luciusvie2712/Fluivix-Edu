import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import { ErrorResponse } from "./response.dto";
import {
  ReportQuery,
  OperationalDashboardResponse,
  AttendanceReportResponse,
  EnrollmentReportResponse,
  CollectionReportResponse,
  ReportCsvResponse,
} from "./reports.dto";
import { ReportsService } from "./reports.service";
@ApiTags("reports")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
@Controller("reports")
@ApiResponse({ status: 401, type: ErrorResponse })
export class ReportsController {
  constructor(private service: ReportsService) {}
  @Get("dashboard")
  @TenantPermission("report.dashboard.read")
  @ApiOkResponse({ type: OperationalDashboardResponse })
  dashboard(@Req() r: ApiRequest, @Query() q: ReportQuery) {
    return this.service.dashboard(requestClaims(r), q);
  }
  @Get("attendance")
  @TenantPermission("report.attendance.read")
  @ApiOkResponse({ type: AttendanceReportResponse })
  attendance(@Req() r: ApiRequest, @Query() q: ReportQuery) {
    return this.service.attendance(requestClaims(r), q);
  }
  @Get("enrollments")
  @TenantPermission("report.dashboard.read")
  @ApiOkResponse({ type: EnrollmentReportResponse })
  enrollments(@Req() r: ApiRequest, @Query() q: ReportQuery) {
    return this.service.enrollments(requestClaims(r), q);
  }
  @Get("attendance/export")
  @TenantPermission("report.attendance.export")
  @ApiOkResponse({ type: ReportCsvResponse })
  attendanceExport(@Req() r: ApiRequest, @Query() q: ReportQuery) {
    return this.service.export(requestClaims(r), q, "attendance", r.traceId);
  }
  @Get("enrollments/export")
  @TenantPermission("report.enrollment.export")
  @ApiOkResponse({ type: ReportCsvResponse })
  enrollmentExport(@Req() r: ApiRequest, @Query() q: ReportQuery) {
    return this.service.export(requestClaims(r), q, "enrollments", r.traceId);
  }
}
@ApiTags("finance reports")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
@Controller("finance/reports")
@ApiResponse({ status: 401, type: ErrorResponse })
export class CollectionReportsController {
  constructor(private service: ReportsService) {}
  @Get("collections")
  @TenantPermission("finance.report.read")
  @ApiOkResponse({ type: CollectionReportResponse })
  collections(@Req() r: ApiRequest, @Query() q: ReportQuery) {
    return this.service.collections(requestClaims(r), q);
  }
  @Get("collections/export")
  @TenantPermission("finance.report.export")
  @ApiOkResponse({ type: ReportCsvResponse })
  export(@Req() r: ApiRequest, @Query() q: ReportQuery) {
    return this.service.export(requestClaims(r), q, "collections", r.traceId);
  }
}
