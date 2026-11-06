import { UnprocessableEntityException } from "@nestjs/common";
import { wallClockUtc } from "@fluivix/contracts";

// Financial day filters use the same Vietnam calendar boundaries on all reads.
// Unsupported extreme calendar boundaries are validation errors, never HTTP500.
export function financialDay(day: string, nextDay = false): Date {
  try {
    if (nextDay) {
      const next = new Date(day + "T00:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      day = next.toISOString().slice(0, 10);
    }
    if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(day))
      throw new Error("UNSUPPORTED_CALENDAR_BOUNDARY");
    return wallClockUtc(day, "00:00", "Asia/Ho_Chi_Minh");
  } catch (cause) {
    throw new UnprocessableEntityException(
      "Ngày lọc vượt phạm vi lịch được hỗ trợ.",
      { cause },
    );
  }
}
export function financialOffset(q: { page: number; limit: number }): number {
  const offset = (q.page - 1) * q.limit;
  if (
    !Number.isSafeInteger(q.page) ||
    q.page < 1 ||
    !Number.isInteger(q.limit) ||
    q.limit < 1 ||
    q.limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    throw new UnprocessableEntityException("Phân trang vượt phạm vi hỗ trợ.");
  return offset;
}
