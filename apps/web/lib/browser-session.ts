"use client";
import {
  ApiError,
  browserAuth,
  installSessionAccess,
  installSessionRecovery,
  type Me,
  type Role,
  type SessionAccess,
} from "./api";
const lockName = "fluivixedu-tenant-web-session";
const scopeOf = (me: Me) =>
  `${me.id}:${me.activeTenantId ?? ""}:${me.activeRole ?? ""}`;
// Server access lifetime is five minutes. Renew after four elapsed minutes;
// changing a device's wall clock must not create an immediate refresh loop.
const renewalIntervalMs = 240000;
type Callbacks = {
  clear: () => Promise<void>;
  update: (me: Me | null, ready: boolean, notice: string) => void;
  navigate: (path: string) => void;
};
type Known = { token: string; me: Me; renewAt: number };
export class BrowserSession {
  private channel: BroadcastChannel | null = null;
  private known: Known | null = null;
  private candidate: string | null = null;
  private committedScope: string | null = null;
  private revision = 0;
  private activeLock = false;
  private destroyed = false;
  private retrying = false;
  private suspended = false;
  private clearing = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private callbacks: Callbacks) {
    if (typeof BroadcastChannel !== "undefined" && navigator.locks) {
      this.channel = new BroadcastChannel(lockName);
      this.channel.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (!data || typeof data !== "object" || !("kind" in data)) return;
        if (data.kind === "invalidate" || data.kind === "logout") {
          // Senders publish inside this exclusive lock. A message received
          // while we own it belongs to an earlier completed operation.
          if (this.activeLock) return;
          if (data.kind === "invalidate") {
            // Verify after the sender releases the lock, even if it closes or
            // loses a context-mutation response. Peers must not load forever.
            void this.invalidate(false)
              .then(() => this.lock(() => this.ensure(true)))
              .catch(() => {});
          } else void this.anonymous(false, "", true);
        } else if (
          data.kind === "token" &&
          "token" in data &&
          typeof data.token === "string" &&
          data.token.length <= 4096
        ) {
          const token = data.token;
          this.candidate = token;
          void this.lock(async () => {
            if (this.candidate !== token) return;
            try {
              const verified = await browserAuth.session(token);
              if (this.candidate === token && !this.destroyed)
                await this.publish(token, verified.data, true);
            } catch (e) {
              if (this.candidate === token) this.candidate = null;
              if (!(e instanceof ApiError) || e.status !== 401)
                this.retryLater();
            }
          }).catch(() => {});
        }
      };
    }
    installSessionRecovery((expected) =>
      this.lock(async () => {
        if (expected.revision !== this.revision) return this.access();
        await this.ensure();
        return this.access();
      }),
    );
    document.addEventListener("visibilitychange", this.visible);
  }
  private visible = () => {
    if (document.visibilityState === "visible" && this.known)
      void this.lock(() => this.ensure()).catch(() => {});
  };
  private async lock<T>(task: () => Promise<T>): Promise<T> {
    if (!this.channel || !navigator.locks)
      throw new ApiError(
        0,
        "Cập nhật trình duyệt để duy trì phiên đăng nhập an toàn giữa các tab.",
      );
    return navigator.locks.request(lockName, async () => {
      if (this.destroyed)
        throw new DOMException("Phiên đã đóng.", "AbortError");
      this.activeLock = true;
      try {
        await this.clearing;
        return await task();
      } finally {
        this.activeLock = false;
      }
    });
  }
  private access(): SessionAccess | null {
    return this.known
      ? {
          token: this.known.token,
          scope: scopeOf(this.known.me),
          revision: this.revision,
        }
      : null;
  }
  private send(kind: "invalidate" | "logout" | "token", token?: string) {
    if (!this.destroyed)
      this.channel?.postMessage(token ? { kind, token } : { kind });
  }
  private async invalidate(broadcast: boolean) {
    const revision = ++this.revision;
    this.suspended = true;
    this.known = null;
    this.candidate = null;
    clearTimeout(this.timer);
    installSessionAccess(null, revision);
    this.callbacks.update(null, false, "");
    if (broadcast) this.send("invalidate");
    this.clearing = this.clearing.then(() => this.callbacks.clear());
    await this.clearing;
    return revision;
  }
  private async anonymous(broadcast: boolean, notice = "", remote = false) {
    const wasAuthenticated = this.committedScope !== null,
      revision = await this.invalidate(false);
    if (this.destroyed || revision !== this.revision) return;
    this.committedScope = null;
    this.suspended = false;
    this.callbacks.update(null, true, notice);
    if (broadcast && wasAuthenticated) this.send("logout");
    if (remote && wasAuthenticated) this.callbacks.navigate("/login");
  }
  private async publish(token: string, me: Me, remote = false) {
    const scope = scopeOf(me),
      changed = this.committedScope !== scope,
      oldScope = this.committedScope;
    if (changed && !this.suspended) await this.invalidate(false);
    await this.clearing;
    if (this.destroyed) return;
    const renewAt =
      this.known?.token === token
        ? this.known.renewAt
        : performance.now() + renewalIntervalMs;
    this.known = { token, me, renewAt };
    this.candidate = token;
    this.committedScope = scope;
    if (remote && changed && oldScope !== null) {
      this.callbacks.navigate(
        me.activeTenantId ? "/app/students" : "/tenant/select",
      );
      return;
    }
    this.suspended = false;
    installSessionAccess(this.access(), this.revision);
    this.callbacks.update(me, true, "");
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.known || this.destroyed) return;
    this.timer = setTimeout(
      () => {
        void this.lock(() => this.ensure()).catch(() => {});
      },
      Math.max(1000, this.known.renewAt - performance.now()),
    );
  }
  private retryLater() {
    if (this.destroyed || !this.known) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.lock(() => this.ensure()).catch(() => {});
    }, 15000);
  }
  private async ensure(remote = true) {
    try {
      const tokens = [
        ...new Set(
          [this.known?.token, this.candidate].filter((v): v is string => !!v),
        ),
      ];
      for (const token of tokens) {
        try {
          const verified = await browserAuth.session(token);
          if (
            this.known?.token !== token ||
            this.known.renewAt > performance.now()
          ) {
            await this.publish(token, verified.data, remote);
            return;
          }
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
        }
      }
      const renewed = await browserAuth.refresh();
      if (this.destroyed) return;
      const verified = await browserAuth.session(renewed.data.accessToken);
      await this.publish(renewed.data.accessToken, verified.data, remote);
      this.send("token", renewed.data.accessToken);
    } catch (e) {
      if (this.destroyed) return;
      if (e instanceof ApiError && e.status === 401)
        await this.anonymous(true, "", remote);
      else {
        this.retryLater();
        if (!this.known)
          this.callbacks.update(
            null,
            true,
            "Chưa xác minh được phiên đăng nhập. Kiểm tra kết nối rồi thử lại.",
          );
        throw e;
      }
    }
  }
  async refreshProfile() {
    await this.lock(() => this.ensure());
  }
  async start() {
    try {
      await this.lock(() => this.ensure());
    } catch (e) {
      if (!this.destroyed && !this.known)
        this.callbacks.update(
          null,
          true,
          e instanceof Error
            ? e.message
            : "Chưa xác minh được phiên đăng nhập.",
        );
    }
  }
  async retry() {
    if (this.retrying) return;
    this.retrying = true;
    this.callbacks.update(null, false, "Đang xác minh lại phiên đăng nhập…");
    try {
      await this.start();
      if (this.known)
        this.callbacks.navigate(
          this.known.me.activeTenantId ? "/app/students" : "/tenant/select",
        );
    } finally {
      this.retrying = false;
    }
  }
  async signIn(email: string, password: string) {
    return this.lock(async () => {
      await this.invalidate(true);
      try {
        const result = await browserAuth.login(email, password);
        const verified = await browserAuth.session(result.data.accessToken);
        await this.publish(result.data.accessToken, verified.data);
        this.send("token", result.data.accessToken);
      } catch (e) {
        try {
          await this.ensure();
          const current = this.access();
          if (current) this.send("token", current.token);
        } catch {
          await this.anonymous(
            true,
            "Chưa xác minh được phiên đăng nhập. Kiểm tra kết nối rồi thử lại.",
          );
        }
        throw e;
      }
    });
  }
  async select(tenantId: string, role: Role) {
    const expected = this.committedScope;
    return this.lock(async () => {
      await this.ensure();
      if (!this.known || expected !== this.committedScope)
        throw new ApiError(
          409,
          "Phiên đã thay đổi. Vui lòng chọn lại trung tâm và vai trò.",
        );
      const token = this.known.token,
        principal = this.known.me.id;
      await this.invalidate(true);
      try {
        const result = await browserAuth.select(token, tenantId, role);
        const verified = await browserAuth.session(result.data.accessToken);
        await this.publish(result.data.accessToken, verified.data);
        this.send("token", result.data.accessToken);
      } catch (e) {
        await this.ensure();
        const current = this.access();
        if (current) this.send("token", current.token);
        // A lost context response can be resolved from the actual cookie-bound
        // server state. Do not repeat the POST to discover its outcome.
        if (
          this.known?.me.id === principal &&
          this.known.me.activeTenantId === tenantId &&
          this.known.me.activeRole === role
        )
          return;
        throw e;
      }
    });
  }
  async signOut() {
    const principal = this.known?.me.id;
    return this.lock(async () => {
      // Losing a role/membership may clear context during verification. The
      // same cookie-bound person must still be able to finish signing out,
      // without navigating to context selection before logout is committed.
      await this.ensure(false);
      if (!this.known) return;
      if (principal !== this.known.me.id)
        throw new ApiError(
          409,
          "Phiên đã thay đổi. Vui lòng kiểm tra lại trước khi đăng xuất.",
        );
      const token = this.known.token;
      await this.invalidate(true);
      try {
        await browserAuth.logout(token);
        await this.anonymous(true);
      } catch (e) {
        try {
          await this.ensure();
          const current = this.access();
          if (current) this.send("token", current.token);
        } catch {
          await this.anonymous(
            true,
            "Chưa xác nhận được đăng xuất trên máy chủ. Kiểm tra kết nối rồi đăng nhập lại.",
          );
        }
        throw e;
      }
    });
  }
  clear() {
    void this.anonymous(false);
  }
  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.channel?.close();
    installSessionRecovery(null);
    document.removeEventListener("visibilitychange", this.visible);
  }
}
