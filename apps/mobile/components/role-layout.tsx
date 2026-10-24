import { Redirect, Tabs, router } from "expo-router";
import { Body, Button, Failure, Screen } from "./ui";
import { useSession } from "../lib/session";
import type { MobileRole } from "../lib/session-client";
export function RoleLayout({ role }: { role: MobileRole }) {
  const session = useSession();
  if (!session.ready || !session.visible)
    return (
      <Screen title="FluivixEdu">
        <Body>Đang xác minh quyền truy cập…</Body>
      </Screen>
    );
  if (!session.me) return <Redirect href="/login" />;
  if (!session.me.activeTenantId || session.me.activeRole !== role)
    return <Redirect href="/context" />;
  if (
    session.activeTenant &&
    ["SUSPENDED", "TERMINATED", "PENDING_ACTIVATION"].includes(
      session.activeTenant.status,
    )
  )
    return (
      <Screen title="Trung tâm không khả dụng">
        <Body>
          Trung tâm đang tạm khóa hoặc chưa được kích hoạt. Liên hệ trung tâm để
          được hỗ trợ.
        </Body>
        <Button
          title="Chọn trung tâm khác"
          onPress={() => router.replace("/context")}
        />
      </Screen>
    );
  if (session.error)
    return (
      <Screen title="Không thể xác minh truy cập">
        <Failure error={session.error} />
        <Button title="Kiểm tra lại" onPress={() => void session.restore()} />
      </Screen>
    );
  const tabs = [
    { name: "index", title: role === "teacher" ? "Hôm nay" : "Trang chủ" },
    { name: "schedule", title: role === "teacher" ? "Lịch dạy" : "Lịch học" },
    ...(role !== "guardian" ? [{ name: "classes", title: "Lớp học" }] : []),
    ...(role === "student" ? [{ name: "grades", title: "Kết quả" }] : []),
    ...(role === "guardian" ? [{ name: "finance", title: "Học phí" }] : []),
    ...(role !== "student"
      ? [{ name: "notifications", title: "Thông báo" }]
      : []),
    { name: "profile", title: "Tài khoản" },
  ];
  return (
    <Tabs
      key={session.scope.join(":")}
      screenOptions={{
        headerTitle: "FluivixEdu",
        tabBarAllowFontScaling: true,
        tabBarIcon: () => null,
        tabBarLabelStyle: { fontSize: 14 },
        tabBarStyle: { minHeight: 64 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.title }}
        />
      ))}
      {[
        "privacy",
        ...(role === "teacher"
          ? [
              "classes/[id]",
              "assessments",
              "assessment/[id]",
              "sessions/[id]/attendance",
              "sessions/[id]/report",
            ]
          : role === "student"
            ? ["classes/[id]", "attendance", "notifications"]
            : ["children", "child-profile", "attendance", "grades"]),
      ].map((name) => (
        // SDK58 treats href:null as a hidden route and redirects away from it.
        // Detail screens must stay navigable while their tab button stays absent.
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: { display: "none" },
          }}
        />
      ))}
    </Tabs>
  );
}
