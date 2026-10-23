"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api, usePlatform } from "../../../components/session";
import { PlatformFrame, unwrap } from "../../../components/frame";
import { Field } from "../../../components/field";
import { Button } from "../../../components/button";
const schema = z
  .object({
    actorId: z.uuid("Nhập UUID của người thực hiện.").or(z.literal("")),
    action: z.string().trim().max(80),
    resourceId: z.string().trim().max(80),
    from: z
      .string()
      .datetime({ offset: true, message: "Nhập thời gian ISO có múi giờ." })
      .or(z.literal("")),
    until: z
      .string()
      .datetime({ offset: true, message: "Nhập thời gian ISO có múi giờ." })
      .or(z.literal("")),
  })
  .refine(
    (value) =>
      !value.from ||
      !value.until ||
      new Date(value.from) < new Date(value.until),
    {
      message: "Thời gian kết thúc phải sau thời gian bắt đầu.",
      path: ["until"],
    },
  );
const empty = { actorId: "", action: "", resourceId: "", from: "", until: "" };
type Filters = z.infer<typeof schema>;
export default function Audit() {
  const { token } = usePlatform();
  const [filters, setFilters] = useState<Filters>(empty),
    [page, setPage] = useState(1),
    [ready, setReady] = useState(false);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: empty });
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const parsed = schema.safeParse(
      Object.fromEntries(
        Object.keys(empty).map((key) => [key, params.get(key) ?? ""]),
      ),
    );
    if (parsed.success) {
      setFilters(parsed.data);
      form.reset(parsed.data);
    }
    const requested = Number(params.get("page") ?? 1);
    if (Number.isSafeInteger(requested) && requested > 0) setPage(requested);
    setReady(true);
  }, [form]);
  function persist(values: Filters, nextPage: number) {
    const params = new URLSearchParams({ ...values, page: String(nextPage) });
    history.replaceState(null, "", "?" + params.toString());
    setFilters(values);
    setPage(nextPage);
  }
  const query = useQuery({
    queryKey: ["platform-audit", filters, page],
    enabled: !!token && ready,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/platform/audit-logs", {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            query: {
              page,
              limit: 20,
              ...(filters.actorId ? { actorId: filters.actorId } : {}),
              ...(filters.action ? { action: filters.action } : {}),
              ...(filters.resourceId ? { resourceId: filters.resourceId } : {}),
              ...(filters.from ? { from: filters.from } : {}),
              ...(filters.until ? { until: filters.until } : {}),
            },
          },
        }),
      ),
  });
  return (
    <PlatformFrame title="Nhật ký vận hành">
      <p>
        Lịch sử thay đổi trung tâm, gói dịch vụ và phiên quản trị nền tảng. Thời
        gian hiển thị theo múi giờ thiết bị.
      </p>
      <form
        className="form-grid form-section"
        noValidate
        onSubmit={form.handleSubmit((values) => persist(values, 1))}
      >
        <Field
          label="Mã người thực hiện (UUID)"
          registration={form.register("actorId")}
          error={form.formState.errors.actorId?.message}
        />
        <Field
          label="Hành động chính xác"
          registration={form.register("action")}
          error={form.formState.errors.action?.message}
        />
        <Field
          label="Mã tài nguyên"
          registration={form.register("resourceId")}
          error={form.formState.errors.resourceId?.message}
        />
        <Field
          label="Từ thời điểm (ISO có múi giờ)"
          registration={form.register("from")}
          error={form.formState.errors.from?.message}
          hint="Ví dụ: 2026-10-23T00:00:00+07:00. Bao gồm mốc bắt đầu."
        />
        <Field
          label="Đến trước thời điểm (ISO có múi giờ)"
          registration={form.register("until")}
          error={form.formState.errors.until?.message}
          hint="Ví dụ: 2026-10-24T00:00:00+07:00. Không bao gồm mốc kết thúc."
        />
        <div className="form-actions">
          <Button>Lọc nhật ký</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              form.reset(empty);
              persist(empty, 1);
            }}
          >
            Xóa bộ lọc
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            Tải lại
          </Button>
        </div>
      </form>
      {query.isPending ? (
        <p role="status">Đang tải nhật ký…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Thử lại</Button>
        </div>
      ) : (
        <>
          <p>{query.data.page.total.toLocaleString("vi-VN")} sự kiện</p>
          {query.data.data.length === 0 ? (
            <p role="status">Không có sự kiện phù hợp với bộ lọc.</p>
          ) : (
            <div
              className="table-scroll"
              role="region"
              tabIndex={0}
              aria-label="Bảng nhật ký vận hành, có thể cuộn ngang"
            >
              <table>
                <caption className="sr-only">Nhật ký vận hành nền tảng</caption>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Hành động</th>
                    <th>Mã người thực hiện</th>
                    <th>Mã tài nguyên</th>
                    <th>Mã truy vết</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.createdAt).toLocaleString("vi-VN")}</td>
                      <td>{row.action}</td>
                      <td className="audit-id">{row.actorId}</td>
                      <td className="audit-id">{row.resourceId}</td>
                      <td className="audit-id">{row.traceId}</td>
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
              onClick={() => persist(filters, page - 1)}
            >
              Trước
            </Button>
            <span>
              Trang {page} / {Math.max(1, query.data.page.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={page >= query.data.page.totalPages}
              onClick={() => persist(filters, page + 1)}
            >
              Sau
            </Button>
          </div>
        </>
      )}
    </PlatformFrame>
  );
}
