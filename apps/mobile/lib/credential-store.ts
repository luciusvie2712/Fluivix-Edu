import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { CredentialStore } from "./session-client";
const key = "fluivixedu.native.refresh.v1";
const native = () => Platform.OS === "android" || Platform.OS === "ios";
export const credentialStore: CredentialStore = {
  async get() {
    return native() ? SecureStore.getItemAsync(key) : null;
  },
  async set(value) {
    if (!native()) throw new Error("Hãy mở ứng dụng Android/iOS để đăng nhập.");
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async remove() {
    if (native()) await SecureStore.deleteItemAsync(key);
  },
};
