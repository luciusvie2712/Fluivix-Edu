import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Panel, Screen } from "../../components/ui";
import { useSession } from "../../lib/session";
import { unwrap } from "../../lib/session-client";
export default function Children() {
  const session = useSession();
  const [page, setPage] = useState(1);
  const children = useQuery({
    queryKey: [...session.scope, "children", page],
    queryFn: async () => {
      const response = await session.client.api.GET(
        "/api/v1/mobile/guardian/students",
        { params: { query: { page, limit: 20 } } },
      );
      unwrap(response);
      return response.data!;
    },
  });
  return (
    <Screen title="Chọn học viên">
      {children.isPending && <Body>Đang tải liên kết…</Body>}
      {children.error && <Failure error={children.error} />}
      {children.data && !children.data.data.length && (
        <Body>
          Chưa có học viên được liên kết. Vui lòng liên hệ trung tâm để xác minh
          quan hệ.
        </Body>
      )}
      {children.data?.data.map((child) => (
        <Panel key={child.id}>
          <Body>{child.fullName}</Body>
          <Body>{child.studentCode}</Body>
          <Button
            title={`Chọn ${child.fullName}`}
            onPress={() => {
              session.selectChild(child);
              router.replace("/(guardian)");
            }}
          />
        </Panel>
      ))}
      {page > 1 && (
        <Button title="Trang trước" onPress={() => setPage(page - 1)} />
      )}
      {children.data && page < children.data.page.totalPages && (
        <Button title="Trang tiếp" onPress={() => setPage(page + 1)} />
      )}
      <Button
        title="Tải lại liên kết"
        onPress={() => void children.refetch()}
      />
      <Button
        title="Tài khoản"
        onPress={() => router.push("/(guardian)/profile")}
      />
    </Screen>
  );
}
