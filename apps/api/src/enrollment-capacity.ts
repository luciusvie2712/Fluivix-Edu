/** Inclusive enrollment dates, independent of lifecycle status. A future-dated
 * withdrawal still occupies a seat until its effective date. */
export function peakEnrollment(
  rows: Array<{ joinedAt: Date; leftAt: Date | null }>,
  from: Date,
  to: Date,
): number {
  const start = from.getTime(),
    end = to.getTime();
  const events = new Map<number, number>();
  for (const row of rows) {
    const a = Math.max(start, row.joinedAt.getTime());
    const b = Math.min(end, row.leftAt?.getTime() ?? end);
    if (a > b) continue;
    events.set(a, (events.get(a) ?? 0) + 1);
    const after = b + 86400000;
    events.set(after, (events.get(after) ?? 0) - 1);
  }
  let count = 0,
    peak = 0;
  for (const [, delta] of [...events].sort(([a], [b]) => a - b)) {
    count += delta;
    peak = Math.max(peak, count);
  }
  return peak;
}
