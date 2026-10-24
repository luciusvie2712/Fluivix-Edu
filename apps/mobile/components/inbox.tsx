import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Panel, Screen } from "./ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
import { openNotification } from "../lib/notifications";
const titles: Record<string, string> = {
  CLASS_SCHEDULE_CHANGED: "Lịch học thay đổi",
  ATTENDANCE_FINALIZED_ABSENT: "Có cập nhật chuyên cần",
  GRADE_PUBLISHED: "Kết quả đã được công bố",
  INVOICE_ISSUED: "Có chứng từ học phí mới",
  PAYMENT_RECORDED: "Trung tâm đã ghi nhận khoản thu",
};
export function Inbox() {
  const session = useSession(),
    [page, setPage] = useState(1),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: [...session.scope, "inbox", page],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await session.client.api.GET("/api/v1/notifications", {
        params: { query: { page, limit: 20 } },
      });
      unwrap(r);
      return r.data!;
    },
  });
  async function read(id: string, open = false) {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await session.client.api.PATCH("/api/v1/notifications/{id}/read", {
          params: { path: { id } },
        }),
      );
      if (open) await openNotification(session, id);
      else await query.refetch();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Thông báo">
      {query.isPending && <Body>Đang tải hộp thư…</Body>}
      {query.error ? (
        <Failure error={query.error} />
      ) : (
        query.data?.data.map((n) => (
          <Panel key={n.id}>
            <Body>{titles[n.type] ?? "Thông báo từ trung tâm"}</Body>
            <Body>
              {new Date(n.createdAt).toLocaleString("vi-VN")} ·{" "}
              {n.readAt ? "Đã đọc" : "Chưa đọc"}
            </Body>
            <Button
              title="Mở nội dung được phép"
              disabled={busy}
              onPress={() => void read(n.id, true)}
            />
            {!n.readAt && (
              <Button
                title="Đánh dấu đã đọc"
                disabled={busy}
                onPress={() => void read(n.id)}
              />
            )}
          </Panel>
        ))
      )}
      {query.data && !query.data.data.length && (
        <Body>Chưa có thông báo trong ngữ cảnh này.</Body>
      )}
      {error ? <Failure error={error} /> : null}
      {page > 1 && (
        <Button title="Trang trước" onPress={() => setPage(page - 1)} />
      )}
      {query.data && page < query.data.page.totalPages && (
        <Button title="Trang tiếp" onPress={() => setPage(page + 1)} />
      )}
      <Button title="Tải lại hộp thư" onPress={() => void query.refetch()} />
    </Screen>
  );
}
