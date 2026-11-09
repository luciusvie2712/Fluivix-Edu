import { reminderBatchReady } from "../../api/dist/fee-reminder-predicates";
import { PrismaClient, Prisma, type Role } from "@prisma/client";
import { openToken } from "@fluivix/server-crypto";
import { z } from "zod";
import {
  claimPushDelivery,
  handoffReminderPush,
  retryPush,
  sendAttemptWhere,
} from "./notification-claims";
import {
  notificationAuthorized,
  consentFor,
  categoryEnabled,
} from "./notification-access";
export { notificationAuthorized } from "./notification-access";
export const DOMAIN_EVENTS = [
  "CLASS_SCHEDULE_CHANGED",
  "ATTENDANCE_FINALIZED_ABSENT",
  "GRADE_PUBLISHED",
  "INVOICE_ISSUED",
  "FEE_REMINDER",
  "PAYMENT_RECORDED",
];
type Tx = Prisma.TransactionClient;
type Recipient = { userId: string; role: Role; studentId: string | null };
const ticketSchema = z.object({
  data: z.object({
    status: z.enum(["ok", "error"]),
    id: z.string().min(1).max(150).optional(),
    details: z.object({ error: z.string().optional() }).optional(),
  }),
});
async function recipients(
  tx: Tx,
  event: {
    tenantId: string | null;
    eventType: string;
    aggregateId: string;
    eventVersion: number;
  },
  now = new Date(),
) {
  if (!event.tenantId) return null;
  const tenantId = event.tenantId,
    rows: Recipient[] = [];
  let ids: string[];
  let entityType: string;
  if (
    event.eventType === "ATTENDANCE_FINALIZED_ABSENT" ||
    event.eventType === "CLASS_SCHEDULE_CHANGED"
  ) {
    const s = await tx.classSession.findFirst({
      where: {
        tenantId,
        id: event.aggregateId,
        version: event.eventVersion,
        ...(event.eventType === "ATTENDANCE_FINALIZED_ABSENT"
          ? { status: "COMPLETED", finalizedAt: { not: null } }
          : {}),
      },
    });
    if (!s) return null;
    entityType = "session";
    if (event.eventType === "ATTENDANCE_FINALIZED_ABSENT")
      ids = (
        await tx.attendanceRecord.findMany({
          where: {
            tenantId,
            sessionId: s.id,
            status: { in: ["ABSENT_EXCUSED", "ABSENT_UNEXCUSED"] },
          },
          select: { studentId: true },
        })
      ).map((v) => v.studentId);
    else {
      ids = (
        await tx.enrollment.findMany({
          where: {
            tenantId,
            classId: s.classId,
            joinedAt: { lte: s.scheduledDate },
            OR: [{ leftAt: null }, { leftAt: { gte: s.scheduledDate } }],
          },
          select: { studentId: true },
        })
      ).map((v) => v.studentId);
      const teacher = await tx.teacher.findFirst({
        where: { tenantId, id: s.teacherId, status: "ACTIVE" },
      });
      if (teacher)
        rows.push({ userId: teacher.userId, role: "teacher", studentId: null });
    }
  } else if (event.eventType === "GRADE_PUBLISHED") {
    const a = await tx.assessment.findFirst({
      where: {
        tenantId,
        id: event.aggregateId,
        status: "PUBLISHED",
        publishedAt: { not: null },
        version: event.eventVersion,
      },
    });
    if (!a) return null;
    entityType = "assessment";
    ids = (
      await tx.assessmentResult.findMany({
        where: { tenantId, assessmentId: a.id },
        select: { studentId: true },
      })
    ).map((v) => v.studentId);
  } else if (event.eventType === "FEE_REMINDER") {
    if (!(await reminderBatchReady(tx, tenantId, event.aggregateId, now)))
      return null;
    const batch = await tx.feeReminderBatch.findFirst({
      where: { tenantId, id: event.aggregateId },
    });
    if (!batch) return null;
    ids = [batch.studentId];
    entityType = "reminder";
  } else if (event.eventType === "INVOICE_ISSUED") {
    const i = await tx.invoice.findFirst({
      where: { tenantId, id: event.aggregateId, billingState: "ISSUED" },
    });
    if (!i) return null;
    ids = [i.studentId];
    entityType = "invoice";
  } else if (event.eventType === "PAYMENT_RECORDED") {
    const p = await tx.payment.findFirst({
      where: { tenantId, id: event.aggregateId, status: "CONFIRMED" },
    });
    if (!p) return null;
    ids = [p.studentId];
    entityType = "payment";
  } else return null;
  for (const student of await tx.student.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, userId: true },
  }))
    if (
      student.userId &&
      !["invoice", "payment", "reminder"].includes(entityType)
    )
      rows.push({
        userId: student.userId,
        role: "student",
        studentId: student.id,
      });
  for (const link of await tx.guardianLink.findMany({
    where: {
      tenantId,
      studentId: { in: ids },
      status: "ACTIVE",
      verifiedAt: { not: null },
      verifiedBy: { not: null },
    },
    select: { guardianUserId: true, studentId: true },
    orderBy: { studentId: "asc" },
  }))
    rows.push({
      userId: link.guardianUserId,
      role: "guardian",
      studentId: link.studentId,
    });
  return { rows, entityType };
}
export async function deliverDomainEvent(
  db: PrismaClient,
  eventId: string,
  request: typeof fetch = fetch,
  clock: () => Date = () => new Date(),
) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM outbox_events WHERE id=${eventId}::uuid FOR UPDATE`;
    const event = await tx.outboxEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    if (event.processedAt) return;
    if (event.tenantId)
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${event.tenantId}::uuid FOR SHARE`;
    const targets = await recipients(tx, event, clock());
    if (targets && event.tenantId)
      for (const r of targets.rows) {
        await tx.$queryRaw`SELECT id FROM tenant_memberships WHERE tenant_id=${event.tenantId}::uuid AND user_id=${r.userId}::uuid FOR SHARE`;
        const subject = {
          tenantId: event.tenantId,
          recipientUserId: r.userId,
          recipientRole: r.role,
          subjectStudentId: r.studentId,
          type: event.eventType,
          entityType: targets.entityType,
          entityId: event.aggregateId,
        };
        if (!(await notificationAuthorized(tx, subject))) continue;
        // New inbox events require actual current purpose/version consent.
        // Existing historical rows are retained; relationship is not consent.
        if (!(await consentFor(tx, subject, [r.studentId]))) continue;
        const pref = await tx.notificationPreference.findUnique({
          where: {
            tenantId_userId: { tenantId: event.tenantId, userId: r.userId },
          },
        });
        if (!categoryEnabled(event.eventType, pref)) continue;
        const prior = await tx.notification.findFirst({
          where: { eventId, recipientUserId: r.userId, recipientRole: r.role },
        });
        if (prior) continue; // Role audiences project to one event per recipient.
        const n = await tx.notification.create({
          data: {
            ...subject,
            eventId,
          },
        });
        if (pref?.pushEnabled) {
          const devices = await tx.devicePushToken.findMany({
            where: { userId: r.userId, status: "ACTIVE" },
          });
          for (const device of devices) {
            const queued = await tx.pushDelivery.findFirst({
              where: {
                eventId: event.id,
                recipientUserId: r.userId,
                deviceId: device.id,
                canonical: true,
              },
              select: { id: true },
            });
            if (queued) continue;
            await tx.pushDelivery.create({
              data: {
                tenantId: event.tenantId,
                notificationId: n.id,
                deviceId: device.id,
              },
            });
          }
        }
      }
    await tx.outboxEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), attempts: { increment: 1 } },
    });
  });
  const notifications = await db.notification.findMany({
    where: { eventId },
    select: { id: true },
  });
  const deliveries = await db.pushDelivery.findMany({
    where: {
      notificationId: { in: notifications.map((n) => n.id) },
      canonical: true,
      status: "PENDING",
      attempts: { lt: 5 },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
  });
  for (const delivery of deliveries) {
    const prepared = await claimPushDelivery(db, delivery, clock);
    if (!prepared) continue;
    const { n, device, attempt } = prepared;
    const where = sendAttemptWhere(delivery.id, attempt, device.version);
    // Claim verification can itself cross09:15; never begin a late HTTP send.
    if (prepared.reminderDeadline && clock() >= prepared.reminderDeadline) {
      await db.pushDelivery.updateMany({
        where,
        data: { status: "SUPPRESSED", nextAttemptAt: null },
      });
      continue;
    }
    try {
      const send = () =>
        request("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.EXPO_ACCESS_TOKEN
              ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
              : {}),
          },
          body: JSON.stringify({
            to: openToken(device.tokenEncrypted),
            title: "FluivixEdu",
            body: "Bạn có thông báo mới.",
            data: { notificationId: n.id },
            channelId: "default",
          }),
          signal: AbortSignal.timeout(10000),
        });
      const response =
        n.type === "FEE_REMINDER"
          ? await handoffReminderPush(db, delivery.id, prepared, send, clock)
          : await send();
      if (!response) continue;
      if (response.status === 429 || response.status >= 500) {
        await retryPush(
          db,
          delivery.id,
          attempt,
          device.version,
          response.headers.get("Retry-After"),
        );
      }
      if (!response.ok) {
        await db.pushDelivery.updateMany({
          where,
          data: { status: "FAILED" },
        });
        continue;
      }
      const ticket = ticketSchema.parse(await response.json()).data;
      if (ticket.status === "error") {
        if (ticket.details?.error === "MessageRateExceeded")
          await retryPush(db, delivery.id, attempt, device.version);
        const invalid = ticket.details?.error === "DeviceNotRegistered";
        await db.$transaction([
          db.pushDelivery.updateMany({
            where,
            data: { status: invalid ? "INVALID" : "FAILED" },
          }),
          ...(invalid
            ? [
                db.devicePushToken.updateMany({
                  where: {
                    id: device.id,
                    userId: n.recipientUserId,
                    version: device.version,
                    status: "ACTIVE",
                  },
                  data: { status: "INVALID" },
                }),
              ]
            : []),
        ]);
      } else if (ticket.id)
        await db.pushDelivery.updateMany({
          where,
          data: {
            status: "ACCEPTED",
            providerRef: ticket.id,
            nextReceiptAt: new Date(Date.now() + 15 * 60000),
            receiptChecks: 0,
          },
        });
      else
        await db.pushDelivery.updateMany({
          where,
          data: { status: "UNKNOWN" },
        });
    } catch (cause) {
      if (
        cause instanceof Error &&
        ["PUSH_RETRYABLE_REJECTION", "PUSH_RETRY_EXHAUSTED"].includes(
          cause.message,
        )
      )
        throw cause;
      // Expo has no send-idempotency contract: uncertain acceptance must not blindly resend.
      await db.pushDelivery.updateMany({
        where,
        data: { status: "UNKNOWN" },
      });
    }
  }
}
export { checkPushReceipts } from "./notification-receipts";
