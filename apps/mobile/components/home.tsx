import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Panel, Screen } from "./ui";
import { useSession } from "../lib/session";
import { unwrap } from "../lib/session-client";
export function Home() {
  const session = useSession(),
    role = session.me?.activeRole,
    guardian = role === "guardian",
    childId = session.child?.id;
  const query = useQuery({
    queryKey: [...session.scope, "dashboard"],
    enabled: !guardian || !!childId,
    queryFn: async () =>
      unwrap(
        await session.client.api.GET("/api/v1/mobile/dashboard", {
          params: { query: childId ? { studentId: childId } : {} },
        }),
      ),
  });
  if (guardian && !childId)
    return (
      <Screen title="Học tập của con">
        <Body>Chọn học viên đã được trung tâm xác minh liên kết.</Body>
        <Button
          title="Chọn học viên"
          onPress={() => router.push("/(guardian)/children")}
        />
      </Screen>
    );
  return (
    <Screen title={role === "teacher" ? "Hôm nay" : "Học tập"}>
      {query.isPending && <Body>Đang tải thông tin được phép…</Body>}
      {query.error ? (
        <>
          <Failure error={query.error} />
          <Body>Nếu chưa có hồ sơ hoặc phân công, hãy liên hệ trung tâm.</Body>
        </>
      ) : (
        query.data && (
          <>
            <Body>
              {query.data.today} · {query.data.timezone}
            </Body>
            {query.data.linkRequired ? (
              <Body>
                Chưa có hồ sơ được liên kết hoặc phân công đang hoạt động. Vui
                lòng liên hệ trung tâm.
              </Body>
            ) : (
              <Body>Số lớp: {query.data.classesCount}</Body>
            )}
            {query.data.pendingAttendanceCount !== null && (
              <Body>
                Buổi hôm nay chưa chốt điểm danh:{" "}
                {query.data.pendingAttendanceCount}
              </Body>
            )}
            <Panel>
              <Body>Buổi học tiếp theo</Body>
              {query.data.nextSession ? (
                <>
                  <Body>{query.data.nextSession.className}</Body>
                  <Body>
                    {new Intl.DateTimeFormat("vi-VN", {
                      timeZone: query.data.timezone,
                      dateStyle: "short",
                      timeStyle: "short",
                      hour12: false,
                    }).format(new Date(query.data.nextSession.startsAt))}
                  </Body>
                  {role === "teacher" && (
                    <Button
                      title="Mở điểm danh"
                      onPress={() =>
                        router.push({
                          pathname: "/(teacher)/sessions/[id]/attendance",
                          params: { id: query.data.nextSession!.id },
                        })
                      }
                    />
                  )}
                </>
              ) : (
                <Body>Chưa có buổi sắp tới trong 30 ngày.</Body>
              )}
            </Panel>
            {query.data.latestAttendance && (
              <Panel>
                <Body>Chuyên cần gần đây · 30 ngày</Body>
                {query.data.latestAttendance.length ? (
                  query.data.latestAttendance.map((a) => (
                    <Body key={a.id}>
                      {a.scheduledDate}: {a.attendanceStatus}
                    </Body>
                  ))
                ) : (
                  <Body>Chưa có điểm danh công bố trong kỳ.</Body>
                )}
              </Panel>
            )}
            {query.data.latestGrades && (
              <Panel>
                <Body>Kết quả mới công bố</Body>
                {query.data.latestGrades.length ? (
                  query.data.latestGrades.map((g) => (
                    <Body key={g.id}>
                      {g.title}: {g.score ?? "Chưa có điểm"}/{g.maxScore}
                    </Body>
                  ))
                ) : (
                  <Body>Chưa có kết quả được công bố.</Body>
                )}
              </Panel>
            )}
            {query.data.outstandingBalanceVnd !== null && (
              <Body>
                Công nợ nội bộ:{" "}
                {new Intl.NumberFormat("vi-VN", {
                  style: "currency",
                  currency: "VND",
                }).format(BigInt(query.data.outstandingBalanceVnd))}
              </Body>
            )}
          </>
        )
      )}
      <Button title="Tải lại" onPress={() => void query.refetch()} />
      {role === "teacher" ? (
        <>
          <Button
            title="Lịch dạy"
            onPress={() => router.push("/(teacher)/schedule")}
          />
          <Button
            title="Đánh giá học tập"
            onPress={() => router.push("/(teacher)/assessments")}
          />
        </>
      ) : role === "student" ? (
        <>
          <Button
            title="Chuyên cần"
            onPress={() => router.push("/(student)/attendance")}
          />
          <Button
            title="Thông báo"
            onPress={() => router.push("/(student)/notifications")}
          />
        </>
      ) : (
        <>
          <Button
            title="Đổi học viên"
            onPress={() => router.push("/(guardian)/children")}
          />
          <Button
            title="Chuyên cần"
            onPress={() => router.push("/(guardian)/attendance")}
          />
          <Button
            title="Kết quả học tập"
            onPress={() => router.push("/(guardian)/grades")}
          />
        </>
      )}
    </Screen>
  );
}
