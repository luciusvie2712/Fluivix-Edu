import { Alert } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import Attendance from "../app/(teacher)/sessions/[id]/attendance";
import type { components } from "@fluivix/api-client";
type Snapshot = components["schemas"]["AttendanceView"];
const mockSnapshot: Snapshot = {
  session: {
    roomName: null,
    changeCount: 0,
    id: "session",
    classId: "class",
    className: "Synthetic twenty",
    teacherId: "teacher",
    scheduledDate: "2026-11-02",
    startsAt: "2026-11-02T11:00:00Z",
    endsAt: "2026-11-02T12:00:00Z",
    status: "SCHEDULED",
    version: 1,
    finalizedAt: null,
  },
  rows: Array.from({ length: 20 }, (_, i) => ({
    studentId: "student-" + i,
    fullName: "Synthetic learner " + i,
    status: "UNMARKED",
  })),
};
const response = (data: Snapshot, status = 200) => ({
  data: { data, meta: { traceId: "native-unit" } },
  response: new Response("", { status }),
});
const mockSession = {
  scope: ["user", "tenant", "teacher", null],
  online: true,
  canWrite: true,
  client: { api: { GET: jest.fn(), PUT: jest.fn(), POST: jest.fn() } },
};
jest.mock("../lib/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "session" }),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.online = true;
  mockSession.client.api.GET.mockResolvedValue(response(mockSnapshot));
});
function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <Attendance />
    </QueryClientProvider>,
  );
}
describe("native attendance commitment", () => {
  it("keeps20 locally marked rows unsynced until the server confirms, then permits finalization", async () => {
    let resolveSave!: (value: ReturnType<typeof response>) => void;
    mockSession.client.api.PUT.mockImplementation(
      () =>
        new Promise<ReturnType<typeof response>>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const confirm = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) =>
        buttons?.find((button) => button.text === "Đánh dấu")?.onPress?.(),
      );
    await mount();
    await screen.findByText("0/20 đã đánh dấu");
    await fireEvent.press(screen.getByLabelText("Đánh dấu tất cả có mặt"));
    expect(screen.getByText("20/20 đã đánh dấu")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Lưu nháp"));
    expect(mockSession.client.api.PUT).toHaveBeenCalledWith(
      "/api/v1/sessions/{id}/attendance/draft",
      expect.objectContaining({
        body: expect.objectContaining({
          sessionVersion: 1,
          records: expect.arrayContaining([
            expect.objectContaining({
              studentId: "student-19",
              status: "PRESENT",
            }),
          ]),
        }),
      }),
    );
    expect(
      screen.queryByText(
        "Máy chủ đã lưu bản nháp. Học viên và phụ huynh chưa thấy điểm danh.",
      ),
    ).toBeNull();
    expect(mockSession.client.api.POST).not.toHaveBeenCalled();
    await act(async () =>
      resolveSave(
        response({
          ...mockSnapshot,
          session: {
            ...mockSnapshot.session,
            status: "IN_PROGRESS",
            version: 2,
          },
          rows: mockSnapshot.rows.map((row) => ({ ...row, status: "PRESENT" })),
        }),
      ),
    );
    expect(
      screen.getByText(
        "Máy chủ đã lưu bản nháp. Học viên và phụ huynh chưa thấy điểm danh.",
      ),
    ).toBeTruthy();
    confirm.mockRestore();
  });
  it("does not send a draft while offline and exposes that it is not synchronized", async () => {
    mockSession.online = false;
    await mount();
    await screen.findByText("0/20 đã đánh dấu");
    await fireEvent.press(screen.getByLabelText("Lưu nháp"));
    expect(mockSession.client.api.PUT).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Mất kết nối. Nháp chỉ còn trong phiên này; chưa đồng bộ.",
      ),
    ).toBeTruthy();
  });
  it("retains local marks when a version409 occurs and offers comparison without overwriting", async () => {
    mockSession.client.api.PUT.mockResolvedValue({
      error: {
        error: { message: "VERSION_CONFLICT" },
        meta: { traceId: "conflict" },
      },
      response: new Response("", { status: 409 }),
    });
    const confirm = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) =>
        buttons?.find((button) => button.text === "Đánh dấu")?.onPress?.(),
      );
    await mount();
    await screen.findByText("0/20 đã đánh dấu");
    await fireEvent.press(screen.getByLabelText("Đánh dấu tất cả có mặt"));
    await fireEvent.press(screen.getByLabelText("Lưu nháp"));
    await screen.findByText("VERSION_CONFLICT");
    expect(screen.getByText("20/20 đã đánh dấu")).toBeTruthy();
    expect(screen.getByLabelText("Tải bản mới để đối chiếu")).toBeTruthy();
    await waitFor(() =>
      expect(mockSession.client.api.PUT).toHaveBeenCalledTimes(1),
    );
    expect(mockSession.client.api.POST).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
