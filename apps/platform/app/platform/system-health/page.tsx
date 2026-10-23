"use client";
import { useQuery } from "@tanstack/react-query";
import { api, usePlatform } from "../../../components/session";
import { PlatformFrame, unwrap } from "../../../components/frame";
import { Button } from "../../../components/button";
export default function Health() {
  const { token } = usePlatform();
  const query = useQuery({
    queryKey: ["platform-health"],
    enabled: !!token,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/platform/system-health", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
  });
  return (
    <PlatformFrame title="Tình trạng hệ thống">
      <p className="section-copy">
        Ảnh chụp số liệu hiện tại của API và cơ sở dữ liệu. Đây không phải báo
        cáo SLA hay lịch sử uptime.
      </p>
      <Button
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {query.isFetching ? "Đang kiểm tra…" : "Kiểm tra lại"}
      </Button>
      {query.isPending ? (
        <p role="status">Đang lấy số liệu…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Thử lại</Button>
        </div>
      ) : (
        <section className="form-section">
          <h2>API và PostgreSQL</h2>
          <dl className="health-stats">
            <dt>Kiểm tra lúc</dt>
            <dd data-testid="health-checked-at">
              {new Date(query.data.data.checkedAt).toLocaleString("vi-VN")}
            </dd>
            <dt>Tiến trình API đã chạy</dt>
            <dd>
              {query.data.data.apiProcessUptimeSeconds.toLocaleString("vi-VN")}{" "}
              giây
            </dd>
            <dt>Thời gian truy vấn PostgreSQL</dt>
            <dd>
              {query.data.data.databaseRoundTripMs.toLocaleString("vi-VN")} ms
            </dd>
            <dt>Sự kiện outbox chưa xử lý</dt>
            <dd>
              {query.data.data.pendingOutboxEvents.toLocaleString("vi-VN")}
            </dd>
            <dt>Sự kiện chờ lâu nhất</dt>
            <dd>
              {query.data.data.oldestPendingEventAt
                ? new Date(query.data.data.oldestPendingEventAt).toLocaleString(
                    "vi-VN",
                  )
                : "Không có sự kiện đang chờ"}
            </dd>
            <dt>Email cần xác minh kết quả</dt>
            <dd>
              {query.data.data.uncertainMailDeliveries.toLocaleString("vi-VN")}
            </dd>
          </dl>
          <h2>Giám sát worker</h2>
          <p role="status">
            Chưa cấu hình heartbeat worker. Các số đếm outbox không chứng minh
            worker đang hoạt động.
          </p>
        </section>
      )}
    </PlatformFrame>
  );
}
