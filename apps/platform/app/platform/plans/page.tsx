"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, usePlatform } from "../../../components/session";
import { PlatformFrame, unwrap } from "../../../components/frame";
import { Field } from "../../../components/field";
import { Button } from "../../../components/button";
const schema = z.object({
  attendance: z.boolean(),
  grades: z.boolean(),
  finance: z.boolean(),
  reports: z.boolean(),
  code: z
    .string()
    .regex(/^[A-Z0-9_-]{2,40}$/, "Dùng 2–40 chữ in hoa, số, _ hoặc -."),
  name: z.string().trim().min(1, "Nhập tên gói.").max(150),
  monthlyPriceVnd: z
    .string()
    .regex(/^(0|[1-9]\d{0,18})$/, "Nhập số nguyên VND, không dấu phân cách."),
  maxStudents: z.number().int().min(1).max(10000000),
  maxClasses: z.number().int().min(1).max(1000000),
  maxUsers: z.number().int().min(1).max(10000000),
  maxStorageBytes: z
    .string()
    .regex(/^(0|[1-9]\d{0,18})$/, "Nhập số byte nguyên."),
});
const defaults = {
  attendance: true,
  grades: true,
  finance: true,
  reports: true,
  code: "",
  name: "",
  monthlyPriceVnd: "",
  maxStudents: 100,
  maxClasses: 10,
  maxUsers: 20,
  maxStorageBytes: "1073741824",
};
export default function Plans() {
  const { token } = usePlatform(),
    cache = useQueryClient();
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const headers = { Authorization: `Bearer ${token}` };
  const query = useQuery({
    queryKey: ["platform-plans"],
    enabled: !!token,
    queryFn: async () =>
      (await unwrap(api.GET("/api/v1/platform/plans", { headers }))).data,
  });
  async function save(values: z.infer<typeof schema>) {
    setError("");
    setSuccess("");
    try {
      await unwrap(
        api.POST("/api/v1/platform/plans", {
          headers,
          body: {
            code: values.code,
            name: values.name,
            monthlyPriceVnd: values.monthlyPriceVnd,
            featureFlags: {
              attendance: values.attendance,
              grades: values.grades,
              finance: values.finance,
              reports: values.reports,
            },
            limits: {
              maxStudents: values.maxStudents,
              maxClasses: values.maxClasses,
              maxUsers: values.maxUsers,
              maxStorageBytes: values.maxStorageBytes,
            },
          },
        }),
      );
      await cache.invalidateQueries({ queryKey: ["platform-plans"] });
      form.reset(defaults);
      setSuccess("Đã tạo gói dịch vụ.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa thể tạo gói.");
    }
  }
  return (
    <PlatformFrame title="Gói dịch vụ">
      {query.isPending ? (
        <p role="status">Đang tải gói…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Thử lại</Button>
        </div>
      ) : query.data.length ? (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Bảng gói dịch vụ, có thể cuộn ngang"
        >
          <table>
            <caption className="sr-only">Danh sách gói dịch vụ</caption>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th className="number">VND/tháng</th>
                <th className="number">Học viên</th>
                <th className="number">Lớp</th>
                <th className="number">Tài khoản</th>
                <th>Tính năng</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.code}</td>
                  <td>{plan.name}</td>
                  <td className="number">
                    {new Intl.NumberFormat("vi-VN").format(
                      BigInt(plan.monthlyPriceVnd),
                    )}
                  </td>
                  <td className="number">{plan.limits.maxStudents}</td>
                  <td className="number">{plan.limits.maxClasses}</td>
                  <td className="number">{plan.limits.maxUsers}</td>
                  <td>
                    {Object.entries(plan.featureFlags)
                      .filter(([, enabled]) => enabled)
                      .map(
                        ([key]) =>
                          (
                            ({
                              attendance: "Điểm danh",
                              grades: "Điểm số",
                              finance: "Tài chính",
                              reports: "Báo cáo",
                            }) as Record<string, string>
                          )[key],
                      )
                      .join(", ") || "Không bật tính năng"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Chưa có gói dịch vụ.</p>
      )}
      <section className="form-section">
        <h2>Tạo gói mới</h2>
        <p className="hint">
          Điều khoản gói đã có thuê bao được giữ nguyên. Tạo mã gói mới khi thay
          đổi giới hạn hoặc giá.
        </p>
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
        <form
          onSubmit={form.handleSubmit(save)}
          noValidate
          className="form-grid"
        >
          <Field
            label="Mã gói"
            registration={form.register("code")}
            error={form.formState.errors.code?.message}
          />
          <Field
            label="Tên gói"
            registration={form.register("name")}
            error={form.formState.errors.name?.message}
          />
          <Field
            label="Giá tháng (VND)"
            registration={form.register("monthlyPriceVnd")}
            error={form.formState.errors.monthlyPriceVnd?.message}
          />
          <Field
            label="Giới hạn học viên hoạt động"
            type="number"
            registration={form.register("maxStudents", { valueAsNumber: true })}
            error={form.formState.errors.maxStudents?.message}
          />
          <Field
            label="Giới hạn lớp hoạt động"
            type="number"
            registration={form.register("maxClasses", { valueAsNumber: true })}
            error={form.formState.errors.maxClasses?.message}
          />
          <Field
            label="Giới hạn tài khoản"
            type="number"
            registration={form.register("maxUsers", { valueAsNumber: true })}
            error={form.formState.errors.maxUsers?.message}
          />
          <Field
            label="Dung lượng (byte)"
            registration={form.register("maxStorageBytes")}
            error={form.formState.errors.maxStorageBytes?.message}
          />
          <div className="form-actions">
            <fieldset className="feature-flags">
              <legend>Tính năng trong gói</legend>
              {(
                [
                  ["attendance", "Điểm danh"],
                  ["grades", "Điểm số"],
                  ["finance", "Tài chính"],
                  ["reports", "Báo cáo"],
                ] as const
              ).map(([key, label]) => (
                <label className="checkbox-field" key={key}>
                  <input type="checkbox" {...form.register(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <Button disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Đang tạo…" : "Tạo gói"}
            </Button>
          </div>
        </form>
      </section>
    </PlatformFrame>
  );
}
