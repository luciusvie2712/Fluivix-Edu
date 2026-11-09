import { describe, expect, it } from "vitest";
import {
  reminderDueRanges,
  reminderPreset,
  reminderWindow,
} from "../../apps/api/src/fee-reminder-window";
describe("fixed P0 reminder calendar", () => {
  it("starts at09:00 inclusive and stops at09:15 exclusive in the actual centre zone", () => {
    expect(
      reminderWindow(new Date("2026-11-09T01:59:59.999Z"), "Asia/Ho_Chi_Minh"),
    ).toBeNull();
    expect(
      reminderWindow(new Date("2026-11-09T02:00:00Z"), "Asia/Ho_Chi_Minh"),
    ).toEqual({
      day: "2026-11-09",
      start: new Date("2026-11-09T02:00:00Z"),
      end: new Date("2026-11-09T02:15:00Z"),
    });
    expect(
      reminderWindow(new Date("2026-11-09T02:14:59.999Z"), "Asia/Ho_Chi_Minh"),
    ).not.toBeNull();
    expect(
      reminderWindow(new Date("2026-11-09T02:15:00Z"), "Asia/Ho_Chi_Minh"),
    ).toBeNull();
    expect(
      reminderWindow(new Date("2026-11-09T09:00:00Z"), "Asia/Ho_Chi_Minh"),
    ).toBeNull();
  });
  it("keeps the preset fixed, bounded and without catch-up", () => {
    expect(reminderPreset).toMatchObject({
      offsets: [-3, 1, 7],
      maxStagesPerInvoice: 3,
      catchUp: false,
      localStart: "09:00",
      localEnd: "09:15",
    });
  });
  it("uses a fractional IANA offset instead of a fixed UTC send hour", () => {
    expect(
      reminderWindow(
        new Date("2026-11-09T03:30:00Z"),
        "Asia/Kolkata",
      )?.start.toISOString(),
    ).toBe("2026-11-09T03:30:00.000Z");
  });
  it("moves the UTC window over spring and autumn DST", () => {
    expect(
      reminderWindow(
        new Date("2026-03-07T14:00:00Z"),
        "America/New_York",
      )?.start.toISOString(),
    ).toBe("2026-03-07T14:00:00.000Z");
    expect(
      reminderWindow(
        new Date("2026-03-08T13:00:00Z"),
        "America/New_York",
      )?.start.toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z");
    expect(
      reminderWindow(
        new Date("2026-10-31T13:00:00Z"),
        "America/New_York",
      )?.start.toISOString(),
    ).toBe("2026-10-31T13:00:00.000Z");
    expect(
      reminderWindow(
        new Date("2026-11-01T14:00:00Z"),
        "America/New_York",
      )?.start.toISOString(),
    ).toBe("2026-11-01T14:00:00.000Z");
  });
  it("covers the full23-hour due day when T-3 crosses a DST start", () => {
    const r = reminderDueRanges("2026-03-05", "America/New_York")[0]!;
    expect(r.stage).toBe("BEFORE_3");
    expect(r.dueDay).toBe("2026-03-08");
    expect(r.end.getTime() - r.start.getTime()).toBe(23 * 3600000);
  });
  it("covers the full25-hour due day when T-3 crosses a DST end", () => {
    const r = reminderDueRanges("2026-10-29", "America/New_York")[0]!;
    expect(r.dueDay).toBe("2026-11-01");
    expect(r.end.getTime() - r.start.getTime()).toBe(25 * 3600000);
  });
  it("calculates month/year edges and leap days as calendar dates", () => {
    expect(
      reminderDueRanges("2028-02-27", "Asia/Ho_Chi_Minh").map((r) => [
        r.stage,
        r.dueDay,
      ]),
    ).toEqual([
      ["BEFORE_3", "2028-03-01"],
      ["AFTER_1", "2028-02-26"],
      ["AFTER_7", "2028-02-20"],
    ]);
    expect(reminderDueRanges("2027-01-01", "UTC").map((r) => r.dueDay)).toEqual(
      ["2027-01-04", "2026-12-31", "2026-12-25"],
    );
  });
  it("rejects impossible dates, invalid times and invalid zones instead of making up a send", () => {
    expect(() => reminderDueRanges("2026-02-30", "UTC")).toThrow();
    expect(() => reminderDueRanges("2026-11-09", "Invalid/Centre")).toThrow();
    expect(() => reminderWindow(new Date(NaN), "UTC")).toThrow();
    expect(() =>
      reminderWindow(new Date("2026-11-09Z"), "Invalid/Centre"),
    ).toThrow();
  });
});
