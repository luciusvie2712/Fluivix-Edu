import nodemailer from "nodemailer";
import { z } from "zod";
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  eventId: string;
}
export function localMailTransport() {
  if (!["development", "test"].includes(process.env.NODE_ENV ?? ""))
    throw new Error("BLOCKED_MAIL_PROVIDER_APPROVAL");
  // Local Mailpit only. A remote production provider requires explicit approval and a separate driver.
  return nodemailer.createTransport({
    host: "127.0.0.1",
    port: 1025,
    secure: false,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}
export function mailProvider(): "mailpit" | "resend" {
  const provider = process.env.MAIL_PROVIDER ?? "mailpit";
  if (provider === "mailpit") {
    localMailTransport().close();
    return provider;
  }
  if (provider !== "resend") throw new Error("INVALID_MAIL_PROVIDER");
  z.string().min(10).parse(process.env.RESEND_API_KEY);
  z.email().parse(process.env.MAIL_FROM);
  return provider;
}
export async function sendMail(
  message: MailMessage,
  request: typeof fetch = fetch,
) {
  if (mailProvider() === "mailpit") return sendLocalMail(message);
  try {
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `fluivix-mail/${message.eventId}`,
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("MAIL_PROVIDER_REJECTED");
    const receipt: unknown = await response.json();
    z.object({ id: z.string().min(1) }).parse(receipt);
    return receipt;
  } catch (cause) {
    throw Object.assign(new Error("MAIL_PROVIDER_RETRY", { cause }), {
      code: "PROVIDER_IDEMPOTENT_RETRY",
    });
  }
}
export async function sendLocalMail(message: MailMessage) {
  const transport = localMailTransport();
  try {
    return await transport.sendMail({
      from: "noreply@fluivixedu.test",
      to: message.to,
      subject: message.subject,
      text: message.text,
      messageId: `<${message.eventId}@fluivixedu.test>`,
    });
  } finally {
    transport.close();
  }
}
export function canSafelyRetry(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  // All other errors may have happened after SMTP DATA acceptance: stop for review instead of double sending.
  return [
    "ECONNECTION",
    "EDNS",
    "EAUTH",
    "ETLS",
    "PROVIDER_IDEMPOTENT_RETRY",
  ].includes(String(error.code));
}
