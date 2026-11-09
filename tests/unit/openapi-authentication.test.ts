import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
type Operation = {
  operationId: string;
  security?: Record<string, string[]>[];
  responses: Record<string, unknown>;
  description?: string;
};
const document = JSON.parse(readFileSync("apps/api/openapi.json", "utf8")) as {
  paths: Record<string, Record<string, Operation>>;
  components: {
    securitySchemes: Record<
      string,
      { type: string; scheme?: string; in?: string; name?: string }
    >;
  };
};
const bodyCredentials = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/auth/accept-invitation",
  "/api/v1/mobile/auth/login",
  "/api/v1/mobile/auth/refresh",
  "/api/v1/platform/auth/login",
  "/api/v1/platform/auth/verify",
  "/api/v1/platform/auth/recover",
]);
const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
  Object.entries(methods)
    .filter(([method]) =>
      ["get", "post", "patch", "put", "delete"].includes(method),
    )
    .map(([method, operation]) => ({ path, method, operation })),
);
describe("generated authentication transport contract", () => {
  it("defines distinct tenant/platform access audiences and browser refresh cookies", () => {
    expect(document.components.securitySchemes.bearer).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(document.components.securitySchemes.platformBearer).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(document.components.securitySchemes.webRefresh).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "__Host-fluivix-refresh",
    });
    expect(document.components.securitySchemes.platformRefresh).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "__Host-fluivix-platform",
    });
  });
  it("requires the actual access scheme for every protected operation and documents unauthorized errors", () => {
    expect(operations).toHaveLength(187);
    for (const { path, operation } of operations) {
      if (
        bodyCredentials.has(path) ||
        path.endsWith("/auth/refresh") ||
        path === "/api/v1/auth/web-session"
      )
        continue;
      expect(operation.security, path).toEqual([
        {
          [path.startsWith("/api/v1/platform/") ? "platformBearer" : "bearer"]:
            [],
        },
      ]);
      expect(operation.responses, path).toHaveProperty("401");
    }
  });
  it("keeps credential exchange public to bearer auth and distinguishes cookie refresh from native body refresh", () => {
    for (const path of bodyCredentials)
      expect(document.paths[path]!.post!.security ?? [], path).toEqual([]);
    expect(document.paths["/api/v1/auth/refresh"]!.post!.security).toEqual([
      { webRefresh: [] },
    ]);
    expect(
      document.paths["/api/v1/platform/auth/refresh"]!.post!.security,
    ).toEqual([{ platformRefresh: [] }]);
    expect(document.paths["/api/v1/auth/refresh"]!.post!.description).toContain(
      "Origin",
    );
    expect(
      document.paths["/api/v1/mobile/auth/refresh"]!.post!.description,
    ).toContain("no Origin or Cookie header");
  });
  it("requires access AND matching refresh cookie for read-only browser verification", () => {
    expect(document.paths["/api/v1/auth/web-session"]!.get!.security).toEqual([
      { bearer: [], webRefresh: [] },
    ]);
    expect(document.paths["/api/v1/me"]!.get!.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths["/api/v1/platform/me"]!.get!.security).toEqual([
      { platformBearer: [] },
    ]);
  });
});
