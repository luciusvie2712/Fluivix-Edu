export type CalendarRange = { from: string; to: string };
export type CalendarView = "day" | "week" | "range";

// UTC is only a coordinate for date-only arithmetic here. A real local day
// may last23/25hours; API queries continue to carry local dates, not instants.
function calendarDate(day: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const value = new Date(day + "T00:00:00Z");
  return Number.isFinite(value.getTime()) &&
    value.toISOString().slice(0, 10) === day
    ? value
    : null;
}
function moveDay(day: string, count: number) {
  const value = calendarDate(day);
  if (!value) return null;
  value.setUTCDate(value.getUTCDate() + count);
  const result = value.toISOString().slice(0, 10);
  return calendarDate(result) ? result : null;
}
export function validCalendarRange(range: CalendarRange) {
  const from = calendarDate(range.from),
    to = calendarDate(range.to);
  return (
    !!from &&
    !!to &&
    from <= to &&
    to.getTime() - from.getTime() <= 93 * 86400000
  );
}
export function calendarPeriod(
  day: string,
  view: "day" | "week",
): CalendarRange | null {
  const date = calendarDate(day);
  if (!date) return null;
  const from =
    view === "day" ? day : moveDay(day, -((date.getUTCDay() + 6) % 7));
  const to = from && (view === "day" ? from : moveDay(from, 6));
  return from && to ? { from, to } : null;
}
export function moveCalendarRange(
  range: CalendarRange,
  direction: -1 | 1,
): CalendarRange | null {
  if (!validCalendarRange(range)) return null;
  const days =
    (calendarDate(range.to)!.getTime() - calendarDate(range.from)!.getTime()) /
      86400000 +
    1;
  const from = moveDay(range.from, days * direction),
    to = moveDay(range.to, days * direction);
  return from && to ? { from, to } : null;
}
export function centreCalendarDay(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((name) =>
      parts
        .find((part) => part.type === name)!
        .value.padStart(name === "year" ? 4 : 2, "0"),
    )
    .join("-");
}
export function calendarDateLabel(day: string) {
  if (!calendarDate(day)) throw new Error("INVALID_CALENDAR_DAY");
  return day.split("-").reverse().join("/");
}
