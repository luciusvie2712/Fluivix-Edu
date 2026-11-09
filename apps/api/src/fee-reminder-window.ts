import { calendarDayRange, wallClockCandidates } from "@fluivix/contracts";

export const reminderPreset = {
  code: "P0_09H_3_1_7_V1",
  localStart: "09:00",
  localEnd: "09:15",
  maxStagesPerInvoice: 3,
  offsets: [-3, 1, 7],
  catchUp: false,
} as const;
export type ReminderStage = "BEFORE_3" | "AFTER_1" | "AFTER_7";

export function reminderWindow(now: Date, timezone: string) {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_REMINDER_TIME");
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(
    now,
  );
  const starts = wallClockCandidates(day, reminderPreset.localStart, timezone);
  const ends = wallClockCandidates(day, reminderPreset.localEnd, timezone);
  // An ambiguous or skipped window is never guessed or sent late.
  if (starts.length !== 1 || ends.length !== 1) return null;
  const start = starts[0]!,
    end = ends[0]!;
  if (
    end.getTime() - start.getTime() !== 15 * 60000 ||
    now < start ||
    now >= end
  )
    return null;
  return { day, start, end };
}
export function reminderDueRanges(day: string, timezone: string) {
  const base = Date.parse(day + "T12:00:00Z");
  if (
    !Number.isFinite(base) ||
    new Date(base).toISOString().slice(0, 10) !== day
  )
    throw new Error("INVALID_REMINDER_DAY");
  return (
    [
      [3, "BEFORE_3"],
      [-1, "AFTER_1"],
      [-7, "AFTER_7"],
    ] as const
  ).map(([days, stage]) => {
    const dueDay = new Date(base + days * 86400000).toISOString().slice(0, 10);
    return { stage, dueDay, ...calendarDayRange(dueDay, timezone) };
  });
}
