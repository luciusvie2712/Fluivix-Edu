"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, usePlatform } from "../../../components/session";
import { Button } from "../../../components/button";
import { PlatformNav } from "../../../components/frame";
const labels: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  PENDING_ACTIVATION: "Chờ kích hoạt",
  PAST_DUE_GRACE: "Gia hạn ân hạn",
  READ_ONLY: "Chỉ đọc",
  SUSPENDED: "Tạm khóa",
  TERMINATED: "Đã chấm dứt",
};
export default function Overview() {
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const session = usePlatform(),
    router = useRouter();
  useEffect(() => {
    if (session.ready && !session.token) router.replace("/platform/login");
  }, [session.ready, session.token, router]);
  const query = useQuery({
    queryKey: ["platform-overview"],
    enabled: !!session.token,
    queryFn: async () => {
      const result = await api.GET("/api/v1/platform/overview", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (result.response.status === 401) session.clear();
      if (!result.data)
        throw new Error(
          result.error?.error.message ?? "Không thể tải dữ liệu.",
        );
      return result.data.data;
    },
  });
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const result = await api.POST("/api/v1/platform/auth/logout", {
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
      });
      if (!result.response.ok && result.response.status !== 401)
        throw new Error(
          "Chưa thể kết thúc phiên trên máy chủ. Vui lòng thử lại.",
        );
      session.clear();
      router.replace("/platform/login");
    } catch (cause) {
      setLogoutError(
        cause instanceof Error
          ? cause.message
          : "Mất kết nối. Vui lòng thử lại.",
      );
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <div className="platform-frame">
      <header className="platform-header">
        <span className="wordmark">
          Fluivix<span>Edu</span> · Nền tảng
        </span>
        <Button
          variant="outline"
          disabled={loggingOut}
          onClick={() => void logout()}
        >
          {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
        </Button>
      </header>
      <PlatformNav />
      <main id="main" className="platform-sheet">
        {logoutError && <p role="alert">{logoutError}</p>}
        <h1>Tổng quan nền tảng</h1>
        <p className="muted">Số trung tâm theo trạng thái vận hành.</p>
        {!session.ready || query.isPending ? (
          <p role="status">Đang tải…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button onClick={() => void query.refetch()}>Thử lại</Button>
          </div>
        ) : query.data ? (
          <>
            {query.data.tenantsByStatus.length ? (
              <table>
                <caption className="sr-only">
                  Số trung tâm theo trạng thái
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Trạng thái</th>
                    <th scope="col" className="number">
                      Trung tâm
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.tenantsByStatus.map((row) => (
                    <tr key={row.status}>
                      <td>{labels[row.status] ?? row.status}</td>
                      <td className="number">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Chưa có trung tâm.</p>
            )}
            <p className="hint">
              Cập nhật {new Date(query.data.observedAt).toLocaleString("vi-VN")}
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
