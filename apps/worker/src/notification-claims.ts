import { Prisma, type PrismaClient, type PushDelivery } from "@prisma/client";
import {
  authorizedNotificationSubjects,
  categoryEnabled,
  consentFor,
  notificationAuthorized,
} from "./notification-access";

export async function claimPushDelivery(
  db: PrismaClient,
  delivery: PushDelivery,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${delivery.tenantId}::uuid FOR SHARE`;
      const n = await tx.notification.findFirstOrThrow({
        where: {
          tenantId: delivery.tenantId,
          id: delivery.notificationId,
        },
      });
      await tx.$queryRaw`SELECT id FROM tenant_memberships WHERE tenant_id=${n.tenantId}::uuid AND user_id=${n.recipientUserId}::uuid FOR SHARE`;
      const pending: Prisma.PushDeliveryWhereInput = {
        id: delivery.id,
        status: "PENDING",
        canonical: true,
      };
      const suppress = async (status: "SUPPRESSED" | "NOT_CONFIGURED") => {
        await tx.pushDelivery.updateMany({
          where: pending,
          data: { status, nextAttemptAt: null },
        });
        return null;
      };
      const initial = await tx.devicePushToken.findUniqueOrThrow({
        where: { id: delivery.deviceId },
      });
      if (initial.userId !== n.recipientUserId || initial.status !== "ACTIVE")
        return suppress("SUPPRESSED");
      const sessions = await tx.$queryRaw<{ id: string }[]>`
      SELECT s.id FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.user_id=${initial.userId}::uuid AND s.family_id=${initial.familyId}::uuid
        AND s.client_type='MOBILE' AND s.revoked_at IS NULL AND s.consumed_at IS NULL
        AND s.expires_at>now() AND u.status='ACTIVE' FOR SHARE OF s,u
    `;
      if (!sessions.length) return suppress("SUPPRESSED");
      await tx.$queryRaw`SELECT id FROM device_push_tokens WHERE id=${initial.id}::uuid FOR UPDATE`;
      const device = await tx.devicePushToken.findUniqueOrThrow({
        where: { id: initial.id },
      });
      if (
        device.userId !== n.recipientUserId ||
        device.familyId !== initial.familyId ||
        device.status !== "ACTIVE"
      )
        return suppress("SUPPRESSED");
      const pref = await tx.notificationPreference.findUnique({
        where: {
          tenantId_userId: { tenantId: n.tenantId, userId: n.recipientUserId },
        },
      });
      if (!pref?.pushEnabled || !categoryEnabled(n.type, pref))
        return suppress("SUPPRESSED");
      const audiences = await tx.notification.findMany({
        where: {
          tenantId: n.tenantId,
          eventId: n.eventId,
          recipientUserId: n.recipientUserId,
        },
        orderBy: { id: "asc" },
      });
      let authorized = false;
      for (const audience of audiences) {
        if (!(await notificationAuthorized(tx, audience))) continue;
        const subjects: (string | null)[] =
          audience.recipientRole === "teacher"
            ? [null]
            : await authorizedNotificationSubjects(tx, audience);
        if (await consentFor(tx, audience, subjects)) {
          authorized = true;
          break;
        }
      }
      if (!authorized) return suppress("SUPPRESSED");
      // A retained legacy duplicate can still have a real accepted/uncertain
      // outcome. Never create another send while that earlier outcome may stand.
      const earlier = await tx.pushDelivery.findFirst({
        where: {
          eventId: n.eventId,
          recipientUserId: n.recipientUserId,
          deviceId: device.id,
          canonical: false,
          status: { in: ["SENDING", "ACCEPTED", "SENT", "UNKNOWN"] },
        },
        select: { id: true },
      });
      if (earlier) return suppress("SUPPRESSED");
      if (process.env.PUSH_PROVIDER !== "expo")
        return suppress("NOT_CONFIGURED");
      const claimed = await tx.pushDelivery.updateMany({
        where: {
          ...pending,
          attempts: { lt: 5 },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        },
        data: {
          status: "SENDING",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          deviceVersion: device.version,
          nextAttemptAt: null,
          nextReceiptAt: null,
          providerRef: null,
        },
      });
      if (!claimed.count) return null;
      const state = await tx.pushDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
        select: { attempts: true },
      });
      return { n, device, attempt: state.attempts };
    },
    { timeout: 15000 },
  );
}

export function sendAttemptWhere(
  id: string,
  attempt: number,
  deviceVersion: number,
): Prisma.PushDeliveryWhereInput {
  return {
    id,
    attempts: attempt,
    deviceVersion,
    status: { in: ["SENDING", "UNKNOWN"] },
  };
}

export function nextSendAt(attempt: number, retryAfter: string | null = null) {
  const now = Date.now(),
    base = Math.min(300000, 5000 * 2 ** Math.min(Math.max(0, attempt - 1), 6));
  const header =
    retryAfter && /^\d{1,6}$/.test(retryAfter)
      ? Number(retryAfter) * 1000
      : retryAfter
        ? Date.parse(retryAfter) - now
        : 0;
  const delay = Number.isFinite(header)
    ? Math.max(base, Math.min(86400000, Math.max(0, header)))
    : base;
  return new Date(now + delay);
}

export async function retryPush(
  db: PrismaClient,
  id: string,
  attempt: number,
  deviceVersion: number,
  retryAfter: string | null = null,
): Promise<never> {
  const exhausted = attempt >= 5;
  await db.pushDelivery.updateMany({
    where: sendAttemptWhere(id, attempt, deviceVersion),
    data: {
      status: exhausted ? "FAILED" : "PENDING",
      nextAttemptAt: exhausted ? null : nextSendAt(attempt, retryAfter),
      nextReceiptAt: null,
    },
  });
  throw new Error(
    exhausted ? "PUSH_RETRY_EXHAUSTED" : "PUSH_RETRYABLE_REJECTION",
  );
}
