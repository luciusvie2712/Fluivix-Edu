"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../../components/providers";
import { Button } from "../../../components/ui/button";
import type { Role } from "../../../lib/api";
const names: Record<Role, string> = {
  owner: "Chủ trung tâm",
  manager: "Quản lý",
  academic_staff: "Giáo vụ",
  accountant: "Kế toán",
  teacher: "Giáo viên",
  guardian: "Phụ huynh",
  student: "Học viên",
};
const statuses: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  PAST_DUE_GRACE: "Đang gia hạn",
  READ_ONLY: "Chỉ đọc",
  SUSPENDED: "Tạm khóa",
  TERMINATED: "Đã chấm dứt",
  PENDING_ACTIVATION: "Chờ kích hoạt",
};
export default function Page() {
  const session = useSession();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (session.ready && !session.me && !busy) router.replace("/login");
  }, [session.ready, session.me, busy, router]);
  async function choose(tenantId: string, role: Role) {
    setBusy(true);
    setError("");
    try {
      await session.select(tenantId, role);
      router.replace("/app/students");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể chuyển trung tâm.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!session.ready || !session.me)
    return (
      <main id="main" className="context-layout">
        <p role="status">Đang xác minh ngữ cảnh…</p>
      </main>
    );
  return (
    <main id="main" className="context-layout">
      <p className="wordmark">
        Fluivix<span>Edu</span>
      </p>
      <h1>Chọn trung tâm và vai trò</h1>
      <p className="muted">
        {session.me.displayName} · Mỗi lần chọn chỉ truy cập một trung tâm.
      </p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {session.me.memberships.length === 0 && (
        <p>
          Chưa có trung tâm được cấp quyền. Vui lòng liên hệ trung tâm đã mời
          bạn.
        </p>
      )}
      <div className="context-list">
        {session.me.memberships.map((membership) => (
          <section className="context-card" key={membership.tenant.id}>
            <h2>{membership.tenant.name}</h2>
            <p className="context-status">
              {statuses[membership.tenant.status] ?? membership.tenant.status}
            </p>
            {membership.roles.map(({ role }) => (
              <div key={role}>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    !["ACTIVE", "READ_ONLY", "PAST_DUE_GRACE"].includes(
                      membership.tenant.status,
                    ) ||
                    ![
                      "owner",
                      "manager",
                      "academic_staff",
                      "accountant",
                    ].includes(role)
                  }
                  onClick={() => void choose(membership.tenant.id, role)}
                >
                  {names[role]}
                </Button>
                {["teacher", "student", "guardian"].includes(role) && (
                  <p className="hint">Vai trò này sử dụng ứng dụng di động.</p>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
      <Button
        variant="outline"
        onClick={() =>
          void session.signOut().then(() => router.replace("/login"))
        }
      >
        Đăng xuất
      </Button>
    </main>
  );
}
