import {
  createApiClient,
  type components,
  type paths,
} from "@fluivix/api-client";
type CalendarQuery = NonNullable<
  paths["/api/v1/schedule"]["get"]["parameters"]["query"]
>;
export type Me = components["schemas"]["MeView"];
export type Role = components["schemas"]["Role"];
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
const api = createApiClient(
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ??
    "http://localhost:4000",
);
export const staff = {
  list: (
    page: number,
    search: string,
    status?: components["schemas"]["StaffView"]["status"],
    signal?: AbortSignal,
  ) =>
    unwrap(
      api.GET("/api/v1/staff", {
        params: {
          query: { page, limit: 20, search, ...(status ? { status } : {}) },
        },
        ...(signal ? { signal } : {}),
      }),
    ),
  detail: (id: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/staff/{id}", {
        params: { path: { id } },
        ...(signal ? { signal } : {}),
      }),
    ),
  invite: (body: components["schemas"]["InviteDto"]) =>
    unwrap(api.POST("/api/v1/staff", { body })),
  update: (id: string, body: components["schemas"]["StaffUpdate"]) =>
    unwrap(api.PATCH("/api/v1/staff/{id}", { params: { path: { id } }, body })),
  addRole: (id: string, body: components["schemas"]["StaffRoleChange"]) =>
    unwrap(
      api.POST("/api/v1/staff/{id}/roles", { params: { path: { id } }, body }),
    ),
  removeRole: (
    id: string,
    roleId: Role,
    body: components["schemas"]["StaffChange"],
  ) =>
    unwrap(
      api.DELETE("/api/v1/staff/{id}/roles/{roleId}", {
        params: { path: { id, roleId } },
        body,
      }),
    ),
  invitations: (page: number, search: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/staff/invitations", {
        params: { query: { page, limit: 10, search } },
        ...(signal ? { signal } : {}),
      }),
    ),
  resend: (id: string) =>
    unwrap(
      api.POST("/api/v1/staff/invitations/{id}/resend", {
        params: { path: { id } },
        headers: { "Content-Type": "application/json" },
      }),
    ),
  permissions: (signal?: AbortSignal) =>
    unwrap(api.GET("/api/v1/permissions", { ...(signal ? { signal } : {}) })),
};
export const previewStudentImport = (
  body: components["schemas"]["StudentCsvInput"],
) => unwrap(api.POST("/api/v1/students/imports", { body }));
export const readStudentImport = (id: string) =>
  unwrap(
    api.GET("/api/v1/students/imports/{id}", { params: { path: { id } } }),
  );
export const commitStudentImport = (id: string) =>
  unwrap(
    api.POST("/api/v1/students/imports/{id}/commit", {
      params: { path: { id } },
      headers: { "Content-Type": "application/json" },
    }),
  );
api.use({
  onRequest({ request }) {
    if (accessToken)
      request.headers.set("Authorization", `Bearer ${accessToken}`);
    return request;
  },
  onResponse({ request, response }) {
    if (
      response.status === 401 &&
      request.headers.has("Authorization") &&
      typeof window !== "undefined"
    ) {
      accessToken = null;
      window.dispatchEvent(new Event("fluivix-session-expired"));
    }
    return response;
  },
});
async function unwrap<T>(
  result: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const response = await result.catch(() => {
    throw new ApiError(
      0,
      "Không thể kết nối dịch vụ. Kiểm tra mạng rồi thử lại.",
    );
  });
  if (response.error || !response.response.ok || response.data === undefined) {
    const status = response.response.status;
    const message =
      status === 401
        ? "Phiên đăng nhập hết hạn hoặc thông tin không hợp lệ."
        : status === 403
          ? "Không có quyền hoặc trung tâm đang bị hạn chế."
          : status === 404
            ? "Không tìm thấy dữ liệu trong trung tâm đang chọn."
            : status === 409
              ? "Dữ liệu đã thay đổi hoặc bị trùng. Vui lòng kiểm tra lại."
              : status === 422
                ? "Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường."
                : status === 429
                  ? "Quá nhiều yêu cầu. Vui lòng thử lại sau."
                  : "Không thể kết nối dịch vụ. Vui lòng thử lại.";
    throw new ApiError(status, message);
  }
  return response.data;
}
export const login = (body: components["schemas"]["LoginDto"]) =>
  unwrap(api.POST("/api/v1/auth/login", { body }));
export const subscriptionInfo = () =>
  unwrap(api.GET("/api/v1/tenant/subscription"));
let refreshing: ReturnType<typeof refreshRequest> | null = null;
const refreshRequest = () =>
  unwrap(
    api.POST("/api/v1/auth/refresh", {
      headers: { "Content-Type": "application/json" },
    }),
  );
export function refresh() {
  refreshing ??= refreshRequest().finally(() => {
    refreshing = null;
  });
  return refreshing;
}
export const getMe = () => unwrap(api.GET("/api/v1/me"));
export const switchContext = (body: components["schemas"]["ContextDto"]) =>
  unwrap(api.POST("/api/v1/auth/switch-context", { body }));
export const forgotPassword = (body: components["schemas"]["ForgotDto"]) =>
  unwrap(api.POST("/api/v1/auth/forgot-password", { body }));
export const resetPassword = (body: components["schemas"]["ResetDto"]) =>
  unwrap(api.POST("/api/v1/auth/reset-password", { body }));
export const acceptInvitation = (
  body: components["schemas"]["AcceptInvitationDto"],
) => unwrap(api.POST("/api/v1/auth/accept-invitation", { body }));
export const logout = () =>
  unwrap(
    api.POST("/api/v1/auth/logout", {
      headers: { "Content-Type": "application/json" },
    }),
  );
export const sessions = () => unwrap(api.GET("/api/v1/me/sessions"));
export const revokeSession = (id: string) =>
  unwrap(
    api.DELETE("/api/v1/me/sessions/{id}", {
      params: { path: { id } },
      headers: { "Content-Type": "application/json" },
    }),
  );
export const students = (
  page: number,
  search: string,
  signal?: AbortSignal,
  status?: components["schemas"]["StudentView"]["status"],
) =>
  unwrap(
    api.GET("/api/v1/students", {
      params: {
        query: { page, limit: 20, search, ...(status ? { status } : {}) },
      },
      ...(signal ? { signal } : {}),
    }),
  );
export const createStudent = (
  body: components["schemas"]["CreateStudentDto"],
) => unwrap(api.POST("/api/v1/students", { body }));
export const teaching = {
  previewDraftRule: (
    id: string,
    body: components["schemas"]["ScheduleRuleInput"],
  ) =>
    unwrap(
      api.POST("/api/v1/classes/{id}/schedule-rules/preview", {
        params: { path: { id } },
        body,
      }),
    ),
  replaceRule: (
    id: string,
    ruleId: string,
    body: components["schemas"]["ScheduleRuleReplacement"],
  ) =>
    unwrap(
      api.PATCH("/api/v1/classes/{id}/schedule-rules/{ruleId}", {
        params: { path: { id, ruleId } },
        body,
      }),
    ),
  ruleHistory: (id: string, ruleId: string, page = 1) =>
    unwrap(
      api.GET("/api/v1/classes/{id}/schedule-rules/{ruleId}/history", {
        params: { path: { id, ruleId }, query: { page, limit: 20 } },
      }),
    ),
  attendance: (id: string) =>
    unwrap(
      api.GET("/api/v1/sessions/{id}/attendance", { params: { path: { id } } }),
    ),
  saveAttendance: (
    id: string,
    body: components["schemas"]["AttendanceDraft"],
  ) =>
    unwrap(
      api.PUT("/api/v1/sessions/{id}/attendance/draft", {
        params: { path: { id } },
        body,
      }),
    ),
  finalize: (id: string, body: components["schemas"]["VersionInput"]) =>
    unwrap(
      api.POST("/api/v1/sessions/{id}/attendance/finalize", {
        params: { path: { id } },
        body,
      }),
    ),
  reopen: (id: string, body: components["schemas"]["ReopenInput"]) =>
    unwrap(
      api.POST("/api/v1/sessions/{id}/attendance/reopen", {
        params: { path: { id } },
        body,
      }),
    ),
  cancel: (id: string, body: components["schemas"]["ReopenInput"]) =>
    unwrap(
      api.POST("/api/v1/sessions/{id}/cancel", {
        params: { path: { id } },
        body,
      }),
    ),
  reschedule: (id: string, body: components["schemas"]["RescheduleInput"]) =>
    unwrap(
      api.POST("/api/v1/sessions/{id}/reschedule", {
        params: { path: { id } },
        body,
      }),
    ),
  lesson: (id: string) =>
    unwrap(
      api.GET("/api/v1/sessions/{id}/lesson-report", {
        params: { path: { id } },
      }),
    ),
  saveLesson: (id: string, body: components["schemas"]["LessonInput"]) =>
    unwrap(
      api.PUT("/api/v1/sessions/{id}/lesson-report", {
        params: { path: { id } },
        body,
      }),
    ),
  classes: (page = 1, search = "", signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/classes", {
        params: { query: { page, limit: 20, search } },
        ...(signal ? { signal } : {}),
      }),
    ),
  createClass: (body: components["schemas"]["ClassInput"]) =>
    unwrap(api.POST("/api/v1/classes", { body })),
  classDetail: (id: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/classes/{id}", {
        params: { path: { id } },
        ...(signal ? { signal } : {}),
      }),
    ),
  updateClass: (id: string, body: components["schemas"]["ClassUpdate"]) =>
    unwrap(
      api.PATCH("/api/v1/classes/{id}", { params: { path: { id } }, body }),
    ),
  closeClass: (id: string, body: components["schemas"]["LifecycleVersion"]) =>
    unwrap(
      api.POST("/api/v1/classes/{id}/close", {
        params: { path: { id } },
        body,
      }),
    ),
  roster: (id: string, page = 1) =>
    unwrap(
      api.GET("/api/v1/classes/{id}/enrollments", {
        params: { path: { id }, query: { page, limit: 20 } },
      }),
    ),
  enroll: (id: string, body: components["schemas"]["EnrollmentInput"]) =>
    unwrap(
      api.POST("/api/v1/classes/{id}/enrollments", {
        params: { path: { id } },
        body,
      }),
    ),
  withdraw: (
    id: string,
    enrollmentId: string,
    body: components["schemas"]["WithdrawInput"],
  ) =>
    unwrap(
      api.POST("/api/v1/classes/{id}/enrollments/{enrollmentId}/withdraw", {
        params: { path: { id, enrollmentId } },
        body,
      }),
    ),
  teachers: (
    page = 1,
    search = "",
    signal?: AbortSignal,
    status?: "ACTIVE" | "INACTIVE",
  ) =>
    unwrap(
      api.GET("/api/v1/teachers", {
        params: {
          query: { page, limit: 20, search, ...(status ? { status } : {}) },
        },
        ...(signal ? { signal } : {}),
      }),
    ),
  teacherDetail: (id: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/teachers/{id}", {
        params: { path: { id } },
        ...(signal ? { signal } : {}),
      }),
    ),
  createTeacher: (body: components["schemas"]["TeacherInput"]) =>
    unwrap(api.POST("/api/v1/teachers", { body })),
  teacherAccounts: (page: number, search: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/teachers/accounts", {
        params: { query: { page, limit: 20, search } },
        ...(signal ? { signal } : {}),
      }),
    ),
  teacherClasses: (id: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/teachers/{id}/classes", {
        params: { path: { id }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
  updateTeacher: (id: string, body: components["schemas"]["TeacherUpdate"]) =>
    unwrap(
      api.PATCH("/api/v1/teachers/{id}", { params: { path: { id } }, body }),
    ),
  assign: (id: string, body: components["schemas"]["TeacherAssignmentInput"]) =>
    unwrap(
      api.POST("/api/v1/classes/{id}/teachers", {
        params: { path: { id } },
        body,
      }),
    ),
  rules: (id: string) =>
    unwrap(
      api.GET("/api/v1/classes/{id}/schedule-rules", {
        params: { path: { id } },
      }),
    ),
  createRule: (id: string, body: components["schemas"]["ScheduleRuleInput"]) =>
    unwrap(
      api.POST("/api/v1/classes/{id}/schedule-rules", {
        params: { path: { id } },
        body,
      }),
    ),
  preview: (
    id: string,
    ruleId: string,
    query: components["schemas"]["GenerationWindow"],
  ) =>
    unwrap(
      api.GET("/api/v1/classes/{id}/schedule-rules/{ruleId}/preview", {
        params: { path: { id, ruleId }, query },
      }),
    ),
  generate: (
    id: string,
    ruleId: string,
    body: components["schemas"]["GenerationWindow"],
  ) =>
    unwrap(
      api.POST("/api/v1/classes/{id}/schedule-rules/{ruleId}/generate", {
        params: { path: { id, ruleId } },
        body,
      }),
    ),
  calendar: (query: CalendarQuery) =>
    unwrap(api.GET("/api/v1/schedule", { params: { query } })),
  classSessions: (id: string, query: CalendarQuery) =>
    unwrap(
      api.GET("/api/v1/classes/{id}/sessions", {
        params: { path: { id }, query },
      }),
    ),
};
export const feePlans = {
  list: (
    page: number,
    search: string,
    status: "" | "ACTIVE" | "ARCHIVED",
    classId: string,
    signal?: AbortSignal,
  ) =>
    unwrap(
      api.GET("/api/v1/fee-plans", {
        params: {
          query: {
            page,
            limit: 20,
            search,
            ...(status ? { status } : {}),
            ...(classId ? { classId } : {}),
          },
        },
        ...(signal ? { signal } : {}),
      }),
    ),
  classes: (
    page: number,
    search: string,
    signal?: AbortSignal,
    includeClosed = false,
  ) =>
    unwrap(
      api.GET("/api/v1/fee-plans/classes", {
        params: {
          query: {
            page,
            limit: 20,
            search,
            ...(includeClosed ? { includeClosed: "true" } : {}),
          },
        },
        ...(signal ? { signal } : {}),
      }),
    ),
  detail: (id: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/fee-plans/{id}", {
        params: { path: { id } },
        ...(signal ? { signal } : {}),
      }),
    ),
  terms: (id: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/fee-plans/{id}/terms", {
        params: { path: { id }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
  create: (body: components["schemas"]["FeePlanInput"]) =>
    unwrap(api.POST("/api/v1/fee-plans", { body })),
  update: (id: string, body: components["schemas"]["FeePlanTermInput"]) =>
    unwrap(
      api.PATCH("/api/v1/fee-plans/{id}", { params: { path: { id } }, body }),
    ),
};
export const invoices = {
  list: (
    query: NonNullable<paths["/api/v1/invoices"]["get"]["parameters"]["query"]>,
    signal?: AbortSignal,
  ) =>
    unwrap(
      api.GET("/api/v1/invoices", {
        params: { query },
        ...(signal ? { signal } : {}),
      }),
    ),
  detail: (id: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/invoices/{id}", {
        params: { path: { id } },
        ...(signal ? { signal } : {}),
      }),
    ),
  items: (id: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/invoices/{id}/items", {
        params: { path: { id }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
  history: (id: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/invoices/{id}/history", {
        params: { path: { id }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
  feeOptions: (
    page: number,
    search: string,
    signal?: AbortSignal,
    includeArchived = false,
  ) =>
    unwrap(
      api.GET("/api/v1/invoices/fee-options", {
        params: {
          query: {
            page,
            limit: 20,
            search,
            ...(includeArchived ? { includeArchived: "true" } : {}),
          },
        },
        ...(signal ? { signal } : {}),
      }),
    ),
  preview: (body: components["schemas"]["InvoiceRunInput"], page: number) =>
    unwrap(
      api.POST("/api/v1/invoices/preview-run", {
        body,
        params: { query: { page, limit: 20 } },
      }),
    ),
  generate: (body: components["schemas"]["InvoiceRunInput"], key: string) =>
    unwrap(
      api.POST("/api/v1/invoices/generate-run", {
        body,
        params: { header: { "idempotency-key": key } },
      }),
    ),
  void: (id: string, body: components["schemas"]["FinanceReason"]) =>
    unwrap(
      api.POST("/api/v1/invoices/{id}/void", {
        params: { path: { id } },
        body,
      }),
    ),
};
export const assessments = {
  list: (
    id: string,
    page: number,
    search: string,
    status: "DRAFT" | "PUBLISHED" | "",
    signal?: AbortSignal,
  ) =>
    unwrap(
      api.GET("/api/v1/classes/{id}/assessments", {
        params: {
          path: { id },
          query: { page, limit: 20, search, ...(status ? { status } : {}) },
        },
        ...(signal ? { signal } : {}),
      }),
    ),
  create: (id: string, body: components["schemas"]["AssessmentInput"]) =>
    unwrap(
      api.POST("/api/v1/classes/{id}/assessments", {
        params: { path: { id } },
        body,
      }),
    ),
  results: (id: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/assessments/{id}/results", {
        params: { path: { id } },
        ...(signal ? { signal } : {}),
      }),
    ),
  save: (id: string, body: components["schemas"]["GradeBatch"]) =>
    unwrap(
      api.PUT("/api/v1/assessments/{id}/results", {
        params: { path: { id } },
        body,
      }),
    ),
  publish: (id: string, body: components["schemas"]["AssessmentVersion"]) =>
    unwrap(
      api.POST("/api/v1/assessments/{id}/publish", {
        params: { path: { id } },
        body,
      }),
    ),
  reopen: (id: string, body: components["schemas"]["AssessmentCorrection"]) =>
    unwrap(
      api.POST("/api/v1/assessments/{id}/reopen", {
        params: { path: { id } },
        body,
      }),
    ),
  history: (id: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/assessments/{id}/history", {
        params: { path: { id }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
  lifecycle: (id: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/assessments/{id}/lifecycle", {
        params: { path: { id }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
  student: (id: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/students/{id}/grades", {
        params: { path: { id }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
};
export const studentDetail = (id: string, signal?: AbortSignal) =>
  unwrap(
    api.GET("/api/v1/students/{id}", {
      params: { path: { id } },
      ...(signal ? { signal } : {}),
    }),
  );
type GuardianDirectoryQuery = NonNullable<
  paths["/api/v1/guardians"]["get"]["parameters"]["query"]
>;
export type GuardianLinkStatus = NonNullable<
  GuardianDirectoryQuery["relationshipStatus"]
>;
export const guardians = {
  list: (query: GuardianDirectoryQuery, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/guardians", {
        params: { query },
        ...(signal ? { signal } : {}),
      }),
    ),
  provision: (email: string) =>
    unwrap(api.POST("/api/v1/guardians", { body: { email } })),
  detail: (userId: string, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/guardians/{userId}", {
        params: { path: { userId } },
        ...(signal ? { signal } : {}),
      }),
    ),
  links: (
    userId: string,
    page: number,
    status: GuardianLinkStatus | "",
    signal?: AbortSignal,
  ) =>
    unwrap(
      api.GET("/api/v1/guardians/{userId}/links", {
        params: {
          path: { userId },
          query: { page, limit: 20, ...(status ? { status } : {}) },
        },
        ...(signal ? { signal } : {}),
      }),
    ),
  studentLinks: (
    id: string,
    page: number,
    status: GuardianLinkStatus | "",
    signal?: AbortSignal,
  ) =>
    unwrap(
      api.GET("/api/v1/students/{id}/guardians", {
        params: {
          path: { id },
          query: { page, limit: 20, ...(status ? { status } : {}) },
        },
        ...(signal ? { signal } : {}),
      }),
    ),
  createLink: (id: string, body: components["schemas"]["LinkInput"]) =>
    unwrap(
      api.POST("/api/v1/students/{id}/guardians", {
        params: { path: { id } },
        body,
      }),
    ),
  approve: (
    id: string,
    linkId: string,
    body: components["schemas"]["VerifyLink"],
  ) =>
    unwrap(
      api.POST("/api/v1/students/{id}/guardians/{linkId}/approve", {
        params: { path: { id, linkId } },
        body,
      }),
    ),
  revoke: (
    id: string,
    linkId: string,
    body: components["schemas"]["RevokeLink"],
  ) =>
    unwrap(
      api.DELETE("/api/v1/students/{id}/guardians/{linkId}", {
        params: { path: { id, linkId } },
        body,
      }),
    ),
  history: (id: string, linkId: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/students/{id}/guardians/{linkId}/history", {
        params: { path: { id, linkId }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
  invitations: (userId: string, page: number, signal?: AbortSignal) =>
    unwrap(
      api.GET("/api/v1/guardians/{userId}/invitations", {
        params: { path: { userId }, query: { page, limit: 20 } },
        ...(signal ? { signal } : {}),
      }),
    ),
  invite: (userId: string) =>
    unwrap(
      api.POST("/api/v1/guardians/{userId}/invite", {
        params: { path: { userId } },
        headers: { "Content-Type": "application/json" },
      }),
    ),
  resend: (userId: string, invitationId: string) =>
    unwrap(
      api.POST("/api/v1/guardians/{userId}/invitations/{invitationId}/resend", {
        params: { path: { userId, invitationId } },
        headers: { "Content-Type": "application/json" },
      }),
    ),
};
export const updateStudent = (
  id: string,
  body: components["schemas"]["UpdateStudentDto"],
) =>
  unwrap(
    api.PATCH("/api/v1/students/{id}", { params: { path: { id } }, body }),
  );
export const deactivateStudent = (
  id: string,
  body: components["schemas"]["DeactivateStudentDto"],
) =>
  unwrap(
    api.POST("/api/v1/students/{id}/deactivate", {
      params: { path: { id } },
      body,
    }),
  );
