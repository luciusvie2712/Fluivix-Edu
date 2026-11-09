import { router } from "expo-router";
import type { useSession } from "./session";
import { unwrap } from "./session-client";
export async function openNotification(
  session: ReturnType<typeof useSession>,
  id: string,
) {
  const n = unwrap(
    await session.client.api.GET("/api/v1/notifications/{id}", {
      params: { path: { id } },
    }),
  );
  if (
    !["session", "assessment", "invoice", "payment", "reminder"].includes(
      n.entityType,
    )
  )
    throw new Error("Loại nội dung thông báo chưa được hỗ trợ.");
  const role = session.me?.activeRole;
  if (n.entityType === "reminder" && role !== "guardian")
    throw new Error("Chọn vai trò phụ huynh để mở nhắc học phí.");
  if (role === "guardian") {
    const subjectId =
      session.child && n.subjectStudentIds.includes(session.child.id)
        ? session.child.id
        : n.subjectStudentIds[0];
    if (!subjectId) throw new Error("Thông báo không có học viên được phép.");
    const child = unwrap(
      await session.client.api.GET(
        "/api/v1/mobile/guardian/students/{id}/profile",
        { params: { path: { id: subjectId } } },
      ),
    );
    session.selectChild(child);
    router.replace(
      n.entityType === "assessment"
        ? "/(guardian)/grades"
        : n.entityType === "invoice" ||
            n.entityType === "payment" ||
            n.entityType === "reminder"
          ? "/(guardian)/finance"
          : "/(guardian)/schedule",
    );
  } else if (role === "student")
    router.push(
      n.entityType === "assessment"
        ? "/(student)/grades"
        : "/(student)/schedule",
    );
  else if (role === "teacher" && n.entityType === "session")
    router.push({
      pathname: "/(teacher)/sessions/[id]/attendance",
      params: { id: n.entityId },
    });
  else throw new Error("Chọn vai trò phù hợp để mở thông báo.");
}
