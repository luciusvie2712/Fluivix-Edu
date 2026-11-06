import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsOptional, IsUUID, Matches } from "class-validator";
import { ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";
export class ReportQuery extends ListDto {
  @ApiProperty({
    format: "date",
    description:
      "Inclusive date in the active tenant IANA calendar; at most366 days",
  })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to!: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  classId?: string;
}
export class ReportRangeView {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() asOf!: string;
}
export class ReportSessionView {
  @ApiProperty() expectedSessions!: number;
  @ApiProperty() cancelledSessions!: number;
  @ApiProperty() upcomingSessions!: number;
}
export class ReportAttendanceView {
  @ApiProperty() finalizedSessions!: number;
  @ApiProperty() eligibleSessions!: number;
  @ApiProperty() completedEligibleSessions!: number;
  @ApiProperty({ type: Number, nullable: true }) completionRateBps!:
    | number
    | null;
  @ApiProperty() rosterCount!: number;
  @ApiProperty() presentCount!: number;
  @ApiProperty() lateCount!: number;
  @ApiProperty() excusedCount!: number;
  @ApiProperty() unexcusedCount!: number;
  @ApiProperty({ type: Number, nullable: true }) presenceRateBps!:
    | number
    | null;
}
export class ReportTrendView extends ReportSessionView {
  @ApiProperty({ format: "date" }) day!: string;
}
export class CollectionTotalsView {
  @ApiProperty() issuedCount!: number;
  @ApiProperty({ type: String }) issuedAmountVnd!: string;
  @ApiProperty() receiptCount!: number;
  @ApiProperty({ type: String }) collectedAmountVnd!: string;
  @ApiProperty({ type: String }) allocatedAmountVnd!: string;
  @ApiProperty({ type: String, nullable: true }) unallocatedAmountVnd!:
    | string
    | null;
  @ApiProperty({ type: String }) balanceVnd!: string;
  @ApiProperty({ type: String }) overdueAmountVnd!: string;
}
export class CollectionDayView extends CollectionTotalsView {
  @ApiProperty({ format: "date" }) day!: string;
}
export class CollectionReportView extends ReportRangeView {
  @ApiProperty({
    enum: ["RECEIVED", "CLASS_ALLOCATED"],
    description:
      "Class filters attribute only allocations, never unallocated centre receipts",
  })
  basis!: "RECEIVED" | "CLASS_ALLOCATED";
  @ApiProperty({ type: CollectionTotalsView }) summary!: CollectionTotalsView;
  @ApiProperty({ type: [CollectionDayView] }) days!: CollectionDayView[];
}
export class OperationalDashboardView extends ReportRangeView {
  @ApiProperty() activeStudents!: number;
  @ApiProperty() activeTeachers!: number;
  @ApiProperty() activeClasses!: number;
  @ApiProperty({ type: ReportSessionView }) sessions!: ReportSessionView;
  @ApiProperty({ type: ReportAttendanceView, nullable: true })
  attendance!: ReportAttendanceView | null;
  @ApiProperty({ type: CollectionReportView, nullable: true })
  finance!: CollectionReportView | null;
  @ApiProperty({ type: [ReportTrendView] }) days!: ReportTrendView[];
}
export class AttendanceClassView extends ReportAttendanceView {
  @ApiProperty() classId!: string;
  @ApiProperty() classCode!: string;
  @ApiProperty() className!: string;
}
export class AttendanceReportView extends ReportRangeView {
  @ApiProperty({ type: ReportAttendanceView }) summary!: ReportAttendanceView;
  @ApiProperty({ type: [AttendanceClassView] }) classes!: AttendanceClassView[];
  @ApiProperty({ type: PageView }) page!: PageView;
}
export class EnrollmentClassView {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
  @ApiProperty() enrollmentCount!: number;
  @ApiProperty() studentCount!: number;
}
export class EnrollmentReportView extends ReportRangeView {
  @ApiProperty() enrollmentCount!: number;
  @ApiProperty() studentCount!: number;
  @ApiProperty({ type: [EnrollmentClassView] }) classes!: EnrollmentClassView[];
  @ApiProperty({ type: PageView }) page!: PageView;
}
export class ReportCsvView extends ReportRangeView {
  @ApiProperty() filename!: string;
  @ApiProperty() csv!: string;
  @ApiProperty() rowCount!: number;
}
export class OperationalDashboardResponse {
  @ApiProperty({ type: OperationalDashboardView })
  data!: OperationalDashboardView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class AttendanceReportResponse {
  @ApiProperty({ type: AttendanceReportView }) data!: AttendanceReportView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class EnrollmentReportResponse {
  @ApiProperty({ type: EnrollmentReportView }) data!: EnrollmentReportView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class CollectionReportResponse {
  @ApiProperty({ type: CollectionReportView }) data!: CollectionReportView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ReportCsvResponse {
  @ApiProperty({ type: ReportCsvView }) data!: ReportCsvView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
