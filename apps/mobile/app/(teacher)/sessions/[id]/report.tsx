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
  Screen,
} from "../../../../components/ui";
import { useSession } from "../../../../lib/session";
import { unwrap } from "../../../../lib/session-client";
export default function Report() {
  const session = useSession(),
    { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState<
      components["schemas"]["LessonView"] | null
    >(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: [...session.scope, "lesson", id],
    queryFn: async () =>
      unwrap(
        await session.client.api.GET("/api/v1/sessions/{id}/lesson-report", {
          params: { path: { id } },
        }),
      ),
  });
  useEffect(() => {
    if (query.data && !draft) setDraft(query.data);
  }, [query.data, draft]);
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      setDraft(
        unwrap(
          await session.client.api.PUT("/api/v1/sessions/{id}/lesson-report", {
            params: { path: { id } },
            body: draft,
          }),
        ),
      );
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
          await session.client.api.GET("/api/v1/sessions/{id}/lesson-report", {
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
    <Screen title="Nhật ký buổi học">
      {query.error ? (
        <Failure error={query.error} />
      ) : draft ? (
        <>
          <Field
            label="Nội dung đã dạy"
            value={draft.lessonSummary}
            multiline
            maxLength={2000}
            onChangeText={(lessonSummary) => {
              setDraft({ ...draft, lessonSummary });
              setDirty(true);
              setSaved(false);
            }}
          />
          <Field
            label="Bài tập văn bản"
            value={draft.homeworkText}
            multiline
            maxLength={2000}
            onChangeText={(homeworkText) => {
              setDraft({ ...draft, homeworkText });
              setDirty(true);
              setSaved(false);
            }}
          />
          <Field
            label="Ghi chú riêng của giáo viên"
            value={draft.teacherNotesPrivate}
            multiline
            maxLength={2000}
            onChangeText={(teacherNotesPrivate) => {
              setDraft({ ...draft, teacherNotesPrivate });
              setDirty(true);
              setSaved(false);
            }}
          />
          {dirty && <Body>Chưa lưu lên máy chủ.</Body>}
          {saved && <Body>Máy chủ đã lưu nhật ký.</Body>}
          {error ? <Failure error={error} /> : null}
          <Button
            title={busy ? "Đang lưu…" : "Lưu nhật ký"}
            disabled={
              busy ||
              !dirty ||
              !draft.lessonSummary.trim() ||
              !session.online ||
              !session.canWrite
            }
            onPress={() => void save()}
          />
          <Button
            title="Tải lại, bỏ bản đang sửa"
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Bỏ bản đang sửa?",
                "Nháp trên thiết bị sẽ được thay bằng dữ liệu mới từ máy chủ.",
                [
                  { text: "Giữ nháp", style: "cancel" },
                  { text: "Tải lại", onPress: () => void reload() },
                ],
              )
            }
          />
        </>
      ) : (
        <Body>Đang tải nhật ký…</Body>
      )}
    </Screen>
  );
}
