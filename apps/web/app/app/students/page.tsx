"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../components/providers";
import { students } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { studentStatuses } from "../../../components/student-form";
const statusSchema = z.enum(["ACTIVE", "PAUSED", "GRADUATED", "INACTIVE"]);
export default function Page() {
  const { me } = useSession();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search),
      requested = Number(params.get("page") ?? 1);
    const value = params.get("search") ?? "";
    setSearch(value);
    setFilter(value);
    if (Number.isSafeInteger(requested) && requested > 0) setPage(requested);
    const parsed = statusSchema.safeParse(params.get("status"));
    if (parsed.success) setStatus(parsed.data);
    setReady(true);
  }, []);
  function persist(nextPage: number, nextSearch = filter, nextStatus = status) {
    history.replaceState(
      null,
      "",
      "?" +
        new URLSearchParams({
          page: String(nextPage),
          search: nextSearch,
          status: nextStatus,
        }),
    );
    setPage(nextPage);
    setFilter(nextSearch);
    setStatus(nextStatus);
  }
  const parsedStatus = statusSchema.safeParse(status);
  const writable = ["owner", "manager", "academic_staff"].includes(
    me?.activeRole ?? "",
  );
  const readOnly =
    me?.memberships.find((row) => row.tenant.id === me.activeTenantId)?.tenant
      .status === "READ_ONLY";
  const query = useQuery({
    queryKey: [
      "students",
      me?.id,
      me?.activeTenantId,
      me?.activeRole,
      page,
      filter,
      status,
    ],
    enabled: ready && !!me?.activeTenantId,
    queryFn: ({ signal }) =>
      students(
        page,
        filter,
        signal,
        parsedStatus.success ? parsedStatus.data : undefined,
      ),
  });
  return (
    <>
      <h1>Học viên</h1>
      <p className="muted">Danh sách hồ sơ trong trung tâm đang chọn.</p>
      {writable && !readOnly && (
        <div className="toolbar">
          <Button asChild>
            <Link href="/app/students/new">Thêm học viên</Link>
          </Button>
        </div>
      )}
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          persist(1, search.trim());
        }}
      >
        <div className="field">
          <label htmlFor="search">Tìm theo mã hoặc họ tên</label>
          <input
            id="search"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="student-filter-status">Trạng thái</label>
          <select
            id="student-filter-status"
            value={status}
            onChange={(event) => persist(1, search.trim(), event.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(studentStatuses).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" type="submit">
          Tìm kiếm
        </Button>
      </form>
      {query.isPending && <p role="status">Đang tải danh sách học viên…</p>}
      {query.isError && (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </div>
      )}
      {query.isSuccess && (
        <>
          <p>{query.data.page.total.toLocaleString("vi-VN")} học viên</p>
          {query.data.data.length === 0 ? (
            <p>Chưa có học viên phù hợp với bộ lọc.</p>
          ) : (
            <>
              <p className="table-hint">Cuộn ngang bảng để xem đủ thông tin.</p>
              <div
                className="table-scroll"
                role="region"
                tabIndex={0}
                aria-label="Bảng học viên, có thể cuộn ngang"
              >
                <table className="student-table">
                  <caption className="sr-only">Danh sách học viên</caption>
                  <thead>
                    <tr>
                      <th scope="col">Mã học viên</th>
                      <th scope="col">Họ tên</th>
                      <th scope="col">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.data.map((student) => (
                      <tr key={student.id}>
                        <td>{student.studentCode}</td>
                        <td>
                          <Link href={"/app/students/" + student.id}>
                            {student.fullName}
                          </Link>
                        </td>
                        <td>
                          {
                            {
                              ACTIVE: "Đang học",
                              PAUSED: "Tạm nghỉ",
                              GRADUATED: "Hoàn thành",
                              INACTIVE: "Ngưng hoạt động",
                            }[student.status]
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => persist(page - 1)}
            >
              Trang trước
            </Button>
            <span>
              Trang {page} / {Math.max(1, query.data.page.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={page >= query.data.page.totalPages}
              onClick={() => persist(page + 1)}
            >
              Trang sau
            </Button>
          </div>
        </>
      )}
    </>
  );
}
