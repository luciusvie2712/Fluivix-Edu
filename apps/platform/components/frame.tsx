"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api, usePlatform } from "./session";
import { Button } from "./button";
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
export async function unwrap<T>(
  pending: Promise<{
    data?: T;
    error?: { error?: { message?: string } };
    response: Response;
  }>,
): Promise<T> {
  let result;
  try {
    result = await pending;
  } catch {
    throw new Error("Không thể kết nối dịch vụ. Kiểm tra mạng rồi tải lại.");
  }
  if (!result.data || !result.response.ok)
    throw new Error(
      result.error?.error?.message ??
        "Không thể kết nối dịch vụ. Vui lòng thử lại.",
    );
  return result.data;
}
export function PlatformNav() {
  return (
    <nav aria-label="Điều hướng nền tảng" className="platform-nav">
      <Link href="/platform/overview">Tổng quan</Link>
      <Link href="/platform/tenants">Trung tâm</Link>
      <Link href="/platform/plans">Gói dịch vụ</Link>
      <Link href="/platform/subscriptions">Thuê bao</Link>
    </nav>
  );
}
export const tenantLabels: Record<string, string> = {
  PENDING_ACTIVATION: "Chờ kích hoạt",
  ACTIVE: "Đang hoạt động",
  PAST_DUE_GRACE: "Đang ân hạn",
  READ_ONLY: "Chỉ đọc",
  SUSPENDED: "Tạm khóa",
  TERMINATED: "Chấm dứt",
};
export function PlatformFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const session = usePlatform(),
    router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const online = useSyncExternalStore(
    subscribeNetwork,
    networkSnapshot,
    serverNetworkSnapshot,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  useEffect(() => {
    if (session.ready && !session.token) router.replace("/platform/login");
  }, [session.ready, session.token, router]);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await unwrap(
        api.POST("/api/v1/platform/auth/logout", {
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json",
          },
        }),
      );
      session.clear();
      router.replace("/platform/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa thể đăng xuất.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="platform-frame">
      <header className="platform-header">
        <Link href="/platform/overview" className="wordmark">
          Fluivix<span>Edu</span>
          <span className="brand-context"> · Nền tảng</span>
        </Link>
        <Button variant="outline" disabled={busy} onClick={() => void logout()}>
          {busy ? "Đang đăng xuất…" : "Đăng xuất"}
        </Button>
      </header>
      <PlatformNav />
      <main id="main" className="platform-sheet">
        <h1 tabIndex={-1} ref={heading} className="page-heading">
          {title}
        </h1>
        {error && <p role="alert">{error}</p>}
        {!online && (
          <p role="alert" className="notice">
            Bạn đang ngoại tuyến. Dữ liệu đang hiển thị có thể đã cũ; yêu cầu
            tải lại sẽ tiếp tục khi có mạng.
          </p>
        )}
        {!session.ready || !session.token ? (
          <p role="status">Đang xác minh quyền truy cập…</p>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
