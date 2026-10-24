import { useEffect, useState } from "react";
import { Platform, Switch, View } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { Body, Button, Failure, Panel } from "./ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
type Preferences = components["schemas"]["PreferencesInput"];
const labels: Record<keyof Preferences, string> = {
  pushEnabled: "Nhận push trên thiết bị",
  attendance: "Chuyên cần",
  grades: "Kết quả học tập",
  finance: "Học phí và phiếu thu",
  schedule: "Thay đổi lịch học",
};
export function Preferences() {
  const session = useSession(),
    [draft, setDraft] = useState<Preferences | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: [...session.scope, "preferences"],
    queryFn: async () =>
      unwrap(
        await session.client.api.GET("/api/v1/me/notification-preferences"),
      ),
  });
  useEffect(() => {
    if (query.data && !draft) setDraft(query.data);
  }, [query.data, draft]);
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      setDraft(
        unwrap(
          await session.client.api.PATCH(
            "/api/v1/me/notification-preferences",
            { body: draft },
          ),
        ),
      );
      setMessage("Máy chủ đã lưu tùy chọn.");
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function register(remove = false) {
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      if (remove) {
        unwrap(
          await session.client.api.DELETE("/api/v1/mobile/devices/push-token"),
        );
        setMessage("Máy chủ đã gỡ đăng ký thiết bị này.");
        return;
      }
      if (!Device.isDevice || !["android", "ios"].includes(Platform.OS))
        throw new Error(
          "Cần thiết bị Android/iOS thật và development/release build để kiểm tra push.",
        );
      const projectId =
        Constants.easConfig?.projectId ??
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
      if (!projectId)
        throw new Error(
          "Chưa cấu hình EAS project ID. Liên hệ người vận hành.",
        );
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("default", {
          name: "Thông báo FluivixEdu",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted)
        permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Thiết bị chưa cho phép thông báo. Bạn vẫn xem được hộp thư.",
        );
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      unwrap(
        await session.client.api.POST("/api/v1/mobile/devices/push-token", {
          body: {
            token: token.data,
            platform: Platform.OS === "ios" ? "ios" : "android",
          },
        }),
      );
      setMessage(
        "Máy chủ đã đăng ký thiết bị. Push còn phụ thuộc consent hợp lệ và cấu hình nhà cung cấp.",
      );
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel>
      <Body>Tùy chọn thông báo</Body>
      {query.isPending && <Body>Đang tải tùy chọn…</Body>}
      {query.error ? (
        <Failure error={query.error} />
      ) : (
        draft &&
        (Object.keys(labels) as (keyof Preferences)[]).map((key) => (
          <View
            key={key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Body>{labels[key]}</Body>
            <Switch
              accessibilityLabel={labels[key]}
              value={draft[key]}
              disabled={busy}
              onValueChange={(value) => setDraft({ ...draft, [key]: value })}
            />
          </View>
        ))
      )}
      {error ? <Failure error={error} /> : null}
      {message ? <Body>{message}</Body> : null}
      <Button
        title="Lưu tùy chọn"
        disabled={!draft || busy || !session.online}
        onPress={() => void save()}
      />
      <Button
        title="Cho phép và đăng ký push"
        disabled={busy || !session.online}
        onPress={() => void register()}
      />
      <Button
        title="Gỡ đăng ký push thiết bị này"
        disabled={busy || !session.online}
        onPress={() => void register(true)}
      />
    </Panel>
  );
}
