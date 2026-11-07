"use client";
import { useQuery } from "@tanstack/react-query";
import { subscriptionInfo } from "../lib/api";
import { useSession } from "./providers";
import { Button } from "./ui/button";
const modes: Record<string, string> = {
  ACTIVE: "Đang hiệu lực",
  PAST_DUE_GRACE: "Đang trong thời gian ân hạn",
  READ_ONLY: "Chỉ đọc",
};
export function TenantSubscriptionSummary() {
  const { me } = useSession();
  const allowed = ["owner", "manager"].includes(me?.activeRole ?? "");
  const zone = me?.memberships.find((m) => m.tenant.id === me.activeTenantId)
    ?.tenant.timezone;
  const datetime = (value: string) =>
    zone
      ? new Date(value).toLocaleString("vi-VN", { timeZone: zone })
      : "Đang xác minh múi giờ trung tâm…";
  const query = useQuery({
    queryKey: [
      "tenant-subscription",
      me?.id,
      me?.activeTenantId,
      me?.activeRole,
    ],
    queryFn: ({ signal }) => subscriptionInfo(signal),
    enabled: allowed && !!me?.activeTenantId,
  });
  if (!allowed) return null;
  return (
    <section aria-labelledby="centre-subscription-title">
      <h2 id="centre-subscription-title">Gói dịch vụ</h2>
      {query.isPending ? (
        <p role="status">Đang tải gói dịch vụ…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Thử lại gói dịch vụ
          </Button>
        </div>
      ) : (
        <>
          <p className="notice">
            {modes[query.data.data.mode] ?? query.data.data.mode}
          </p>
          {query.data.data.plan ? (
            <>
              <h3>{query.data.data.plan.name}</h3>
              <dl>
                <dt>Giá tháng</dt>
                <dd>
                  {new Intl.NumberFormat("vi-VN").format(
                    BigInt(query.data.data.plan.monthlyPriceVnd),
                  )}{" "}
                  VND
                </dd>
                <dt>Hết hạn</dt>
                <dd>
                  {query.data.data.endsAt
                    ? datetime(query.data.data.endsAt)
                    : "—"}
                </dd>
                <dt>Ân hạn đến</dt>
                <dd>
                  {query.data.data.graceUntil
                    ? datetime(query.data.data.graceUntil)
                    : "—"}
                </dd>
              </dl>
              <p className="hint">
                {zone
                  ? `Giờ hiển thị theo ${zone}.`
                  : "Đang xác minh múi giờ trung tâm…"}
              </p>
            </>
          ) : (
            <p>Chưa có thuê bao. Liên hệ đội ngũ vận hành FluivixEdu.</p>
          )}
          <p className="hint">
            Thay đổi gói và gia hạn do đội ngũ vận hành thực hiện.
          </p>
        </>
      )}
    </section>
  );
}
