/** Resolve a tenant wall clock strictly. Reject DST gaps AND ambiguous folds;
 * operators must choose a different local time rather than silently move a lesson. */
export function wallClockUtc(
  day: string,
  time: string,
  timezone: string,
): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = (instant: number) => {
    const p = Object.fromEntries(
      formatter.formatToParts(instant).map((v) => [v.type, v.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  const naive = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(naive)) throw new Error("INVALID_LOCAL_TIME");
  const offsets = new Set<number>();
  // Offset on each side of a transition, including fractional-hour zones.
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = naive + hours * 3600000;
    offsets.add(Date.parse(parts(probe) + ":00Z") - probe);
  }
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => parts(instant) === `${day}T${time}`);
  if (matches.length !== 1) throw new Error("DST_LOCAL_TIME_REQUIRES_REVIEW");
  return new Date(matches[0]!);
}
