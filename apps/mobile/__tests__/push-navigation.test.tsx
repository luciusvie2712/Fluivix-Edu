import { Platform } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { PushNavigation } from "../components/push-navigation";
import { openNotification } from "../lib/notifications";

const mockRemove = jest.fn();
let mockExpoGo = false;
jest.mock("expo", () => ({ isRunningInExpoGo: () => mockExpoGo }));
const mockSession = {
  me: { activeRole: "teacher" },
  ready: true,
  visible: true,
};
jest.mock("expo-notifications", () => ({
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: mockRemove,
  })),
}));
jest.mock("../lib/session", () => ({ useSession: () => mockSession }));
jest.mock("../lib/notifications", () => ({
  openNotification: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
const initialOS = Platform.OS;
const response: Notifications.NotificationResponse = {
  actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
  notification: {
    date: 0,
    request: {
      identifier: "test-notification",
      trigger: null,
      content: {
        title: null,
        subtitle: null,
        body: null,
        categoryIdentifier: null,
        threadIdentifier: null,
        sound: null,
        data: { notificationId: "12345678-1234-1234-1234-123456789abc" },
      },
    },
  },
};
beforeEach(() => {
  mockExpoGo = false;
  jest.clearAllMocks();
  jest
    .mocked(Notifications.getLastNotificationResponseAsync)
    .mockResolvedValue(null);
});
afterEach(() => {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: initialOS,
  });
});
function platform(os: "web" | "android" | "ios") {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
}
describe("push navigation platform boundaries", () => {
  it("skips native push setup in Android Expo Go", async () => {
    platform("android");
    mockExpoGo = true;
    await render(<PushNavigation />);
    expect(
      Notifications.getLastNotificationResponseAsync,
    ).not.toHaveBeenCalled();
    expect(
      Notifications.addNotificationResponseReceivedListener,
    ).not.toHaveBeenCalled();
  });
  it("never calls unsupported Expo response APIs on web", async () => {
    platform("web");
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockRejectedValue(new Error("Unavailable on web"));
    await render(<PushNavigation />);
    expect(
      Notifications.getLastNotificationResponseAsync,
    ).not.toHaveBeenCalled();
    expect(
      Notifications.addNotificationResponseReceivedListener,
    ).not.toHaveBeenCalled();
    expect(openNotification).not.toHaveBeenCalled();
  });
  it.each(["android", "ios"] as const)(
    "restores and authorizes native notification targets on %s",
    async (os) => {
      platform(os);
      // Only the opaque ID is passed onward; openNotification performs server authorization.
      jest
        .mocked(Notifications.getLastNotificationResponseAsync)
        .mockResolvedValue(response);
      const view = await render(<PushNavigation />);
      await waitFor(() =>
        expect(openNotification).toHaveBeenCalledWith(
          mockSession,
          "12345678-1234-1234-1234-123456789abc",
        ),
      );
      await view.unmount();
      expect(mockRemove).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps the live listener usable when launch-response restoration fails", async () => {
    platform("android");
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockRejectedValue(new Error("Native response unavailable"));
    await render(<PushNavigation />);
    await waitFor(() =>
      expect(
        Notifications.addNotificationResponseReceivedListener,
      ).toHaveBeenCalledTimes(1),
    );
    const listener = jest.mocked(
      Notifications.addNotificationResponseReceivedListener,
    ).mock.calls[0]![0];
    await act(async () => listener(response));
    await waitFor(() => expect(openNotification).toHaveBeenCalledTimes(1));
  });
});
