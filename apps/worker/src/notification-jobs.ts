import { Prisma, type PrismaClient } from "@prisma/client";
import { UnrecoverableError, type Queue } from "bullmq";
import { DOMAIN_EVENTS, deliverDomainEvent } from "./notifications";

export async function processNotificationJob(
  db: PrismaClient,
  eventId: string,
  request: typeof fetch = fetch,
) {
  let failure:
    | "PUSH_RETRY_EXHAUSTED"
    | "PUSH_RETRYABLE_REJECTION"
    | "NOTIFICATION_DELIVERY_FAILED";
  try {
    await deliverDomainEvent(db, eventId, request);
    return;
  } catch (cause) {
    // Redis failedReason/stacktrace must not retain raw Prisma/provider data.
    failure =
      cause instanceof Error && cause.message === "PUSH_RETRY_EXHAUSTED"
        ? "PUSH_RETRY_EXHAUSTED"
        : cause instanceof Error && cause.message === "PUSH_RETRYABLE_REJECTION"
          ? "PUSH_RETRYABLE_REJECTION"
          : "NOTIFICATION_DELIVERY_FAILED";
  }
  // Cross the queue boundary with the classified public failure only.
  if (failure === "PUSH_RETRY_EXHAUSTED") throw new UnrecoverableError(failure);
  throw new Error(failure);
}

export async function enqueueNotificationPage(
  db: PrismaClient,
  queue: Pick<Queue<{ eventId: string }>, "add">,
  now = new Date(),
) {
  const options = {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: false,
  } as const;
  const events = await db.outboxEvent.findMany({
    where: { processedAt: null, eventType: { in: DOMAIN_EVENTS } },
    select: { id: true },
    take: 50,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const event of events)
    await queue.add(
      "deliver",
      { eventId: event.id },
      { ...options, jobId: event.id },
    );
  // A committed inbox event may still need a known-rejected retry after Redis
  // loss/restart. Database due time and attempt identity survive the queue.
  const pending = await db.$queryRaw<
    { id: string; eventId: string; attempts: number }[]
  >(Prisma.sql`
    SELECT d.id,d.event_id AS "eventId",d.attempts
    FROM notification_deliveries d JOIN outbox_events e ON e.tenant_id=d.tenant_id AND e.id=d.event_id
    WHERE d.canonical AND d.status='PENDING' AND d.attempts<5
      AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=${now})
      AND e.processed_at IS NOT NULL AND e.event_type IN (${Prisma.join(DOMAIN_EVENTS)})
    ORDER BY d.next_attempt_at ASC NULLS FIRST,d.id LIMIT 50
  `);
  for (const row of pending)
    await queue.add(
      "deliver",
      { eventId: row.eventId },
      { ...options, jobId: `${row.eventId}-${row.id}-${row.attempts + 1}` },
    );
  return { eventCandidates: events.length, deliveryCandidates: pending.length };
}
