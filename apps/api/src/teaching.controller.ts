import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { TeachingService } from "./teaching.service";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import { ListDto } from "./auth.dto";
import { ErrorResponse } from "./response.dto";
import {
  AssignmentResponse,
  AttendanceDraft,
  AttendanceResponse,
  ClassInput,
  ClassResponse,
  ClassRosterResponse,
  ClassesResponse,
  EnrollmentInput,
  EnrollmentResponse,
  LessonInput,
  LessonResponse,
  PublishedAttendanceResponse,
  ReopenInput,
  ScheduleQuery,
  SessionInput,
  SessionResponse,
  SessionsListResponse,
  TeacherAssignmentInput,
  TeacherInput,
  TeacherResponse,
  VersionInput,
  AttendanceSummaryResponse,
  RescheduleInput,
  RoomInput,
  RoomResponse,
  ScheduleRuleInput,
  ScheduleRuleResponse,
  ScheduleRulesResponse,
  GenerationWindow,
  SchedulePreviewResponse,
  TeachersResponse,
  TeacherUpdate,
  TeacherQuery,
  TeacherAccountsResponse,
  TeacherClassesResponse,
  ClassUpdate,
  LifecycleVersion,
  WithdrawInput,
  RoomsResponse,
  ScheduleRuleReplacement,
  ScheduleRevisionsResponse,
} from "./teaching.dto";

@ApiTags("teaching")
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
@ApiResponse({ status: 401, type: ErrorResponse })
@ApiResponse({ status: 403, type: ErrorResponse })
@ApiResponse({ status: 404, type: ErrorResponse })
@ApiResponse({ status: 409, type: ErrorResponse })
@ApiResponse({ status: 422, type: ErrorResponse })
export class TeachingController {
  constructor(private service: TeachingService) {}
  @Post("classes/:id/schedule-rules/preview")
  @HttpCode(200)
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: SchedulePreviewResponse })
  previewDraftRule(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ScheduleRuleInput,
  ) {
    return this.service.previewDraftRule(requestClaims(r), id, body, r.traceId);
  }
  @Get("classes/:id/schedule-rules/:ruleId/history")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: ScheduleRevisionsResponse })
  ruleHistory(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Query() q: ListDto,
  ) {
    return this.service.ruleHistory(requestClaims(r), id, ruleId, q);
  }
  @Patch("classes/:id/schedule-rules/:ruleId")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: ScheduleRuleResponse })
  replaceRule(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Body() body: ScheduleRuleReplacement,
  ) {
    return this.service.replaceRule(
      requestClaims(r),
      id,
      ruleId,
      body,
      r.traceId,
    );
  }
  @Get("rooms")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: RoomsResponse })
  rooms(@Req() r: ApiRequest, @Query() q: ListDto) {
    return this.service.rooms(requestClaims(r), q);
  }
  @Get("schedule")
  @TenantPermission("teaching.read", "teaching.read.assigned")
  @ApiOkResponse({ type: SessionsListResponse })
  calendar(@Req() r: ApiRequest, @Query() q: ScheduleQuery) {
    return this.service.schedule(requestClaims(r), q);
  }
  @Get("classes/:id/sessions")
  @TenantPermission(
    "teaching.read",
    "teaching.read.assigned",
    "teaching.read.own",
  )
  @ApiOkResponse({ type: SessionsListResponse })
  classSessions(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ScheduleQuery,
  ) {
    return this.service.classSessions(requestClaims(r), id, q);
  }
  @Get("sessions/:id")
  @TenantPermission("teaching.read", "teaching.read.assigned")
  @ApiOkResponse({ type: SessionResponse })
  sessionDetail(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.sessionDetail(requestClaims(r), id);
  }
  @Get("teachers")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: TeachersResponse })
  teachers(@Req() r: ApiRequest, @Query() q: TeacherQuery) {
    return this.service.teachers(requestClaims(r), q);
  }
  @Get("teachers/accounts")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: TeacherAccountsResponse })
  teacherAccounts(@Req() r: ApiRequest, @Query() q: ListDto) {
    return this.service.teacherAccounts(requestClaims(r), q);
  }
  @Get("teachers/:id/classes")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: TeacherClassesResponse })
  teacherClasses(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.teacherClasses(requestClaims(r), id, q);
  }
  @Get("teachers/:id")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: TeacherResponse })
  teacherDetail(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.teacherDetail(requestClaims(r), id);
  }
  @Patch("teachers/:id")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: TeacherResponse })
  updateTeacher(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TeacherUpdate,
  ) {
    return this.service.updateTeacher(requestClaims(r), id, dto, r.traceId);
  }
  @Patch("classes/:id")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: ClassResponse })
  updateClass(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ClassUpdate,
  ) {
    return this.service.updateClass(requestClaims(r), id, dto, r.traceId);
  }
  @Post("classes/:id/close")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: ClassResponse })
  closeClass(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: LifecycleVersion,
  ) {
    return this.service.closeClass(requestClaims(r), id, dto, r.traceId);
  }
  @Post("classes/:id/enrollments/:enrollmentId/withdraw")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: EnrollmentResponse })
  withdraw(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("enrollmentId", ParseUUIDPipe) enrollmentId: string,
    @Body() dto: WithdrawInput,
  ) {
    return this.service.withdraw(
      requestClaims(r),
      id,
      enrollmentId,
      dto,
      r.traceId,
    );
  }
  @Get("classes/:id/schedule-rules")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: ScheduleRulesResponse })
  rules(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.scheduleRules(requestClaims(r), id);
  }
  @Post("classes/:id/schedule-rules")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: ScheduleRuleResponse })
  rule(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ScheduleRuleInput,
  ) {
    return this.service.createRule(requestClaims(r), id, dto, r.traceId);
  }
  @Get("classes/:id/schedule-rules/:ruleId/preview")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: SchedulePreviewResponse })
  previewRule(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Query() q: GenerationWindow,
  ) {
    return this.service.generateRule(
      requestClaims(r),
      id,
      ruleId,
      q,
      r.traceId,
      false,
    );
  }
  @Post("classes/:id/schedule-rules/:ruleId/generate")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: SchedulePreviewResponse })
  generateRule(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Body() dto: GenerationWindow,
  ) {
    return this.service.generateRule(
      requestClaims(r),
      id,
      ruleId,
      dto,
      r.traceId,
      true,
    );
  }
  @Get("mobile/my/attendance/summary")
  @TenantPermission("attendance.read.own")
  @ApiOkResponse({ type: AttendanceSummaryResponse })
  attendanceSummary(@Req() r: ApiRequest, @Query() q: ScheduleQuery) {
    return this.service.attendanceSummary(requestClaims(r), q);
  }
  @Get("mobile/guardian/students/:id/attendance/summary")
  @TenantPermission("attendance.read.linked")
  @ApiOkResponse({ type: AttendanceSummaryResponse })
  childAttendanceSummary(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ScheduleQuery,
  ) {
    return this.service.attendanceSummary(requestClaims(r), q, id);
  }
  @Post("rooms")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: RoomResponse })
  room(@Req() r: ApiRequest, @Body() dto: RoomInput) {
    return this.service.room(requestClaims(r), dto, r.traceId);
  }
  @Post("sessions/:id/reschedule")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: SessionResponse })
  reschedule(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RescheduleInput,
  ) {
    return this.service.changeSession(requestClaims(r), id, dto, r.traceId);
  }
  @Post("sessions/:id/cancel")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: SessionResponse })
  cancel(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReopenInput,
  ) {
    return this.service.changeSession(
      requestClaims(r),
      id,
      dto,
      r.traceId,
      true,
    );
  }
  @Post("teachers")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: TeacherResponse })
  teacher(@Req() req: ApiRequest, @Body() dto: TeacherInput) {
    return this.service.teacher(requestClaims(req), dto, req.traceId);
  }
  @Post("classes")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: ClassResponse })
  createClass(@Req() req: ApiRequest, @Body() dto: ClassInput) {
    return this.service.createClass(requestClaims(req), dto, req.traceId);
  }
  @Get("classes")
  @TenantPermission(
    "teaching.read",
    "teaching.read.assigned",
    "teaching.read.own",
  )
  @ApiOkResponse({ type: ClassesResponse })
  classes(@Req() req: ApiRequest, @Query() q: ListDto) {
    return this.service.classes(requestClaims(req), q);
  }
  @Get("mobile/my/classes")
  @TenantPermission("teaching.read.assigned", "teaching.read.own")
  @ApiOkResponse({ type: ClassesResponse })
  myClasses(@Req() req: ApiRequest, @Query() q: ListDto) {
    return this.service.classes(requestClaims(req), q);
  }
  @Get("classes/:id")
  @TenantPermission(
    "teaching.read",
    "teaching.read.assigned",
    "teaching.read.own",
  )
  @ApiOkResponse({ type: ClassResponse })
  detail(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.classDetail(requestClaims(req), id);
  }
  @Get("classes/:id/enrollments")
  @TenantPermission("teaching.read", "teaching.read.assigned")
  @ApiOkResponse({ type: ClassRosterResponse })
  classRoster(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ListDto,
  ) {
    return this.service.classRoster(requestClaims(req), id, q);
  }
  @Post("classes/:id/teachers")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: AssignmentResponse })
  assign(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TeacherAssignmentInput,
  ) {
    return this.service.assign(requestClaims(req), id, dto, req.traceId);
  }
  @Post("classes/:id/enrollments")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: EnrollmentResponse })
  enroll(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: EnrollmentInput,
  ) {
    return this.service.enroll(requestClaims(req), id, dto, req.traceId);
  }
  @Post("classes/:id/sessions/extra")
  @TenantPermission("teaching.manage")
  @ApiCreatedResponse({ type: SessionResponse })
  session(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SessionInput,
  ) {
    return this.service.createSession(requestClaims(req), id, dto, req.traceId);
  }
  @Get("mobile/my/schedule")
  @TenantPermission("teaching.read.assigned", "teaching.read.own")
  @ApiOkResponse({ type: SessionsListResponse })
  schedule(@Req() req: ApiRequest, @Query() q: ScheduleQuery) {
    return this.service.schedule(requestClaims(req), q);
  }
  @Get("mobile/guardian/students/:id/schedule")
  @TenantPermission("teaching.read.linked")
  @ApiOkResponse({ type: SessionsListResponse })
  childSchedule(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ScheduleQuery,
  ) {
    return this.service.schedule(requestClaims(req), q, id);
  }
  @Get("mobile/my/attendance")
  @TenantPermission("attendance.read.own")
  @ApiOkResponse({ type: PublishedAttendanceResponse })
  ownAttendance(@Req() req: ApiRequest, @Query() q: ScheduleQuery) {
    return this.service.schedule(requestClaims(req), q, undefined, true);
  }
  @Get("mobile/guardian/students/:id/attendance")
  @TenantPermission("attendance.read.linked")
  @ApiOkResponse({ type: PublishedAttendanceResponse })
  childAttendance(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ScheduleQuery,
  ) {
    return this.service.schedule(requestClaims(req), q, id, true);
  }
  @Get("sessions/:id/roster")
  @TenantPermission("attendance.write", "attendance.write.assigned")
  @ApiOkResponse({ type: AttendanceResponse })
  roster(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.roster(requestClaims(req), id);
  }
  @Get("sessions/:id/attendance")
  @TenantPermission("attendance.write", "attendance.write.assigned")
  @ApiOkResponse({ type: AttendanceResponse })
  attendance(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.roster(requestClaims(req), id);
  }
  @Put("sessions/:id/attendance/draft")
  @TenantPermission("attendance.write", "attendance.write.assigned")
  @ApiOkResponse({ type: AttendanceResponse })
  draft(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AttendanceDraft,
  ) {
    return this.service.draft(requestClaims(req), id, dto, req.traceId);
  }
  @Post("sessions/:id/attendance/finalize")
  @TenantPermission("attendance.write", "attendance.write.assigned")
  @ApiCreatedResponse({ type: AttendanceResponse })
  finalize(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VersionInput,
  ) {
    return this.service.finalize(
      requestClaims(req),
      id,
      dto.sessionVersion,
      req.traceId,
    );
  }
  @Post("sessions/:id/attendance/reopen")
  @TenantPermission("attendance.reopen")
  @ApiCreatedResponse({ type: AttendanceResponse })
  reopen(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReopenInput,
  ) {
    return this.service.reopen(requestClaims(req), id, dto, req.traceId);
  }
  @Get("sessions/:id/lesson-report")
  @TenantPermission("teaching.read", "teaching.read.assigned")
  @ApiOkResponse({ type: LessonResponse })
  report(@Req() req: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.lesson(requestClaims(req), id);
  }
  @Put("sessions/:id/lesson-report")
  @TenantPermission("attendance.write", "attendance.write.assigned")
  @ApiOkResponse({ type: LessonResponse })
  saveReport(
    @Req() req: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: LessonInput,
  ) {
    return this.service.lesson(requestClaims(req), id, dto, req.traceId);
  }
}
