"use client";
import Link from "next/link";
import { useSession } from "../../../../components/providers";
import StudentForm from "../../../../components/student-form";
export default function NewStudent() {
  const { me } = useSession();
  const allowed = ["owner", "manager", "academic_staff"].includes(
    me?.activeRole ?? "",
  );
  const readOnly =
    me?.memberships.find((row) => row.tenant.id === me.activeTenantId)?.tenant
      .status === "READ_ONLY";
  return (
    <>
      <h1>Tạo hồ sơ học viên</h1>
      <Link href="/app/students">Về danh sách học viên</Link>
      {!allowed ? (
        <p role="alert">Không có quyền tạo hồ sơ học viên.</p>
      ) : readOnly ? (
        <p role="status">Trung tâm chỉ đọc, chưa thể tạo hồ sơ.</p>
      ) : (
        <>
          <p className="section-copy">
            Có thể tạo hồ sơ khi học viên chưa có tài khoản đăng nhập.
          </p>
          <StudentForm />
        </>
      )}
    </>
  );
}
