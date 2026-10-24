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
  const role = session.me?.activeRole;
  if (role === "guardian") {
    if (!n.subjectStudentId)
      throw new Error("Thông báo không có học viên được phép.");
    const child = unwrap(
      await session.client.api.GET(
        "/api/v1/mobile/guardian/students/{id}/profile",
        { params: { path: { id: n.subjectStudentId } } },
      ),
    );
    session.selectChild(child);
    router.replace(
      n.entityType === "assessment"
        ? "/(guardian)/grades"
        : n.entityType === "invoice" || n.entityType === "payment"
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
