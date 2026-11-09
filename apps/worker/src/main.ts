import { enqueueFeeReminderPage } from "./fee-reminder-jobs";
import { PrismaClient } from "@prisma/client";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import { z } from "zod";
import { redisConnection } from "./redis";
import { mailProvider } from "./mail";
import { deliver, MAIL_EVENTS } from "./delivery";
import { purgeExpiredImports } from "./import-retention";
import { purgeExpiredPrivacyExports } from "./privacy-retention";
import { enqueueSchedulePage, generateScheduledRule } from "./schedule-jobs";
import { checkPushReceipts } from "./notifications";
import {
  enqueueNotificationPage,
  processNotificationJob,
} from "./notification-jobs";
async function main() {
  const provider = mailProvider();
  const origin = new URL(z.url().parse(process.env.WEB_ORIGIN));
  if (
    provider === "mailpit" &&
    !["localhost", "127.0.0.1"].includes(origin.hostname)
  )
    throw new Error("Local mail testing requires a local web origin");
  const connection = redisConnection(process.env.REDIS_URL);
  const db = new PrismaClient();
  await db.$connect();
  const prefix = z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,100}$/)
    .parse(process.env.QUEUE_PREFIX ?? "fluivixedu");
  const scheduleGenerationEnabled =
    z
      .enum(["true", "false"])
      .default("true")
      .parse(process.env.SCHEDULE_GENERATION_ENABLED) === "true";
  const queue = new Queue<{ eventId: string }>("identity-mail", {
    connection,
    prefix,
  });
  const notificationQueue = new Queue<{ eventId: string }>(
    "domain-notifications",
    { connection, prefix },
  );
  const scheduleQueue = new Queue<{ ruleId: string }>("schedule-generation", {
    connection,
    prefix,
  });
  const scheduleWorker = new Worker<{ ruleId: string }>(
    "schedule-generation",
    (job) => generateScheduledRule(db, z.uuid().parse(job.data.ruleId)),
    { connection, prefix, concurrency: 1, autorun: scheduleGenerationEnabled },
  );
  scheduleWorker.on("error", () =>
    console.error(JSON.stringify({ code: "SCHEDULE_WORKER_CONNECTION_ERROR" })),
  );
  scheduleWorker.on("failed", (job) =>
    console.error(
      JSON.stringify({
        code: "SCHEDULE_JOB_FAILED",
        ruleId: job?.data.ruleId ?? null,
      }),
    ),
  );
  let scheduleCursor: string | undefined,
    lastScheduleDispatch = 0;
  const notificationWorker = new Worker<{ eventId: string }>(
    "domain-notifications",
    (job) => processNotificationJob(db, z.uuid().parse(job.data.eventId)),
    { connection, prefix, concurrency: 2 },
  );
  notificationWorker.on("error", () =>
    console.error(
      JSON.stringify({ code: "NOTIFICATION_WORKER_CONNECTION_ERROR" }),
    ),
  );
  notificationWorker.on("failed", () =>
    console.error(JSON.stringify({ code: "NOTIFICATION_JOB_FAILED" })),
  );
  const worker = new Worker<{ eventId: string }>(
    "identity-mail",
    async (job) => {
      const eventId = z.uuid().parse(job.data.eventId);
      const event = await db.outboxEvent.findUniqueOrThrow({
        where: { id: eventId },
      });
      if (event.processedAt) return;
      await db.outboxEvent.update({
        where: { id: eventId },
        data: { attempts: { increment: 1 } },
      });
      try {
        await deliver(db, eventId, origin.toString());
      } catch (error) {
        if (error instanceof Error && error.message === "MAIL_OUTCOME_UNKNOWN")
          throw new UnrecoverableError("MAIL_OUTCOME_UNKNOWN");
        throw new Error("MAIL_DELIVERY_FAILED", { cause: error });
      }
    },
    { connection, prefix, concurrency: 4 },
  );
  worker.on("failed", (job) => {
    console.error(
      JSON.stringify({
        code: "MAIL_JOB_FAILED",
        eventId: job?.data.eventId ?? null,
      }),
    );
  });
  let lastConnectionReport = 0,
    connectionFailures = 0;
  worker.on("error", () => {
    connectionFailures++;
    if (Date.now() - lastConnectionReport > 30000) {
      console.error(
        JSON.stringify({
          code: "MAIL_WORKER_CONNECTION_ERROR",
          count: connectionFailures,
        }),
      );
      lastConnectionReport = Date.now();
      connectionFailures = 0;
    }
  });
  try {
    await Promise.all([
      worker.waitUntilReady(),
      notificationWorker.waitUntilReady(),
      scheduleWorker.waitUntilReady(),
    ]);
  } catch (cause) {
    await worker.close(true);
    await notificationWorker.close(true);
    await scheduleWorker.close(true);
    await notificationQueue.close();
    await scheduleQueue.close();
    await queue.close();
    await db.$disconnect();
    throw new Error("MAIL_WORKER_NOT_READY", { cause });
  }
  let reminderCursor: string | undefined;
  let dispatching = false;
  let lastImportSweep = 0;
  async function dispatch() {
    if (dispatching) return;
    dispatching = true;
    try {
      if (
        scheduleGenerationEnabled &&
        Date.now() - lastScheduleDispatch >= 60000
      ) {
        const result = await enqueueSchedulePage(
          db,
          scheduleQueue,
          scheduleCursor,
        );
        scheduleCursor = result.cursor;
        lastScheduleDispatch = Date.now();
      }
      if (Date.now() - lastImportSweep >= 60000) {
        await purgeExpiredImports(db);
        await purgeExpiredPrivacyExports(db);
        lastImportSweep = Date.now();
      }
      const events = await db.outboxEvent.findMany({
        where: {
          processedAt: null,
          attempts: { lt: 5 },
          eventType: { in: MAIL_EVENTS },
        },
        select: { id: true },
        take: 50,
        orderBy: { createdAt: "asc" },
      });
      for (const event of events)
        await queue.add(
          "deliver",
          { eventId: event.id },
          {
            jobId: event.id,
            attempts: 5,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { age: 86400 },
            removeOnFail: false,
          },
        );
      const reminders = await enqueueFeeReminderPage(db, reminderCursor);
      reminderCursor = reminders.cursor;
      await enqueueNotificationPage(db, notificationQueue);
      await checkPushReceipts(db);
    } catch {
      console.error(JSON.stringify({ code: "MAIL_DISPATCH_FAILED" }));
    } finally {
      dispatching = false;
    }
  }
  await dispatch();
  const timer = setInterval(() => void dispatch(), 1000);
  async function stop() {
    clearInterval(timer);
    await worker.close();
    await notificationWorker.close();
    await notificationQueue.close();
    await scheduleWorker.close();
    await scheduleQueue.close();
    await queue.close();
    await db.$disconnect();
  }
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}
void main().catch(() => {
  console.error(JSON.stringify({ code: "WORKER_STARTUP_FAILED" }));
  process.exitCode = 1;
});
