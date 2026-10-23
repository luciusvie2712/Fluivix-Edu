"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api, usePlatform } from "../../../components/session";
import { PlatformFrame, unwrap } from "../../../components/frame";
import { Button } from "../../../components/button";
import CreateTenant from "../../../components/create-tenant";
const statusSchema = z.enum([
  "PENDING_ACTIVATION",
  "ACTIVE",
  "PAST_DUE_GRACE",
  "READ_ONLY",
  "SUSPENDED",
  "TERMINATED",
]);
const tenantLabels: Record<string, string> = {
  PENDING_ACTIVATION: "Chờ kích hoạt",
  ACTIVE: "Đang hoạt động",
  PAST_DUE_GRACE: "Đang ân hạn",
  READ_ONLY: "Chỉ đọc",
  SUSPENDED: "Tạm khóa",
  TERMINATED: "Chấm dứt",
};
export default function Tenants() {
  const { token } = usePlatform();
  const [search, setSearch] = useState(""),
    [draft, setDraft] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const p = new URLSearchParams(location.search),
      value = p.get("search") ?? "";
    setSearch(value);
    setDraft(value);
    const requested = p.get("status") ?? "";
    if (statusSchema.safeParse(requested).success) setStatus(requested);
  }, []);
  function persist(nextSearch: string, nextStatus: string, nextPage: number) {
    const p = new URLSearchParams({
      search: nextSearch,
      status: nextStatus,
      page: String(nextPage),
    });
    history.replaceState(null, "", "?" + p.toString());
  }
  const selected = statusSchema.safeParse(status);
  const query = useQuery({
    queryKey: ["platform-tenants", search, status, page],
    enabled: !!token,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/platform/tenants", {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            query: {
              search,
              page,
              limit: 20,
              ...(selected.success ? { status: selected.data } : {}),
            },
          },
        }),
      ),
  });
  return (
    <PlatformFrame title="Trung tâm">
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(draft.trim());
          setPage(1);
          persist(draft.trim(), status, 1);
        }}
      >
        <div className="field">
          <label htmlFor="search">Tìm theo tên hoặc slug</label>
          <input
            id="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={100}
          />
        </div>
        <div className="field">
          <label htmlFor="status">Trạng thái</label>
          <select
            id="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
              persist(search, event.target.value, 1);
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(tenantLabels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button>Tìm</Button>
      </form>
      {query.isPending ? (
        <p role="status">Đang tải trung tâm…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Thử lại</Button>
        </div>
      ) : query.data.data.length ? (
        <>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Danh sách trung tâm</caption>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Slug</th>
                  <th>Trạng thái</th>
                  <th>Múi giờ</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <Link href={"/platform/tenants/" + tenant.id}>
                        {tenant.name}
                      </Link>
                    </td>
                    <td>{tenant.slug}</td>
                    <td>{tenantLabels[tenant.status] ?? tenant.status}</td>
                    <td>{tenant.timezone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
                persist(search, status, page - 1);
              }}
            >
              Trước
            </Button>
            <span>
              Trang {page} · {query.data.page.total} trung tâm
            </span>
            <Button
              variant="outline"
              disabled={page >= query.data.page.totalPages}
              onClick={() => {
                setPage(page + 1);
                persist(search, status, page + 1);
              }}
            >
              Sau
            </Button>
          </div>
        </>
      ) : (
        <p>Không có trung tâm phù hợp.</p>
      )}
      <CreateTenant />
    </PlatformFrame>
  );
}
