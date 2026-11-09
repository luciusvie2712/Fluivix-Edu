"use client";
import { useQuery } from "@tanstack/react-query";
import { api, usePlatform } from "../../../components/session";
import { PlatformFrame, unwrap } from "../../../components/frame";
import { Button } from "../../../components/button";
import type { components } from "@fluivix/api-client";
import type { ReactNode } from "react";
type WorkerView = components["schemas"]["WorkerHealthView"];
const workerStatus = {
  NOT_CONFIGURED: "Chưa cấu hình kết nối giám sát worker",
  INVALID_CONFIGURATION: "Cấu hình giám sát worker không hợp lệ",
  UNREACHABLE: "Không kết nối được Redis để kiểm tra worker",
  MISSING: "Chưa ghi nhận worker trong phạm vi giám sát",
  STALE: "Heartbeat worker đã quá hạn",
  DEGRADED: "Worker hoặc hàng đợi cần kiểm tra",
  HEALTHY: "Worker đang hoạt động; chưa thấy dấu hiệu bất thường",
} satisfies Record<WorkerView["status"], string>;
const queueNames = {
  "identity-mail": "Email tài khoản",
  "domain-notifications": "Thông báo nghiệp vụ",
  "schedule-generation": "Sinh lịch định kỳ",
} as const;
function WorkerHealth({
  worker,
  children,
}: {
  worker: WorkerView;
  children: ReactNode;
}) {
  return (
    <div className="system-health">
      <div className="health-summary-grid">
        {children}
        <section
          className="form-section"
          aria-label="Giám sát worker và hàng đợi"
        >
          <h2>Giám sát worker</h2>
          <p role="status" aria-atomic="true">
            {workerStatus[worker.status]}
          </p>
          <p className="section-copy">
            Heartbeat quá 15 giây được xem là cũ; lượt điều phối quá 20 giây
            chưa thành công cần được kiểm tra. Đây là ngưỡng giám sát kỹ thuật
            hiện tại. Số đếm hàng đợi không chứng minh email hoặc push đã đến
            người nhận.
          </p>
          {worker.freshWorkers === null ? (
            <p>
              Không có số liệu worker hoặc hàng đợi đã xác minh trong lần kiểm
              tra này.
            </p>
          ) : (
            <dl className="health-stats">
              <dt>Worker có heartbeat còn mới</dt>
              <dd>{worker.freshWorkers}</dd>
              <dt>Worker có heartbeat cũ hoặc hết hạn</dt>
              <dd>{worker.staleWorkers}</dd>
              <dt>Heartbeat không hợp lệ</dt>
              <dd>{worker.invalidWorkers}</dd>
              <dt>Heartbeat mới nhất</dt>
              <dd>
                {worker.lastHeartbeatAt
                  ? new Date(worker.lastHeartbeatAt).toLocaleString("vi-VN")
                  : "Chưa có heartbeat còn mới"}
              </dd>
            </dl>
          )}
        </section>
      </div>
      <div className="worker-queues">
        {worker.queues.map((queue) => (
          <section className="form-section" key={queue.name}>
            <h3>{queueNames[queue.name]}</h3>
            <p>
              {queue.consumers === "DISABLED"
                ? "Tác vụ đang được tắt trong cấu hình worker."
                : queue.consumers === "UNAVAILABLE"
                  ? "Chưa có tiến trình xử lý hoạt động được xác minh."
                  : `${queue.runningWorkers} tiến trình xử lý đang hoạt động.`}
              {queue.paused ? " Hàng đợi đang tạm dừng." : ""}
            </p>
            <dl className="health-stats">
              <dt>Đang chờ</dt>
              <dd>{queue.waiting}</dd>
              <dt>Đang xử lý</dt>
              <dd>{queue.active}</dd>
              <dt>Hẹn xử lý sau</dt>
              <dd>{queue.delayed}</dd>
              <dt>Ưu tiên đang chờ</dt>
              <dd>{queue.prioritized}</dd>
              <dt>Chờ tác vụ phụ thuộc</dt>
              <dd>{queue.waitingChildren}</dd>
              <dt>Thất bại đang lưu</dt>
              <dd>{queue.failed}</dd>
              <dt>Hoàn tất đang lưu</dt>
              <dd>{queue.completed}</dd>
            </dl>
          </section>
        ))}
        <p className="section-copy queue-retention-note">
          Các tác vụ đã hết thời hạn lưu không còn nằm trong số đếm. Kiểm tra và
          xử lý sự cố theo runbook vận hành; màn hình này không tự gửi cảnh báo
          ra bên ngoài.
        </p>
      </div>
    </div>
  );
}
export default function Health() {
  const { token } = usePlatform();
  const query = useQuery({
    queryKey: ["platform-health"],
    enabled: !!token,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET("/api/v1/platform/system-health", {
          signal,
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
        aria-disabled={query.isFetching}
        aria-busy={query.isFetching}
        onClick={() => {
          if (!query.isFetching) void query.refetch();
        }}
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
        <WorkerHealth worker={query.data.data.worker}>
          <section className="form-section">
            <h2>API và PostgreSQL</h2>
            <dl className="health-stats">
              <dt>Kiểm tra lúc</dt>
              <dd data-testid="health-checked-at">
                {new Date(query.data.data.checkedAt).toLocaleString("vi-VN")}
              </dd>
              <dt>Tiến trình API đã chạy</dt>
              <dd>
                {query.data.data.apiProcessUptimeSeconds.toLocaleString(
                  "vi-VN",
                )}{" "}
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
                  ? new Date(
                      query.data.data.oldestPendingEventAt,
                    ).toLocaleString("vi-VN")
                  : "Không có sự kiện đang chờ"}
              </dd>
              <dt>Email cần xác minh kết quả</dt>
              <dd>
                {query.data.data.uncertainMailDeliveries.toLocaleString(
                  "vi-VN",
                )}
              </dd>
            </dl>
          </section>
        </WorkerHealth>
      )}
    </PlatformFrame>
  );
}
