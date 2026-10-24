import { useState } from "react";
import { Alert, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { Body, Button, Failure, Panel, Screen } from "./ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
export function Privacy() {
  const session = useSession(),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [request, setRequest] = useState<
      components["schemas"]["PrivacyRequestView"] | null
    >(null);
  const policy = useQuery({
    queryKey: [...session.scope, "privacy-policy"],
    queryFn: async () =>
      unwrap(await session.client.api.GET("/api/v1/privacy/policy")),
  });
  const consents = useQuery({
    queryKey: [...session.scope, "privacy-consents"],
    queryFn: async () =>
      unwrap(await session.client.api.GET("/api/v1/privacy/consents")),
  });
  const subject = session.child ? { subjectStudentId: session.child.id } : {};
  async function consent(granted: boolean) {
    if (!policy.data?.version) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      unwrap(
        await session.client.api.POST("/api/v1/privacy/consents", {
          body: {
            ...subject,
            policyVersion: policy.data.version,
            purposeCode: "NOTIFICATIONS",
            granted,
          },
        }),
      );
      await consents.refetch();
      setMessage(
        granted
          ? "Đã ghi nhận đồng ý đúng version chính sách."
          : "Đã ghi nhận rút đồng ý thông báo.",
      );
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function createRequest(
    type: components["schemas"]["PrivacyRequestInput"]["type"],
  ) {
    setBusy(true);
    setError(null);
    try {
      setRequest(
        unwrap(
          await session.client.api.POST("/api/v1/privacy/requests", {
            body: { ...subject, type },
          }),
        ),
      );
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Quyền riêng tư">
      {policy.isPending && <Body>Đang kiểm tra chính sách…</Body>}
      {policy.error ? (
        <Failure error={policy.error} />
      ) : policy.data?.configured ? (
        <>
          <Body>Chính sách: {policy.data.version}</Body>
          <Button
            title="Đọc thông báo quyền riêng tư"
            onPress={() => {
              if (policy.data?.noticeUrl)
                void Linking.openURL(policy.data.noticeUrl);
            }}
          />
          <Button
            title="Đồng ý nhận thông báo theo chính sách"
            disabled={
              busy ||
              !session.online ||
              (session.me?.activeRole === "guardian" && !session.child)
            }
            onPress={() =>
              Alert.alert(
                "Ghi nhận đồng ý?",
                "Xác nhận bạn đã đọc chính sách cho đúng tài khoản/học viên đang chọn.",
                [
                  { text: "Hủy", style: "cancel" },
                  { text: "Đồng ý", onPress: () => void consent(true) },
                ],
              )
            }
          />
          <Button
            title="Rút đồng ý nhận thông báo"
            disabled={
              busy ||
              !session.online ||
              (session.me?.activeRole === "guardian" && !session.child)
            }
            onPress={() => void consent(false)}
          />
        </>
      ) : (
        <Body>
          Chính sách quyền riêng tư chưa được cấu hình. Chưa thể ghi nhận
          consent; liên hệ trung tâm.
        </Body>
      )}
      {consents.error ? (
        <Failure error={consents.error} />
      ) : (
        consents.data?.map((c) => (
          <Panel key={c.id}>
            <Body>
              {c.policyVersion} · {c.purposeCode}
            </Body>
            <Body>
              {c.granted && !c.revokedAt
                ? "Đã đồng ý"
                : "Đã rút / hết hiệu lực"}{" "}
              · {new Date(c.capturedAt).toLocaleString("vi-VN")}
            </Body>
          </Panel>
        ))
      )}
      {error ? <Failure error={error} /> : null}
      {message ? <Body>{message}</Body> : null}
      <Body>
        Yêu cầu dữ liệu cần trung tâm xác minh và xử lý; thao tác này không tự
        xóa lịch sử tài chính.
      </Body>
      {(
        [
          ["ACCESS", "Yêu cầu xem dữ liệu"],
          ["CORRECT", "Yêu cầu sửa dữ liệu"],
          ["EXPORT", "Yêu cầu xuất dữ liệu"],
          ["ERASE", "Yêu cầu xóa dữ liệu"],
          ["WITHDRAW", "Yêu cầu rút xử lý dữ liệu"],
        ] as const
      ).map(([type, label]) => (
        <Button
          key={type}
          title={label}
          disabled={busy || !session.online}
          onPress={() =>
            Alert.alert(
              label,
              "Gửi yêu cầu đến trung tâm để xác minh và xem xét?",
              [
                { text: "Hủy", style: "cancel" },
                {
                  text: "Gửi yêu cầu",
                  onPress: () => void createRequest(type),
                },
              ],
            )
          }
        />
      ))}
      {request && (
        <Panel>
          <Body>Mã yêu cầu: {request.id}</Body>
          <Body>Trạng thái: {request.status}</Body>
          <Button
            title="Kiểm tra tiến độ yêu cầu"
            disabled={busy}
            onPress={() => {
              void session.client.api
                .GET("/api/v1/privacy/requests/{id}", {
                  params: { path: { id: request.id } },
                })
                .then(unwrap)
                .then(setRequest)
                .catch(setError);
            }}
          />
        </Panel>
      )}
    </Screen>
  );
}
