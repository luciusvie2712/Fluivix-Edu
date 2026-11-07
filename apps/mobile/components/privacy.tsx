import { useEffect, useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { Body, Button, Failure, Panel, Screen } from "./ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
import { sharePrivacyExport } from "../lib/privacy-export";
const statuses: Record<string, string> = {
  RECEIVED: "Đã tiếp nhận",
  VERIFIED: "Đã xác minh",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Đã từ chối",
  COMPLETED: "Đã thực hiện",
};
function PrivacyView() {
  const session = useSession(),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [request, setRequest] = useState<
      components["schemas"]["PrivacyRequestView"] | null
    >(null);
  const mounted = useRef(true),
    createKey = useRef<{ type: string; key: string } | null>(null);
  const [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const requests = useQuery({
    queryKey: [...session.scope, "privacy-requests", page],
    queryFn: async () => {
      const result = await session.client.api.GET("/api/v1/privacy/requests", {
        params: {
          query: {
            page,
            limit: 10,
            ...(session.child ? { subjectStudentId: session.child.id } : {}),
          },
        },
      });
      unwrap(result);
      return result.data!;
    },
  });
  const detail = useQuery({
    queryKey: [...session.scope, "privacy-request", request?.id],
    enabled: !!request,
    queryFn: async () =>
      unwrap(
        await session.client.api.GET("/api/v1/privacy/requests/{id}", {
          params: { path: { id: request!.id } },
        }),
      ),
  });
  const history = useQuery({
    queryKey: [...session.scope, "privacy-history", request?.id, historyPage],
    enabled: !!request,
    queryFn: async () => {
      const result = await session.client.api.GET(
        "/api/v1/privacy/requests/{id}/history",
        {
          params: {
            path: { id: request!.id },
            query: { page: historyPage, limit: 10 },
          },
        },
      );
      unwrap(result);
      return result.data!;
    },
  });
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
    if (
      !mounted.current ||
      !policy.data?.version ||
      !session.canWrite ||
      !session.online ||
      busy
    )
      return;
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
      if (mounted.current)
        setMessage(
          granted
            ? "Đã ghi nhận đồng ý đúng version chính sách."
            : "Đã ghi nhận rút đồng ý thông báo.",
        );
    } catch (cause) {
      if (mounted.current) setError(cause);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function createRequest(
    type: components["schemas"]["PrivacyRequestInput"]["type"],
  ) {
    if (!mounted.current || !session.canWrite || !session.online || busy)
      return;
    setBusy(true);
    setError(null);
    setMessage("");
    if (!createKey.current || createKey.current.type !== type)
      createKey.current = {
        type,
        key: `privacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    const key = createKey.current.key;
    try {
      const saved = unwrap(
        await session.client.api.POST("/api/v1/privacy/requests", {
          body: { ...subject, type },
          headers: { "Idempotency-Key": key },
        }),
      );
      if (mounted.current) {
        setRequest(saved);
        setHistoryPage(1);
        createKey.current = null;
        setMessage(
          "Máy chủ đã tiếp nhận yêu cầu. Chưa thay đổi hoặc xóa dữ liệu.",
        );
        await requests.refetch();
      }
    } catch (cause) {
      if (mounted.current) setError(cause);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function exportFile() {
    if (!mounted.current || !request || busy) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const payload = unwrap(
        await session.client.api.GET("/api/v1/privacy/requests/{id}/export", {
          params: { path: { id: request.id } },
        }),
      );
      await sharePrivacyExport(payload, () => mounted.current);
      if (mounted.current)
        setMessage(
          "Đã đóng hộp chia sẻ và dọn tệp tạm. Hãy kiểm tra nơi bạn chọn lưu; ứng dụng chưa xác nhận người nhận đã nhận tệp.",
        );
    } catch (cause) {
      if (mounted.current) {
        setError(cause);
        await detail.refetch();
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const current = detail.isError ? undefined : detail.data;
  return (
    <Screen title="Quyền riêng tư">
      <Body>
        Phạm vi:{" "}
        {session.child?.fullName ??
          (session.me?.activeRole === "student"
            ? "Hồ sơ học viên của bạn"
            : "Tài khoản cá nhân trong trung tâm")}
        .
      </Body>
      {busy && <Body>Đang chờ máy chủ xác nhận…</Body>}
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
              !session.canWrite ||
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
              !session.canWrite ||
              (session.me?.activeRole === "guardian" && !session.child)
            }
            onPress={() =>
              Alert.alert(
                "Rút đồng ý thông báo?",
                "Lịch sử đồng ý đã ghi nhận được giữ lại.",
                [
                  { text: "Hủy", style: "cancel" },
                  { text: "Rút đồng ý", onPress: () => void consent(false) },
                ],
              )
            }
          />
        </>
      ) : (
        <Body>
          Chính sách quyền riêng tư chưa được cấu hình. Chưa thể ghi nhận
          consent; liên hệ trung tâm.
        </Body>
      )}
      {consents.isPending && <Body>Đang tải lịch sử đồng ý…</Body>}
      {consents.error ? (
        <Failure error={consents.error} />
      ) : (
        consents.data?.map((c) => (
          <Panel key={c.id}>
            <Body>
              Phạm vi:{" "}
              {c.subjectStudentId
                ? c.subjectStudentId === session.child?.id
                  ? session.child.fullName
                  : "Hồ sơ học viên khác hoặc liên kết cũ"
                : "Tài khoản cá nhân"}
              .
            </Body>
            <Body>
              {c.policyVersion} · {c.purposeCode}
            </Body>
            <Body>
              {c.granted && !c.revokedAt
                ? "Đã đồng ý"
                : "Đã rút / hết hiệu lực"}{" "}
              · {new Date(c.capturedAt).toLocaleString("vi-VN")}
            </Body>
            {c.granted && !c.revokedAt && (
              <Button
                title="Rút bản đồng ý này"
                disabled={busy || !session.online || !session.canWrite}
                onPress={() =>
                  Alert.alert(
                    "Rút bản đồng ý?",
                    "Bạn có thể rút bản đồng ý do mình ghi nhận, kể cả khi liên kết học viên đã thu hồi.",
                    [
                      { text: "Hủy", style: "cancel" },
                      {
                        text: "Rút đồng ý",
                        onPress: () => {
                          if (
                            !mounted.current ||
                            !session.canWrite ||
                            !session.online ||
                            busy
                          )
                            return;
                          setBusy(true);
                          setError(null);
                          setMessage("");
                          void session.client.api
                            .POST("/api/v1/privacy/consents/{id}/withdraw", {
                              params: { path: { id: c.id } },
                              body: {},
                            })
                            .then(unwrap)
                            .then(async () => {
                              if (mounted.current) {
                                await consents.refetch();
                                setMessage(
                                  "Máy chủ đã rút đồng ý và giữ nguyên lịch sử.",
                                );
                              }
                            })
                            .catch((cause) => {
                              if (mounted.current) setError(cause);
                            })
                            .finally(() => {
                              if (mounted.current) setBusy(false);
                            });
                        },
                      },
                    ],
                  )
                }
              />
            )}
          </Panel>
        ))
      )}
      {error ? <Failure error={error} /> : null}
      {message ? <Body>{message}</Body> : null}
      <Body>
        Yêu cầu dữ liệu cần trung tâm xác minh và xử lý; thao tác này không tự
        xóa lịch sử tài chính. Che thông tin chỉ áp dụng các trường hồ sơ theo
        chính sách; mã học viên, tài khoản dùng chung, tài chính, chuyên cần,
        kết quả công bố và nhật ký được giữ lại. Rút đồng ý chỉ áp dụng thông
        báo.
      </Body>
      {(
        [
          ["ACCESS", "Yêu cầu xem dữ liệu"],
          ["CORRECT", "Yêu cầu sửa dữ liệu"],
          ["EXPORT", "Yêu cầu xuất dữ liệu"],
          ["ERASE", "Yêu cầu che thông tin hồ sơ"],
          ["WITHDRAW", "Yêu cầu rút đồng ý thông báo"],
        ] as const
      ).map(([type, label]) => (
        <Button
          key={type}
          title={label}
          disabled={
            busy ||
            !session.online ||
            !session.canWrite ||
            (session.me?.activeRole === "guardian" && !session.child)
          }
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
      <Button
        title="Tải lại yêu cầu"
        disabled={busy || !session.online || requests.isFetching}
        onPress={() => {
          void requests.refetch();
          if (request) {
            void detail.refetch();
            void history.refetch();
          }
        }}
      />
      {requests.isPending && <Body>Đang tải yêu cầu…</Body>}
      {requests.error ? (
        <Failure error={requests.error} />
      ) : (
        requests.data && (
          <>
            <Body>{requests.data.page.total} yêu cầu</Body>
            {!requests.data.data.length && (
              <Body>Chưa có yêu cầu trong phạm vi này.</Body>
            )}
            {requests.data.data.map((r) => (
              <Panel key={r.id}>
                <Body>
                  {r.type} · {statuses[r.status] ?? r.status} ·{" "}
                  {new Date(r.createdAt).toLocaleString("vi-VN")}
                </Body>
                <Button
                  title={`Xem yêu cầu ${r.id.slice(0, 8)}`}
                  disabled={busy}
                  onPress={() => {
                    setRequest(r);
                    setHistoryPage(1);
                    setError(null);
                    setMessage("");
                  }}
                />
              </Panel>
            ))}
            <Button
              title="Trang yêu cầu trước"
              disabled={busy || page === 1}
              onPress={() => setPage(page - 1)}
            />
            <Body>
              Trang {page} / {Math.max(1, requests.data.page.totalPages)}
            </Body>
            <Button
              title="Trang yêu cầu tiếp"
              disabled={busy || page >= requests.data.page.totalPages}
              onPress={() => setPage(page + 1)}
            />
          </>
        )
      )}
      {request && (
        <Panel>
          {detail.isPending && (
            <Body>Đang kiểm tra yêu cầu và quyền hiện tại…</Body>
          )}
          {detail.error ? <Failure error={detail.error} /> : null}
          {current && (
            <>
              <Body>Mã yêu cầu: {current.id}</Body>
              <Body>
                Trạng thái: {statuses[current.status] ?? current.status} · phiên
                bản {current.version}
              </Body>
              {!current.scopeAvailable && (
                <Body>
                  Phạm vi chưa được xác nhận hoặc quyền hiện tại không còn phù
                  hợp. Nội dung và bản xuất không khả dụng.
                </Body>
              )}
              {current.decisionReason && (
                <Body>Lý do: {current.decisionReason}</Body>
              )}
              {current.completedAt && (
                <Body>
                  Máy chủ đã thực hiện lúc{" "}
                  {new Date(current.completedAt).toLocaleString("vi-VN")}.
                </Body>
              )}
              {current.resultFields.length > 0 && (
                <Body>Trường đã xử lý: {current.resultFields.join(", ")}.</Body>
              )}
              {current.retainedSections.length > 0 && (
                <Body>
                  Tiếp tục lưu: {current.retainedSections.join(", ")}.
                </Body>
              )}
              {current.withdrawnConsentCount !== null && (
                <Body>
                  Số bản đồng ý đã rút: {current.withdrawnConsentCount}.
                </Body>
              )}
              {current.temporaryExportsPurged !== null && (
                <Body>
                  Bản xuất tạm đã xóa nội dung: {current.temporaryExportsPurged}
                  .
                </Body>
              )}
              {current.exportExpiresAt && (
                <Body>
                  Bản xuất tạm hết hạn:{" "}
                  {new Date(current.exportExpiresAt).toLocaleString("vi-VN")}.
                </Body>
              )}
              {!current.scopeConfirmedAt && current.status === "RECEIVED" && (
                <Button
                  title="Xác nhận phạm vi yêu cầu cũ"
                  disabled={busy || !session.online || !session.canWrite}
                  onPress={() =>
                    Alert.alert(
                      "Xác nhận phạm vi?",
                      "Yêu cầu cũ thuộc đúng tài khoản, vai trò và học viên của bạn trong trung tâm này?",
                      [
                        { text: "Hủy", style: "cancel" },
                        {
                          text: "Xác nhận",
                          onPress: () => {
                            if (
                              !mounted.current ||
                              !session.canWrite ||
                              !session.online ||
                              busy
                            )
                              return;
                            setBusy(true);
                            setError(null);
                            setMessage("");
                            void session.client.api
                              .POST(
                                "/api/v1/privacy/requests/{id}/confirm-scope",
                                {
                                  params: { path: { id: current.id } },
                                  body: { version: current.version },
                                },
                              )
                              .then(unwrap)
                              .then(async () => {
                                if (mounted.current) {
                                  await detail.refetch();
                                  await history.refetch();
                                  setMessage(
                                    "Máy chủ đã ghi nhận phạm vi hiện tại.",
                                  );
                                }
                              })
                              .catch((cause) => {
                                if (mounted.current) setError(cause);
                              })
                              .finally(() => {
                                if (mounted.current) setBusy(false);
                              });
                          },
                        },
                      ],
                    )
                  }
                />
              )}
              {current.exportAvailable && (
                <Button
                  title="Lưu bản xuất riêng tư"
                  disabled={busy || !session.online}
                  onPress={() =>
                    Alert.alert(
                      "Lưu bản xuất riêng tư?",
                      "Tệp có dữ liệu cá nhân. Chỉ lưu hoặc chia sẻ đến nơi bạn tin cậy.",
                      [
                        { text: "Hủy", style: "cancel" },
                        {
                          text: "Mở chia sẻ tệp",
                          onPress: () => void exportFile(),
                        },
                      ],
                    )
                  }
                />
              )}
            </>
          )}
          <Button
            title="Kiểm tra tiến độ yêu cầu"
            disabled={busy}
            onPress={() => {
              void session.client.api
                .GET("/api/v1/privacy/requests/{id}", {
                  params: { path: { id: request.id } },
                })
                .then(unwrap)
                .then((value) => {
                  if (mounted.current) setRequest(value);
                  void detail.refetch();
                  void history.refetch();
                })
                .catch((cause) => {
                  if (mounted.current) setError(cause);
                });
            }}
          />
          {history.isPending && <Body>Đang tải lịch sử xử lý…</Body>}
          {history.error ? (
            <Failure error={history.error} />
          ) : (
            history.data && (
              <>
                {history.data.data.map((h) => (
                  <Body key={h.version}>
                    {h.eventType === "LEGACY_OBSERVED"
                      ? "Ghi nhận trạng thái cũ lúc nâng cấp; chưa biết bằng chứng trước đó"
                      : h.eventType === "SCOPE_CONFIRMED"
                        ? "Người yêu cầu xác nhận phạm vi"
                        : (statuses[h.afterStatus] ?? h.afterStatus)}{" "}
                    · {new Date(h.recordedAt).toLocaleString("vi-VN")} · phiên
                    bản {h.version}
                    {h.reason ? ` · ${h.reason}` : ""}
                  </Body>
                ))}
                {history.data.page.totalPages > 1 && (
                  <>
                    <Button
                      title="Lịch sử trước"
                      disabled={busy || historyPage === 1}
                      onPress={() => setHistoryPage(historyPage - 1)}
                    />
                    <Body>
                      Trang lịch sử {historyPage} /{" "}
                      {history.data.page.totalPages}
                    </Body>
                    <Button
                      title="Lịch sử tiếp"
                      disabled={
                        busy || historyPage >= history.data.page.totalPages
                      }
                      onPress={() => setHistoryPage(historyPage + 1)}
                    />
                  </>
                )}
              </>
            )
          )}
        </Panel>
      )}
    </Screen>
  );
}
export function Privacy() {
  const session = useSession();
  return <PrivacyView key={session.scope.join(":")} />;
}
