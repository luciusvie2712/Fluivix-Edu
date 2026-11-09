import { UnprocessableEntityException } from "@nestjs/common";
import { z } from "zod";

// Stored JSON can contain legacy/unrecognized fields. Expose only this whitelist.
const snapshot = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    scheduledDate: z.iso.date().refine((value) => !value.startsWith("0000")),
    teacherId: z.uuid(),
    roomId: z.uuid().nullable(),
    status: z.enum([
      "SCHEDULED",
      "IN_PROGRESS",
      "COMPLETED",
      "REOPENED",
      "CANCELLED",
    ]),
    version: z.number().int().positive(),
  })
  .refine((value) => Date.parse(value.startsAt) < Date.parse(value.endsAt));

export function sessionHistoryIntegrityError(): never {
  throw new UnprocessableEntityException(
    "Lịch sử buổi học chưa đủ thông tin hợp lệ để hiển thị. Liên hệ người quản lý để kiểm tra.",
  );
}

export function parseSessionHistory(row: {
  oldSnapshot: unknown;
  newSnapshot: unknown;
  changeType: string;
}): {
  before: z.infer<typeof snapshot>;
  after: z.infer<typeof snapshot>;
  changeType: "CANCELLED" | "RESCHEDULED";
} {
  const before = snapshot.safeParse(row.oldSnapshot);
  const after = snapshot.safeParse(row.newSnapshot);
  if (!before.success || !after.success) return sessionHistoryIntegrityError();
  const old = before.data,
    next = after.data;
  const expected =
    ["SCHEDULED", "IN_PROGRESS"].includes(old.status) &&
    next.status === "CANCELLED"
      ? "CANCELLED"
      : old.status === "SCHEDULED" && next.status === "SCHEDULED"
        ? "RESCHEDULED"
        : null;
  if (
    !expected ||
    expected !== row.changeType ||
    next.version !== old.version + 1
  )
    return sessionHistoryIntegrityError();
  return { before: old, after: next, changeType: expected };
}
