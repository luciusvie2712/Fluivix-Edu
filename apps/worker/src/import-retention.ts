import { Prisma, type PrismaClient } from "@prisma/client";

/** A fixed development-upload retention policy, independent of legal retention
 * of education/financial records. Purge raw preview PII after its 24-hour TTL. */
export async function purgeExpiredImports(db: PrismaClient, now = new Date()) {
  return db.studentImport.updateMany({
    where: { status: "PREVIEW", expiresAt: { lte: now } },
    data: { status: "EXPIRED", rowsJson: Prisma.DbNull },
  });
}
