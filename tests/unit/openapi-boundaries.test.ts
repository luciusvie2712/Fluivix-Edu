import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
type Schema = { properties?: Record<string, { type?: string }> };
const api = JSON.parse(readFileSync("apps/api/openapi.json", "utf8")) as {
  components: { schemas: Record<string, Schema> };
};
describe("generated contract security boundaries", () => {
  it("keeps login sessions and teaching sessions as distinct schemas", () => {
    expect(
      Object.keys(api.components.schemas.SessionView!.properties!),
    ).toEqual(expect.arrayContaining(["id", "createdAt", "expiresAt"]));
    expect(api.components.schemas.SessionView!.properties).not.toHaveProperty(
      "classId",
    );
    expect(
      Object.keys(api.components.schemas.TeachingSessionView!.properties!),
    ).toEqual(
      expect.arrayContaining(["classId", "startsAt", "version", "status"]),
    );
  });
  it("exposes refresh credentials only in native token responses", () => {
    expect(api.components.schemas.TokenDto!.properties).not.toHaveProperty(
      "refreshToken",
    );
    expect(api.components.schemas.NativeTokens!.properties).toHaveProperty(
      "refreshToken",
    );
  });
  it("transports balances and grades as exact decimal strings", () => {
    for (const name of ["totalAmountVnd", "paidAmountVnd", "balanceVnd"])
      expect(api.components.schemas.InvoiceView!.properties![name]?.type).toBe(
        "string",
      );
    expect(api.components.schemas.GradeInput!.properties!.score?.type).toBe(
      "string",
    );
  });
});
