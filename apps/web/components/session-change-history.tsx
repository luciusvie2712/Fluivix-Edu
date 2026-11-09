"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { ApiError, teaching } from "../lib/api";
import { calendarDateLabel } from "../lib/calendar-period";
import { useFinancialTime } from "../lib/financial-time";
import { sessionStatuses } from "../lib/session-status";
import { Button } from "./ui/button";

type Snapshot = components["schemas"]["SessionHistorySnapshot"];
export function SessionChangeHistory({
  id,
  scope,
  onDenied,
  version,
}: {
  id: string;
  scope: readonly (string | null | undefined)[];
  onDenied: (error: ApiError) => void;
  version: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="operation-panel session-change-history"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Lịch sử thay đổi buổi học</summary>
      {open && (
        <HistoryEntries
          id={id}
          scope={scope}
          onDenied={onDenied}
          version={version}
        />
      )}
    </details>
  );
}
function HistoryEntries({
  id,
  scope,
  onDenied,
  version,
}: {
  id: string;
  scope: readonly (string | null | undefined)[];
  onDenied: (error: ApiError) => void;
  version: number;
}) {
  const [page, setPage] = useState(1);
  const time = useFinancialTime();
  const query = useQuery({
    queryKey: ["teaching", ...scope, "session-changes", id, page],
    queryFn: ({ signal }) => teaching.changes(id, page, signal),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  useEffect(() => {
    if (
      query.error instanceof ApiError &&
      [401, 403, 404].includes(query.error.status)
    )
      onDenied(query.error);
  }, [query.error, onDenied]);
  const previousAvailable = page > 1 && !query.isFetching;
  const nextAvailable =
    !!query.data &&
    !query.isError &&
    page < query.data.page.totalPages &&
    !query.isFetching;
  function snapshot(title: string, value: Snapshot) {
    return (
      <section aria-label={`${title}, phiên bản ${value.version}`}>
        <h3>{title}</h3>
        <dl>
          <dt>Ngày theo lịch sử</dt>
          <dd>{calendarDateLabel(value.scheduledDate)}</dd>
          <dt>Bắt đầu</dt>
          <dd>
            <time dateTime={value.startsAt}>
              {time.datetime(value.startsAt)}
            </time>
          </dd>
          <dt>Kết thúc</dt>
          <dd>
            <time dateTime={value.endsAt}>{time.datetime(value.endsAt)}</time>
          </dd>
          <dt>Giáo viên</dt>
          <dd>{value.teacherName}</dd>
          <dt>Phòng</dt>
          <dd>{value.roomName ?? "Không chỉ định phòng"}</dd>
          <dt>Trạng thái</dt>
          <dd>{sessionStatuses[value.status] ?? "Trạng thái chưa xác định"}</dd>
          <dt>Phiên bản buổi học</dt>
          <dd>{value.version}</dd>
        </dl>
      </section>
    );
  }
  return (
    <div>
      <p className="muted">
        Thời điểm và trạng thái theo bản ghi đã lưu. Tên người thực hiện, giáo
        viên và phòng theo hồ sơ hiện tại. Thời gian hiển thị theo {time.label}.
      </p>
      <Button
        type="button"
        variant="outline"
        aria-disabled={query.isFetching}
        onClick={() => {
          if (!query.isFetching) void query.refetch();
        }}
      >
        {query.isError ? "Thử tải lại lịch sử" : "Tải lại lịch sử"}
      </Button>
      {query.isPending && <p role="status">Đang tải lịch sử thay đổi…</p>}
      {query.error && (
        <div role="alert">
          <p>{query.error.message}</p>
        </div>
      )}
      {query.data && !query.isError && (
        <>
          {query.data.data.some((entry) => entry.after.version > version) && (
            <p role="status" className="notice">
              Lịch sử có thay đổi mới hơn phiên bản đang mở. Bản nhập được giữ
              nguyên; đối chiếu rồi tải lại dữ liệu buổi học.
            </p>
          )}
          <p role="status">
            {query.isFetching
              ? "Đang tải lại lịch sử…"
              : `${query.data.page.total} thay đổi đã lưu.`}
          </p>
          {query.data.data.length === 0 && (
            <p>
              {query.data.page.total === 0
                ? "Buổi học chưa có thay đổi lịch hoặc hủy."
                : "Trang lịch sử này không còn bản ghi. Chọn trang trước để đối chiếu."}
            </p>
          )}
          <ol className="session-history-list" aria-label="Các thay đổi đã lưu">
            {query.data.data.map((entry) => (
              <li key={entry.id}>
                <article
                  aria-label={`${entry.changeType === "CANCELLED" ? "Hủy buổi học" : "Đổi lịch buổi học"}, phiên bản ${entry.after.version}`}
                >
                  <h2>
                    {entry.changeType === "CANCELLED"
                      ? "Hủy buổi học"
                      : "Đổi lịch buổi học"}
                  </h2>
                  <p>
                    <time dateTime={entry.createdAt}>
                      {time.datetime(entry.createdAt)}
                    </time>{" "}
                    · {entry.actorDisplayName}
                  </p>
                  <p className="session-history-reason">
                    <strong>Lý do:</strong> {entry.reason}
                  </p>
                  <div className="session-history-comparison">
                    {snapshot("Trước thay đổi", entry.before)}
                    {snapshot("Sau thay đổi", entry.after)}
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </>
      )}
      <div
        className="toolbar"
        role="group"
        aria-label="Phân trang lịch sử buổi học"
      >
        <Button
          type="button"
          variant="outline"
          aria-disabled={!previousAvailable}
          onClick={() => {
            if (previousAvailable) setPage((value) => value - 1);
          }}
        >
          Lịch sử trước
        </Button>
        <span>
          Trang lịch sử {page}
          {query.data && !query.isError
            ? ` / ${Math.max(1, query.data.page.totalPages)}`
            : ""}
        </span>
        <Button
          type="button"
          variant="outline"
          aria-disabled={!nextAvailable}
          onClick={() => {
            if (nextAvailable) setPage((value) => value + 1);
          }}
        >
          Lịch sử sau
        </Button>
      </div>
    </div>
  );
}
