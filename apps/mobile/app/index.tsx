import { Redirect } from "expo-router";
import { Body, Button, Failure, Screen } from "../components/ui";
import { useSession } from "../lib/session";
export default function Entry() {
  const session = useSession();
  if (!session.ready)
    return (
      <Screen title="FluivixEdu">
        <Body>Đang kiểm tra phiên…</Body>
      </Screen>
    );
  if (session.error)
    return (
      <Screen title="Kết nối tài khoản">
        <Failure error={session.error} />
        <Button title="Thử lại" onPress={() => void session.restore()} />
        <Button
          title="Đăng nhập lại"
          onPress={() => {
            void session.client.forget();
            session.setError("");
          }}
        />
      </Screen>
    );
  return <Redirect href={session.me ? "/context" : "/login"} />;
}
