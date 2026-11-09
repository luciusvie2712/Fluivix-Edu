import { router } from "expo-router";
import { useSession } from "../lib/session";
import { openNotification } from "../lib/notifications";

const mockSession = {
  me: { activeRole: "guardian" },
  child: { id: "child-b", fullName: "Synthetic selected child" },
  selectChild: jest.fn(),
  client: { api: { GET: jest.fn() } },
};
jest.mock("../lib/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));
const note = {
  id: "opaque-note",
  entityType: "assessment",
  entityId: "assessment-a",
  subjectStudentId: "child-a",
  subjectStudentIds: ["child-a", "child-b"],
};
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.me.activeRole = "guardian";
  mockSession.child.id = "child-b";
});
function reply(data: unknown) {
  return { data: { data }, response: { status: 200 } };
}
it("keeps the currently selected eligible sibling and reauthorizes that profile before navigating", async () => {
  mockSession.client.api.GET.mockResolvedValueOnce(
    reply(note),
  ).mockResolvedValueOnce(
    reply({ id: "child-b", fullName: "Synthetic child B" }),
  );
  await openNotification(useSession(), "opaque-note");
  expect(mockSession.client.api.GET).toHaveBeenNthCalledWith(
    2,
    "/api/v1/mobile/guardian/students/{id}/profile",
    { params: { path: { id: "child-b" } } },
  );
  expect(mockSession.selectChild).toHaveBeenCalledWith({
    id: "child-b",
    fullName: "Synthetic child B",
  });
  expect(router.replace).toHaveBeenCalledWith("/(guardian)/grades");
});
it("uses only a currently authorized sibling when the selected child is unrelated", async () => {
  mockSession.child.id = "unrelated-child";
  mockSession.client.api.GET.mockResolvedValueOnce(
    reply({ ...note, subjectStudentIds: ["child-b"] }),
  ).mockResolvedValueOnce(
    reply({ id: "child-b", fullName: "Synthetic child B" }),
  );
  await openNotification(useSession(), "opaque-note");
  expect(mockSession.client.api.GET).toHaveBeenNthCalledWith(
    2,
    "/api/v1/mobile/guardian/students/{id}/profile",
    { params: { path: { id: "child-b" } } },
  );
});
it("does not treat a historical representative hint as a current authorization grant", async () => {
  mockSession.client.api.GET.mockResolvedValueOnce(
    reply({ ...note, subjectStudentIds: [] }),
  );
  await expect(openNotification(useSession(), "opaque-note")).rejects.toThrow(
    "không có học viên được phép",
  );
  expect(mockSession.client.api.GET).toHaveBeenCalledTimes(1);
  expect(mockSession.selectChild).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
it("does not navigate if the child relation is revoked between notification and profile requests", async () => {
  mockSession.client.api.GET.mockResolvedValueOnce(
    reply(note),
  ).mockResolvedValueOnce({
    error: {
      error: { message: "Relation revoked" },
      meta: { traceId: "synthetic-trace" },
    },
    response: { status: 404 },
  });
  await expect(openNotification(useSession(), "opaque-note")).rejects.toThrow(
    "Relation revoked",
  );
  expect(mockSession.selectChild).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
it("rejects an unknown deep-link entity instead of falling back to a schedule", async () => {
  mockSession.client.api.GET.mockResolvedValueOnce(
    reply({ ...note, entityType: "untrusted-route" }),
  );
  await expect(openNotification(useSession(), "opaque-note")).rejects.toThrow(
    "chưa được hỗ trợ",
  );
  expect(mockSession.selectChild).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

it("opens a reminder only after the current guardian child profile is authorized and uses live finance", async () => {
  mockSession.client.api.GET.mockResolvedValueOnce(
    reply({
      ...note,
      entityType: "reminder",
      entityId: "opaque-reminder-batch",
      subjectStudentIds: ["child-b"],
    }),
  ).mockResolvedValueOnce(
    reply({ id: "child-b", fullName: "Synthetic authorized reminder child" }),
  );
  await openNotification(useSession(), "opaque-note");
  expect(mockSession.client.api.GET).toHaveBeenNthCalledWith(
    2,
    "/api/v1/mobile/guardian/students/{id}/profile",
    { params: { path: { id: "child-b" } } },
  );
  expect(mockSession.selectChild).toHaveBeenCalledWith({
    id: "child-b",
    fullName: "Synthetic authorized reminder child",
  });
  expect(router.replace).toHaveBeenCalledWith("/(guardian)/finance");
});
it("does not fall back to a schedule for a reminder under a non-guardian role", async () => {
  mockSession.me.activeRole = "student";
  mockSession.client.api.GET.mockResolvedValueOnce(
    reply({ ...note, entityType: "reminder" }),
  );
  await expect(openNotification(useSession(), "opaque-note")).rejects.toThrow(
    "vai trò phụ huynh",
  );
  expect(mockSession.client.api.GET).toHaveBeenCalledTimes(1);
  expect(mockSession.selectChild).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
