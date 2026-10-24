import { Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Screen } from "../../components/ui";
import { useSession } from "../../lib/session";
import { unwrap } from "../../lib/session-client";
export default function ChildProfile() {
  const session = useSession();
  const childId = session.child?.id;
  const profile = useQuery({
    queryKey: [...session.scope, "child-profile"],
    enabled: !!childId,
    refetchInterval: 15000,
    queryFn: async () =>
      unwrap(
        await session.client.api.GET(
          "/api/v1/mobile/guardian/students/{id}/profile",
          { params: { path: { id: childId! } } },
        ),
      ),
  });
  if (!childId) return <Redirect href="/(guardian)/children" />;
  return (
    <Screen title="Hồ sơ học viên">
      {profile.isPending && <Body>Đang xác minh liên kết…</Body>}
      {profile.error ? (
        <Failure error={profile.error} />
      ) : (
        profile.data && (
          <>
            <Body>{profile.data.studentCode}</Body>
            <Body>Trạng thái: {profile.data.status}</Body>
            <Body>Ngày nhập học: {profile.data.enrolledAt}</Body>
          </>
        )
      )}
      <Button title="Đổi học viên" onPress={() => session.clearChild()} />
    </Screen>
  );
}
