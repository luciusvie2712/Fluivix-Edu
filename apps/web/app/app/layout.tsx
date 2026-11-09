"use client";
import { usePathname, useRouter } from "next/navigation";
import { TenantNavigation } from "../../components/tenant-navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
  const [logoutError, setLogoutError] = useState("");
  const router = useRouter();
  const pathname = usePathname();
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
      <TenantNavigation
        key={[
          session.me.id,
          session.me.activeTenantId,
          session.me.activeRole,
          pathname,
        ].join(":")}
        role={session.me.activeRole ?? null}
        pathname={pathname}
      />
      <header className="topbar">
        <span>
          {tenant?.name} ·{" "}
          {session.me.activeRole
            ? roleLabels[session.me.activeRole]
            : "Chưa chọn vai trò"}
        </span>
        <Button
          variant="outline"
          onClick={() => {
            setLogoutError("");
            void session
              .signOut()
              .then(() => router.replace("/login"))
              .catch((e: unknown) =>
                setLogoutError(
                  e instanceof Error
                    ? e.message
                    : "Chưa xác nhận được đăng xuất.",
                ),
              );
          }}
        >
          Đăng xuất
        </Button>
      </header>
      <main className="sheet" id="main">
        {logoutError && <p role="alert">{logoutError}</p>}
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
