"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, usePlatform } from "../../../../components/session";
import {
  PlatformFrame,
  tenantLabels,
  unwrap,
} from "../../../../components/frame";
import { Field } from "../../../../components/field";
import { Button } from "../../../../components/button";
const schema = z.object({
  name: z.string().trim().min(1, "Nhập tên.").max(150),
  contactEmail: z.email("Email không hợp lệ.").max(254).or(z.literal("")),
});
export default function Detail() {
  const { id } = useParams<{ id: string }>(),
    { token } = usePlatform(),
    cache = useQueryClient();
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    params = { path: { id } };
  const query = useQuery({
    queryKey: ["platform-tenant", id],
    enabled: !!token,
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/api/v1/platform/tenants/{id}", { headers, params }),
        )
      ).data,
  });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", contactEmail: "" },
  });
  useEffect(() => {
    if (query.data)
      form.reset({
        name: query.data.name,
        contactEmail: query.data.contactEmail ?? "",
      });
  }, [query.data, form]);
  async function save(values: z.infer<typeof schema>) {
    setError("");
    setSuccess("");
    try {
      await unwrap(
        api.PATCH("/api/v1/platform/tenants/{id}", {
          headers,
          params,
          body: {
            name: values.name,
            contactEmail: values.contactEmail || null,
          },
        }),
      );
      await cache.invalidateQueries({ queryKey: ["platform-tenant", id] });
      setSuccess("Đã lưu thông tin trung tâm.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa thể lưu.");
    }
  }
  async function action(kind: "suspend" | "reactivate" | "resend") {
    setError("");
    setSuccess("");
    if (kind !== "resend" && reason.trim().length < 10) {
      setError("Nêu lý do từ 10 ký tự.");
      return;
    }
    const message =
      kind === "suspend"
        ? "Tạm khóa trung tâm? Tất cả thành viên sẽ ngừng truy cập dữ liệu nghiệp vụ."
        : kind === "reactivate"
          ? "Mở lại trung tâm theo trạng thái thuê bao hiện tại?"
          : "Gửi lại lời mời? Liên kết cũ sẽ hết hiệu lực.";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      if (kind === "resend")
        await unwrap(
          api.POST("/api/v1/platform/tenants/{id}/resend-owner-invitation", {
            headers,
            params,
          }),
        );
      else if (kind === "suspend")
        await unwrap(
          api.POST("/api/v1/platform/tenants/{id}/suspend", {
            headers,
            params,
            body: { reason: reason.trim() },
          }),
        );
      else
        await unwrap(
          api.POST("/api/v1/platform/tenants/{id}/reactivate", {
            headers,
            params,
            body: { reason: reason.trim() },
          }),
        );
      await cache.invalidateQueries({ queryKey: ["platform-tenant", id] });
      setReason("");
      setSuccess(
        kind === "resend"
          ? "Lời mời mới đã đưa vào hàng đợi email."
          : "Đã cập nhật trạng thái trung tâm.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Thao tác chưa được xác nhận.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <PlatformFrame title="Chi tiết trung tâm">
      <Link href="/platform/tenants">Về danh sách trung tâm</Link>
      <div className="toolbar">
        <Button variant="outline" onClick={() => void query.refetch()}>
          Làm mới thông tin
        </Button>
      </div>
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
      {query.isPending ? (
        <p role="status">Đang tải…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Thử lại</Button>
        </div>
      ) : (
        <>
          <h2>{query.data.name}</h2>
          <dl>
            <dt>Slug</dt>
            <dd>{query.data.slug}</dd>
            <dt>Trạng thái</dt>
            <dd data-testid="tenant-status" data-status={query.data.status}>
              {tenantLabels[query.data.status] ?? query.data.status}
            </dd>
            <dt>Múi giờ</dt>
            <dd>{query.data.timezone}</dd>
          </dl>
          <Link href={"/platform/subscriptions?tenant=" + id}>
            Xem và gia hạn thuê bao
          </Link>
          <section className="form-section">
            <h2>Gói và giới hạn sử dụng</h2>
            {query.data.currentPlan ? (
              <>
                <p>{query.data.currentPlan.name}</p>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Bảng quota trung tâm, có thể cuộn ngang"
                >
                  <table className="quota-table">
                    <thead>
                      <tr>
                        <th>Hạng mục</th>
                        <th className="number">Đã dùng</th>
                        <th className="number">Giới hạn</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Học viên hoạt động</td>
                        <td className="number">
                          {query.data.usage.activeStudents}
                        </td>
                        <td className="number">
                          {query.data.currentPlan.limits.maxStudents}
                        </td>
                      </tr>
                      <tr>
                        <td>Tài khoản hoạt động/chờ kích hoạt</td>
                        <td className="number">
                          {query.data.usage.reservedUsers}
                        </td>
                        <td className="number">
                          {query.data.currentPlan.limits.maxUsers}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>Chưa có gói đang áp dụng.</p>
            )}
          </section>
          <section className="form-section">
            <h2>Thông tin liên hệ</h2>
            <form
              className="form-grid"
              noValidate
              onSubmit={form.handleSubmit(save)}
            >
              <Field
                label="Tên trung tâm"
                registration={form.register("name")}
                error={form.formState.errors.name?.message}
              />
              <Field
                label="Email liên hệ"
                type="email"
                registration={form.register("contactEmail")}
                error={form.formState.errors.contactEmail?.message}
              />
              <div className="form-actions">
                <Button disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Đang lưu…" : "Lưu thông tin"}
                </Button>
              </div>
            </form>
          </section>
          <section className="form-section">
            <h2>Lời mời owner</h2>
            {query.data.ownerInvitation ? (
              <>
                <p>{query.data.ownerInvitation.email}</p>
                <p>
                  {query.data.ownerInvitation.usedAt
                    ? "Đã xác nhận lời mời"
                    : "Chưa xác nhận · hết hạn " +
                      new Date(
                        query.data.ownerInvitation.expiresAt,
                      ).toLocaleString("vi-VN")}
                </p>
              </>
            ) : (
              <p>Không có lời mời.</p>
            )}
            {query.data.status === "PENDING_ACTIVATION" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void action("resend")}
              >
                Gửi lại lời mời owner
              </Button>
            )}
          </section>
          {query.data.status !== "TERMINATED" && (
            <section className="form-section">
              <h2>Trạng thái vận hành</h2>
              <div className="field">
                <label htmlFor="reason">Lý do thay đổi trạng thái</label>
                <input
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={10}
                  maxLength={500}
                  aria-describedby="reason-help"
                />
                <span className="hint" id="reason-help">
                  Từ 10 ký tự. Lý do được lưu vào nhật ký vận hành.
                </span>
              </div>
              <Button
                variant={
                  query.data.status === "SUSPENDED" ? "outline" : "destructive"
                }
                disabled={busy}
                onClick={() =>
                  void action(
                    query.data.status === "SUSPENDED"
                      ? "reactivate"
                      : "suspend",
                  )
                }
              >
                {busy
                  ? "Đang cập nhật…"
                  : query.data.status === "SUSPENDED"
                    ? "Mở khóa trung tâm"
                    : "Tạm khóa trung tâm"}
              </Button>
            </section>
          )}
        </>
      )}
    </PlatformFrame>
  );
}
