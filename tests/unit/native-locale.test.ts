import { describe, it, expect } from "vitest";
import {
  tenantMonth,
  tenantDate,
  formatVnd,
} from "../../apps/mobile/lib/format";
describe("native tenant calendar and exact VND", () => {
  it("uses the center month when the UTC date is still the previous month", () => {
    expect(
      tenantMonth("Asia/Ho_Chi_Minh", new Date("2026-10-31T17:00:00Z")),
    ).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(
      tenantMonth("Asia/Ho_Chi_Minh", new Date("2028-02-29T12:00:00Z")),
    ).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(tenantDate("2026-10-31T17:00:00Z", "Asia/Ho_Chi_Minh")).toBe(
      "1/11/26",
    );
  });
  it("keeps VND integers above Number safe precision", () => {
    expect(formatVnd("9007199254740993")).toContain("9.007.199.254.740.993");
  });
});
