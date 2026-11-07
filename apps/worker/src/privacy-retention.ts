import type { PrismaClient } from "@prisma/client";

/** Erases only expired transient export content; business/request metadata stays. */
export async function purgeExpiredPrivacyExports(db: PrismaClient) {
  const now = new Date();
  const due = await db.privacyExportArtifact.findMany({
    where: {
      expiresAt: { lte: now },
      ciphertext: { not: null },
      purgedAt: null,
    },
    select: { id: true, tenantId: true, requestId: true },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  let purged = 0;
  for (const row of due) {
    purged += await db.$transaction(async (tx) => {
      const changed = await tx.privacyExportArtifact.updateMany({
        where: {
          id: row.id,
          tenantId: row.tenantId,
          expiresAt: { lte: now },
          ciphertext: { not: null },
          purgedAt: null,
        },
        data: { ciphertext: null, purgedAt: new Date() },
      });
      if (changed.count)
        await tx.auditLog.create({
          data: {
            tenantId: row.tenantId,
            actorUserId: null,
            action: "privacy.export.content_purged",
            resourceId: row.id,
            traceId: "privacy-retention",
            metadata: { requestId: row.requestId },
            reason:
              "Hết thời hạn bản xuất tạm thời; giữ nguyên metadata và lịch sử nghiệp vụ",
          },
        });
      return changed.count;
    });
  }
  return purged;
}
