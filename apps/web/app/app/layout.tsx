"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "../../components/providers";
import { Button } from "../../components/ui/button";
export default function Layout({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
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
          <Link href="/tenant/select">Đổi trung tâm / vai trò</Link>
        </nav>
      </aside>
      <header className="topbar">
        <span>
          {tenant?.name} · {session.me.activeRole}
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
