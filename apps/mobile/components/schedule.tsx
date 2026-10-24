import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Field, Panel, Screen } from "./ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
import { stateLabel, tenantMonth } from "../lib/format";
export function Schedule({ attendance = false }: { attendance?: boolean }) {
  const session = useSession(),
    role = session.me?.activeRole;
  const [range, setRange] = useState(() =>
    tenantMonth(session.activeTenant?.timezone ?? "Asia/Ho_Chi_Minh"),
  );
  const [filter, setFilter] = useState(range);
  const [page, setPage] = useState(1);
  const guardian = role === "guardian",
    childId = session.child?.id;
  const query = useQuery({
    queryKey: [
      ...session.scope,
      attendance ? "attendance" : "schedule",
      filter,
      page,
    ],
    enabled: !guardian || !!childId,
    queryFn: async () => {
      const params = { query: { ...filter, page, limit: 20 } };
      const result = guardian
        ? attendance
          ? await session.client.api.GET(
              "/api/v1/mobile/guardian/students/{id}/attendance",
              { params: { ...params, path: { id: childId! } } },
            )
          : await session.client.api.GET(
              "/api/v1/mobile/guardian/students/{id}/schedule",
              { params: { ...params, path: { id: childId! } } },
            )
        : attendance
          ? await session.client.api.GET("/api/v1/mobile/my/attendance", {
              params,
            })
          : await session.client.api.GET("/api/v1/mobile/my/schedule", {
              params,
            });
      unwrap<unknown>(result);
      return result.data!;
    },
  });
  const timezone =
    session.me?.memberships.find(
      (v) => v.tenant.id === session.me?.activeTenantId,
    )?.tenant.timezone ?? "Asia/Ho_Chi_Minh";
  const summary = useQuery({
    queryKey: [...session.scope, "attendance-summary", filter],
    enabled: attendance && (!guardian || !!childId),
    queryFn: async () => {
      const params = { query: filter };
      return unwrap(
        guardian
          ? await session.client.api.GET(
              "/api/v1/mobile/guardian/students/{id}/attendance/summary",
              { params: { ...params, path: { id: childId! } } },
            )
          : await session.client.api.GET(
              "/api/v1/mobile/my/attendance/summary",
              { params },
            ),
      );
    },
  });
  const time = (value: string) =>
    new Intl.DateTimeFormat("vi-VN", {
      timeZone: timezone,
      dateStyle: "short",
      timeStyle: "short",
      hour12: false,
    }).format(new Date(value));
  if (guardian && !childId)
    return (
      <Screen title="Chọn học viên">
        <Body>Chọn học viên có liên kết hợp lệ để xem.</Body>
        <Button
          title="Danh sách học viên"
          onPress={() => router.replace("/(guardian)/children")}
        />
      </Screen>
    );
  return (
    <Screen
      title={
        attendance
          ? "Chuyên cần đã công bố"
          : role === "teacher"
            ? "Lịch dạy"
            : "Lịch học"
      }
    >
      <Body>Múi giờ: {timezone}</Body>
      <Field
        label="Từ ngày (YYYY-MM-DD)"
        value={range.from}
        onChangeText={(from) => setRange({ ...range, from })}
      />
      <Field
        label="Đến ngày (YYYY-MM-DD)"
        value={range.to}
        onChangeText={(to) => setRange({ ...range, to })}
      />
      <Button
        title="Xem khoảng ngày"
        disabled={
          !/^\d{4}-\d{2}-\d{2}$/.test(range.from) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(range.to) ||
          range.from > range.to
        }
        onPress={() => {
          setPage(1);
          setFilter({ ...range });
        }}
      />
      {query.isPending && <Body>Đang tải…</Body>}
      {attendance && summary.error && <Failure error={summary.error} />}
      {attendance && summary.data && (
        <Panel>
          <Body>
            Tỷ lệ tham dự:{" "}
            {summary.data.attendedPercent === null
              ? "Chưa có dữ liệu"
              : summary.data.attendedPercent + "%"}
          </Body>
          <Body>
            Có mặt {summary.data.present}, đi muộn {summary.data.late}, vắng có
            phép {summary.data.excused}, vắng không phép{" "}
            {summary.data.unexcused} / {summary.data.total} buổi.
          </Body>
          <Body>{summary.data.denominator}</Body>
        </Panel>
      )}
      {query.error ? (
        <Failure error={query.error} />
      ) : (
        query.data?.data.map((item) => (
          <Panel key={item.id}>
            <Body>{item.className}</Body>
            <Body>
              {time(item.startsAt)} – {time(item.endsAt)}
            </Body>
            <Body>
              {stateLabel(item.status)}
              {item.changeCount > 0 ? " · Đã thay đổi lịch" : ""}
            </Body>
            <Body>{item.roomName ?? "Chưa phân phòng"}</Body>
            {"attendanceStatus" in item && (
              <Body>
                Điểm danh: {stateLabel(String(item.attendanceStatus))}
              </Body>
            )}
            {role === "teacher" && (
              <>
                <Button
                  title="Điểm danh"
                  onPress={() =>
                    router.push({
                      pathname: "/(teacher)/sessions/[id]/attendance",
                      params: { id: item.id },
                    })
                  }
                />
                <Button
                  title="Nhật ký buổi học"
                  onPress={() =>
                    router.push({
                      pathname: "/(teacher)/sessions/[id]/report",
                      params: { id: item.id },
                    })
                  }
                />
              </>
            )}
          </Panel>
        ))
      )}
      {query.data && !query.data.data.length && (
        <Body>Không có buổi học trong khoảng này.</Body>
      )}
      {page > 1 && (
        <Button title="Trang trước" onPress={() => setPage(page - 1)} />
      )}
      {query.data && page < query.data.page.totalPages && (
        <Button title="Trang tiếp" onPress={() => setPage(page + 1)} />
      )}
      <Button title="Tải lại" onPress={() => void query.refetch()} />
    </Screen>
  );
}
