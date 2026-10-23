"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSession } from "../../../../components/providers";
import StudentForm, {
  studentStatuses,
} from "../../../../components/student-form";
import { studentDetail, deactivateStudent } from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
const deactivateSchema = z.object({
  reason: z.string().trim().min(10, "Nêu lý do từ 10 ký tự.").max(500),
});
export default function Detail() {
  const { id } = useParams<{ id: string }>(),
    { me } = useSession(),
    cache = useQueryClient();
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [id]);
  const writable = ["owner", "manager", "academic_staff"].includes(
    me?.activeRole ?? "",
  );
  const readOnly =
    me?.memberships.find((row) => row.tenant.id === me.activeTenantId)?.tenant
      .status === "READ_ONLY";
  const query = useQuery({
    queryKey: [
      "student-detail",
      me?.id,
      me?.activeTenantId,
      me?.activeRole,
      id,
    ],
    enabled: !!me?.activeTenantId,
    queryFn: ({ signal }) => studentDetail(id, signal),
  });
  const form = useForm({
    resolver: zodResolver(deactivateSchema),
    defaultValues: { reason: "" },
  });
  async function deactivate(values: z.infer<typeof deactivateSchema>) {
    if (
      !query.data ||
      !window.confirm(
        "Ngưng hoạt động học viên? Hồ sơ và lịch sử sẽ được giữ lại.",
      )
    )
      return;
    setError("");
    setMessage("");
    try {
      await deactivateStudent(id, {
        version: query.data.data.version,
        reason: values.reason,
      });
      await cache.invalidateQueries({ queryKey: ["student-detail"] });
      await cache.invalidateQueries({ queryKey: ["students"] });
      form.reset();
      setMessage("Đã ngưng hoạt động học viên, giữ nguyên hồ sơ và lịch sử.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chưa thể ngưng hoạt động.",
      );
    }
  }
  return (
    <>
      <h1 tabIndex={-1} ref={heading} className="page-heading">
        Hồ sơ học viên
      </h1>
      <Link href="/app/students">Về danh sách học viên</Link>
      {query.isPending ? (
        <p role="status">Đang tải hồ sơ…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (
        <>
          <h2 className="section-title">{query.data.data.fullName}</h2>
          <dl>
            <dt>Mã học viên</dt>
            <dd>{query.data.data.studentCode}</dd>
            <dt>Trạng thái</dt>
            <dd data-testid="student-status">
              {studentStatuses[
                query.data.data.status as keyof typeof studentStatuses
              ] ?? query.data.data.status}
            </dd>
            <dt>Ngày vào học</dt>
            <dd>{query.data.data.enrolledAt.split("-").reverse().join("/")}</dd>
          </dl>
          {writable && (
            <>
              <h2 className="section-title">Thông tin hồ sơ</h2>
              <StudentForm
                student={query.data.data}
                disabled={readOnly}
                onReload={() => void query.refetch()}
              />
            </>
          )}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          {writable && query.data.data.status !== "INACTIVE" && (
            <section className="student-lifecycle">
              <h2>Ngưng hoạt động</h2>
              <p>
                Hồ sơ được giữ lại để tra cứu lịch sử. Thao tác cần xác nhận và
                lưu lý do.
              </p>
              <form noValidate onSubmit={form.handleSubmit(deactivate)}>
                <div className="field">
                  <label htmlFor="deactivate-reason">
                    Lý do ngưng hoạt động
                  </label>
                  <input
                    id="deactivate-reason"
                    {...form.register("reason")}
                    aria-invalid={!!form.formState.errors.reason}
                    aria-describedby="deactivate-error"
                    disabled={readOnly || form.formState.isSubmitting}
                  />
                  <span
                    id="deactivate-error"
                    className="field-error"
                    role={form.formState.errors.reason ? "alert" : undefined}
                  >
                    {form.formState.errors.reason?.message}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  disabled={readOnly || form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting
                    ? "Đang cập nhật…"
                    : "Ngưng hoạt động học viên"}
                </Button>
              </form>
            </section>
          )}
        </>
      )}
    </>
  );
}
