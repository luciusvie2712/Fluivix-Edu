import { useEffect, useState } from "react";
import type { NotificationResponse } from "expo-notifications";
import { router } from "expo-router";
import { useSession } from "../lib/session";
import { openNotification } from "../lib/notifications";
import { supportsRemotePush } from "../lib/push-capability";
export function PushNavigation() {
  const session = useSession(),
    [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!supportsRemotePush()) return;
    let mounted = true;
    let subscription: { remove(): void } | undefined;
    const received = (response: NotificationResponse | null) => {
      const id: unknown =
        response?.notification.request.content.data?.notificationId;
      if (mounted && typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
        setPending(id);
    };
    // Expo Go lacks some native push modules: do not evaluate this package there.
    // Missing push support must not prevent opening the app or the API inbox.
    async function start() {
      // Keep native module evaluation behind the Expo Go/platform guard.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const notifications: typeof import("expo-notifications") = require("expo-notifications");
      if (!mounted) return;
      subscription =
        notifications.addNotificationResponseReceivedListener(received);
      try {
        received(await notifications.getLastNotificationResponseAsync());
      } catch {
        // The live listener remains available if launch-response restoration fails.
      }
    }
    void start().catch(() => {});
    return () => {
      mounted = false;
      subscription?.remove();
    };
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
