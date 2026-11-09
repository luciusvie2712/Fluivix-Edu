import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

export function authContractCases(getBase: () => string) {
  const document = JSON.parse(
    readFileSync("apps/api/openapi.json", "utf8"),
  ) as {
    paths: Record<string, { get?: { operationId: string } }>;
  };
  const reads = Object.entries(document.paths).filter(
    ([, methods]) => methods.get,
  );
  describe("all documented private GET routes enforce real HTTP authentication", () => {
    for (const credential of ["absent", "malformed"] as const) {
      it(`rejects ${credential} bearer credentials before exposing scoped resources`, async () => {
        expect(reads).toHaveLength(104);
        const uuid = randomUUID();
        for (const [path, methods] of reads) {
          const concrete = path.replace(/\{[^}]+\}/g, uuid);
          const response = await fetch(
            getBase().replace(/\/api\/v1$/, "") + concrete,
            {
              headers:
                credential === "malformed"
                  ? { Authorization: "Bearer invalid.access.credential" }
                  : {},
            },
          );
          const body = await response.json();
          const context = `${methods.get!.operationId} ${path}`;
          expect(response.status, context).toBe(401);
          expect(response.headers.get("cache-control"), context).toBe(
            "no-store",
          );
          expect(body.error.code, context).toBe("UNAUTHORIZED");
          expect(body.meta.traceId, context).toMatch(/^[a-f0-9-]{36}$/);
          expect(body, context).not.toHaveProperty("data");
          expect(body, context).not.toHaveProperty("accessToken");
        }
      });
    }
  });
}
