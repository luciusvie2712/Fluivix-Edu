"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, usePlatform } from "./session";
import { unwrap } from "./frame";
import { Field } from "./field";
import { Button } from "./button";
const date = z
  .string()
  .min(1, "Chọn thời gian.")
  .refine(
    (value) => Number.isFinite(Date.parse(value)),
    "Thời gian không hợp lệ.",
  );
const schema = z
  .object({
    name: z.string().trim().min(1, "Nhập tên trung tâm.").max(150),
    slug: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/,
        "Dùng 3–80 chữ thường, số và dấu -.",
      ),
    ownerEmail: z.email("Email không hợp lệ.").max(254),
    timezone: z.string().min(1).max(80),
    planId: z.uuid("Chọn gói dịch vụ."),
    startsAt: date,
    endsAt: date,
    graceUntil: date,
  })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    path: ["endsAt"],
    message: "Kết thúc cần sau ngày bắt đầu.",
  })
  .refine((value) => Date.parse(value.graceUntil) >= Date.parse(value.endsAt), {
    path: ["graceUntil"],
    message: "Ân hạn cần từ ngày kết thúc trở đi.",
  });
export default function CreateTenant() {
  const { token } = usePlatform(),
    router = useRouter();
  const [error, setError] = useState("");
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      slug: "",
      ownerEmail: "",
      timezone: "Asia/Ho_Chi_Minh",
      planId: "",
      startsAt: "",
      endsAt: "",
      graceUntil: "",
    },
  });
  const headers = { Authorization: `Bearer ${token}` };
  const plans = useQuery({
    queryKey: ["platform-plans"],
    enabled: !!token,
    queryFn: async () =>
      (await unwrap(api.GET("/api/v1/platform/plans", { headers }))).data,
  });
  async function save(values: z.infer<typeof schema>) {
    setError("");
    try {
      const created = await unwrap(
        api.POST("/api/v1/platform/tenants", {
          headers,
          body: {
            ...values,
            startsAt: new Date(values.startsAt).toISOString(),
            endsAt: new Date(values.endsAt).toISOString(),
            graceUntil: new Date(values.graceUntil).toISOString(),
          },
        }),
      );
      router.push("/platform/tenants/" + created.data.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chưa thể tạo trung tâm.",
      );
    }
  }
  return (
    <section className="form-section">
      <h2>Tạo trung tâm</h2>
      <p>
        Owner nhận lời mời có thời hạn. Trung tâm chờ kích hoạt đến khi owner
        xác nhận.
      </p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {plans.isError && <p role="alert">{plans.error.message}</p>}
      <form className="form-grid" noValidate onSubmit={form.handleSubmit(save)}>
        <Field
          label="Tên trung tâm"
          registration={form.register("name")}
          error={form.formState.errors.name?.message}
        />
        <Field
          label="Mã đường dẫn (slug)"
          registration={form.register("slug")}
          error={form.formState.errors.slug?.message}
        />
        <Field
          label="Email owner"
          registration={form.register("ownerEmail")}
          error={form.formState.errors.ownerEmail?.message}
          type="email"
        />
        <Field
          label="Múi giờ IANA"
          registration={form.register("timezone")}
          error={form.formState.errors.timezone?.message}
        />
        <div className="field">
          <label htmlFor="planId">Gói dịch vụ</label>
          <select
            id="planId"
            {...form.register("planId")}
            aria-invalid={!!form.formState.errors.planId}
            aria-describedby="planId-error"
            disabled={plans.isPending}
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
          <span id="planId-error" className="field-error">
            {form.formState.errors.planId?.message}
          </span>
        </div>
        <Field
          label="Bắt đầu thuê bao"
          type="datetime-local"
          registration={form.register("startsAt")}
          error={form.formState.errors.startsAt?.message}
          hint="Thời gian trên thiết bị; bắt đầu không được ở tương lai."
        />
        <Field
          label="Kết thúc thuê bao"
          type="datetime-local"
          registration={form.register("endsAt")}
          error={form.formState.errors.endsAt?.message}
        />
        <Field
          label="Kết thúc ân hạn"
          type="datetime-local"
          registration={form.register("graceUntil")}
          error={form.formState.errors.graceUntil?.message}
        />
        <div className="form-actions">
          <Button disabled={form.formState.isSubmitting || plans.isPending}>
            {form.formState.isSubmitting
              ? "Đang tạo…"
              : "Tạo trung tâm và mời owner"}
          </Button>
        </div>
      </form>
    </section>
  );
}
