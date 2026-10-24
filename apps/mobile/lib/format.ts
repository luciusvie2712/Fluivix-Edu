export const calendarDate = (value: string) =>
  value.split("-").reverse().join("/");
export const formatVnd = (value: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
const states: Record<string, string> = {
  SCHEDULED: "Đã lên lịch",
  IN_PROGRESS: "Đang điểm danh",
  COMPLETED: "Đã chốt",
  REOPENED: "Đã mở lại",
  CANCELLED: "Đã hủy",
  UNMARKED: "Chưa đánh dấu",
  PRESENT: "Có mặt",
  LATE: "Đi muộn",
  ABSENT_EXCUSED: "Vắng có phép",
  ABSENT_UNEXCUSED: "Vắng không phép",
  UNPAID: "Chưa thu",
  PARTIAL: "Thu một phần",
  PAID: "Đã thu đủ",
  OVERDUE: "Quá hạn",
  VOID: "Đã hủy",
  CONFIRMED: "Đã ghi nhận nội bộ",
  REVERSED: "Đã đảo giao dịch",
  ACTIVE: "Hoạt động",
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã công bố",
  CLOSED: "Đã đóng",
  ARCHIVED: "Đã lưu trữ",
};
export const stateLabel = (state: string) => states[state] ?? state;
export const tenantDate = (value: string, timezone: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    dateStyle: "short",
  }).format(new Date(value));
export function tenantMonth(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value),
    month = Number(parts.find((p) => p.type === "month")!.value);
  return {
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}
