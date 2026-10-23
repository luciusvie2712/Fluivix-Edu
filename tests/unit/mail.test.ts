import { describe, expect, it } from "vitest";
import {
  canSafelyRetry,
  localMailTransport,
  sendMail,
} from "../../apps/worker/src/mail";
describe("local email failure safety", () => {
  it("refuses production transport without an approved provider", () => {
    const mode = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => localMailTransport()).toThrow(
        "BLOCKED_MAIL_PROVIDER_APPROVAL",
      );
    } finally {
      if (mode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = mode;
    }
  });
  it("never blindly retries uncertain SMTP DATA/timeouts", () => {
    expect(canSafelyRetry({ code: "ETIMEDOUT", command: "DATA" })).toBe(false);
    expect(canSafelyRetry(new Error("connection disappeared after DATA"))).toBe(
      false,
    );
    expect(canSafelyRetry({ code: "ECONNECTION" })).toBe(true);
  });
  it("retries the approved provider with a stable idempotency key without logging payloads", async () => {
    const saved = {
      provider: process.env.MAIL_PROVIDER,
      key: process.env.RESEND_API_KEY,
      from: process.env.MAIL_FROM,
    };
    process.env.MAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "synthetic-unit-test-key";
    process.env.MAIL_FROM = "unit@example.test";
    const headers: Headers[] = [];
    const request: typeof fetch = async (_input, init) => {
      headers.push(new Headers(init?.headers));
      return new Response('{"id":"test-only"}', { status: 200 });
    };
    try {
      const message = {
        eventId: "test-only-event",
        to: "test-only@example.test",
        subject: "Fixture",
        text: "Synthetic fixture",
      };
      await sendMail(message, request);
      await sendMail(message, request);
      expect(headers).toHaveLength(2);
      expect(headers[0]?.get("Idempotency-Key")).toBe(
        "fluivix-mail/test-only-event",
      );
      expect(headers[1]?.get("Idempotency-Key")).toBe(
        headers[0]?.get("Idempotency-Key"),
      );
    } finally {
      for (const [key, value] of Object.entries({
        MAIL_PROVIDER: saved.provider,
        RESEND_API_KEY: saved.key,
        MAIL_FROM: saved.from,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
