"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSession } from "./providers";
import StudentForm, { studentStatuses } from "./student-form";
import { ApiError, studentDetail, deactivateStudent } from "../lib/api";
import { Button } from "./ui/button";
import { GuardianRelationships } from "./guardian-workspace";
import { StudentGrades } from "./assessment-workspace";
import {
  HistoryFailure,
  StudentEnrollments,
  StudentAttendance,
  StudentFinance,
} from "./student-history";
const panes = [
  { id: "overview", label: "Tổng quan" },
  { id: "enrollments", label: "Lớp học" },
  { id: "attendance", label: "Điểm danh" },
  { id: "grades", label: "Điểm số" },
  { id: "finance", label: "Học phí" },
  { id: "guardians", label: "Phụ huynh" },
];
const deactivateSchema = z.object({
  reason: z.string().trim().min(10, "Nêu lý do từ 10 ký tự.").max(500),
});
export default function StudentProfile({ id }: { id: string }) {
  const { me } = useSession();
  const role = me?.activeRole ?? "";
  if (!me?.activeTenantId || !role)
    return <p role="status">Đang tải trung tâm và vai trò…</p>;
  if (
    ![
      "owner",
      "manager",
      "academic_staff",
      "accountant",
      "student",
      "guardian",
    ].includes(role)
  )
    return (
      <p role="alert">Vai trò hiện tại không được tra cứu hồ sơ học viên.</p>
    );
  const scope = `${me.id}:${me.activeTenantId}:${role}`;
  return <Profile key={`${scope}:${id}`} id={id} scope={scope} />;
}
function Profile({ id, scope }: { id: string; scope: string }) {
  const searchParams = useSearchParams();
  const { me } = useSession(),
    cache = useQueryClient();
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [id]);
  const writable = ["owner", "manager", "academic_staff"].includes(
    me?.activeRole ?? "",
  );
  const tenant = me?.memberships.find(
    (row) => row.tenant.id === me.activeTenantId,
  )?.tenant;
  const readOnly =
    !online || !tenant || !["ACTIVE", "PAST_DUE_GRACE"].includes(tenant.status);
  const financeAllowed = ["owner", "manager", "accountant"].includes(
    me?.activeRole ?? "",
  );
  const enrollmentAllowed = [
    "owner",
    "manager",
    "academic_staff",
    "accountant",
  ].includes(me?.activeRole ?? "");
  const allowedPanes = panes.filter(
    (pane) =>
      pane.id === "overview" ||
      (pane.id === "enrollments" && enrollmentAllowed) ||
      (pane.id === "finance" ? financeAllowed : writable),
  );
  const requestedPane = searchParams.get("tab") ?? "overview";
  const activePane = allowedPanes.some((pane) => pane.id === requestedPane)
    ? requestedPane
    : null;
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
      !value ||
      !window.confirm(
        "Ngưng hoạt động học viên? Hồ sơ và lịch sử sẽ được giữ lại.",
      )
    )
      return;
    setError("");
    setMessage("");
    try {
      await deactivateStudent(id, {
        version: value.version,
        reason: values.reason,
      });
      await cache.invalidateQueries({ queryKey: ["student-detail"] });
      await cache.invalidateQueries({ queryKey: ["students"] });
      form.reset();
      setMessage("Đã ngưng hoạt động học viên, giữ nguyên hồ sơ và lịch sử.");
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status))
        await query.refetch();
      setError(
        cause instanceof Error ? cause.message : "Chưa thể ngưng hoạt động.",
      );
    }
  }
  const value = query.data?.data;
  const accessLost =
    query.isError &&
    query.error instanceof ApiError &&
    [401, 403, 404].includes(query.error.status);
  return (
    <div className="student-profile">
      <h1 tabIndex={-1} ref={heading} className="page-heading">
        Hồ sơ học viên
      </h1>
      <Link href="/app/students">Về danh sách học viên</Link>
      <Button
        type="button"
        variant="outline"
        disabled={!online || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Làm mới hồ sơ
      </Button>
      {query.isFetching && !query.isPending && (
        <p role="status">Đang xác minh hồ sơ mới nhất…</p>
      )}
      {!online && (
        <p role="status">
          Bạn đang ngoại tuyến. Dữ liệu có thể đã cũ; kết nối lại để xác minh
          trước khi lưu.
        </p>
      )}
      {query.isPending && <p role="status">Đang tải hồ sơ…</p>}
      {query.isError && (
        <HistoryFailure
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      {value && !accessLost && (
        <div hidden={query.isError}>
          <h2 className="section-title">{value.fullName}</h2>
          <dl>
            <dt>Mã học viên</dt>
            <dd>{value.studentCode}</dd>
            <dt>Trạng thái</dt>
            <dd data-testid="student-status">
              {studentStatuses[value.status as keyof typeof studentStatuses] ??
                value.status}
            </dd>
            <dt>Ngày vào học</dt>
            <dd>{value.enrolledAt.split("-").reverse().join("/")}</dd>
          </dl>
          <nav
            aria-label="Các mục hồ sơ học viên"
            className="student-profile-nav"
          >
            {allowedPanes.map((pane) => (
              <Link
                key={pane.id}
                href={`/app/students/${id}?tab=${pane.id}`}
                aria-current={activePane === pane.id ? "page" : undefined}
                scroll={false}
              >
                {pane.label}
              </Link>
            ))}
          </nav>
          {!activePane && (
            <p role="alert">
              Mục hồ sơ không tồn tại hoặc không được phép với vai trò hiện tại.
              Chọn một mục phía trên.
            </p>
          )}
          {["enrollments", "attendance", "finance"].includes(
            activePane ?? "",
          ) && (
            <p className="hint">
              Trên màn hình hẹp, cuộn ngang bảng để xem đủ các cột; dùng phím
              mũi tên khi bảng được chọn.
            </p>
          )}
          <div hidden={activePane !== "overview"}>
            {!writable && (
              <p>
                {me?.activeRole === "accountant"
                  ? "Bạn đang xem thông tin giới hạn của học viên theo quyền kế toán."
                  : "Thông tin cơ bản của học viên."}
              </p>
            )}
            {writable && (
              <>
                <h2 className="section-title">Thông tin hồ sơ</h2>
                <StudentForm
                  student={value}
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
            {writable && value.status !== "INACTIVE" && (
              <section className="student-lifecycle">
                <h2>Ngưng hoạt động</h2>
                <p>
                  Hồ sơ được giữ lại để tra cứu lịch sử. Thao tác cần xác nhận
                  và lưu lý do.
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
          </div>
          {!query.isError && (
            <>
              {activePane === "enrollments" && (
                <StudentEnrollments
                  studentId={id}
                  scope={scope}
                  linkClasses={writable}
                />
              )}
              {activePane === "attendance" && (
                <StudentAttendance studentId={id} scope={scope} />
              )}
              {activePane === "grades" && <StudentGrades studentId={id} />}
              {activePane === "finance" && (
                <StudentFinance studentId={id} scope={scope} />
              )}
              {activePane === "guardians" && (
                <GuardianRelationships studentId={id} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
