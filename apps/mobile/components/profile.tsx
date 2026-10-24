import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { Body, Button, Failure, Screen } from "./ui";
import { useSession } from "../lib/session";
import { Preferences } from "./preferences";
export function Profile() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout(all: boolean) {
    setBusy(true);
    setError("");
    try {
      await session.client.logout(all);
      router.replace("/login");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Chưa thể thu hồi phiên. Vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Tài khoản">
      <Body>{session.me?.displayName}</Body>
      <Body>
        {
          session.me?.memberships.find(
            (m) => m.tenant.id === session.me?.activeTenantId,
          )?.tenant.name
        }
      </Body>
      {error ? <Failure error={error} /> : null}
      <Button
        title="Đổi trung tâm / vai trò"
        disabled={busy}
        onPress={() => {
          session.clearChild();
          router.dismissAll();
          router.replace("/context");
        }}
      />
      {session.me?.activeRole === "guardian" && (
        <Button
          title="Chọn học viên"
          onPress={() => router.push("/(guardian)/children")}
        />
      )}
      <Button
        title="Quyền riêng tư và yêu cầu dữ liệu"
        onPress={() =>
          router.push(
            session.me?.activeRole === "teacher"
              ? "/(teacher)/privacy"
              : session.me?.activeRole === "student"
                ? "/(student)/privacy"
                : "/(guardian)/privacy",
          )
        }
      />
      <Preferences />
      <Button
        title={busy ? "Đang thu hồi phiên…" : "Đăng xuất thiết bị này"}
        disabled={busy}
        onPress={() => void logout(false)}
      />
      <Button
        title="Đăng xuất mọi thiết bị"
        disabled={busy}
        onPress={() =>
          Alert.alert(
            "Thu hồi mọi phiên?",
            "Tất cả thiết bị sẽ cần đăng nhập lại.",
            [
              { text: "Hủy", style: "cancel" },
              {
                text: "Đăng xuất",
                style: "destructive",
                onPress: () => void logout(true),
              },
            ],
          )
        }
      />
    </Screen>
  );
}
