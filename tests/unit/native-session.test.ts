import { describe, expect, it, vi } from "vitest";
import {
  NativeSession,
  StaleContext,
  type CredentialStore,
} from "../../apps/mobile/lib/session-client";

const envelope = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, meta: { traceId: "unit-trace" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function fixture(handler?: (request: Request) => Promise<Response>) {
  let credential: string | null = "refresh-initial";
  const store: CredentialStore = {
    get: async () => credential,
    set: async (value) => {
      credential = value;
    },
    remove: async () => {
      credential = null;
    },
  };
  const cleared = vi.fn(),
    expired = vi.fn();
  let rotations = 0;
  const transport: typeof fetch = async (input, init) => {
    const req = new Request(input, init),
      path = new URL(req.url).pathname;
    if (path.endsWith("/mobile/auth/refresh")) {
      rotations++;
      return envelope({
        accessToken: "access-" + rotations,
        refreshToken: "refresh-" + rotations,
      });
    }
    if (path.endsWith("/mobile/auth/login"))
      return envelope({ accessToken: "access-0", refreshToken: "refresh-0" });
    if (handler) return handler(req);
    return envelope({
      id: "self",
      displayName: "Test",
      memberships: [],
      activeTenantId: null,
      activeRole: null,
    });
  };
  const session = new NativeSession(
    "https://api.example.test",
    store,
    cleared,
    expired,
    transport,
  );
  return {
    session,
    cleared,
    expired,
    credential: () => credential,
    rotations: () => rotations,
  };
}
describe("native session confidentiality under context races", () => {
  it("serializes concurrent refresh so an old credential is never reused", async () => {
    const f = fixture();
    await Promise.all([
      f.session.refresh(),
      f.session.refresh(),
      f.session.refresh(),
    ]);
    expect(f.rotations()).toBe(1);
    expect(f.credential()).toBe("refresh-1");
  });
  it("rejects a previous child/tenant response even after a successful HTTP response", async () => {
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture(async () => {
      await delayed;
      return envelope({ sensitive: "old-child" });
    });
    const pending = f.session.api.GET("/api/v1/me");
    const rejected = expect(pending).rejects.toBeInstanceOf(StaleContext);
    f.session.invalidate();
    release();
    await rejected;
    expect(f.cleared).toHaveBeenCalledOnce();
  });
  it("clears protected caches on forbidden/not-found and never retries a denied request", async () => {
    for (const status of [403, 404]) {
      let calls = 0;
      const f = fixture(async () => {
        calls++;
        return new Response(JSON.stringify({ error: { message: "denied" } }), {
          status,
        });
      });
      await f.session.api.GET("/api/v1/me");
      expect(f.cleared).toHaveBeenCalledOnce();
      expect(calls).toBe(1);
    }
  });
  it("uses bearer memory credentials and omits cookies", async () => {
    const seen: Request[] = [];
    const f = fixture(async (request) => {
      seen.push(request);
      return envelope({ id: "self", memberships: [] });
    });
    await f.session.restore();
    expect(seen[0]?.credentials).toBe("omit");
    expect(seen[0]?.headers.get("Authorization")).toBe("Bearer access-1");
    expect(seen[0]?.headers.has("cookie")).toBe(false);
  });
  it("forgets credentials only after confirmed server logout; offline failure retains recoverability", async () => {
    const f = fixture(async () => {
      throw new TypeError("offline");
    });
    await expect(f.session.logout()).rejects.toThrow("offline");
    expect(f.credential()).toBe("refresh-initial");
  });
});
