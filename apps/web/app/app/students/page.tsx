"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../components/providers";
import { students } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
export default function Page() {
  const { me } = useSession();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [
      "students",
      me?.id,
      me?.activeTenantId,
      me?.activeRole,
      page,
      filter,
    ],
    enabled: !!me?.activeTenantId,
    queryFn: ({ signal }) => students(page, filter, signal),
  });
  return (
    <>
      <h1>Học viên</h1>
      <p className="muted">Danh sách hồ sơ trong trung tâm đang chọn.</p>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setFilter(search);
        }}
      >
        <div className="field">
          <label htmlFor="search">Tìm theo họ tên</label>
          <input
            id="search"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
            <div className="table-scroll">
              <table>
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
                      <td>{student.fullName}</td>
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
          )}
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Trang trước
            </Button>
            <span>
              Trang {page} / {Math.max(1, query.data.page.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={page >= query.data.page.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Trang sau
            </Button>
          </div>
        </>
      )}
    </>
  );
}
