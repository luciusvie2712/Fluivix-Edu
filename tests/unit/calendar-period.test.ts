import { describe, expect, it } from "vitest";
import {
  calendarDateLabel,
  calendarPeriod,
  centreCalendarDay,
  moveCalendarRange,
  validCalendarRange,
} from "../../apps/web/lib/calendar-period";
import { calendarDayRange } from "../../packages/contracts/src";

describe("local calendar day/week navigation", () => {
  it.each([
    ["2030-06-03", "2030-06-03", "2030-06-09"],
    ["2030-06-09", "2030-06-03", "2030-06-09"],
    ["2028-02-29", "2028-02-28", "2028-03-05"],
    ["2030-01-01", "2029-12-31", "2030-01-06"],
    ["0001-01-01", "0001-01-01", "0001-01-07"],
  ])("starts the week containing%s on Monday", (anchor, from, to) => {
    expect(calendarPeriod(anchor, "week")).toEqual({ from, to });
    expect(calendarPeriod(anchor, "day")).toEqual({ from: anchor, to: anchor });
  });
  it.each([
    "",
    "2026-02-29",
    "2028-02-30",
    "2030-13-01",
    "2030-01-00",
    "0000-01-01",
    "10000-01-01",
    "2030-6-3",
  ])("refuses invalid or unsupported dates:%s", (day) => {
    expect(calendarPeriod(day, "day")).toBeNull();
    expect(validCalendarRange({ from: day, to: day })).toBe(false);
  });
  it("moves inclusive periods through month/year and leap boundaries without losing or duplicating a day", () => {
    expect(
      moveCalendarRange({ from: "2028-02-28", to: "2028-02-28" }, 1),
    ).toEqual({ from: "2028-02-29", to: "2028-02-29" });
    expect(
      moveCalendarRange({ from: "2028-02-29", to: "2028-02-29" }, 1),
    ).toEqual({ from: "2028-03-01", to: "2028-03-01" });
    expect(
      moveCalendarRange({ from: "2029-12-31", to: "2030-01-06" }, 1),
    ).toEqual({ from: "2030-01-07", to: "2030-01-13" });
    expect(
      moveCalendarRange({ from: "2030-01-07", to: "2030-01-13" }, -1),
    ).toEqual({ from: "2029-12-31", to: "2030-01-06" });
    expect(
      moveCalendarRange({ from: "2030-01-01", to: "2030-01-03" }, -1),
    ).toEqual({ from: "2029-12-29", to: "2029-12-31" });
  });
  it("keeps real API span constraints and refuses unsupported previous/next dates", () => {
    expect(validCalendarRange({ from: "2030-01-01", to: "2030-04-04" })).toBe(
      true,
    );
    expect(validCalendarRange({ from: "2030-01-01", to: "2030-04-05" })).toBe(
      false,
    );
    expect(validCalendarRange({ from: "2030-06-04", to: "2030-06-03" })).toBe(
      false,
    );
    expect(
      moveCalendarRange({ from: "0001-01-01", to: "0001-01-01" }, -1),
    ).toBeNull();
    expect(
      moveCalendarRange({ from: "9999-12-31", to: "9999-12-31" }, 1),
    ).toBeNull();
    expect(calendarPeriod("9999-12-31", "week")).toBeNull();
  });
  it.each([
    ["2026-03-08", "2026-03-02", "2026-03-08", 167],
    ["2026-11-01", "2026-10-26", "2026-11-01", 169],
  ])(
    "retains seven local dates across the New York DST week%s",
    (day, from, to, hours) => {
      const range = calendarPeriod(day as string, "week")!;
      expect(range).toEqual({ from, to });
      const start = calendarDayRange(range.from, "America/New_York").start;
      const end = calendarDayRange(range.to, "America/New_York").end;
      expect((end.getTime() - start.getTime()) / 3600000).toBe(hours);
    },
  );
  it("derives today from the centre IANA clock rather than the browser/host day", () => {
    const now = new Date("2030-12-31T12:30:00Z");
    expect(centreCalendarDay("Pacific/Kiritimati", now)).toBe("2031-01-01");
    expect(centreCalendarDay("Pacific/Honolulu", now)).toBe("2030-12-31");
    expect(
      centreCalendarDay("Asia/Kathmandu", new Date("2030-12-31T18:30:00Z")),
    ).toBe("2031-01-01");
  });
  it("uses unambiguous Vietnamese date labels without changing the API date", () => {
    expect(calendarDateLabel("2030-06-03")).toBe("03/06/2030");
    expect(() => calendarDateLabel("2030-02-30")).toThrow(
      "INVALID_CALENDAR_DAY",
    );
  });
});
