import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { openToken } from "@fluivix/server-crypto";
import {
  canSafelyRetry,
  mailProvider,
  sendMail,
  type MailMessage,
} from "./mail";
const payloadSchema = z.object({
  encryptedToken: z.string(),
  userId: z.uuid().optional(),
});
export const MAIL_EVENTS = ["INVITATION_CREATED", "PASSWORD_RESET_REQUESTED"];
export async function deliver(
  db: PrismaClient,
  eventId: string,
  webOrigin: string,
) {
  const event = await db.outboxEvent.findUniqueOrThrow({
    where: { id: eventId },
  });
  if (event.processedAt) return;
  const provider = mailProvider();
  // Provider idempotency keys expire after 24 hours. Stop rather than double send after that bound.
  if (
    provider === "resend" &&
    Date.now() - event.createdAt.getTime() >= 23 * 3600000
  )
    throw new Error("MAIL_OUTCOME_UNKNOWN");
  if (!MAIL_EVENTS.includes(event.eventType))
    throw new Error("UNSUPPORTED_EVENT_TYPE");
  const payload = payloadSchema.parse(event.payload);
  const token = openToken(payload.encryptedToken);
  let recipient: string;
  let route: string;
  let subject: string;
  if (event.eventType === "INVITATION_CREATED") {
    const invitation = await db.invitation.findUniqueOrThrow({
      where: { id: event.aggregateId },
    });
    if (invitation.usedAt || invitation.expiresAt <= new Date()) {
      await db.outboxEvent.update({
        where: { id: eventId },
        data: { processedAt: new Date() },
      });
      return;
    }
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: invitation.tenantId },
    });
    if (["SUSPENDED", "TERMINATED"].includes(tenant.status))
      throw new Error("TENANT_MAIL_RESTRICTED");
    recipient = invitation.email;
    route = "/invite/accept";
    subject = "Lời mời tham gia FluivixEdu";
  } else {
    const reset = await db.passwordResetToken.findUniqueOrThrow({
      where: { id: event.aggregateId },
    });
    if (reset.usedAt || reset.expiresAt <= new Date()) {
      await db.outboxEvent.update({
        where: { id: eventId },
        data: { processedAt: new Date() },
      });
      return;
    }
    const user = await db.user.findUniqueOrThrow({
      where: { id: reset.userId },
    });
    if (user.status !== "ACTIVE") throw new Error("USER_MAIL_RESTRICTED");
    recipient = user.email;
    route = "/reset-password";
    subject = "Đặt lại mật khẩu FluivixEdu";
  }
  const url = new URL(route, webOrigin);
  url.hash = new URLSearchParams({ token }).toString();
  const message: MailMessage = {
    to: recipient,
    subject,
    text: `Mở liên kết sau để tiếp tục:\n${url.toString()}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    eventId,
  };
  const acquired = await db.$transaction(async (tx) => {
    const delivery = await tx.mailDelivery.upsert({
      where: { eventId },
      create: { eventId },
      update: {},
    });
    if (delivery.status === "SENT") return false;
    const changed = await tx.mailDelivery.updateMany({
      where: {
        eventId,
        status: {
          in: provider === "resend" ? ["PENDING", "SENDING"] : ["PENDING"],
        },
      },
      data: { status: "SENDING" },
    });
    if (changed.count !== 1) throw new Error("MAIL_OUTCOME_UNKNOWN");
    return true;
  });
  if (!acquired) return;
  try {
    await sendMail(message);
  } catch (error) {
    const retry = canSafelyRetry(error);
    await db.mailDelivery.update({
      where: { eventId },
      data: { status: retry ? "PENDING" : "UNKNOWN" },
    });
    throw new Error(retry ? "MAIL_RETRYABLE" : "MAIL_OUTCOME_UNKNOWN", {
      cause: error,
    });
  }
  await db.$transaction([
    db.mailDelivery.update({
      where: { eventId },
      data: { status: "SENT", sentAt: new Date() },
    }),
    db.outboxEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    }),
  ]);
}
