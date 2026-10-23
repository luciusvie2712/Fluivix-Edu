"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { components } from "@fluivix/api-client";
import { ApiError, createStudent, updateStudent } from "../lib/api";
import { Button } from "./ui/button";
import { useSession } from "./providers";
export const studentStatuses = {
  ACTIVE: "Đang học",
  PAUSED: "Tạm nghỉ",
  GRADUATED: "Hoàn thành",
  INACTIVE: "Ngưng hoạt động",
};
type Student = components["schemas"]["StudentDetailView"];
export default function StudentForm({
  student,
  disabled = false,
  onReload,
}: {
  student?: Student;
  disabled?: boolean;
  onReload?: () => void;
}) {
  const { me } = useSession();
  const timezone =
    me?.memberships.find((row) => row.tenant.id === me.activeTenantId)?.tenant
      .timezone ?? "UTC";
  const router = useRouter(),
    cache = useQueryClient();
  const baseline = useRef({
    version: student?.version ?? 1,
    status: student?.status ?? "ACTIVE",
  });
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const schema = z
    .object({
      studentCode: z
        .string()
        .trim()
        .regex(
          /^[A-Za-z0-9_-]{1,40}$/,
          "Mã gồm chữ không dấu, số, gạch ngang hoặc gạch dưới, tối đa 40 ký tự.",
        ),
      fullName: z.string().trim().min(1, "Nhập họ tên.").max(150),
      dateOfBirth: z.iso.date("Ngày sinh không hợp lệ.").or(z.literal("")),
      contactEmail: z.email("Email không hợp lệ.").max(254).or(z.literal("")),
      contactPhone: z
        .string()
        .trim()
        .regex(
          /^(?=.*\d)[+\d ()-]{7,30}$/,
          "Nhập số điện thoại từ 7 đến 30 ký tự.",
        )
        .or(z.literal("")),
      notesPrivate: z.string().trim().max(2000),
      status: z.enum(["ACTIVE", "PAUSED", "GRADUATED", "INACTIVE"]),
      reason: z.string().trim().max(500),
    })
    .superRefine((value, ctx) => {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const today = ["year", "month", "day"]
        .map((part) => parts.find((entry) => entry.type === part)?.value)
        .join("-");
      if (value.dateOfBirth && value.dateOfBirth > today)
        ctx.addIssue({
          code: "custom",
          path: ["dateOfBirth"],
          message: "Ngày sinh không được ở tương lai.",
        });
      if (
        student &&
        value.status !== baseline.current.status &&
        value.reason.length < 10
      )
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Nêu lý do từ 10 ký tự.",
        });
    });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      studentCode: "",
      fullName: "",
      dateOfBirth: "",
      contactEmail: "",
      contactPhone: "",
      notesPrivate: "",
      status: "ACTIVE" as const,
      reason: "",
    },
  });
  useEffect(() => {
    if (student && !form.formState.isDirty) {
      baseline.current = { version: student.version, status: student.status };
      form.reset({
        studentCode: student.studentCode,
        fullName: student.fullName,
        dateOfBirth: student.dateOfBirth ?? "",
        contactEmail: student.contactEmail ?? "",
        contactPhone: student.contactPhone ?? "",
        notesPrivate: student.notesPrivate ?? "",
        status: z
          .enum(["ACTIVE", "PAUSED", "GRADUATED", "INACTIVE"])
          .parse(student.status),
        reason: "",
      });
    }
  }, [student, form, form.formState.isDirty]);
  async function save(values: z.infer<typeof schema>) {
    setError("");
    setMessage("");
    setConflict(false);
    const body: components["schemas"]["CreateStudentDto"] = {
      studentCode: values.studentCode,
      fullName: values.fullName,
      dateOfBirth: values.dateOfBirth || null,
      contactEmail: values.contactEmail || null,
      contactPhone: values.contactPhone || null,
      notesPrivate: values.notesPrivate || null,
    };
    if (
      student &&
      values.status !== baseline.current.status &&
      !window.confirm("Đổi trạng thái học viên? Lý do sẽ được ghi vào nhật ký.")
    )
      return;
    try {
      if (student) {
        const updated = await updateStudent(student.id, {
          ...body,
          version: baseline.current.version,
          ...(values.status !== baseline.current.status &&
          values.status !== "INACTIVE"
            ? { status: values.status, reason: values.reason }
            : {}),
        });
        await cache.invalidateQueries({ queryKey: ["student-detail"] });
        await cache.invalidateQueries({ queryKey: ["students"] });
        baseline.current = {
          version: updated.data.version,
          status: updated.data.status,
        };
        form.reset({ ...values, reason: "" });
        setMessage("Đã lưu hồ sơ học viên.");
      } else {
        const response = await createStudent(body);
        await cache.invalidateQueries({ queryKey: ["students"] });
        router.push("/app/students/" + response.data.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa thể lưu hồ sơ.");
      setConflict(cause instanceof ApiError && cause.status === 409);
    }
  }
  return (
    <form noValidate onSubmit={form.handleSubmit(save)}>
      {error && (
        <div role="alert" className="notice">
          <p>{error}</p>
          {conflict && onReload && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    "Bỏ thay đổi chưa lưu và nhận phiên bản mới nhất?",
                  )
                ) {
                  setError("");
                  setConflict(false);
                  form.reset();
                  onReload();
                }
              }}
            >
              Nhận bản mới
            </Button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <fieldset
        disabled={disabled || form.formState.isSubmitting}
        className="student-form-grid"
      >
        <legend className="sr-only">Thông tin hồ sơ học viên</legend>
        {(
          [
            ["studentCode", "Mã học viên", "text"],
            ["fullName", "Họ và tên", "text"],
            ["dateOfBirth", "Ngày sinh", "date"],
            ["contactEmail", "Email liên hệ", "email"],
            ["contactPhone", "Số điện thoại", "tel"],
          ] as const
        ).map(([key, label, type]) => (
          <div className="field" key={key}>
            <label htmlFor={key}>{label}</label>
            <input
              id={key}
              type={type}
              {...form.register(key)}
              aria-invalid={!!form.formState.errors[key]}
              aria-describedby={key + "-error"}
            />
            <span
              id={key + "-error"}
              className="field-error"
              role={form.formState.errors[key] ? "alert" : undefined}
            >
              {form.formState.errors[key]?.message}
            </span>
          </div>
        ))}
        <div className="field student-form-wide">
          <label htmlFor="notesPrivate">Ghi chú riêng tư</label>
          <textarea
            id="notesPrivate"
            rows={4}
            {...form.register("notesPrivate")}
            aria-describedby="notesPrivate-help notesPrivate-error"
            aria-invalid={!!form.formState.errors.notesPrivate}
          />
          <span className="hint" id="notesPrivate-help">
            Chỉ người có quyền quản lý hồ sơ được xem. Không ghi mật khẩu hoặc
            mã xác thực.
          </span>
          <span
            id="notesPrivate-error"
            role={form.formState.errors.notesPrivate ? "alert" : undefined}
            className="field-error"
          >
            {form.formState.errors.notesPrivate?.message}
          </span>
        </div>
        {student && (
          <>
            <div className="field">
              <label htmlFor="status">Trạng thái học viên</label>
              <select id="status" {...form.register("status")}>
                {Object.entries(studentStatuses).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                    disabled={value === "INACTIVE"}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="reason">Lý do đổi trạng thái</label>
              <input
                id="reason"
                {...form.register("reason")}
                aria-invalid={!!form.formState.errors.reason}
                aria-describedby="reason-error"
              />
              <span
                id="reason-error"
                className="field-error"
                role={form.formState.errors.reason ? "alert" : undefined}
              >
                {form.formState.errors.reason?.message}
              </span>
            </div>
          </>
        )}
        <div className="student-form-wide">
          <Button>
            {form.formState.isSubmitting
              ? "Đang lưu…"
              : student
                ? "Lưu hồ sơ"
                : "Tạo hồ sơ học viên"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
