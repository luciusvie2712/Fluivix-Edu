import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { credentialStore } from "../lib/credential-store";
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
}));
const initialOS = Platform.OS;
function platform(os: "web" | "android" | "ios") {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
}
beforeEach(() => jest.clearAllMocks());
afterEach(() =>
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: initialOS,
  }),
);
it("does not call native storage or persist a browser refresh credential", async () => {
  platform("web");
  expect(await credentialStore.get()).toBeNull();
  await credentialStore.remove();
  await expect(credentialStore.set("synthetic-refresh")).rejects.toThrow(
    "Android/iOS",
  );
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});
it.each(["android", "ios"] as const)(
  "retains protected refresh storage on %s",
  async (os) => {
    platform(os);
    jest
      .mocked(SecureStore.getItemAsync)
      .mockResolvedValue("synthetic-refresh");
    expect(await credentialStore.get()).toBe("synthetic-refresh");
    await credentialStore.set("synthetic-refresh");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "fluivixedu.native.refresh.v1",
      "synthetic-refresh",
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
    );
    await credentialStore.remove();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "fluivixedu.native.refresh.v1",
    );
  },
);
