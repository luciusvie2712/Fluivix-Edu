import { PrismaClient } from "@prisma/client";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import { z } from "zod";
import { mailProvider } from "./mail";
import { deliver, MAIL_EVENTS } from "./delivery";
async function main() {
  const provider = mailProvider();
  const origin = new URL(z.url().parse(process.env.WEB_ORIGIN));
  if (
    provider === "mailpit" &&
    !["localhost", "127.0.0.1"].includes(origin.hostname)
  )
    throw new Error("Local mail testing requires a local web origin");
  const redis = new URL(z.url().parse(process.env.REDIS_URL));
  if (!["redis:", "rediss:"].includes(redis.protocol))
    throw new Error("Unsupported Redis scheme");
  const connection = {
    host: redis.hostname,
    port: Number(redis.port || "6379"),
    ...(redis.password ? { password: decodeURIComponent(redis.password) } : {}),
    ...(redis.username ? { username: decodeURIComponent(redis.username) } : {}),
    ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
  };
  const db = new PrismaClient();
  await db.$connect();
  const prefix = z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,100}$/)
    .parse(process.env.QUEUE_PREFIX ?? "fluivixedu");
  const queue = new Queue<{ eventId: string }>("identity-mail", {
    connection,
    prefix,
  });
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
    await worker.waitUntilReady();
  } catch (cause) {
    await worker.close(true);
    await queue.close();
    await db.$disconnect();
    throw new Error("MAIL_WORKER_NOT_READY", { cause });
  }
  let dispatching = false;
  async function dispatch() {
    if (dispatching) return;
    dispatching = true;
    try {
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
