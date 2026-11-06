"use client";
import { useSession } from "../components/providers";
export const zoneLabel = (timezone: string) =>
  timezone === "Asia/Ho_Chi_Minh" ? "giờ Việt Nam" : `múi giờ ${timezone}`;
export function useFinancialTime() {
  const { me } = useSession();
  const timezone = me?.memberships.find(
    (m) => m.tenant.id === me.activeTenantId,
  )?.tenant.timezone;
  return {
    timezone,
    label: timezone ? zoneLabel(timezone) : "đang tải múi giờ trung tâm",
    datetime: (value: string, zone = timezone) =>
      zone
        ? new Date(value).toLocaleString("vi-VN", {
            timeZone: zone,
            timeZoneName: "shortOffset",
          })
        : "Đang tải múi giờ…",
  };
}
