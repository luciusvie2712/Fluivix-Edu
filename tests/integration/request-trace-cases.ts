import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { describe, expect, it } from "vitest";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function requestTraceCases(getBase: () => string) {
  describe("early HTTP trace and safe parser failures over real TCP", () => {
    it("traces preflight before CORS ends it and exposes trace IDs to approved origins", async () => {
      const origin = process.env.WEB_ORIGIN!;
      const response = await fetch(getBase() + "/auth/login", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
          "X-Trace-Id": "untrusted-client-trace",
        },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("x-trace-id")).toMatch(uuid);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      const denied = await fetch(getBase() + "/auth/login", {
        method: "OPTIONS",
        headers: {
          Origin: "https://unapproved.example.test",
          "Access-Control-Request-Method": "POST",
        },
      });
      await denied.arrayBuffer();
      expect(denied.headers.get("x-trace-id")).toMatch(uuid);
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
      expect(denied.headers.get("x-trace-id")).not.toBe(
        response.headers.get("x-trace-id"),
      );
      const routed = await fetch(getBase() + "/platform/system-health", {
        headers: { Origin: origin },
      });
      await routed.arrayBuffer();
      expect(routed.status).toBe(401);
      expect(routed.headers.get("access-control-expose-headers")).toBe(
        "X-Trace-Id",
      );
      expect(routed.headers.get("access-control-allow-origin")).toBe(origin);
      expect(routed.headers.get("x-trace-id")).toMatch(uuid);
    });

    for (const [name, body, status, code] of [
      [
        "malformed JSON",
        '{"private-synthetic-marker": INVALID}',
        400,
        "BAD_REQUEST",
      ],
      ["JSON primitive", '"private-synthetic-marker"', 400, "BAD_REQUEST"],
      [
        "oversized JSON",
        JSON.stringify({ value: "x".repeat(1024 * 1024 + 1) }),
        413,
        "PAYLOAD_TOO_LARGE",
      ],
    ] as const) {
      it(`${name} has a trace envelope and never reflects the submitted body`, async () => {
        const response = await fetch(getBase() + "/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: process.env.WEB_ORIGIN!,
            "X-Trace-Id": "untrusted-client-trace",
          },
          body,
        });
        expect(response.status).toBe(status);
        const trace = response.headers.get("x-trace-id");
        expect(trace).toMatch(uuid);
        expect(response.headers.get("cache-control")).toBe("no-store");
        // Parser failures occur before CORS; response still has a safe trace
        // header, but this test does not claim browser access to that header.
        const raw = await response.text();
        expect(raw).not.toContain("private-synthetic-marker");
        expect(raw).not.toContain("SyntaxError");
        expect(raw).not.toContain("stack");
        expect(raw.length).toBeLessThan(500);
        expect(JSON.parse(raw)).toEqual({
          error: { code, message: expect.any(String) },
          meta: { traceId: trace },
        });
      });
    }

    it("retains the CSRF rejection and validation boundary with distinct server traces", async () => {
      const traces = new Set<string>();
      for (const [path, options, status] of [
        ["/trace-missing-" + randomUUID(), {}, 404],
        [
          "/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: "synthetic",
          },
          403,
        ],
        [
          "/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
          422,
        ],
        ["/platform/system-health", {}, 401],
      ] as const) {
        const response = await fetch(getBase() + path, options);
        expect(response.status).toBe(status);
        const trace = response.headers.get("x-trace-id")!;
        expect(trace).toMatch(uuid);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const result = await response.json();
        expect(result.meta.traceId).toBe(trace);
        traces.add(trace);
      }
      expect(traces.size).toBe(4);
    });

    it("traces safe 500 responses and successful early handlers without a production debug route", async () => {
      const { createApp } = await import("../../apps/api/dist/app.js");
      const app = await createApp();
      try {
        // Test-only in-memory handler. No source endpoint, logs, or fixture
        // writes are introduced for fault injection.
        app.use(
          "/trace-test-success",
          (_req: unknown, res: { json: (value: unknown) => void }) =>
            res.json({ ok: true }),
        );
        app.use("/trace-test-failure", () => {
          throw new Error("private-synthetic-marker");
        });
        await app.listen(0, "127.0.0.1");
        const base = await app.getUrl();
        const ok = await fetch(base + "/trace-test-success");
        expect(ok.status).toBe(200);
        expect(ok.headers.get("x-trace-id")).toMatch(uuid);
        expect(await ok.json()).toEqual({ ok: true });
        const failed = await fetch(base + "/trace-test-failure");
        expect(failed.status).toBe(500);
        expect(failed.headers.get("x-trace-id")).toMatch(uuid);
        const raw = await failed.text();
        expect(raw).not.toContain("private-synthetic-marker");
        expect(JSON.parse(raw)).toEqual({
          error: {
            code: "INTERNAL_ERROR",
            message: "Không thể xử lý yêu cầu.",
          },
          meta: { traceId: failed.headers.get("x-trace-id") },
        });
      } finally {
        (app.getHttpServer() as Server).closeAllConnections();
        await app.close();
      }
    });
  });
}
