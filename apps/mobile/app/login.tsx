import { useState } from "react";
import { router } from "expo-router";
import { Button, Failure, Field, Screen } from "../components/ui";
import { useSession } from "../lib/session";
export default function Login() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setError("");
    setBusy(true);
    try {
      session.setMe(await session.client.login(email.trim(), password));
      router.replace("/context");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kết nối.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return (
    <Screen title="Đăng nhập FluivixEdu">
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={email && !validEmail ? "Nhập email hợp lệ." : ""}
      />
      <Field
        label="Mật khẩu"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        error={
          password && password.length < 12
            ? "Mật khẩu cần ít nhất 12 ký tự."
            : ""
        }
      />
      {error ? <Failure error={error} /> : null}
      <Button
        primary
        title={busy ? "Đang đăng nhập…" : "Đăng nhập"}
        disabled={busy || !validEmail || password.length < 12}
        onPress={() => void submit()}
      />
      <Button title="Quên mật khẩu" onPress={() => router.push("/recover")} />
      <Button
        title="Kích hoạt lời mời"
        onPress={() => router.push("/activate")}
      />
    </Screen>
  );
}
