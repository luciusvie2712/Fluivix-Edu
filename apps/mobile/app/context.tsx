import { useState } from "react";
import { Redirect, router } from "expo-router";
import { Body, Button, Failure, Panel, Screen } from "../components/ui";
import { useSession } from "../lib/session";
import { mobileRoles, type MobileRole } from "../lib/session-client";
export default function Context() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!session.me) return <Redirect href="/login" />;
  async function select(tenantId: string, role: MobileRole) {
    setBusy(true);
    setError("");
    try {
      session.setMe(await session.client.switchContext(tenantId, role));
      session.setError("");
      router.dismissAll();
      router.replace(
        role === "teacher"
          ? "/(teacher)"
          : role === "student"
            ? "/(student)"
            : "/(guardian)/children",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể chuyển trung tâm.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Chọn trung tâm và vai trò">
      {error ? <Failure error={error} /> : null}
      {!session.me.memberships.length && (
        <Body>
          Bạn chưa được liên kết với trung tâm. Vui lòng liên hệ nhân viên trung
          tâm.
        </Body>
      )}
      {session.me.memberships.map(({ tenant, roles }) => (
        <Panel key={tenant.id}>
          <Body>{tenant.name}</Body>
          <Body>
            {tenant.status === "READ_ONLY"
              ? "Trung tâm chỉ cho phép xem dữ liệu."
              : tenant.status}
          </Body>
          {roles
            .filter((r) => mobileRoles.includes(r.role))
            .map(({ role }) => (
              <Button
                key={role}
                label={`${tenant.name}, ${role === "teacher" ? "Giáo viên" : role === "student" ? "Học viên" : "Phụ huynh"}`}
                title={
                  role === "teacher"
                    ? "Giáo viên"
                    : role === "student"
                      ? "Học viên"
                      : "Phụ huynh"
                }
                disabled={
                  busy ||
                  ["SUSPENDED", "TERMINATED", "PENDING_ACTIVATION"].includes(
                    tenant.status,
                  )
                }
                onPress={() => void select(tenant.id, role as MobileRole)}
              />
            ))}
          {!roles.some((r) => mobileRoles.includes(r.role)) && (
            <Body>Vai trò nhân viên sử dụng cổng Web.</Body>
          )}
        </Panel>
      ))}
    </Screen>
  );
}
