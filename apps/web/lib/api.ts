import { createApiClient, type components } from "@fluivix/api-client";
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
  const response = await result;
  if (response.error || !response.response.ok || response.data === undefined) {
    const status = response.response.status;
    const message =
      status === 401
        ? "Phiên đăng nhập hết hạn hoặc thông tin không hợp lệ."
        : status === 403
          ? "Không có quyền hoặc trung tâm đang bị hạn chế."
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
export const students = (page: number, search: string, signal?: AbortSignal) =>
  unwrap(
    api.GET("/api/v1/students", {
      params: { query: { page, limit: 20, search } },
      ...(signal ? { signal } : {}),
    }),
  );
export const createStudent = (
  body: components["schemas"]["CreateStudentDto"],
) => unwrap(api.POST("/api/v1/students", { body }));
