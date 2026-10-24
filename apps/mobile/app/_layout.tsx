import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../lib/session";
import { PushNavigation } from "../components/push-navigation";
export default function Root() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
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
