import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../lib/session";
import { PushNavigation } from "../components/push-navigation";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { cleanupPrivacyExports } from "../lib/privacy-export";
export default function Root() {
  const [cleanupFailed, setCleanupFailed] = useState(false);
  useEffect(() => {
    void cleanupPrivacyExports().catch(() => setCleanupFailed(true));
  }, []);
  return (
    <SafeAreaProvider>
      <SessionProvider>
        {cleanupFailed && (
          <Text accessibilityRole="alert">
            Chưa dọn được bản xuất tạm trên thiết bị. Vui lòng mở lại ứng dụng
            trước khi xuất dữ liệu riêng tư.
          </Text>
        )}
        <PushNavigation />
        <Stack screenOptions={{ headerTitle: "FluivixEdu", animation: "none" }}>
          <Stack.Screen name="(teacher)" options={{ headerShown: false }} />
          <Stack.Screen name="(student)" options={{ headerShown: false }} />
          <Stack.Screen name="(guardian)" options={{ headerShown: false }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
