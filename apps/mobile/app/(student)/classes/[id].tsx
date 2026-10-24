import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Screen } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { unwrap } from "../../../lib/session-client";
import { calendarDate, stateLabel } from "../../../lib/format";
export default function ClassDetail() {
  const session = useSession(),
    { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: [...session.scope, "own-class", id],
    queryFn: async () =>
      unwrap(
        await session.client.api.GET("/api/v1/classes/{id}", {
          params: { path: { id } },
        }),
      ),
  });
  return (
    <Screen title={query.data?.name ?? "Lớp học của tôi"}>
      {query.isPending && <Body>Đang xác minh ghi danh…</Body>}
      {query.error ? (
        <Failure error={query.error} />
      ) : (
        query.data && (
          <>
            <Body>
              {query.data.code} · {stateLabel(query.data.status)}
            </Body>
            <Body>
              {calendarDate(query.data.startDate)} –{" "}
              {calendarDate(query.data.endDate)}
            </Body>
            <Button
              title="Lịch học của tôi"
              onPress={() => router.push("/(student)/schedule")}
            />
            <Button
              title="Chuyên cần của tôi"
              onPress={() => router.push("/(student)/attendance")}
            />
            <Button
              title="Kết quả đã công bố"
              onPress={() => router.push("/(student)/grades")}
            />
          </>
        )
      )}
    </Screen>
  );
}
