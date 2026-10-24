import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Panel, Screen } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { unwrap } from "../../../lib/session-client";
export default function ClassDetail() {
  const session = useSession(),
    { id } = useLocalSearchParams<{ id: string }>(),
    [page, setPage] = useState(1);
  const detail = useQuery({
    queryKey: [...session.scope, "class-detail", id],
    queryFn: async () =>
      unwrap(
        await session.client.api.GET("/api/v1/classes/{id}", {
          params: { path: { id } },
        }),
      ),
  });
  const roster = useQuery({
    queryKey: [...session.scope, "class-roster", id, page],
    queryFn: async () => {
      const r = await session.client.api.GET(
        "/api/v1/classes/{id}/enrollments",
        { params: { path: { id }, query: { page, limit: 20 } } },
      );
      unwrap(r);
      return r.data!;
    },
  });
  return (
    <Screen title={detail.data?.name ?? "Lớp được phân công"}>
      {detail.error ? (
        <Failure error={detail.error} />
      ) : (
        detail.data && (
          <>
            <Body>
              {detail.data.code} · {detail.data.status}
            </Body>
            <Body>
              {detail.data.startDate} – {detail.data.endDate}
            </Body>
            <Body>Sức chứa: {detail.data.capacity}</Body>
          </>
        )
      )}
      {roster.isPending && <Body>Đang tải danh sách tối thiểu…</Body>}
      {roster.error ? (
        <Failure error={roster.error} />
      ) : (
        roster.data?.data.map((row) => (
          <Panel key={row.studentId + row.joinedAt}>
            <Body>{row.fullName}</Body>
            <Body>
              {row.status} · từ {row.joinedAt}
            </Body>
          </Panel>
        ))
      )}
      {roster.data && !roster.data.data.length && (
        <Body>Chưa có học viên ghi danh.</Body>
      )}
      {page > 1 && (
        <Button title="Trang trước" onPress={() => setPage(page - 1)} />
      )}
      {roster.data && page < roster.data.page.totalPages && (
        <Button title="Trang tiếp" onPress={() => setPage(page + 1)} />
      )}
      <Button
        title="Xem lịch dạy và buổi học"
        onPress={() => router.push("/(teacher)/schedule")}
      />
    </Screen>
  );
}
