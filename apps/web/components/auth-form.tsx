"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { acceptInvitation, forgotPassword, resetPassword } from "../lib/api";
import { useSession } from "./providers";
import { Button } from "./ui/button";
type Mode = "login" | "forgot" | "reset" | "invite";
const schema = z.object({
  email: z.string(),
  password: z.string(),
  displayName: z.string(),
});
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const session = useSession();
  const [token, setToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    setError: fieldError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", displayName: "" },
  });
  useEffect(() => {
    if (mode !== "reset" && mode !== "invite") return;
    function consumeLink() {
      if (!window.location.hash) return;
      setToken(
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
      );
      setSuccess("");
      setError("");
      reset({ email: "", password: "", displayName: "" });
      window.history.replaceState(null, "", window.location.pathname);
    }
    consumeLink();
    window.addEventListener("hashchange", consumeLink);
    return () => window.removeEventListener("hashchange", consumeLink);
  }, [mode, reset]);
  const title = {
    login: "Đăng nhập",
    forgot: "Quên mật khẩu",
    reset: "Đặt lại mật khẩu",
    invite: "Kích hoạt lời mời",
  }[mode];
  async function submit(values: z.infer<typeof schema>) {
    setError("");
    if (mode === "login" || mode === "forgot") {
      if (!z.email().max(254).safeParse(values.email.trim()).success) {
        fieldError("email", { message: "Nhập địa chỉ email hợp lệ." });
        return;
      }
    }
    if (
      mode !== "forgot" &&
      (values.password.length < 12 || values.password.length > 128)
    ) {
      fieldError("password", { message: "Mật khẩu cần từ 12 đến 128 ký tự." });
      return;
    }
    if (
      mode === "invite" &&
      (!values.displayName.trim() || values.displayName.length > 150)
    ) {
      fieldError("displayName", { message: "Nhập họ tên, tối đa 150 ký tự." });
      return;
    }
    try {
      if (mode === "login") {
        await session.signIn(values.email.trim(), values.password);
        router.replace("/tenant/select");
      }
      if (mode === "forgot") {
        const result = await forgotPassword({ email: values.email.trim() });
        setSuccess(result.data.message);
      }
      if (mode === "reset") {
        await resetPassword({ token, password: values.password });
        setSuccess("Đã đổi mật khẩu. Bạn có thể đăng nhập lại.");
      }
      if (mode === "invite") {
        await acceptInvitation({
          token,
          password: values.password,
          displayName: values.displayName.trim(),
        });
        setSuccess("Đã kích hoạt lời mời. Bạn có thể đăng nhập.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể xử lý. Vui lòng thử lại.",
      );
    }
  }
  const invalidToken =
    (mode === "invite" || mode === "reset") && token.length !== 43;
  return (
    <main id="main" className="auth-layout">
      <section className="auth-panel" aria-labelledby="auth-title">
        <Link className="wordmark" href="/login">
          Fluivix<span>Edu</span>
        </Link>
        <h1 id="auth-title">{title}</h1>
        <p className="muted">
          {mode === "login"
            ? "Truy cập trung tâm và vai trò được cấp cho bạn."
            : mode === "invite"
              ? "Với tài khoản đã có, nhập mật khẩu hiện tại để xác thực."
              : "Bảo vệ quyền truy cập tài khoản của bạn."}
        </p>
        {success ? (
          <div role="status">
            <p>{success}</p>
            <Link href="/login">Về đăng nhập</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(submit)} noValidate>
            {(mode === "login" || mode === "forgot") && (
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  maxLength={254}
                  aria-invalid={!!errors.email}
                  aria-describedby="email-error"
                  {...register("email")}
                />
                <span className="field-error" id="email-error">
                  {errors.email?.message}
                </span>
              </div>
            )}
            {mode === "invite" && (
              <div className="field">
                <label htmlFor="displayName">Họ và tên</label>
                <input
                  id="displayName"
                  autoComplete="name"
                  maxLength={150}
                  aria-invalid={!!errors.displayName}
                  aria-describedby="name-error"
                  {...register("displayName")}
                />
                <span className="field-error" id="name-error">
                  {errors.displayName?.message}
                </span>
              </div>
            )}
            {mode !== "forgot" && (
              <div className="field">
                <label htmlFor="password">Mật khẩu</label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "reset" ? "new-password" : "current-password"
                  }
                  maxLength={128}
                  aria-invalid={!!errors.password}
                  aria-describedby="password-error password-hint"
                  {...register("password")}
                />
                <span id="password-hint" className="hint">
                  12–128 ký tự. Có thể dán mật khẩu.
                </span>
                <span className="field-error" id="password-error">
                  {errors.password?.message}
                </span>
                <button
                  type="button"
                  className="text-button"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                </button>
              </div>
            )}
            {invalidToken && (
              <p role="alert">
                Liên kết thiếu mã hợp lệ. Vui lòng yêu cầu gửi lại liên kết.
              </p>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <Button disabled={isSubmitting || invalidToken} type="submit">
              {isSubmitting ? "Đang xử lý…" : title}
            </Button>
          </form>
        )}
        <nav className="auth-links" aria-label="Hỗ trợ đăng nhập">
          {mode === "login" ? (
            <Link href="/forgot-password">Quên mật khẩu?</Link>
          ) : (
            <Link href="/login">Về đăng nhập</Link>
          )}
        </nav>
      </section>
    </main>
  );
}
