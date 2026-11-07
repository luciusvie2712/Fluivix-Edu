import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { MetaDto, PageView } from "./response.dto";
import { ListDto } from "./auth.dto";
export class TeacherInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() userId!: string;
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{1,40}$/) teacherCode!: string;
  @ApiProperty() @IsString() @Matches(/\S/) @Length(1, 150) fullName!: string;
}
export class TeacherQuery extends ListDto {
  @ApiPropertyOptional({ enum: ["ACTIVE", "INACTIVE"] })
  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: string;
}
export class TeacherView extends TeacherInput {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
  @ApiProperty() accountReady!: boolean;
}
export class TeacherAccountView {
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
}
export class TeacherAccountsResponse {
  @ApiProperty({ type: [TeacherAccountView] }) data!: TeacherAccountView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TeacherClassView {
  @ApiProperty() id!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() classCode!: string;
  @ApiProperty() className!: string;
  @ApiProperty() classStatus!: string;
  @ApiProperty({ format: "date" }) effectiveFrom!: string;
  @ApiProperty({ type: String, format: "date", nullable: true }) effectiveTo!:
    | string
    | null;
}
export class TeacherClassesResponse {
  @ApiProperty({ type: [TeacherClassView] }) data!: TeacherClassView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TeachersResponse {
  @ApiProperty({ type: [TeacherView] }) data!: TeacherView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class LifecycleVersion {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Matches(/\S/)
  @Length(10, 500)
  reason!: string;
}
export class TeacherUpdate extends LifecycleVersion {
  @ApiProperty() @IsString() @Matches(/\S/) @Length(1, 150) fullName!: string;
  @ApiProperty({ enum: ["ACTIVE", "INACTIVE"] })
  @IsIn(["ACTIVE", "INACTIVE"])
  status!: string;
}
export class ClassUpdate extends LifecycleVersion {
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  roomId?: string | null;
  @ApiProperty() @IsString() @Matches(/\S/) @Length(1, 150) name!: string;
  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;
}
export class WithdrawInput extends LifecycleVersion {
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  leftAt!: string;
}
export class TeacherResponse {
  @ApiProperty({ type: TeacherView }) data!: TeacherView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ClassInput {
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  roomId?: string | null;
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{1,40}$/) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  startDate!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  endDate!: string;
}
export class ClassView extends ClassInput {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
}
export class ClassResponse {
  @ApiProperty({ type: ClassView }) data!: ClassView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ClassesResponse {
  @ApiProperty({ type: [ClassView] }) data!: ClassView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ClassRosterRow {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty() studentId!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: "date" }) joinedAt!: string;
}
export class ClassRosterResponse {
  @ApiProperty({ type: [ClassRosterRow] }) data!: ClassRosterRow[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class EnrollmentInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() studentId!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  joinedAt!: string;
}
export class EnrollmentView extends EnrollmentInput {
  @ApiProperty() id!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ type: String, format: "date", nullable: true })
  leftAt?: string | null;
}
export class EnrollmentResponse {
  @ApiProperty({ type: EnrollmentView }) data!: EnrollmentView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TeacherAssignmentInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() teacherId!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  effectiveFrom!: string;
  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  effectiveTo?: string;
}
export class AssignmentView extends TeacherAssignmentInput {
  @ApiProperty() id!: string;
}
export class AssignmentResponse {
  @ApiProperty({ type: AssignmentView }) data!: AssignmentView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class SessionInput {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  roomId?: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() teacherId!: string;
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  startsAt!: string;
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  endsAt!: string;
}
export class ScheduleRuleInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() teacherId!: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  roomId?: string;
  @ApiProperty({ minimum: 1, maximum: 7, description: "ISO weekday: Monday=1" })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;
  @ApiProperty({ example: "18:00" })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  localStart!: string;
  @ApiProperty({ example: "19:30" })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  localEnd!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  validFrom!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  validTo!: string;
}
export class ScheduleRuleView extends ScheduleRuleInput {
  @ApiProperty() lineageId!: string;
  @ApiProperty() id!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() version!: number;
  @ApiProperty() active!: boolean;
}
export class ScheduleRuleResponse {
  @ApiProperty({ type: ScheduleRuleView }) data!: ScheduleRuleView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ScheduleRulesResponse {
  @ApiProperty({ type: [ScheduleRuleView] }) data!: ScheduleRuleView[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ScheduleRuleReplacement extends ScheduleRuleInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  reason!: string;
}
export class ScheduleRevisionView {
  @ApiProperty() id!: string;
  @ApiProperty() ruleId!: string;
  @ApiProperty() replacementId!: string;
  @ApiProperty({ format: "date" }) effectiveFrom!: string;
  @ApiProperty() reason!: string;
  @ApiProperty() actorId!: string;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: ScheduleRuleView }) before!: ScheduleRuleView;
  @ApiProperty({ type: ScheduleRuleView }) after!: ScheduleRuleView;
}
export class ScheduleRevisionsResponse {
  @ApiProperty({ type: [ScheduleRevisionView] }) data!: ScheduleRevisionView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GenerationWindow {
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to!: string;
}
export class ScheduleCandidate {
  @ApiPropertyOptional({ format: "date" }) occurrenceDate?: string;
  @ApiProperty({ format: "date" }) scheduledDate!: string;
  @ApiProperty({ format: "date-time" }) startsAt!: string;
  @ApiProperty({ format: "date-time" }) endsAt!: string;
  @ApiProperty({ enum: ["AVAILABLE", "EXISTING", "PRESERVED", "CONFLICT"] })
  status!: string;
  @ApiPropertyOptional() conflict?: string;
}
export class SchedulePreview {
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: [ScheduleCandidate] }) candidates!: ScheduleCandidate[];
  @ApiProperty() created!: number;
  @ApiProperty() skipped!: number;
}
export class SchedulePreviewResponse {
  @ApiProperty({ type: SchedulePreview }) data!: SchedulePreview;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TeachingSessionView extends SessionInput {
  @ApiProperty({ type: String, nullable: true }) roomName!: string | null;
  @ApiProperty() changeCount!: number;
  @ApiProperty() id!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() className!: string;
  @ApiProperty({ format: "date" }) scheduledDate!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  finalizedAt!: string | null;
}
export class SessionResponse {
  @ApiProperty({ type: TeachingSessionView }) data!: TeachingSessionView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class SessionsListResponse {
  @ApiProperty({ type: [TeachingSessionView] }) data!: TeachingSessionView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ScheduleQuery extends ListDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  classId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  teacherId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  roomId?: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to!: string;
}
export class VersionInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) sessionVersion!: number;
}
export const attendanceStatuses = [
  "UNMARKED",
  "PRESENT",
  "LATE",
  "ABSENT_EXCUSED",
  "ABSENT_UNEXCUSED",
] as const;
export class AttendanceInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() studentId!: string;
  @ApiProperty({ enum: attendanceStatuses })
  @IsIn(attendanceStatuses)
  status!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}
export class AttendanceDraft extends VersionInput {
  @ApiProperty({ type: [AttendanceInput] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique((r: AttendanceInput) => r.studentId)
  @ValidateNested({ each: true })
  @Type(() => AttendanceInput)
  records!: AttendanceInput[];
}
export class ReopenInput extends VersionInput {
  @ApiProperty() @IsString() @Length(10, 500) reason!: string;
}
export class RescheduleInput extends SessionInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) sessionVersion!: number;
  @ApiProperty() @IsString() @Length(10, 500) reason!: string;
}
export class RoomInput {
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{1,40}$/) code!: string;
  @ApiProperty() @IsString() @Matches(/\S/) @Length(1, 150) name!: string;
  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;
}
export class RoomView extends RoomInput {
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty() id!: string;
  @ApiProperty() active!: boolean;
}
export class RoomResponse {
  @ApiProperty({ type: RoomView }) data!: RoomView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class RoomsResponse {
  @ApiProperty({ type: [RoomView] }) data!: RoomView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class RosterView extends AttendanceInput {
  @ApiProperty() fullName!: string;
}
export class AttendanceView {
  @ApiProperty({ type: TeachingSessionView }) session!: TeachingSessionView;
  @ApiProperty({ type: [RosterView] }) rows!: RosterView[];
}
export class AttendanceResponse {
  @ApiProperty({ type: AttendanceView }) data!: AttendanceView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PublishedAttendance extends TeachingSessionView {
  @ApiProperty() attendanceStatus!: string;
}
export class PublishedAttendanceResponse {
  @ApiProperty({ type: [PublishedAttendance] }) data!: PublishedAttendance[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class AttendanceSummaryView {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() total!: number;
  @ApiProperty() present!: number;
  @ApiProperty() late!: number;
  @ApiProperty() excused!: number;
  @ApiProperty() unexcused!: number;
  @ApiProperty({ type: String, nullable: true }) attendedPercent!:
    | string
    | null;
  @ApiProperty() denominator!: string;
}
export class AttendanceSummaryResponse {
  @ApiProperty({ type: AttendanceSummaryView }) data!: AttendanceSummaryView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class LessonInput extends VersionInput {
  @ApiProperty() @IsString() @Length(1, 2000) lessonSummary!: string;
  @ApiProperty() @IsString() @Length(0, 2000) homeworkText!: string;
  @ApiProperty() @IsString() @Length(0, 2000) teacherNotesPrivate!: string;
}
export class LessonView {
  @ApiProperty() lessonSummary!: string;
  @ApiProperty() homeworkText!: string;
  @ApiProperty() teacherNotesPrivate!: string;
  @ApiProperty() sessionVersion!: number;
}
export class LessonResponse {
  @ApiProperty({ type: LessonView }) data!: LessonView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
