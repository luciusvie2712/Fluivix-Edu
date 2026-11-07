import type { Prisma } from "@prisma/client";
import { tenantDate } from "./students";

export type RoomUsage = {
  activeOrDraftClasses: number;
  futureActiveRules: number;
  upcomingOrOngoingSessions: number;
  requiredCapacity: number;
};
export async function roomUsage(
  tx: Prisma.TransactionClient,
  tenantId: string,
  roomId: string,
  timezone: string,
): Promise<RoomUsage> {
  // Caller holds the canonical tenant lock. Inherited future rule/session room
  // references count too; completed/cancelled/past history never reserves space.
  const [row] = await tx.$queryRaw<RoomUsage[]>`
    WITH class_uses AS (
      SELECT capacity FROM classes WHERE tenant_id=${tenantId}::uuid AND room_id=${roomId}::uuid AND status IN ('DRAFT','ACTIVE')
    ), rule_uses AS (
      SELECT c.capacity FROM schedule_rules r JOIN classes c ON c.tenant_id=r.tenant_id AND c.id=r.class_id
      WHERE r.tenant_id=${tenantId}::uuid AND COALESCE(r.room_id,c.room_id)=${roomId}::uuid AND r.active AND r.valid_to>=${tenantDate(timezone)}::date AND c.status IN ('DRAFT','ACTIVE')
    ), session_uses AS (
      SELECT c.capacity FROM class_sessions s JOIN classes c ON c.tenant_id=s.tenant_id AND c.id=s.class_id
      WHERE s.tenant_id=${tenantId}::uuid AND COALESCE(s.room_id,c.room_id)=${roomId}::uuid AND s.status IN ('SCHEDULED','IN_PROGRESS','REOPENED') AND s.ends_at>${new Date()}::timestamptz
    ) SELECT
      (SELECT count(*)::integer FROM class_uses) AS "activeOrDraftClasses",
      (SELECT count(*)::integer FROM rule_uses) AS "futureActiveRules",
      (SELECT count(*)::integer FROM session_uses) AS "upcomingOrOngoingSessions",
      GREATEST(COALESCE((SELECT max(capacity) FROM class_uses),0),COALESCE((SELECT max(capacity) FROM rule_uses),0),COALESCE((SELECT max(capacity) FROM session_uses),0)) AS "requiredCapacity"
  `;
  if (!row) throw new Error("ROOM_USAGE_UNAVAILABLE");
  return row;
}
