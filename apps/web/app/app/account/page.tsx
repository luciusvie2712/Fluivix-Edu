"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { sessions, revokeSession } from "../../../lib/api";
import { useSession } from "../../../components/providers";
import { Button } from "../../../components/ui/button";
export default function Page() {
  const { me, clear } = useSession();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["sessions", me?.id, me?.activeTenantId, me?.activeRole],
    queryFn: sessions,
  });
  async function revoke(id: string) {
    if (
      !window.confirm(
        "Thu hồi phiên này? Thiết bị dùng phiên đó sẽ phải đăng nhập lại.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await revokeSession(id);
      await cache.invalidateQueries({ queryKey: ["sessions"] });
    } catch (cause) {
      if (cause instanceof Error) setError(cause.message);
      clear();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Tài khoản và phiên</h1>
      <p>{me?.displayName}</p>
      {query.isPending && <p role="status">Đang tải phiên đăng nhập…</p>}
      {query.isError && <p role="alert">{query.error.message}</p>}
      {error && <p role="alert">{error}</p>}
      {query.isSuccess && (
        <ul>
          {query.data.data.map((item) => (
            <li key={item.id} className="toolbar">
              <span>
                Đăng nhập{" "}
                {new Intl.DateTimeFormat("vi-VN", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(new Date(item.createdAt))}
              </span>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void revoke(item.id)}
              >
                Thu hồi phiên
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
