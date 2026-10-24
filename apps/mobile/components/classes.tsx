import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Panel, Screen } from "./ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
import { calendarDate, stateLabel } from "../lib/format";
export function Classes() {
  const session = useSession(),
    [page, setPage] = useState(1);
  const classes = useQuery({
    queryKey: [...session.scope, "classes", page],
    queryFn: async () => {
      const result = await session.client.api.GET("/api/v1/mobile/my/classes", {
        params: { query: { page, limit: 20 } },
      });
      unwrap(result);
      return result.data!;
    },
  });
  return (
    <Screen title="Lớp học của tôi">
      {classes.isPending && <Body>Đang tải lớp…</Body>}
      {classes.error ? (
        <Failure error={classes.error} />
      ) : (
        classes.data?.data.map((item) => (
          <Panel key={item.id}>
            <Body>{item.name}</Body>
            <Body>
              {item.code} · {stateLabel(item.status)}
            </Body>
            <Body>
              {calendarDate(item.startDate)} – {calendarDate(item.endDate)}
            </Body>
            <Body>Sức chứa: {item.capacity}</Body>
            {session.me?.activeRole === "teacher" && (
              <Button
                title="Danh sách học viên được phép"
                onPress={() =>
                  router.push({
                    pathname: "/(teacher)/classes/[id]",
                    params: { id: item.id },
                  })
                }
              />
            )}
            {session.me?.activeRole === "student" && (
              <Button
                title="Thông tin lớp của tôi"
                onPress={() =>
                  router.push({
                    pathname: "/(student)/classes/[id]",
                    params: { id: item.id },
                  })
                }
              />
            )}
          </Panel>
        ))
      )}
      {classes.data && !classes.data.data.length && (
        <Body>Chưa có lớp học phù hợp với tài khoản.</Body>
      )}
      {page > 1 && (
        <Button title="Trang trước" onPress={() => setPage(page - 1)} />
      )}
      {classes.data && page < classes.data.page.totalPages && (
        <Button title="Trang tiếp" onPress={() => setPage(page + 1)} />
      )}
      <Button title="Tải lại" onPress={() => void classes.refetch()} />
    </Screen>
  );
}
