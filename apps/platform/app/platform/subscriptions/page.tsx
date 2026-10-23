"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, usePlatform } from "../../../components/session";
import { PlatformFrame, unwrap } from "../../../components/frame";
import { Field } from "../../../components/field";
import { Button } from "../../../components/button";
const date = z
  .string()
  .refine(
    (value) => Number.isFinite(Date.parse(value)),
    "Chọn thời gian hợp lệ.",
  );
const schema = z
  .object({
    planId: z.uuid("Chọn gói."),
    startsAt: date,
    endsAt: date,
    graceUntil: date,
  })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    path: ["endsAt"],
    message: "Kết thúc cần sau bắt đầu.",
  })
  .refine((value) => Date.parse(value.graceUntil) >= Date.parse(value.endsAt), {
    path: ["graceUntil"],
    message: "Ân hạn cần từ ngày kết thúc trở đi.",
  });
export default function Subscriptions() {
  const [tenantSearch, setTenantSearch] = useState("");
  const { token } = usePlatform(),
    cache = useQueryClient();
  const [tenantId, setTenantId] = useState(""),
    [draft, setDraft] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(location.search).get("tenant");
    if (value && z.uuid().safeParse(value).success) {
      setTenantId(value);
      setDraft(value);
    }
  }, []);
  const headers = { Authorization: `Bearer ${token}` };
  const tenants = useQuery({
    queryKey: ["platform-tenants-select", tenantSearch],
    enabled: !!token,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/platform/tenants", {
          headers,
          params: { query: { search: tenantSearch, limit: 20, page: 1 } },
        }),
      ),
  });
  const selectedTenant = useQuery({
    queryKey: ["platform-tenant", tenantId],
    enabled: !!token && !!tenantId,
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/api/v1/platform/tenants/{id}", {
            headers,
            params: { path: { id: tenantId } },
          }),
        )
      ).data,
  });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { planId: "", startsAt: "", endsAt: "", graceUntil: "" },
  });
  const plans = useQuery({
    queryKey: ["platform-plans"],
    enabled: !!token,
    queryFn: async () =>
      (await unwrap(api.GET("/api/v1/platform/plans", { headers }))).data,
  });
  const query = useQuery({
    queryKey: ["platform-subscriptions", tenantId],
    enabled: !!token && !!tenantId,
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/api/v1/platform/tenants/{id}/subscriptions", {
            headers,
            params: { path: { id: tenantId } },
          }),
        )
      ).data,
  });
  async function save(values: z.infer<typeof schema>) {
    setError("");
    setSuccess("");
    if (!tenantId) {
      setError("Chọn trung tâm trước.");
      return;
    }
    if (
      !window.confirm("Xác nhận gán kỳ thuê bao theo gói và thời gian đã nhập?")
    )
      return;
    try {
      await unwrap(
        api.POST("/api/v1/platform/tenants/{id}/subscriptions", {
          headers,
          params: { path: { id: tenantId } },
          body: {
            planId: values.planId,
            startsAt: new Date(values.startsAt).toISOString(),
            endsAt: new Date(values.endsAt).toISOString(),
            graceUntil: new Date(values.graceUntil).toISOString(),
          },
        }),
      );
      await cache.invalidateQueries({
        queryKey: ["platform-subscriptions", tenantId],
      });
      setSuccess("Đã gán kỳ thuê bao.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chưa thể gán thuê bao.",
      );
    }
  }
  return (
    <PlatformFrame title="Thuê bao trung tâm">
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          if (!z.uuid().safeParse(draft.trim()).success) {
            setError("Chọn một trung tâm.");
            return;
          }
          setError("");
          setTenantId(draft.trim());
          history.replaceState(null, "", "?tenant=" + draft.trim());
        }}
      >
        <div className="field">
          <label htmlFor="tenant-search">Tìm trung tâm</label>
          <input
            id="tenant-search"
            value={tenantSearch}
            onChange={(event) => setTenantSearch(event.target.value)}
            maxLength={100}
          />
        </div>
        <div className="field">
          <label htmlFor="tenant">Trung tâm</label>
          <select
            id="tenant"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="">Chọn trung tâm</option>
            {selectedTenant.data &&
              !tenants.data?.data.some(
                (row) => row.id === selectedTenant.data.id,
              ) && (
                <option value={selectedTenant.data.id}>
                  {selectedTenant.data.name}
                </option>
              )}
            {tenants.data?.data.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name} · {row.slug}
              </option>
            ))}
          </select>
        </div>
        <Button>Xem thuê bao</Button>
      </form>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="notice">
          {success}
        </p>
      )}
      {!tenantId ? (
        <p>Chọn trung tâm để xem lịch sử và gán kỳ thuê bao.</p>
      ) : query.isPending ? (
        <p role="status">Đang tải thuê bao…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Thử lại</Button>
        </div>
      ) : (
        <>
          {query.data.length ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Bảng lịch sử thuê bao, có thể cuộn ngang"
            >
              <table>
                <caption className="sr-only">Lịch sử thuê bao</caption>
                <thead>
                  <tr>
                    <th>Gói</th>
                    <th>Bắt đầu</th>
                    <th>Kết thúc</th>
                    <th>Ân hạn đến</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.plan.code}</td>
                      <td>
                        {new Date(row.startsAt).toLocaleString("vi-VN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>
                        {new Date(row.endsAt).toLocaleString("vi-VN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>
                        {new Date(row.graceUntil).toLocaleString("vi-VN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>
                        {row.status !== "ACTIVE"
                          ? ((
                              {
                                CANCELLED: "Đã hủy",
                                EXPIRED: "Đã hết hạn",
                              } as Record<string, string>
                            )[row.status] ?? row.status)
                          : new Date(row.startsAt) > new Date()
                            ? "Sắp hiệu lực"
                            : new Date(row.endsAt) > new Date()
                              ? "Đang hiệu lực"
                              : new Date(row.graceUntil) > new Date()
                                ? "Đang ân hạn"
                                : "Đã hết hạn"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Chưa có thuê bao.</p>
          )}
          <section className="form-section">
            <h2>Gán kỳ thuê bao</h2>
            <p className="hint">
              Kỳ mới không được chồng lấn kỳ ACTIVE hiện có. Mốc thời gian theo
              thiết bị.
            </p>
            <form
              className="form-grid"
              noValidate
              onSubmit={form.handleSubmit(save)}
            >
              <div className="field">
                <label htmlFor="planId">Gói dịch vụ</label>
                <select
                  id="planId"
                  {...form.register("planId")}
                  aria-describedby="plan-error"
                  aria-invalid={!!form.formState.errors.planId}
                >
                  <option value="">Chọn gói</option>
                  {plans.data
                    ?.filter((plan) => plan.status === "ACTIVE")
                    .map((plan) => (
                      <option value={plan.id} key={plan.id}>
                        {plan.code} · {plan.name}
                      </option>
                    ))}
                </select>
                <span className="field-error" id="plan-error">
                  {form.formState.errors.planId?.message}
                </span>
              </div>
              <Field
                label="Bắt đầu"
                type="datetime-local"
                registration={form.register("startsAt")}
                error={form.formState.errors.startsAt?.message}
              />
              <Field
                label="Kết thúc"
                type="datetime-local"
                registration={form.register("endsAt")}
                error={form.formState.errors.endsAt?.message}
              />
              <Field
                label="Ân hạn đến"
                type="datetime-local"
                registration={form.register("graceUntil")}
                error={form.formState.errors.graceUntil?.message}
              />
              <div className="form-actions">
                <Button disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? "Đang gán…"
                    : "Gán kỳ thuê bao"}
                </Button>
              </div>
            </form>
          </section>
        </>
      )}
    </PlatformFrame>
  );
}
