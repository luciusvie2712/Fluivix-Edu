import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Panel, Screen } from "./ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
export function Grades() {
  const session = useSession(),
    guardian = session.me?.activeRole === "guardian",
    childId = session.child?.id;
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...session.scope, "published-grades", page],
    enabled: !guardian || !!childId,
    queryFn: async () => {
      const params = { query: { page, limit: 20 } };
      const result = guardian
        ? await session.client.api.GET(
            "/api/v1/mobile/guardian/students/{id}/grades",
            { params: { ...params, path: { id: childId! } } },
          )
        : await session.client.api.GET("/api/v1/mobile/my/grades", { params });
      unwrap(result);
      return result.data!;
    },
  });
  if (guardian && !childId)
    return (
      <Screen title="Kết quả học tập">
        <Body>Chọn học viên để xem.</Body>
        <Button
          title="Chọn học viên"
          onPress={() => router.replace("/(guardian)/children")}
        />
      </Screen>
    );
  return (
    <Screen title="Kết quả đã công bố">
      {query.isPending && <Body>Đang tải kết quả…</Body>}
      {query.error ? (
        <Failure error={query.error} />
      ) : (
        query.data?.data.map((item) => (
          <Panel key={item.id}>
            <Body>{item.title}</Body>
            <Body>{item.heldAt}</Body>
            <Body>
              {item.score ?? "Chưa có điểm"} / {item.maxScore}
            </Body>
            <Body>{item.comment}</Body>
          </Panel>
        ))
      )}
      {query.data && !query.data.data.length && (
        <Body>Chưa có kết quả được công bố.</Body>
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
