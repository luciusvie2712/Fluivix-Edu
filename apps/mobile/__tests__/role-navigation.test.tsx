import { Text } from "react-native";
import { Stack } from "expo-router";
import {
  renderRouter,
  screen,
  fireEvent,
  waitFor,
  testRouter,
} from "expo-router/testing-library";
import Context from "../app/context";
import Login from "../app/login";
import { RoleLayout } from "../components/role-layout";
import type { MobileRole } from "../lib/session-client";

const tenant = {
  id: "tenant-a",
  name: "Trung tâm kiểm thử A",
  status: "ACTIVE",
};
const mockSession = {
  ready: true,
  visible: true,
  online: true,
  error: "",
  child: null,
  activeTenant: tenant,
  scope: ["self", tenant.id, "teacher"] as string[],
  me: {
    id: "self",
    activeTenantId: null as string | null,
    activeRole: null as MobileRole | null,
    memberships: [
      {
        tenant,
        roles: [{ role: "teacher" }, { role: "student" }, { role: "guardian" }],
      },
    ],
  },
  setMe: jest.fn(),
  setError: jest.fn(),
  restore: jest.fn(),
  client: { switchContext: jest.fn(), login: jest.fn() },
};
jest.mock("../lib/session", () => ({ useSession: () => mockSession }));
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.me.activeRole = null;
  mockSession.me.activeTenantId = null;
  mockSession.setMe.mockImplementation((next) => {
    mockSession.me = next;
    mockSession.scope = ["self", tenant.id, next.activeRole];
  });
  mockSession.client.switchContext.mockImplementation(
    async (tenantId: string, role: MobileRole) => ({
      ...mockSession.me,
      activeTenantId: tenantId,
      activeRole: role,
    }),
  );
  mockSession.client.login.mockResolvedValue(mockSession.me);
});
const routes: Record<string, () => React.JSX.Element> = {
  _layout: () => <Stack />,
  context: Context,
  index: () => <Text>Entry</Text>,
  login: Login,
};
for (const role of ["teacher", "student", "guardian"] as const) {
  routes[`(${role})/_layout`] = () => <RoleLayout role={role} />;
  const names = [
    "index",
    "schedule",
    "profile",
    "privacy",
    "notifications",
    ...(role === "teacher"
      ? [
          "classes",
          "classes/[id]",
          "assessments",
          "assessment/[id]",
          "sessions/[id]/attendance",
          "sessions/[id]/report",
        ]
      : role === "student"
        ? ["classes", "classes/[id]", "attendance", "grades"]
        : ["finance", "children", "child-profile", "attendance", "grades"]),
  ];
  for (const name of names)
    routes[`(${role})/${name}`] = () => <Text>{role + " " + name}</Text>;
}
it.each([
  ["teacher", "Giáo viên", "index"],
  ["student", "Học viên", "index"],
  ["guardian", "Phụ huynh", "children"],
] as const)(
  "selects %s context using actual Expo Router navigation",
  async (role, label, destination) => {
    await renderRouter(routes, { initialUrl: "/context" });
    await fireEvent.press(
      screen.getByLabelText(`Trung tâm kiểm thử A, ${label}`),
    );
    await waitFor(() =>
      expect(screen.getByText(`${role} ${destination}`)).toBeTruthy(),
    );
    expect(mockSession.client.switchContext).toHaveBeenCalledWith(
      tenant.id,
      role,
    );
    const detail =
      role === "teacher"
        ? "sessions/session-1/attendance"
        : role === "student"
          ? "attendance"
          : "grades";
    await testRouter.push(`/${detail}`);
    await waitFor(() =>
      expect(
        screen.getByText(
          `${role} ${role === "teacher" ? "sessions/[id]/attendance" : detail}`,
        ),
      ).toBeTruthy(),
    );
  },
);
it("replaces login with the real context selector after successful authentication", async () => {
  await renderRouter(routes, { initialUrl: "/login" });
  await fireEvent.changeText(
    screen.getByLabelText("Email"),
    "teacher@example.test",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Mật khẩu"),
    "synthetic-password-16",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Đăng nhập" }));
  await waitFor(() =>
    expect(screen.getByText("Chọn trung tâm và vai trò")).toBeTruthy(),
  );
  expect(mockSession.client.login).toHaveBeenCalledWith(
    "teacher@example.test",
    "synthetic-password-16",
  );
});
