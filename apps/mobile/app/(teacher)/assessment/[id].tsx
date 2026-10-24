import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import {
  Body,
  Button,
  Failure,
  Field,
  Panel,
  Screen,
} from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { unwrap } from "../../../lib/session-client";
import { gradeError } from "../../../lib/grade-validation";
export default function GradeEditor() {
  const session = useSession(),
    { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState<
      components["schemas"]["GradeEditor"] | null
    >(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: [...session.scope, "grade-editor", id],
    queryFn: async () =>
      unwrap(
        await session.client.api.GET("/api/v1/assessments/{id}/results", {
          params: { path: { id } },
        }),
      ),
  });
  useEffect(() => {
    if (query.data && !draft) setDraft(query.data);
  }, [query.data, draft]);
  const locked = !session.canWrite || draft?.assessment.status === "PUBLISHED";
  const invalid =
    draft?.rows.some(
      (row) =>
        gradeError(row.score, draft.assessment.maxScore) !== null ||
        (row.score === null && !row.comment.trim()),
    ) ?? true;
  async function save(publish = false) {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = publish
        ? await session.client.api.POST("/api/v1/assessments/{id}/publish", {
            params: { path: { id } },
            body: { version: draft.assessment.version },
          })
        : await session.client.api.PUT("/api/v1/assessments/{id}/results", {
            params: { path: { id } },
            body: {
              version: draft.assessment.version,
              records: draft.rows.map(({ studentId, score, comment }) => ({
                studentId,
                score,
                comment,
              })),
            },
          });
      setDraft(unwrap(r));
      setDirty(false);
      setSaved(true);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError(null);
    try {
      setDraft(
        unwrap(
          await session.client.api.GET("/api/v1/assessments/{id}/results", {
            params: { path: { id } },
          }),
        ),
      );
      setDirty(false);
      setSaved(false);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title={draft?.assessment.title ?? "Nhập điểm"}>
      {query.error ? (
        <Failure error={query.error} />
      ) : draft ? (
        <>
          <Body>
            Thang điểm: {draft.assessment.maxScore} · {draft.assessment.status}
          </Body>
          {dirty && <Body>Chưa lưu lên máy chủ.</Body>}
          {saved && (
            <Body>
              {locked
                ? "Máy chủ đã công bố kết quả."
                : "Máy chủ đã lưu bản nháp."}
            </Body>
          )}
          {draft.rows.map((row) => (
            <Panel key={row.studentId}>
              <Body>{row.fullName}</Body>
              <Field
                label="Điểm (để trống cần lý do)"
                value={row.score ?? ""}
                error={
                  dirty
                    ? (gradeError(row.score, draft.assessment.maxScore) ?? "")
                    : ""
                }
                keyboardType="decimal-pad"
                editable={!locked && !busy}
                onChangeText={(score) => {
                  setDraft({
                    ...draft,
                    rows: draft.rows.map((r) =>
                      r.studentId === row.studentId
                        ? { ...r, score: score.replace(",", ".") || null }
                        : r,
                    ),
                  });
                  setDirty(true);
                  setSaved(false);
                }}
              />
              <Field
                label="Nhận xét / lý do chưa có điểm"
                value={row.comment}
                multiline
                maxLength={2000}
                editable={!locked && !busy}
                onChangeText={(comment) => {
                  setDraft({
                    ...draft,
                    rows: draft.rows.map((r) =>
                      r.studentId === row.studentId ? { ...r, comment } : r,
                    ),
                  });
                  setDirty(true);
                  setSaved(false);
                }}
              />
            </Panel>
          ))}
          {error ? <Failure error={error} /> : null}
          <Button
            title={busy ? "Đang gửi…" : "Lưu điểm nháp"}
            disabled={busy || locked || !dirty || !session.online || invalid}
            onPress={() => void save()}
          />
          <Button
            title="Công bố kết quả"
            disabled={busy || locked || dirty || !session.online}
            onPress={() =>
              Alert.alert(
                "Công bố kết quả?",
                "Học viên và phụ huynh có liên kết sẽ xem được kết quả đã lưu.",
                [
                  { text: "Hủy", style: "cancel" },
                  { text: "Công bố", onPress: () => void save(true) },
                ],
              )
            }
          />
          <Button
            title="Bỏ bản đang sửa và tải lại"
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Tải lại từ máy chủ?",
                "Nháp trên thiết bị sẽ bị bỏ.",
                [
                  { text: "Giữ nháp", style: "cancel" },
                  {
                    text: "Tải lại",
                    onPress: () => {
                      void reload();
                    },
                  },
                ],
              )
            }
          />
        </>
      ) : (
        <Body>Đang tải điểm…</Body>
      )}
    </Screen>
  );
}
