import { describe, expect, it } from "vitest";
import { wallClockUtc } from "../../packages/contracts/src/schedule-time";

describe("tenant wall clock scheduling", () => {
  it("keeps Vietnam local date across the UTC boundary", () => {
    expect(
      wallClockUtc("2026-10-25", "00:15", "Asia/Ho_Chi_Minh").toISOString(),
    ).toBe("2026-10-24T17:15:00.000Z");
  });
  it("handles fractional offsets without rounding", () => {
    expect(
      wallClockUtc("2026-10-25", "09:00", "Asia/Kathmandu").toISOString(),
    ).toBe("2026-10-25T03:15:00.000Z");
  });
  it("rejects nonexistent and ambiguous DST lessons", () => {
    expect(() =>
      wallClockUtc("2026-03-08", "02:30", "America/New_York"),
    ).toThrow("DST_LOCAL_TIME_REQUIRES_REVIEW");
    expect(() =>
      wallClockUtc("2026-11-01", "01:30", "America/New_York"),
    ).toThrow("DST_LOCAL_TIME_REQUIRES_REVIEW");
    expect(
      wallClockUtc("2026-11-01", "03:30", "America/New_York").toISOString(),
    ).toBe("2026-11-01T08:30:00.000Z");
  });
});
