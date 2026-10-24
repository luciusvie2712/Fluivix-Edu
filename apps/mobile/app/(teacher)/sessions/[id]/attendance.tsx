import { useEffect, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import {
  Body,
  Button,
  Failure,
  Panel,
  Screen,
  styles,
} from "../../../../components/ui";
import { useSession } from "../../../../lib/session";
import { ApiFailure, unwrap } from "../../../../lib/session-client";
type Snapshot = components["schemas"]["AttendanceView"];
const statuses = [
  ["PRESENT", "Có mặt"],
  ["LATE", "Đi muộn"],
  ["ABSENT_EXCUSED", "Vắng có phép"],
  ["ABSENT_UNEXCUSED", "Vắng không phép"],
  ["UNMARKED", "Chưa đánh dấu"],
] as const;
export default function Attendance() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    session = useSession();
  const [editor, setEditor] = useState<Snapshot | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [conflict, setConflict] = useState<Snapshot | null>(null),
    [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: [...session.scope, "roster", id],
    queryFn: async () =>
      unwrap(
        await session.client.api.GET("/api/v1/sessions/{id}/roster", {
          params: { path: { id } },
        }),
      ),
  });
  useEffect(() => {
    if (query.data && !editor) setEditor(query.data);
  }, [query.data, editor]);
  const locked =
    !session.canWrite ||
    (!!editor &&
      !["SCHEDULED", "IN_PROGRESS", "REOPENED"].includes(
        editor.session.status,
      ));
  const unmarked =
    editor?.rows.filter((row) => row.status === "UNMARKED").length ?? 0;
  function mark(studentId: string, status: Snapshot["rows"][number]["status"]) {
    setEditor((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.studentId === studentId ? { ...row, status } : row,
            ),
          }
        : null,
    );
    setDirty(true);
    setSaved(false);
  }
  async function save(finalize = false) {
    if (!editor || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = finalize
        ? await session.client.api.POST(
            "/api/v1/sessions/{id}/attendance/finalize",
            {
              params: { path: { id } },
              body: { sessionVersion: editor.session.version },
            },
          )
        : await session.client.api.PUT(
            "/api/v1/sessions/{id}/attendance/draft",
            {
              params: { path: { id } },
              body: {
                sessionVersion: editor.session.version,
                records: editor.rows.map(({ studentId, status, note }) => ({
                  studentId,
                  status,
                  ...(note !== undefined ? { note } : {}),
                })),
              },
            },
          );
      const next = unwrap(result);
      setEditor(next);
      setDirty(false);
      setConflict(null);
      setSaved(true);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function compare() {
    setBusy(true);
    try {
      setConflict(
        unwrap(
          await session.client.api.GET("/api/v1/sessions/{id}/roster", {
            params: { path: { id } },
          }),
        ),
      );
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  if (query.error)
    return (
      <Screen title="Không thể mở điểm danh">
        <Failure error={query.error} />
        <Button title="Tải lại" onPress={() => void query.refetch()} />
      </Screen>
    );
  if (!editor)
    return (
      <Screen title="Điểm danh">
        <Body>Đang tải danh sách được phân công…</Body>
      </Screen>
    );
  return (
    <SafeAreaView style={styles.page} edges={["left", "right", "bottom"]}>
      <FlatList
        data={editor.rows}
        keyExtractor={(row) => row.studentId}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <Text accessibilityRole="header" style={styles.title}>
              Điểm danh · {editor.session.className}
            </Text>
            <Body>
              {editor.session.scheduledDate} · {editor.session.status} · Phiên
              bản {editor.session.version}
            </Body>
            {!session.canWrite && (
              <Body>Trung tâm đang chỉ cho phép xem dữ liệu.</Body>
            )}
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {editor.rows.length - unmarked}/{editor.rows.length} đã đánh dấu
            </Text>
            {!session.online && (
              <Failure error="Mất kết nối. Nháp chỉ còn trong phiên này; chưa đồng bộ." />
            )}
            {dirty && (
              <Body>
                Chưa lưu lên máy chủ. Rời màn hình sẽ mất nháp chưa đồng bộ.
              </Body>
            )}
            {saved && (
              <Body>
                {editor.session.status === "COMPLETED"
                  ? "Máy chủ đã xác nhận hoàn tất và khóa điểm danh."
                  : "Máy chủ đã lưu bản nháp. Học viên và phụ huynh chưa thấy điểm danh."}
              </Body>
            )}
            {error ? <Failure error={error} /> : null}
            {error instanceof ApiFailure && error.status === 409 && (
              <Button
                title="Tải bản mới để đối chiếu"
                disabled={busy}
                onPress={() => void compare()}
              />
            )}
            {conflict && (
              <Panel>
                <Body>Bản máy chủ: phiên bản {conflict.session.version}</Body>
                {conflict.rows
                  .filter(
                    (row) =>
                      row.status !==
                      editor.rows.find(
                        (local) => local.studentId === row.studentId,
                      )?.status,
                  )
                  .map((row) => (
                    <Body key={row.studentId}>
                      {row.fullName}: máy chủ {row.status}; nháp{" "}
                      {editor.rows.find(
                        (local) => local.studentId === row.studentId,
                      )?.status ?? "không còn trong danh sách"}
                    </Body>
                  ))}
                <Button
                  title="Dùng bản máy chủ, bỏ nháp"
                  onPress={() =>
                    Alert.alert(
                      "Bỏ nháp trên thiết bị?",
                      "Các thay đổi chưa lưu sẽ bị thay bằng bản máy chủ.",
                      [
                        { text: "Giữ nháp", style: "cancel" },
                        {
                          text: "Tải bản máy chủ",
                          onPress: () => {
                            setEditor(conflict);
                            setConflict(null);
                            setDirty(false);
                            setError(null);
                          },
                        },
                      ],
                    )
                  }
                />
              </Panel>
            )}
            <Button
              title="Đánh dấu tất cả có mặt"
              disabled={locked || busy || !session.online || !!conflict}
              onPress={() =>
                Alert.alert(
                  "Tất cả có mặt?",
                  `Áp dụng Có mặt cho ${editor.rows.length} học viên. Bạn vẫn cần lưu nháp.`,
                  [
                    { text: "Hủy", style: "cancel" },
                    {
                      text: "Đánh dấu",
                      onPress: () => {
                        setEditor({
                          ...editor,
                          rows: editor.rows.map((row) => ({
                            ...row,
                            status: "PRESENT",
                          })),
                        });
                        setDirty(true);
                        setSaved(false);
                      },
                    },
                  ],
                )
              }
            />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <Panel>
            <Body>{item.fullName}</Body>
            <Body>
              Trạng thái:{" "}
              {statuses.find((s) => s[0] === item.status)?.[1] ?? item.status}
            </Body>
            {!locked && (
              <View style={{ gap: 8, flexDirection: "row", flexWrap: "wrap" }}>
                {statuses.map(([status, label]) => (
                  <View
                    key={status}
                    style={{ width: status === "UNMARKED" ? "100%" : "48%" }}
                  >
                    <Button
                      selected={item.status === status}
                      title={
                        item.status === status ? `${label} · đã chọn` : label
                      }
                      disabled={busy || !!conflict}
                      onPress={() => mark(item.studentId, status)}
                    />
                  </View>
                ))}
              </View>
            )}
          </Panel>
        )}
        ListFooterComponent={
          <View style={{ gap: 16, paddingTop: 16 }}>
            <Button
              title={busy ? "Đang gửi…" : "Lưu nháp"}
              disabled={
                busy || locked || !session.online || !!conflict || !dirty
              }
              onPress={() => void save()}
            />
            <Button
              title="Xác nhận và khóa điểm danh"
              disabled={
                busy ||
                locked ||
                dirty ||
                unmarked > 0 ||
                !editor.rows.length ||
                !session.online ||
                !!conflict
              }
              onPress={() =>
                Alert.alert(
                  "Chốt điểm danh?",
                  `${editor.rows.length} học viên đã đánh dấu. Chỉ người có quyền mới mở lại được.`,
                  [
                    { text: "Hủy", style: "cancel" },
                    { text: "Chốt điểm danh", onPress: () => void save(true) },
                  ],
                )
              }
            />
          </View>
        }
      />
    </SafeAreaView>
  );
}
