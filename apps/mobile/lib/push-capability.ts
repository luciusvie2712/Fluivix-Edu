import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

export function supportsRemotePush() {
  return (
    (Platform.OS === "android" || Platform.OS === "ios") && !isRunningInExpoGo()
  );
}
