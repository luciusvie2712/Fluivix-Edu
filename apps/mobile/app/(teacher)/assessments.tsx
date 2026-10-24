import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  Body,
  Button,
  Failure,
  Field,
  Panel,
  Screen,
} from "../../components/ui";
import { useSession } from "../../lib/session";
import { unwrap } from "../../lib/session-client";
export default function Assessments() {
  const session = useSession();
  const [classId, setClass] = useState<string | null>(null),
    [classPage, setClassPage] = useState(1),
    [page, setPage] = useState(1),
    [title, setTitle] = useState(""),
    [heldAt, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [maxScore, setMax] = useState("10.00"),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const classes = useQuery({
    queryKey: [...session.scope, "assessment-classes", classPage],
    queryFn: async () => {
      const r = await session.client.api.GET("/api/v1/mobile/my/classes", {
        params: { query: { page: classPage, limit: 20 } },
      });
      unwrap(r);
      return r.data!;
    },
  });
  const query = useQuery({
    queryKey: [...session.scope, "assessments", classId, page],
    enabled: !!classId,
    queryFn: async () => {
      const r = await session.client.api.GET(
        "/api/v1/classes/{id}/assessments",
        { params: { path: { id: classId! }, query: { page, limit: 20 } } },
      );
      unwrap(r);
      return r.data!;
    },
  });
  async function create() {
    if (!classId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = unwrap(
        await session.client.api.POST("/api/v1/classes/{id}/assessments", {
          params: { path: { id: classId } },
          body: { title, heldAt, maxScore },
        }),
      );
      setTitle("");
      router.push({
        pathname: "/(teacher)/assessment/[id]",
        params: { id: created.id },
      });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Đánh giá học tập">
      {classes.error && <Failure error={classes.error} />}
      <Body>Chọn lớp được phân công</Body>
      {classes.data?.data.map((cls) => (
        <Button
          key={cls.id}
          title={cls.id === classId ? `${cls.name} · đã chọn` : cls.name}
          onPress={() => {
            setClass(cls.id);
            setPage(1);
          }}
        />
      ))}
      {classPage > 1 && (
        <Button
          title="Nhóm lớp trước"
          onPress={() => setClassPage(classPage - 1)}
        />
      )}
      {classes.data && classPage < classes.data.page.totalPages && (
        <Button
          title="Nhóm lớp tiếp"
          onPress={() => setClassPage(classPage + 1)}
        />
      )}
      {classId && (
        <>
          <Field
            label="Tên bài đánh giá"
            value={title}
            onChangeText={setTitle}
            maxLength={150}
          />
          <Field
            label="Ngày đánh giá (YYYY-MM-DD)"
            value={heldAt}
            onChangeText={setDate}
          />
          <Field
            label="Thang điểm tối đa"
            value={maxScore}
            onChangeText={setMax}
            keyboardType="decimal-pad"
          />
          {error ? <Failure error={error} /> : null}
          <Button
            title={busy ? "Đang tạo…" : "Tạo bản nháp"}
            disabled={
              busy ||
              !title.trim() ||
              !/^\d{4}-\d{2}-\d{2}$/.test(heldAt) ||
              !/^\d{1,4}(\.\d{1,2})?$/.test(maxScore) ||
              !session.online
            }
            onPress={() => void create()}
          />
          {query.isPending && <Body>Đang tải đánh giá…</Body>}
          {query.error ? (
            <Failure error={query.error} />
          ) : (
            query.data?.data.map((a) => (
              <Panel key={a.id}>
                <Body>
                  {a.title} · {a.status}
                </Body>
                <Body>
                  {a.heldAt} · thang {a.maxScore}
                </Body>
                <Button
                  title="Xem / nhập điểm"
                  onPress={() =>
                    router.push({
                      pathname: "/(teacher)/assessment/[id]",
                      params: { id: a.id },
                    })
                  }
                />
              </Panel>
            ))
          )}
          {query.data && !query.data.data.length && (
            <Body>Lớp chưa có bài đánh giá.</Body>
          )}
          {page > 1 && (
            <Button title="Trang trước" onPress={() => setPage(page - 1)} />
          )}
          {query.data && page < query.data.page.totalPages && (
            <Button title="Trang tiếp" onPress={() => setPage(page + 1)} />
          )}
        </>
      )}
    </Screen>
  );
}
