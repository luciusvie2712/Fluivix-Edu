"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { components } from "@fluivix/api-client";
import { api, usePlatform } from "../../../components/session";
import { Button } from "../../../components/button";
const schema = z.object({
  email: z.email("Nhập email hợp lệ."),
  password: z.string().min(12, "Mật khẩu cần ít nhất 12 ký tự.").max(128),
});
export default function Login() {
  const router = useRouter(),
    session = usePlatform();
  const [challenge, setChallenge] = useState<
    components["schemas"]["ChallengeView"] | null
  >(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const initialStep = useRef(true);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  useEffect(() => {
    if (initialStep.current) {
      initialStep.current = false;
      return;
    }
    heading.current?.focus();
  }, [challenge, recovery, codes]);
  async function login(values: z.infer<typeof schema>) {
    setError("");
    try {
      const result = await api.POST("/api/v1/platform/auth/login", {
        body: values,
      });
      if (!result.data)
        throw new Error(result.error?.error.message ?? "Không thể đăng nhập.");
      setChallenge(result.data.data);
      form.reset();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Mất kết nối. Vui lòng thử lại.",
      );
    }
  }
  async function verify() {
    if (!challenge) return;
    setError("");
    setBusy(true);
    try {
      if (recovery) {
        if (!/^[a-f0-9]{24}$/.test(code))
          throw new Error("Nhập đủ 24 ký tự mã khôi phục.");
        const result = await api.POST("/api/v1/platform/auth/recover", {
          body: {
            challengeToken: challenge.challengeToken,
            recoveryCode: code,
          },
        });
        if (!result.data)
          throw new Error(
            result.error?.error.message ?? "Không thể khôi phục.",
          );
        setChallenge(result.data.data);
        setRecovery(false);
        setCode("");
        return;
      }
      if (!/^\d{6}$/.test(code))
        throw new Error("Nhập mã xác minh gồm 6 chữ số.");
      const result = await api.POST("/api/v1/platform/auth/verify", {
        body: { challengeToken: challenge.challengeToken, code },
      });
      if (!result.data)
        throw new Error(result.error?.error.message ?? "Không thể xác minh.");
      session.accept(result.data.data.accessToken);
      setChallenge(null);
      setCode("");
      if (result.data.data.recoveryCodes.length)
        setCodes(result.data.data.recoveryCodes);
      else router.replace("/platform/overview");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Mất kết nối. Vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="auth-layout">
      <section className="auth-panel">
        <div className="wordmark">
          Fluivix<span>Edu</span>
        </div>
        <p className="muted">Quản trị nền tảng</p>
        <h1 tabIndex={-1} ref={heading}>
          {codes.length
            ? "Lưu mã khôi phục"
            : challenge
              ? recovery
                ? "Khôi phục xác thực"
                : challenge.enrollmentRequired
                  ? "Thiết lập xác thực hai bước"
                  : "Xác thực hai bước"
              : "Đăng nhập nền tảng"}
        </h1>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {!session.ready ? (
          <p role="status">Đang kiểm tra phiên…</p>
        ) : codes.length ? (
          <>
            <p>
              Mỗi mã chỉ dùng một lần. Lưu ở nơi an toàn; các mã này chỉ hiển
              thị lúc này.
            </p>
            <ul className="recovery-codes">
              {codes.map((value) => (
                <li key={value}>
                  <code>{value}</code>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => {
                setCodes([]);
                router.replace("/platform/overview");
              }}
            >
              Đã lưu mã, tiếp tục
            </Button>
          </>
        ) : challenge ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            {challenge.secret && !recovery && (
              <>
                <p>
                  Thêm khóa dưới đây vào ứng dụng xác thực, chọn TOTP 6 chữ số,
                  chu kỳ 30 giây.
                </p>
                <p className="secret">
                  <code>{challenge.secret}</code>
                </p>
              </>
            )}
            <div className="field">
              <label htmlFor="mfa-code">
                {recovery ? "Mã khôi phục" : "Mã xác minh"}
              </label>
              <input
                id="mfa-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode={recovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                maxLength={recovery ? 24 : 6}
                aria-invalid={!!error}
                required
              />
            </div>
            <Button disabled={busy}>
              {busy
                ? "Đang xác minh…"
                : recovery
                  ? "Dùng mã khôi phục"
                  : "Xác minh"}
            </Button>
            {!challenge.enrollmentRequired && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setRecovery(!recovery);
                  setCode("");
                  setError("");
                }}
              >
                {recovery ? "Dùng ứng dụng xác thực" : "Mất thiết bị xác thực?"}
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setChallenge(null);
                setCode("");
                setError("");
              }}
            >
              Quay lại đăng nhập
            </button>
          </form>
        ) : (
          <form onSubmit={form.handleSubmit(login)} noValidate>
            <div className="field">
              <label htmlFor="email">Email quản trị</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                {...form.register("email")}
                aria-invalid={!!form.formState.errors.email}
                aria-describedby="email-error"
              />
              <span className="field-error" id="email-error">
                {form.formState.errors.email?.message}
              </span>
            </div>
            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register("password")}
                aria-invalid={!!form.formState.errors.password}
                aria-describedby="password-error"
              />
              <span className="field-error" id="password-error">
                {form.formState.errors.password?.message}
              </span>
            </div>
            <Button disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Đang đăng nhập…" : "Tiếp tục"}
            </Button>
            <p className="hint">Chỉ dành cho nhân sự vận hành FluivixEdu.</p>
          </form>
        )}
      </section>
    </main>
  );
}
