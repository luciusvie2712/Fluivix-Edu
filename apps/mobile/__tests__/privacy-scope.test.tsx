import { Alert } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Privacy } from "../components/privacy";
const mockSession = {
  scope: ["user", "tenant", "guardian", "child-a"],
  child: { id: "child-a", fullName: "Học viên A" },
  me: { activeRole: "guardian" },
  canWrite: true,
  online: true,
  client: { api: { GET: jest.fn(), POST: jest.fn() } },
};
jest.mock("../lib/session", () => ({ useSession: () => mockSession }));
jest.mock("../lib/privacy-export", () => ({ sharePrivacyExport: jest.fn() }));
const page = { page: 1, limit: 10, total: 0, totalPages: 0 };
function reply(data: unknown) {
  return {
    data: { data, page, meta: { traceId: "synthetic-native-privacy" } },
    response: new Response("", { status: 200 }),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.scope = ["user", "tenant", "guardian", "child-a"];
  mockSession.child = { id: "child-a", fullName: "Học viên A" };
  mockSession.canWrite = true;
  mockSession.client.api.GET.mockImplementation((path: string) =>
    Promise.resolve(
      reply(
        path.endsWith("policy")
          ? {
              configured: true,
              version: "synthetic-v1",
              noticeUrl: "https://example.test/privacy",
            }
          : [],
      ),
    ),
  );
});
async function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = () => (
    <QueryClientProvider client={cache}>
      <Privacy />
    </QueryClientProvider>
  );
  const rendered = await render(view());
  return { view, ...rendered };
}
it("keeps request and consent writes disabled in read-only mode while loading tracking", async () => {
  mockSession.canWrite = false;
  await mount();
  await screen.findByText("Chính sách: synthetic-v1");
  expect(
    screen.getByLabelText("Yêu cầu xuất dữ liệu").props.accessibilityState
      .disabled,
  ).toBe(true);
  expect(
    screen.getByLabelText("Đồng ý nhận thông báo theo chính sách").props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(mockSession.client.api.POST).not.toHaveBeenCalled();
  expect(mockSession.client.api.GET).toHaveBeenCalledWith(
    "/api/v1/privacy/requests",
    expect.objectContaining({
      params: { query: { page: 1, limit: 10, subjectStudentId: "child-a" } },
    }),
  );
});
it("does not submit an old child's confirmation after the selected child changes", async () => {
  let confirm: (() => void) | undefined;
  const alert = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) => {
      const button = buttons?.find((b) => b.text === "Gửi yêu cầu");
      confirm = button?.onPress
        ? () => {
            button.onPress?.();
          }
        : undefined;
    });
  try {
    const root = await mount();
    await screen.findByText("Chính sách: synthetic-v1");
    await fireEvent.press(screen.getByLabelText("Yêu cầu xuất dữ liệu"));
    expect(confirm).toBeDefined();
    mockSession.scope = ["user", "tenant", "guardian", "child-b"];
    mockSession.child = { id: "child-b", fullName: "Học viên B" };
    await root.rerender(root.view());
    await screen.findByText("Phạm vi: Học viên B.");
    await act(async () => {
      confirm?.();
    });
    expect(mockSession.client.api.POST).not.toHaveBeenCalled();
  } finally {
    alert.mockRestore();
  }
});
it("does not publish a delayed creation outcome into the next child's screen", async () => {
  let resolve!: (value: ReturnType<typeof reply>) => void;
  mockSession.client.api.POST.mockImplementation(
    () =>
      new Promise<ReturnType<typeof reply>>((done) => {
        resolve = done;
      }),
  );
  const alert = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === "Gửi yêu cầu")?.onPress?.();
    });
  try {
    const root = await mount();
    await screen.findByText("Chính sách: synthetic-v1");
    await fireEvent.press(screen.getByLabelText("Yêu cầu xuất dữ liệu"));
    await waitFor(() =>
      expect(mockSession.client.api.POST).toHaveBeenCalledTimes(1),
    );
    expect(mockSession.client.api.POST).toHaveBeenCalledWith(
      "/api/v1/privacy/requests",
      expect.objectContaining({
        body: { subjectStudentId: "child-a", type: "EXPORT" },
      }),
    );
    mockSession.scope = ["user", "tenant", "guardian", "child-b"];
    mockSession.child = { id: "child-b", fullName: "Học viên B" };
    await root.rerender(root.view());
    await act(async () =>
      resolve(
        reply({ id: "old-child-request", type: "EXPORT", status: "RECEIVED" }),
      ),
    );
    expect(screen.queryByText(/Máy chủ đã tiếp nhận yêu cầu/)).toBeNull();
    expect(screen.queryByText(/old-child-request/)).toBeNull();
  } finally {
    alert.mockRestore();
  }
});
