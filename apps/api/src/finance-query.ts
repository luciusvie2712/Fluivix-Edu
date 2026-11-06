import { UnprocessableEntityException } from "@nestjs/common";
import { calendarDayRange } from "@fluivix/contracts";
import type { Prisma } from "@prisma/client";

// Financial reads use the actual scoped tenant calendar in their transaction.
// Unsupported extreme calendar boundaries are validation errors, never HTTP500.
export function financialDay(
  day: string,
  timezone: string,
  nextDay = false,
): Date {
  try {
    const range = calendarDayRange(day, timezone);
    return nextDay ? range.end : range.start;
  } catch (cause) {
    throw new UnprocessableEntityException(
      "Ngày lọc vượt phạm vi lịch được hỗ trợ.",
      { cause },
    );
  }
}
export async function financialTimezone(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { timezone: true },
  });
  return tenant.timezone;
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
