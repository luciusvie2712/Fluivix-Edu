import { describe, expect, it } from "vitest";
import { gradeError } from "../../apps/mobile/lib/grade-validation";
describe("native exact score input", () => {
  it("allows zero, null and the exact maximum", () => {
    expect(gradeError("0", "10.00")).toBeNull();
    expect(gradeError(null, "10.00")).toBeNull();
    expect(gradeError("10.00", "10.00")).toBeNull();
  });
  it("rejects over-maximum, negatives and excess precision without float rounding", () => {
    expect(gradeError("10.01", "10.00")).toContain("10.00");
    expect(gradeError("-1", "10.00")).toBeTruthy();
    expect(gradeError("9.999", "10.00")).toBeTruthy();
  });
});
