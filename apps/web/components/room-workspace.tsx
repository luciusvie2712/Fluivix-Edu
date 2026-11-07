"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { ApiError, rooms } from "../lib/api";
import { useSession } from "./providers";
import { RoomForm } from "./room-form";
import { Button } from "./ui/button";

type Snapshot = components["schemas"]["RoomSnapshotView"];
function useRoomScope() {
  const { me } = useSession();
  const tenant = me?.memberships.find(
    (m) => m.tenant.id === me.activeTenantId,
  )?.tenant;
  return {
    ready: !!me?.activeTenantId && !!me.activeRole,
    allowed:
      !!me?.activeTenantId &&
      ["owner", "manager", "academic_staff"].includes(me.activeRole ?? ""),
    writable: !!tenant && ["ACTIVE", "PAST_DUE_GRACE"].includes(tenant.status),
    key: `${me?.id}:${me?.activeTenantId}:${me?.activeRole}`,
  };
}
function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert">
      <p>
        {error instanceof ApiError && error.status === 404
          ? "Không tìm thấy phòng trong trung tâm hiện tại."
          : error instanceof ApiError && error.status === 403
            ? "Bạn không còn quyền truy cập phòng này."
            : error.message}
      </p>
      <Button variant="outline" onClick={retry}>
        Thử tải lại
      </Button>
    </div>
  );
}
function Pagination({
  page,
  totalPages,
  change,
}: {
  page: number;
  totalPages: number;
  change: (page: number) => void;
}) {
  return (
    <div className="toolbar">
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        Trang trước
      </Button>
      <span>Trang {page}</span>
      <Button
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => change(page + 1)}
      >
        Trang sau
      </Button>
    </div>
  );
}
function Directory({ scope, writable }: { scope: string; writable: boolean }) {
  const cache = useQueryClient();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [active, setActive] = useState<"" | "true" | "false">(""),
    [saved, setSaved] = useState<components["schemas"]["RoomView"] | null>(
      null,
    );
  const query = useQuery({
    queryKey: ["rooms", scope, "list", page, search, active],
    queryFn: ({ signal }) =>
      rooms.list(
        { page, limit: 20, search, ...(active ? { active } : {}) },
        signal,
      ),
  });
  return (
    <>
      <h1>Phòng học</h1>
      <p className="muted">
        Tra cứu sức chứa và tình trạng sử dụng trước khi xếp lịch.
      </p>
      <Link href="/app/classes">Về danh sách lớp học</Link>
      {!writable && (
        <p className="notice">
          Trung tâm đang ở chế độ chỉ đọc. Bạn có thể xem phòng và lịch sử.
        </p>
      )}
      <div className="operations-grid">
        <div className="field">
          <label htmlFor="room-search">Tìm mã hoặc tên phòng</label>
          <input
            id="room-search"
            value={search}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="room-active">Tình trạng phòng</label>
          <select
            id="room-active"
            value={active}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "" || next === "true" || next === "false") {
                setActive(next);
                setPage(1);
              }
            }}
          >
            <option value="">Tất cả phòng</option>
            <option value="true">Đang sử dụng</option>
            <option value="false">Đã ngưng sử dụng</option>
          </select>
        </div>
      </div>
      {query.isPending && <p role="status">Đang tải phòng học…</p>}
      {query.isError && (
        <Failure error={query.error} retry={() => void query.refetch()} />
      )}
      {query.data && !query.isError && (
        <>
          <p className="hint">
            Trên màn hình hẹp, cuộn ngang bảng để xem đủ các cột.
          </p>
          <div
            className="table-scroll room-directory"
            tabIndex={0}
            role="region"
            aria-label="Danh sách phòng học, có thể cuộn ngang"
          >
            <table>
              <caption>{query.data.page.total} phòng phù hợp</caption>
              <thead>
                <tr>
                  <th>Mã phòng</th>
                  <th>Tên phòng</th>
                  <th className="number">Sức chứa</th>
                  <th>Tình trạng</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td className="number">{row.capacity}</td>
                    <td>{row.active ? "Đang sử dụng" : "Đã ngưng"}</td>
                    <td>
                      <Link href={`/app/settings/rooms/${row.id}`}>
                        Mở phòng {row.code}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.data.length && <p>Chưa có phòng phù hợp với bộ lọc.</p>}
          <Pagination
            page={page}
            totalPages={query.data.page.totalPages}
            change={setPage}
          />
        </>
      )}
      <section className="operation-panel" aria-labelledby="create-room-title">
        <h2 id="create-room-title">Tạo phòng học</h2>
        <p>
          Mã phòng được giữ nguyên sau khi tạo. Sức chứa được kiểm tra lại khi
          xếp lớp và lịch học.
        </p>
        <RoomForm
          writable={writable}
          onSaved={async (room) => {
            setSaved(room);
            await cache.invalidateQueries({ queryKey: ["rooms", scope] });
          }}
        />
        {saved && (
          <Link href={`/app/settings/rooms/${saved.id}`}>
            Xem phòng vừa tạo {saved.code}
          </Link>
        )}
      </section>
    </>
  );
}
function RoomSnapshot({ value }: { value: Snapshot }) {
  return (
    <span>
      {value.code} — {value.name}; sức chứa {value.capacity};{" "}
      {value.active ? "đang sử dụng" : "đã ngưng"}; phiên bản {value.version}
    </span>
  );
}
function Detail({
  scope,
  writable,
  id,
}: {
  scope: string;
  writable: boolean;
  id: string;
}) {
  const [page, setPage] = useState(1);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["rooms", scope, id, "detail"],
    queryFn: ({ signal }) => rooms.detail(id, signal),
  });
  const history = useQuery({
    queryKey: ["rooms", scope, id, "history", page],
    enabled: !!query.data && !query.isError,
    queryFn: ({ signal }) => rooms.history(id, page, signal),
  });
  const value = query.data?.data;
  const accessLost =
    query.isError &&
    query.error instanceof ApiError &&
    [401, 403, 404].includes(query.error.status);
  return (
    <>
      <Link href="/app/settings/rooms">Về danh sách phòng học</Link>
      <h1 className="room-title">
        {value && !query.isError ? `Phòng ${value.code}` : "Chi tiết phòng học"}
      </h1>
      {query.isPending && <p role="status">Đang tải phòng học…</p>}
      {query.isError && (
        <Failure error={query.error} retry={() => void query.refetch()} />
      )}
      {value && !accessLost && (
        <div hidden={query.isError}>
          {!writable && (
            <p className="notice">Trung tâm đang ở chế độ chỉ đọc.</p>
          )}
          <div className="centre-settings-grid room-workspace">
            <section aria-labelledby="room-edit-title">
              <h2 id="room-edit-title">Thông tin phòng</h2>
              <RoomForm
                value={value}
                writable={writable}
                reload={async () => {
                  const result = await query.refetch();
                  if (result.isError) return undefined;
                  return result.data?.data;
                }}
                onSaved={async () => {
                  await cache.invalidateQueries({ queryKey: ["rooms", scope] });
                }}
              />
            </section>
            <section aria-labelledby="room-usage-title">
              <h2 id="room-usage-title">Đang sử dụng phòng</h2>
              <dl>
                <dt>Lớp hoạt động hoặc nháp dùng phòng mặc định</dt>
                <dd>{value.usage.activeOrDraftClasses}</dd>
                <dt>Quy tắc lịch còn hiệu lực</dt>
                <dd>{value.usage.futureActiveRules}</dd>
                <dt>Buổi học sắp tới hoặc đang diễn ra</dt>
                <dd>{value.usage.upcomingOrOngoingSessions}</dd>
                <dt>Sức chứa tối thiểu đang cần</dt>
                <dd>{value.usage.requiredCapacity}</dd>
              </dl>
              <p className="hint">
                Các nhóm có thể trùng nhau. Chuyển phòng hoặc kết thúc lịch liên
                quan trước khi ngưng sử dụng; lịch sử đã chốt được giữ nguyên.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Làm mới tình trạng sử dụng
              </Button>
            </section>
          </div>
          <section aria-labelledby="room-history-title">
            <h2 id="room-history-title">Lịch sử thay đổi phòng</h2>
            {history.isPending && <p role="status">Đang tải lịch sử phòng…</p>}
            {history.isError && (
              <Failure
                error={history.error}
                retry={() => void history.refetch()}
              />
            )}
            {history.data && !history.isError && (
              <>
                {!history.data.data.length && (
                  <p>Chưa có lịch sử thay đổi phòng.</p>
                )}
                <ol className="audit-events">
                  {history.data.data.map((item) => (
                    <li key={item.id}>
                      <h3>
                        {item.action === "room.created"
                          ? "Tạo phòng"
                          : "Cập nhật phòng"}
                      </h3>
                      <p>
                        <time dateTime={item.createdAt}>
                          {new Intl.DateTimeFormat("vi-VN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: value.timezone,
                          }).format(new Date(item.createdAt))}
                        </time>{" "}
                        · {value.timezone}
                      </p>
                      {item.hasDetails ? (
                        <>
                          <p>
                            Người thực hiện:{" "}
                            {item.actorName ?? "Chưa ghi nhận tên"}
                          </p>
                          {item.reason && <p>Lý do: {item.reason}</p>}
                          <dl>
                            {item.before && (
                              <>
                                <dt>Trước thay đổi</dt>
                                <dd>
                                  <RoomSnapshot value={item.before} />
                                </dd>
                              </>
                            )}
                            {item.after && (
                              <>
                                <dt>Sau thay đổi</dt>
                                <dd>
                                  <RoomSnapshot value={item.after} />
                                </dd>
                              </>
                            )}
                          </dl>
                        </>
                      ) : (
                        <p>Chi tiết cũ chưa được ghi nhận.</p>
                      )}
                    </li>
                  ))}
                </ol>
                <Pagination
                  page={page}
                  totalPages={history.data.page.totalPages}
                  change={setPage}
                />
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
export function RoomsWorkspace({ id }: { id?: string }) {
  const scope = useRoomScope();
  if (!scope.ready) return <p role="status">Đang xác minh ngữ cảnh…</p>;
  if (!scope.allowed)
    return (
      <p role="alert">Vai trò hiện tại không có quyền quản lý phòng học.</p>
    );
  return id ? (
    <Detail
      key={`${scope.key}:${id}`}
      scope={scope.key}
      writable={scope.writable}
      id={id}
    />
  ) : (
    <Directory key={scope.key} scope={scope.key} writable={scope.writable} />
  );
}
