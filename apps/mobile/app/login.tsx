import { useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { Body, Button, Failure, Field, Screen } from "../components/ui";
import { useSession } from "../lib/session";
export default function Login() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (Platform.OS === "web") return;
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
      {Platform.OS === "web" && (
        <Body>
          Bạn đang xem trước giao diện Mobile. Hãy mở ứng dụng Android/iOS để
          đăng nhập, hoặc dùng giao diện Web của trung tâm.
        </Body>
      )}
      <Field
        label="Email"
        editable={Platform.OS !== "web"}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={email && !validEmail ? "Nhập email hợp lệ." : ""}
      />
      <Field
        label="Mật khẩu"
        editable={Platform.OS !== "web"}
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
        disabled={
          Platform.OS === "web" || busy || !validEmail || password.length < 12
        }
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
