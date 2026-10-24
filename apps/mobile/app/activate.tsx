import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Body, Button, Failure, Field, Screen } from "../components/ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
export default function Activate() {
  const session = useSession();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? "");
  const [displayName, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function activate() {
    setBusy(true);
    setError("");
    try {
      unwrap(
        await session.client.api.POST("/api/v1/auth/accept-invitation", {
          body: { token, displayName, password },
        }),
      );
      setDone(true);
      setToken("");
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kích hoạt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Kích hoạt lời mời">
      {done ? (
        <Body>Đã kích hoạt. Bạn có thể đăng nhập bằng mật khẩu đã đặt.</Body>
      ) : (
        <>
          <Body>Chỉ sử dụng lời mời do trung tâm của bạn gửi.</Body>
          <Field
            label="Mã lời mời"
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
          />
          <Field
            label="Tên hiển thị"
            value={displayName}
            onChangeText={setName}
          />
          <Field
            label="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <Failure error={error} /> : null}
          <Button
            title={busy ? "Đang kích hoạt…" : "Kích hoạt"}
            disabled={
              busy ||
              token.length !== 43 ||
              !displayName.trim() ||
              password.length < 12
            }
            onPress={() => void activate()}
          />
        </>
      )}
    </Screen>
  );
}
