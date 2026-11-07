import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Claims } from "./security";

const snapshotSchema = z
  .object({
    // Historical values reflect actual stored rows, including legitimate legacy
    // capacity above a newer input ceiling. They are not new command validation.
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(150),
    capacity: z.number().int().positive(),
    active: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
const metadataSchema = z
  .object({
    recordType: z.literal("ROOM_CHANGE"),
    schemaVersion: z.literal(1),
    actorName: z.string().max(150).nullable(),
    before: snapshotSchema.nullable(),
    after: snapshotSchema,
  })
  .strict();
type RoomSnapshot = z.infer<typeof snapshotSchema>;
export function roomSnapshot(room: RoomSnapshot): RoomSnapshot {
  return {
    code: room.code,
    name: room.name,
    capacity: room.capacity,
    active: room.active,
    version: room.version,
  };
}
export async function recordRoomChange(
  tx: Prisma.TransactionClient,
  c: Claims,
  actorName: string,
  roomId: string,
  before: RoomSnapshot | null,
  after: RoomSnapshot,
  traceId: string,
  reason: string | null,
) {
  await tx.auditLog.create({
    data: {
      tenantId: c.tenantId!,
      actorUserId: c.sub,
      action: before ? "room.updated" : "room.created",
      resourceId: roomId,
      traceId,
      reason,
      metadata: {
        recordType: "ROOM_CHANGE",
        schemaVersion: 1,
        actorName: actorName.trim() || null,
        before,
        after,
      },
    },
  });
}
// Only resource-scoped room.created/room.updated records reach this function.
// Unknown legacy/free-form metadata is retained in DB but never reflected to UI.
export function roomHistoryDetails(
  action: string,
  metadata: Prisma.JsonValue | null,
  reason: string | null,
  actualCode: string,
) {
  const parsed = metadataSchema.safeParse(metadata);
  if (!parsed.success || parsed.data.after.code !== actualCode) return null;
  const change = parsed.data;
  if (action === "room.created") {
    if (change.before !== null || change.after.version !== 1 || reason !== null)
      return null;
  } else if (action === "room.updated") {
    if (
      !change.before ||
      change.before.code !== actualCode ||
      change.before.version + 1 !== change.after.version ||
      !reason ||
      reason.trim().length < 10 ||
      reason.length > 500
    )
      return null;
  } else return null;
  return {
    actorName: change.actorName,
    before: change.before,
    after: change.after,
    reason,
  };
}
