import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { nextSendAt } from "./notification-claims";

const receiptsSchema = z.object({
  data: z.record(
    z.string(),
    z.object({
      status: z.enum(["ok", "error"]),
      details: z.object({ error: z.string().optional() }).optional(),
    }),
  ),
});

/** SENT is the legacy name for provider handoff, never proof of device display. */
export async function checkPushReceipts(
  db: PrismaClient,
  request: typeof fetch = fetch,
  now = new Date(),
) {
  await db.pushDelivery.updateMany({
    where: {
      OR: [
        {
          status: "SENDING",
          lastAttemptAt: { lt: new Date(now.getTime() - 60000) },
        },
        {
          status: "ACCEPTED",
          OR: [
            { lastAttemptAt: { lt: new Date(now.getTime() - 86400000) } },
            { receiptChecks: { gte: 8 } },
          ],
        },
      ],
    },
    data: { status: "UNKNOWN", nextReceiptAt: null },
  });
  if (process.env.PUSH_PROVIDER !== "expo") return;
  const due = await db.pushDelivery.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { nextReceiptAt: { lte: now } },
        {
          nextReceiptAt: null,
          OR: [
            { lastAttemptAt: { lte: new Date(now.getTime() - 15 * 60000) } },
            { lastAttemptAt: null },
          ],
        },
      ],
    },
    orderBy: [
      { nextReceiptAt: { sort: "asc", nulls: "first" } },
      { id: "asc" },
    ],
    take: 100,
  });
  const claimed: typeof due = [];
  for (const row of due) {
    if (!row.providerRef) {
      await db.pushDelivery.updateMany({
        where: { id: row.id, status: "ACCEPTED", providerRef: null },
        data: { status: "UNKNOWN", nextReceiptAt: null },
      });
      continue;
    }
    const delay = Math.min(
      6 * 3600000,
      15 * 60000 * 2 ** Math.min(row.receiptChecks, 5),
    );
    const changed = await db.pushDelivery.updateMany({
      where: {
        id: row.id,
        status: "ACCEPTED",
        receiptChecks: row.receiptChecks,
        nextReceiptAt: row.nextReceiptAt,
      },
      data: {
        receiptChecks: { increment: 1 },
        nextReceiptAt: new Date(now.getTime() + delay),
      },
    });
    if (changed.count) claimed.push(row);
  }
  if (!claimed.length) return;
  let receipts: z.infer<typeof receiptsSchema>;
  try {
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
        body: JSON.stringify({ ids: claimed.map((row) => row.providerRef) }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) return;
    receipts = receiptsSchema.parse(await response.json());
  } catch {
    return;
  } // Receipt query failure cannot block outbox dispatch or imply send failure.
  for (const row of claimed) {
    const receipt = row.providerRef
      ? receipts.data[row.providerRef]
      : undefined;
    if (!receipt) continue;
    const invalid = receipt.details?.error === "DeviceNotRegistered";
    const retry =
      receipt.status === "error" &&
      receipt.details?.error === "MessageRateExceeded" &&
      row.canonical &&
      row.attempts < 5;
    await db.$transaction(async (tx) => {
      const changed = await tx.pushDelivery.updateMany({
        where: { id: row.id, status: "ACCEPTED", providerRef: row.providerRef },
        data: {
          status:
            receipt.status === "ok"
              ? "SENT"
              : invalid
                ? "INVALID"
                : retry
                  ? "PENDING"
                  : "FAILED",
          nextReceiptAt: null,
          nextAttemptAt: retry ? nextSendAt(row.attempts) : null,
        },
      });
      if (changed.count && invalid && row.deviceVersion !== null)
        await tx.devicePushToken.updateMany({
          where: {
            id: row.deviceId,
            userId: row.recipientUserId,
            version: row.deviceVersion,
            status: "ACTIVE",
          },
          data: { status: "INVALID" },
        });
    });
  }
}
