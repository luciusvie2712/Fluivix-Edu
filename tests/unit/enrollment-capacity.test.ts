import { expect, it } from "vitest";
import { peakEnrollment } from "../../apps/api/src/enrollment-capacity";
const d = (value: string) => new Date(value + "T00:00:00Z");
it("future withdrawal occupies its last day, later re-enrollment uses the released seat", () => {
  const rows = [
    { joinedAt: d("2026-11-01"), leftAt: d("2026-11-05") },
    { joinedAt: d("2026-11-06"), leftAt: null },
  ];
  expect(peakEnrollment(rows, d("2026-11-01"), d("2026-11-30"))).toBe(1);
  expect(peakEnrollment(rows, d("2026-11-05"), d("2026-11-05"))).toBe(1);
  expect(peakEnrollment(rows, d("2026-10-01"), d("2026-10-30"))).toBe(0);
});
