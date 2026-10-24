import { createApiClient, type components } from "@fluivix/api-client";
export type Me = components["schemas"]["MeView"];
export type MobileRole = "teacher" | "student" | "guardian";
export const mobileRoles: readonly string[] = [
  "teacher",
  "student",
  "guardian",
];
export interface CredentialStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}
export class ApiFailure extends Error {
  constructor(
    public status: number,
    message: string,
    public traceId?: string,
  ) {
    super(message);
  }
}
export class StaleContext extends Error {
  constructor() {
    super("Ngữ cảnh đã thay đổi. Vui lòng tải lại.");
  }
}
export function unwrap<T>(result: {
  data?: { data: T };
  error?: { error: { message: string }; meta: { traceId: string } };
  response: Response;
}): T {
  if (!result.data)
    throw new ApiFailure(
      result.response.status,
      result.error?.error.message ?? "Không thể tải dữ liệu.",
      result.error?.meta.traceId,
    );
  return result.data.data;
}

// The epoch invalidates pending responses as well as caches, including logout during refresh.
export class NativeSession {
  private access: string | null = null;
  private epoch = 0;
  private refreshJob: Promise<void> | null = null;
  private storageJob: Promise<void> = Promise.resolve();
  readonly api;
  private readonly identity;
  constructor(
    baseUrl: string,
    private store: CredentialStore,
    private clearScope: () => void,
    private expired: () => void,
    transport: typeof fetch = fetch,
    private blocked: () => void = () => {},
  ) {
    this.identity = createApiClient(baseUrl, "omit", transport);
    const authorized: typeof fetch = async (input, init) => {
      const epoch = this.epoch;
      let request = new Request(input, init);
      if (
        !["GET", "HEAD"].includes(request.method) &&
        !request.headers.has("Content-Type")
      ) {
        request.headers.set("Content-Type", "application/json");
        request = new Request(request, { body: "{}" });
      }
      if (this.access)
        request.headers.set("Authorization", `Bearer ${this.access}`);
      const replay = request.clone();
      let response = await transport(request);
      if (epoch !== this.epoch) throw new StaleContext();
      if (response.status === 401 && this.access) {
        await this.refresh();
        if (epoch !== this.epoch) throw new StaleContext();
        replay.headers.set("Authorization", `Bearer ${this.access}`);
        response = await transport(replay);
      }
      if (epoch !== this.epoch) throw new StaleContext();
      if (response.status === 401) await this.forget();
      else if (response.status === 403 || response.status === 404) {
        this.invalidate();
        this.blocked();
      }
      return response;
    };
    this.api = createApiClient(baseUrl, "omit", authorized);
  }
  private write(operation: () => Promise<void>) {
    const next = this.storageJob.then(operation, operation);
    this.storageJob = next.catch(() => {});
    return next;
  }
  invalidate() {
    this.epoch++;
    this.clearScope();
  }
  async forget() {
    this.access = null;
    this.invalidate();
    this.expired();
    await this.write(() => this.store.remove());
  }
  async login(email: string, password: string) {
    await this.forget();
    const epoch = this.epoch;
    const tokens = unwrap(
      await this.identity.POST("/api/v1/mobile/auth/login", {
        body: { email, password },
      }),
    );
    if (epoch !== this.epoch) throw new StaleContext();
    await this.write(() => this.store.set(tokens.refreshToken));
    if (epoch !== this.epoch) throw new StaleContext();
    this.access = tokens.accessToken;
    return this.me();
  }
  async restore() {
    if (!(await this.store.get())) return null;
    await this.refresh();
    return this.me();
  }
  refresh(): Promise<void> {
    if (this.refreshJob) return this.refreshJob;
    const epoch = this.epoch;
    const run = async () => {
      const refreshToken = await this.store.get();
      if (!refreshToken) throw new ApiFailure(401, "Vui lòng đăng nhập lại.");
      const result = await this.identity.POST("/api/v1/mobile/auth/refresh", {
        body: { refreshToken },
      });
      if (epoch !== this.epoch) throw new StaleContext();
      if (!result.data) {
        await this.forget();
        throw new ApiFailure(
          result.response.status,
          "Phiên đăng nhập đã hết hạn.",
        );
      }
      await this.write(() => this.store.set(result.data.data.refreshToken));
      if (epoch !== this.epoch) throw new StaleContext();
      this.access = result.data.data.accessToken;
    };
    this.refreshJob = run().finally(() => {
      this.refreshJob = null;
    });
    return this.refreshJob;
  }
  async me() {
    return unwrap(await this.api.GET("/api/v1/me"));
  }
  async switchContext(tenantId: string, role: MobileRole) {
    this.invalidate();
    const epoch = this.epoch;
    const result = unwrap(
      await this.api.POST("/api/v1/auth/switch-context", {
        body: { tenantId, role },
      }),
    );
    if (epoch !== this.epoch) throw new StaleContext();
    this.access = result.accessToken;
    return this.me();
  }
  async logout(all = false) {
    // Keep the refresh credential until server revocation is confirmed; an offline logout is not a revoke.
    unwrap(
      await this.api.POST(
        all ? "/api/v1/auth/logout-all" : "/api/v1/auth/logout",
      ),
    );
    await this.forget();
  }
}
