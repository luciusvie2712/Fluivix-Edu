/** Inclusive calendar date, exclusive next-day boundary in the configured IANA zone.
 * Calendar boundaries can be 23/25 hours apart or start after a midnight gap. */
export function calendarDayRange(day: string, timezone: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error("INVALID_CALENDAR_DAY");
  const naive = Date.parse(day + "T00:00:00Z");
  if (
    !Number.isFinite(naive) ||
    new Date(naive).toISOString().slice(0, 10) !== day
  )
    throw new Error("INVALID_CALENDAR_DAY");
  const next = new Date(naive + 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-/.test(next)) throw new Error("UNSUPPORTED_CALENDAR_BOUNDARY");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    era: "short",
  });
  const localDay = (instant: number) => {
    const p = Object.fromEntries(
      formatter.formatToParts(instant).map((v) => [v.type, v.value]),
    );
    const year = p.era === "BC" ? 1 - Number(p.year) : Number(p.year);
    return year * 10000 + Number(p.month) * 100 + Number(p.day);
  };
  const boundary = (target: string) => {
    const targetDay = Number(target.replaceAll("-", ""));
    let lo = naive - 36 * 3600000,
      hi = naive + 60 * 3600000;
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (localDay(mid) < targetDay) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const start = boundary(day),
    end = boundary(next);
  if (localDay(start) !== Number(day.replaceAll("-", "")) || end <= start)
    throw new Error("SKIPPED_CALENDAR_DAY");
  return { start: new Date(start), end: new Date(end) };
}
