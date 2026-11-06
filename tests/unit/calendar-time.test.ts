import { describe, expect, it } from "vitest";
import {
  calendarDayRange,
  wallClockCandidates,
  wallClockUtc,
} from "../../packages/contracts/src";
describe("tenant financial calendar and explicit payment instants", () => {
  it.each([
    [
      "0001-01-01",
      "UTC",
      "0001-01-01T00:00:00.000Z",
      "0001-01-02T00:00:00.000Z",
    ],
    [
      "9999-12-30",
      "UTC",
      "9999-12-30T00:00:00.000Z",
      "9999-12-31T00:00:00.000Z",
    ],
    [
      "2026-03-08",
      "America/New_York",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
    ],
    [
      "2026-11-01",
      "America/New_York",
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ],
    [
      "2026-11-06",
      "Asia/Kathmandu",
      "2026-11-05T18:15:00.000Z",
      "2026-11-06T18:15:00.000Z",
    ],
    [
      "2026-11-06",
      "Asia/Ho_Chi_Minh",
      "2026-11-05T17:00:00.000Z",
      "2026-11-06T17:00:00.000Z",
    ],
    [
      "2026-10-04",
      "Australia/Lord_Howe",
      "2026-10-03T13:30:00.000Z",
      "2026-10-04T13:00:00.000Z",
    ],
    [
      "2018-11-04",
      "America/Sao_Paulo",
      "2018-11-04T03:00:00.000Z",
      "2018-11-05T02:00:00.000Z",
    ],
    [
      "2011-12-29",
      "Pacific/Apia",
      "2011-12-29T10:00:00.000Z",
      "2011-12-30T10:00:00.000Z",
    ],
  ])("resolves actual boundaries for %s in %s", (day, zone, start, end) => {
    const actual = calendarDayRange(day, zone);
    expect(actual.start.toISOString()).toBe(start);
    expect(actual.end.toISOString()).toBe(end);
  });
  it("rejects invalid, skipped and unsupported extreme days", () => {
    for (const day of ["2026-02-30", "0000-01-01", "9999-12-31"])
      expect(() => calendarDayRange(day, "Asia/Ho_Chi_Minh")).toThrow();
    expect(() => calendarDayRange("2011-12-30", "Pacific/Apia")).toThrow(
      "SKIPPED_CALENDAR_DAY",
    );
    expect(() => calendarDayRange("2026-11-06", "Invalid/Zone")).toThrow();
  });
  it("exposes both actual DST instants, preserves strict lesson rejection and seconds", () => {
    expect(
      wallClockCandidates("2026-11-01", "01:30", "America/New_York").map((d) =>
        d.toISOString(),
      ),
    ).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
    expect(
      wallClockCandidates("2026-03-08", "02:30", "America/New_York"),
    ).toEqual([]);
    expect(() =>
      wallClockUtc("2026-11-01", "01:30", "America/New_York"),
    ).toThrow("DST_LOCAL_TIME_REQUIRES_REVIEW");
    expect(
      wallClockCandidates(
        "2026-11-06",
        "09:15:37",
        "Asia/Kathmandu",
      )[0]!.toISOString(),
    ).toBe("2026-11-06T03:30:37.000Z");
    expect(() => wallClockCandidates("2026-02-30", "12:00", "UTC")).toThrow(
      "INVALID_LOCAL_TIME",
    );
  });
});
