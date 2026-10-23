"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "../../components/providers";
import { Button } from "../../components/ui/button";
import type { Role } from "../../lib/api";
const roleLabels: Record<Role, string> = {
  owner: "Chủ trung tâm",
  manager: "Quản lý",
  academic_staff: "Giáo vụ",
  accountant: "Kế toán",
  teacher: "Giáo viên",
  student: "Học viên",
  guardian: "Phụ huynh",
};
function subscribeNetwork(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}
const networkSnapshot = () => navigator.onLine;
const serverNetworkSnapshot = () => true;
export default function Layout({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const online = useSyncExternalStore(
    subscribeNetwork,
    networkSnapshot,
    serverNetworkSnapshot,
  );
  useEffect(() => {
    if (session.ready && !session.me) router.replace("/login");
    else if (session.ready && session.me && !session.me.activeTenantId)
      router.replace("/tenant/select");
  }, [session.ready, session.me, router]);
  if (!session.ready || !session.me?.activeTenantId)
    return (
      <main id="main" className="context-layout">
        <p role="status">Đang xác minh quyền truy cập…</p>
      </main>
    );
  const tenant = session.me.memberships.find(
    (item) => item.tenant.id === session.me?.activeTenantId,
  )?.tenant;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="wordmark" href="/app/students">
          Fluivix<span>Edu</span>
        </Link>
        <nav aria-label="Điều hướng trung tâm">
          <Link href="/app/students">Học viên</Link>
          <Link href="/app/account">Tài khoản và phiên</Link>
          {["owner", "manager"].includes(session.me.activeRole ?? "") && (
            <Link href="/app/settings">Gói dịch vụ</Link>
          )}
          <Link href="/tenant/select">Đổi trung tâm / vai trò</Link>
        </nav>
      </aside>
      <header className="topbar">
        <span>
          {tenant?.name} ·{" "}
          {session.me.activeRole
            ? roleLabels[session.me.activeRole]
            : "Chưa chọn vai trò"}
        </span>
        <Button
          variant="outline"
          onClick={() =>
            void session.signOut().then(() => router.replace("/login"))
          }
        >
          Đăng xuất
        </Button>
      </header>
      <main className="sheet" id="main">
        {!online && (
          <p role="alert" className="notice">
            Bạn đang ngoại tuyến. Dữ liệu đang hiển thị có thể đã cũ; chờ kết
            nối lại trước khi lưu.
          </p>
        )}
        {tenant?.status === "READ_ONLY" && (
          <p className="notice">
            Trung tâm ở chế độ chỉ đọc. Các thay đổi đang bị khóa.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
