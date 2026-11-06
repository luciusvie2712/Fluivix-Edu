"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { notificationInbox, type NotificationPreferences } from "../lib/api";
import { useSession } from "./providers";
import { useFinancialTime } from "../lib/financial-time";
import { Button } from "./ui/button";

const titles: Record<string, string> = {
  CLASS_SCHEDULE_CHANGED: "Lịch học thay đổi",
  ATTENDANCE_FINALIZED_ABSENT: "Có cập nhật chuyên cần",
  GRADE_PUBLISHED: "Kết quả đã được công bố",
  INVOICE_ISSUED: "Có chứng từ học phí mới",
  PAYMENT_RECORDED: "Trung tâm đã ghi nhận khoản thu",
};
const statuses: Record<string, string> = {
  PENDING: "Đang chờ gửi hoặc thử lại",
  SENDING: "Đang gửi",
  ACCEPTED: "Nhà cung cấp đã tiếp nhận",
  SENT: "Đã chuyển đến dịch vụ hệ điều hành",
  UNKNOWN: "Chưa xác định kết quả; không tự gửi lại",
  INVALID: "Đăng ký thiết bị không còn hợp lệ",
  FAILED: "Gửi không thành công",
  RETRY_EXHAUSTED: "Đã dừng sau giới hạn thử lại",
  SUPPRESSED: "Đã dừng theo quyền hoặc tùy chọn hiện tại",
  NOT_CONFIGURED: "Push chưa được cấu hình",
};
const labels: Record<keyof NotificationPreferences, string> = {
  pushEnabled: "Nhận push trên thiết bị di động đã đăng ký",
  attendance: "Chuyên cần",
  grades: "Kết quả học tập",
  finance: "Học phí và phiếu thu",
  schedule: "Thay đổi lịch học",
};

function InboxView({ scope, canWrite }: { scope: string; canWrite: boolean }) {
  const time = useFinancialTime();
  const [page, setPage] = useState(1),
    [draft, setDraft] = useState<NotificationPreferences | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [outcome, setOutcome] = useState("");
  const controller = useRef<AbortController | null>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const inbox = useQuery({
    queryKey: ["notification-inbox", scope, page],
    queryFn: ({ signal }) => notificationInbox.list(page, signal),
    refetchInterval: 30000,
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences", scope],
    queryFn: ({ signal }) => notificationInbox.preferences(signal),
  });
  const values = draft ?? preferences.data?.data;
  const rows = inbox.isError ? undefined : inbox.data;
  async function mutate(id?: string) {
    if (busy || !canWrite || (!id && !values)) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setOutcome("");
    try {
      if (id) {
        await notificationInbox.read(id, current.signal);
        if (current.signal.aborted) return;
        await inbox.refetch();
        setOutcome("Máy chủ đã đánh dấu thông báo là đã đọc.");
      } else if (values) {
        const saved = await notificationInbox.save(values, current.signal);
        if (current.signal.aborted) return;
        setDraft(saved.data);
        await preferences.refetch();
        setOutcome("Máy chủ đã lưu tùy chọn thông báo.");
      }
    } catch (cause) {
      if (!current.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Chưa xác nhận được thay đổi.",
        );
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="notification-workspace" data-ui>
      <h1>Thông báo</h1>
      <p>Cập nhật dành cho bạn trong trung tâm và vai trò đang chọn.</p>
      {error && (
        <p role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {outcome && <p role="status">{outcome}</p>}
      <div className="notification-columns">
        <section aria-labelledby="inbox-heading">
          <div className="toolbar">
            <h2 id="inbox-heading">Hộp thư</h2>
            <Button
              variant="outline"
              disabled={inbox.isFetching || busy}
              onClick={() => void inbox.refetch()}
            >
              Tải lại hộp thư
            </Button>
          </div>
          {inbox.isPending && <p role="status">Đang tải hộp thư…</p>}
          {inbox.isError && (
            <p role="alert">
              {inbox.error.message} Hộp thư cũ đã được ẩn; hãy tải lại.
            </p>
          )}
          {rows && (
            <>
              <p className="muted">
                {rows.page.total} thông báo · {time.label}
              </p>
              {!rows.data.length && (
                <p>Chưa có thông báo trong ngữ cảnh này.</p>
              )}
              <ul className="record-list notification-list">
                {rows.data.map((n) => (
                  <li key={n.id}>
                    <h3>{titles[n.type] ?? "Thông báo từ trung tâm"}</h3>
                    <p>
                      <time dateTime={n.createdAt}>
                        {time.datetime(n.createdAt)}
                      </time>{" "}
                      · <strong>{n.readAt ? "Đã đọc" : "Chưa đọc"}</strong>
                    </p>
                    {n.deliveryStatuses.length > 0 && (
                      <ul aria-label="Trạng thái push">
                        {n.deliveryStatuses.map((s) => (
                          <li key={s.status}>
                            {statuses[s.status] ?? "Chưa có mô tả trạng thái"} ·{" "}
                            {s.count} thiết bị
                          </li>
                        ))}
                      </ul>
                    )}
                    {!n.readAt && (
                      <Button
                        variant="outline"
                        disabled={!canWrite || busy}
                        onClick={() => void mutate(n.id)}
                      >
                        Đánh dấu đã đọc
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {rows.page.totalPages > 1 && (
                <nav className="toolbar" aria-label="Trang hộp thư">
                  <Button
                    variant="outline"
                    disabled={busy || page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Trang trước
                  </Button>
                  <span>
                    Trang {page} / {rows.page.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={busy || page >= rows.page.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Trang tiếp
                  </Button>
                </nav>
              )}
            </>
          )}
          <p className="muted">
            Push chỉ báo có cập nhật. Trạng thái nhà cung cấp không xác nhận nội
            dung đã hiển thị trên điện thoại. Mở ứng dụng di động để xem nội
            dung theo quyền hiện tại.
          </p>
        </section>
        <section aria-labelledby="preferences-heading">
          <h2 id="preferences-heading">Tùy chọn thông báo</h2>
          <p>
            Các tùy chọn dùng chung cho tài khoản trong trung tâm này. Sự đồng ý
            theo chính sách và quyền truy cập được kiểm tra riêng.
          </p>
          {preferences.isPending && <p role="status">Đang tải tùy chọn…</p>}
          {preferences.isError && (
            <>
              <p role="alert">{preferences.error.message}</p>
              <Button
                variant="outline"
                onClick={() => void preferences.refetch()}
              >
                Tải lại tùy chọn
              </Button>
            </>
          )}
          {values && !preferences.isError && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate();
              }}
            >
              <fieldset
                className="operation-fields"
                disabled={!canWrite || busy}
              >
                <legend className="sr-only">Loại thông báo được nhận</legend>
                {(Object.keys(labels) as (keyof NotificationPreferences)[]).map(
                  (key) => (
                    <label className="confirmation" key={key}>
                      <input
                        type="checkbox"
                        checked={values[key]}
                        onChange={(e) => {
                          setDraft({ ...values, [key]: e.target.checked });
                          setOutcome("");
                        }}
                      />
                      {labels[key]}
                    </label>
                  ),
                )}
              </fieldset>
              <Button disabled={!canWrite || busy || preferences.isFetching}>
                {busy ? "Đang xác nhận…" : "Lưu tùy chọn"}
              </Button>
            </form>
          )}
          {!canWrite && (
            <p className="notice">
              Chế độ chỉ đọc: chưa thể lưu tùy chọn hoặc đánh dấu đã đọc.
            </p>
          )}
          <p className="muted">
            Đăng ký hoặc gỡ thiết bị push trong ứng dụng Android/iOS. Cho phép
            thông báo trong hệ điều hành không thay thế việc đồng ý theo chính
            sách.
          </p>
        </section>
      </div>
    </div>
  );
}

export function NotificationWorkspace() {
  const { me } = useSession();
  if (!me?.activeTenantId || !me.activeRole)
    return <p role="status">Đang xác minh ngữ cảnh…</p>;
  const tenant = me.memberships.find(
    (m) => m.tenant.id === me.activeTenantId,
  )?.tenant;
  const scope = `${me.id}:${me.activeTenantId}:${me.activeRole}`;
  return (
    <InboxView
      key={scope}
      scope={scope}
      canWrite={
        !!tenant && ["ACTIVE", "PAST_DUE_GRACE"].includes(tenant.status)
      }
    />
  );
}
