/** Enumerate actual instants for a tenant wall clock; financial forms explicitly
 * select a DST occurrence. wallClockUtc retains strict scheduling semantics. */
export function wallClockCandidates(
  day: string,
  time: string,
  timezone: string,
): Date[] {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = (instant: number) => {
    const p = Object.fromEntries(
      formatter.formatToParts(instant).map((v) => [v.type, v.value]),
    );
    return `${p.year!.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  };
  const clock = /^\d{2}:\d{2}$/.test(time) ? time + ":00" : time;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}:\d{2}$/.test(clock))
    throw new Error("INVALID_LOCAL_TIME");
  const naive = Date.parse(`${day}T${clock}Z`);
  if (!Number.isFinite(naive)) throw new Error("INVALID_LOCAL_TIME");
  if (new Date(naive).toISOString().slice(0, 19) !== `${day}T${clock}`)
    throw new Error("INVALID_LOCAL_TIME");
  const offsets = new Set<number>();
  // Offset on each side of a transition, including fractional-hour zones.
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = naive + hours * 3600000;
    offsets.add(Date.parse(parts(probe) + "Z") - probe);
  }
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => parts(instant) === `${day}T${clock}`)
    .sort((a, b) => a - b);
  return matches.map((instant) => new Date(instant));
}
export function wallClockUtc(
  day: string,
  time: string,
  timezone: string,
): Date {
  const matches = wallClockCandidates(day, time, timezone);
  if (matches.length !== 1) throw new Error("DST_LOCAL_TIME_REQUIRES_REVIEW");
  return matches[0]!;
}
