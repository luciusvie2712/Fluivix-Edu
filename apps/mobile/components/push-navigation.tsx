import { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useSession } from "../lib/session";
import { openNotification } from "../lib/notifications";
export function PushNavigation() {
  const session = useSession(),
    [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const received = (response: Notifications.NotificationResponse | null) => {
      const id: unknown =
        response?.notification.request.content.data?.notificationId;
      if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) setPending(id);
    };
    void Notifications.getLastNotificationResponseAsync().then(received);
    const subscription =
      Notifications.addNotificationResponseReceivedListener(received);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (
      !pending ||
      !session.me?.activeRole ||
      !session.ready ||
      !session.visible
    )
      return;
    setPending(null);
    void openNotification(session, pending).catch(() =>
      router.replace("/context"),
    );
  }, [pending, session.me?.activeRole, session.ready, session.visible]);
  return null;
}
