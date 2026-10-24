import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Body, Button, Failure, Field, Screen } from "../components/ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
export default function Recover() {
  const session = useSession();
  const params = useLocalSearchParams<{ token?: string }>();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(params.token ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(reset: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (reset) {
        unwrap(
          await session.client.api.POST("/api/v1/auth/reset-password", {
            body: { token, password },
          }),
        );
        await session.client.forget();
        setPassword("");
        setToken("");
        setMessage("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
      } else {
        const result = unwrap(
          await session.client.api.POST("/api/v1/auth/forgot-password", {
            body: { email },
          }),
        );
        setMessage(result.message);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kết nối.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Khôi phục mật khẩu">
      <Field
        label="Email nhận liên kết"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Button
        title="Gửi liên kết khôi phục"
        disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
        onPress={() => void submit(false)}
      />
      <Field
        label="Mã từ liên kết khôi phục"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        secureTextEntry
      />
      <Field
        label="Mật khẩu mới"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        title="Đặt mật khẩu mới"
        disabled={busy || token.length !== 43 || password.length < 12}
        onPress={() => void submit(true)}
      />
      {error ? <Failure error={error} /> : null}
      {message ? <Body>{message}</Body> : null}
    </Screen>
  );
}
