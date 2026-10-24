import {
  PrismaClient,
  Prisma,
  type Notification,
  type Role,
} from "@prisma/client";
import { openToken } from "@fluivix/server-crypto";
import { z } from "zod";
export const DOMAIN_EVENTS = [
  "CLASS_SCHEDULE_CHANGED",
  "ATTENDANCE_FINALIZED_ABSENT",
  "GRADE_PUBLISHED",
  "INVOICE_ISSUED",
  "PAYMENT_RECORDED",
];
type Tx = Prisma.TransactionClient;
type Recipient = { userId: string; role: Role; studentId: string | null };
const ticketSchema = z.object({
  data: z.object({
    status: z.enum(["ok", "error"]),
    id: z.string().optional(),
    details: z.object({ error: z.string().optional() }).optional(),
  }),
});
export async function notificationAuthorized(
  db: Tx,
  n: Pick<
    Notification,
    "tenantId" | "recipientUserId" | "recipientRole" | "subjectStudentId"
  >,
) {
  const membership = await db.membership.findFirst({
    where: {
      tenantId: n.tenantId,
      userId: n.recipientUserId,
      status: "ACTIVE",
      roles: { some: { role: n.recipientRole } },
      user: { status: "ACTIVE" },
      tenant: {
        status: { notIn: ["SUSPENDED", "TERMINATED", "PENDING_ACTIVATION"] },
      },
    },
  });
  if (!membership) return false;
  if (n.recipientRole === "guardian")
    return (
      !!n.subjectStudentId &&
      !!(await db.guardianLink.findFirst({
        where: {
          tenantId: n.tenantId,
          studentId: n.subjectStudentId,
          guardianUserId: n.recipientUserId,
          status: "ACTIVE",
          verifiedBy: { not: null },
          verifiedAt: { not: null },
        },
      }))
    );
  if (n.recipientRole === "student")
    return (
      !!n.subjectStudentId &&
      !!(await db.student.findFirst({
        where: {
          tenantId: n.tenantId,
          id: n.subjectStudentId,
          userId: n.recipientUserId,
        },
      }))
    );
  return n.recipientRole === "teacher";
}
async function recipients(
  tx: Tx,
  event: {
    tenantId: string | null;
    eventType: string;
    aggregateId: string;
    eventVersion: number;
  },
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
          ? { status: "COMPLETED" }
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
    if (student.userId && !["invoice", "payment"].includes(entityType))
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
) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM outbox_events WHERE id=${eventId}::uuid FOR UPDATE`;
    const event = await tx.outboxEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    if (event.processedAt) return;
    const targets = await recipients(tx, event);
    if (targets && event.tenantId)
      for (const r of targets.rows) {
        const subject = {
          tenantId: event.tenantId,
          recipientUserId: r.userId,
          recipientRole: r.role,
          subjectStudentId: r.studentId,
        };
        if (!(await notificationAuthorized(tx, subject))) continue;
        const pref = await tx.notificationPreference.findUnique({
          where: {
            tenantId_userId: { tenantId: event.tenantId, userId: r.userId },
          },
        });
        const enabled =
          event.eventType === "GRADE_PUBLISHED"
            ? pref?.grades
            : event.eventType === "ATTENDANCE_FINALIZED_ABSENT"
              ? pref?.attendance
              : event.eventType === "CLASS_SCHEDULE_CHANGED"
                ? pref?.schedule
                : pref?.finance;
        if (enabled === false) continue;
        const prior = await tx.notification.findFirst({
          where: { eventId, recipientUserId: r.userId, recipientRole: r.role },
        });
        if (prior) continue; // one event per recipient/role, even siblings share an assessment.
        const n = await tx.notification.create({
          data: {
            ...subject,
            eventId,
            type: event.eventType,
            entityType: targets.entityType,
            entityId: event.aggregateId,
          },
        });
        if (pref?.pushEnabled) {
          const devices = await tx.devicePushToken.findMany({
            where: { userId: r.userId, status: "ACTIVE" },
          });
          for (const device of devices)
            await tx.pushDelivery.create({
              data: {
                tenantId: event.tenantId,
                notificationId: n.id,
                deviceId: device.id,
              },
            });
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
      status: "PENDING",
      attempts: { lt: 5 },
    },
  });
  for (const delivery of deliveries) {
    const n = await db.notification.findFirstOrThrow({
        where: { tenantId: delivery.tenantId, id: delivery.notificationId },
      }),
      device = await db.devicePushToken.findUniqueOrThrow({
        where: { id: delivery.deviceId },
      });
    const activeSession = await db.authSession.findFirst({
      where: {
        userId: device.userId,
        familyId: device.familyId,
        revokedAt: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE" },
      },
    });
    const pref = await db.notificationPreference.findUnique({
      where: {
        tenantId_userId: { tenantId: n.tenantId, userId: n.recipientUserId },
      },
    });
    const categoryEnabled =
      n.type === "GRADE_PUBLISHED"
        ? pref?.grades
        : n.type === "ATTENDANCE_FINALIZED_ABSENT"
          ? pref?.attendance
          : n.type === "CLASS_SCHEDULE_CHANGED"
            ? pref?.schedule
            : pref?.finance;
    const consent = process.env.PRIVACY_POLICY_VERSION
      ? await db.privacyConsent.findFirst({
          where: {
            tenantId: n.tenantId,
            consentingUserId: n.recipientUserId,
            subjectStudentId: n.subjectStudentId,
            purposeCode: "NOTIFICATIONS",
            policyVersion: process.env.PRIVACY_POLICY_VERSION,
            granted: true,
            revokedAt: null,
          },
        })
      : null;
    if (
      !consent ||
      device.userId !== n.recipientUserId ||
      !activeSession ||
      device.status !== "ACTIVE" ||
      !pref?.pushEnabled ||
      categoryEnabled === false ||
      !(await notificationAuthorized(db, n))
    ) {
      await db.pushDelivery.update({
        where: { id: delivery.id },
        data: { status: "SUPPRESSED" },
      });
      continue;
    }
    if (process.env.PUSH_PROVIDER !== "expo") {
      await db.pushDelivery.update({
        where: { id: delivery.id },
        data: { status: "NOT_CONFIGURED" },
      });
      continue;
    }
    const claimed = await db.pushDelivery.updateMany({
      where: { id: delivery.id, status: "PENDING" },
      data: {
        status: "SENDING",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (!claimed.count) continue;
    try {
      const response = await request("https://exp.host/--/api/v2/push/send", {
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
      if (response.status === 429 || response.status >= 500) {
        await db.pushDelivery.update({
          where: { id: delivery.id },
          data: { status: "PENDING" },
        });
        throw new Error("PUSH_RETRYABLE_REJECTION");
      }
      if (!response.ok) {
        await db.pushDelivery.update({
          where: { id: delivery.id },
          data: { status: "FAILED" },
        });
        continue;
      }
      const ticket = ticketSchema.parse(await response.json()).data;
      if (ticket.status === "error") {
        const invalid = ticket.details?.error === "DeviceNotRegistered";
        await db.$transaction([
          db.pushDelivery.update({
            where: { id: delivery.id },
            data: { status: invalid ? "INVALID" : "FAILED" },
          }),
          ...(invalid
            ? [
                db.devicePushToken.update({
                  where: { id: device.id },
                  data: { status: "INVALID" },
                }),
              ]
            : []),
        ]);
      } else if (ticket.id)
        await db.pushDelivery.update({
          where: { id: delivery.id },
          data: { status: "ACCEPTED", providerRef: ticket.id },
        });
      else
        await db.pushDelivery.update({
          where: { id: delivery.id },
          data: { status: "UNKNOWN" },
        });
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message === "PUSH_RETRYABLE_REJECTION"
      )
        throw cause;
      // Expo has no send-idempotency contract: uncertain acceptance must not blindly resend.
      await db.pushDelivery.update({
        where: { id: delivery.id },
        data: { status: "UNKNOWN" },
      });
    }
  }
}
export async function checkPushReceipts(
  db: PrismaClient,
  request: typeof fetch = fetch,
) {
  await db.pushDelivery.updateMany({
    where: {
      OR: [
        {
          status: "SENDING",
          lastAttemptAt: { lt: new Date(Date.now() - 60000) },
        },
        {
          status: "ACCEPTED",
          lastAttemptAt: { lt: new Date(Date.now() - 86400000) },
        },
      ],
    },
    data: { status: "UNKNOWN" },
  });
  if (process.env.PUSH_PROVIDER !== "expo") return;
  const rows = await db.pushDelivery.findMany({
    where: {
      status: "ACCEPTED",
      lastAttemptAt: { lt: new Date(Date.now() - 15000) },
    },
    take: 100,
  });
  if (!rows.length) return;
  const response = await request(
    "https://exp.host/--/api/v2/push/getReceipts",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ ids: rows.map((r) => r.providerRef) }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) return;
  const receipts = z
    .object({
      data: z.record(
        z.string(),
        z.object({
          status: z.enum(["ok", "error"]),
          details: z.object({ error: z.string().optional() }).optional(),
        }),
      ),
    })
    .parse(await response.json());
  for (const row of rows) {
    const receipt = row.providerRef
      ? receipts.data[row.providerRef]
      : undefined;
    if (!receipt) continue;
    const invalid = receipt.details?.error === "DeviceNotRegistered";
    await db.pushDelivery.update({
      where: { id: row.id },
      data: {
        status:
          receipt.status === "ok" ? "SENT" : invalid ? "INVALID" : "FAILED",
      },
    });
    if (invalid)
      await db.devicePushToken.update({
        where: { id: row.deviceId },
        data: { status: "INVALID" },
      });
  }
  // A crash after claiming a send has an unknown provider outcome; never treat it as delivered.
}
