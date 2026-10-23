"use client";
import { useQuery } from "@tanstack/react-query";
import { subscriptionInfo } from "../../../lib/api";
import { useSession } from "../../../components/providers";
import { Button } from "../../../components/ui/button";
const labels: Record<string, string> = {
  ACTIVE: "Đang hiệu lực",
  PAST_DUE_GRACE: "Đang trong thời gian ân hạn",
  READ_ONLY: "Chỉ đọc",
};
export default function Subscription() {
  const { me } = useSession();
  const allowed = ["owner", "manager"].includes(me?.activeRole ?? "");
  const query = useQuery({
    queryKey: [
      "tenant-subscription",
      me?.id,
      me?.activeTenantId,
      me?.activeRole,
    ],
    queryFn: subscriptionInfo,
    enabled: allowed && !!me?.activeTenantId,
  });
  if (!allowed)
    return (
      <>
        <h1>Gói dịch vụ</h1>
        <p role="alert">Bạn không có quyền xem thông tin gói.</p>
      </>
    );
  return (
    <>
      <h1>Gói dịch vụ</h1>
      {query.isPending ? (
        <p role="status">Đang tải…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Thử lại</Button>
        </div>
      ) : (
        <>
          <p className="notice">
            {labels[query.data.data.mode] ?? query.data.data.mode}
          </p>
          {query.data.data.plan ? (
            <>
              <h2>{query.data.data.plan.name}</h2>
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
                    ? new Date(query.data.data.endsAt).toLocaleString("vi-VN")
                    : "—"}
                </dd>
                <dt>Ân hạn đến</dt>
                <dd>
                  {query.data.data.graceUntil
                    ? new Date(query.data.data.graceUntil).toLocaleString(
                        "vi-VN",
                      )
                    : "—"}
                </dd>
              </dl>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Bảng giới hạn sử dụng, có thể cuộn ngang"
              >
                <table>
                  <caption>Giới hạn sử dụng</caption>
                  <thead>
                    <tr>
                      <th>Hạng mục</th>
                      <th className="number">Đã dùng</th>
                      <th className="number">Giới hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Học viên hoạt động</td>
                      <td className="number">
                        {query.data.data.usage.activeStudents}
                      </td>
                      <td className="number">
                        {query.data.data.plan.limits.maxStudents}
                      </td>
                    </tr>
                    <tr>
                      <td>Tài khoản hoạt động/chờ kích hoạt</td>
                      <td className="number">
                        {query.data.data.usage.reservedUsers}
                      </td>
                      <td className="number">
                        {query.data.data.plan.limits.maxUsers}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>Chưa có thuê bao. Liên hệ đội ngũ vận hành FluivixEdu.</p>
          )}
          <p className="hint">
            Thay đổi gói và gia hạn do đội ngũ vận hành thực hiện.
          </p>
        </>
      )}
    </>
  );
}
