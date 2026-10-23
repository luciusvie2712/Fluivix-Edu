import { describe, expect, it } from "vitest";
import { planLimitsSchema, vndSchema } from "../../packages/contracts/src";
describe("exact shared contract constraints", () => {
  it("preserves large VND decimal strings and rejects unsafe representations", () => {
    expect(vndSchema.parse("9007199254740993")).toBe("9007199254740993");
    expect(vndSchema.parse("9223372036854775807")).toBe("9223372036854775807");
    for (const value of [
      "9223372036854775808",
      "1.5",
      "-1",
      "01",
      "1e5",
      9007199254740992,
    ])
      expect(vndSchema.safeParse(value).success).toBe(false);
  });
  it("requires positive bounded quota and rejects unknown limit keys", () => {
    const limits = {
      maxStudents: 1,
      maxClasses: 1,
      maxUsers: 1,
      maxStorageBytes: "0",
    };
    expect(planLimitsSchema.safeParse(limits).success).toBe(true);
    expect(planLimitsSchema.safeParse({ ...limits, maxUsers: 0 }).success).toBe(
      false,
    );
    expect(
      planLimitsSchema.safeParse({ ...limits, arbitrary: true }).success,
    ).toBe(false);
  });
});
