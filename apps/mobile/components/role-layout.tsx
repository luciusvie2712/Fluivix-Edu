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
      <Tabs.Screen
        name="index"
        options={{ title: role === "teacher" ? "Hôm nay" : "Trang chủ" }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: role === "teacher" ? "Lịch dạy" : "Lịch học" }}
      />
      {role !== "guardian" && (
        <Tabs.Screen name="classes" options={{ title: "Lớp học" }} />
      )}
      {role === "student" && (
        <Tabs.Screen name="grades" options={{ title: "Kết quả" }} />
      )}
      {role === "guardian" && (
        <Tabs.Screen name="finance" options={{ title: "Học phí" }} />
      )}
      {role !== "student" && (
        <Tabs.Screen name="notifications" options={{ title: "Thông báo" }} />
      )}
      <Tabs.Screen name="profile" options={{ title: "Tài khoản" }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      {role === "teacher" && (
        <>
          <Tabs.Screen name="classes/[id]" options={{ href: null }} />
          <Tabs.Screen name="assessments" options={{ href: null }} />
          <Tabs.Screen name="assessment/[id]" options={{ href: null }} />
          <Tabs.Screen
            name="sessions/[id]/attendance"
            options={{ href: null }}
          />
          <Tabs.Screen name="sessions/[id]/report" options={{ href: null }} />
        </>
      )}
      {role === "student" && (
        <>
          <Tabs.Screen name="classes/[id]" options={{ href: null }} />
          <Tabs.Screen name="attendance" options={{ href: null }} />
          <Tabs.Screen name="notifications" options={{ href: null }} />
        </>
      )}
      {role === "guardian" && (
        <>
          <Tabs.Screen name="children" options={{ href: null }} />
          <Tabs.Screen name="child-profile" options={{ href: null }} />
          <Tabs.Screen name="attendance" options={{ href: null }} />
          <Tabs.Screen name="grades" options={{ href: null }} />
        </>
      )}
    </Tabs>
  );
}
