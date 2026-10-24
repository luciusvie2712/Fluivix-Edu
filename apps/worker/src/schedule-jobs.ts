import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { UnrecoverableError, type Queue } from "bullmq";
import { TeachingService } from "../../api/dist/teaching.service";

const localDay = (timezone: string, now: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

/** Trusted internal job, not an HTTP identity. System audit has actor NULL.
 * Reuses the exact API scheduling transaction/policy; never mints a user token. */
export async function generateScheduledRule(
  db: PrismaClient,
  ruleId: string,
  now = new Date(),
) {
  try {
    const rule = await db.scheduleRule.findFirst({
      where: { id: ruleId, active: true },
    });
    if (!rule) return { status: "SKIPPED_INACTIVE", created: 0 };
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: rule.tenantId },
    });
    const from = localDay(tenant.timezone, now);
    if (rule.validTo.toISOString().slice(0, 10) < from)
      return { status: "SKIPPED_EXPIRED", created: 0 };
    const to = new Date(Date.parse(from + "T00:00:00Z") + 59 * 86400000)
      .toISOString()
      .slice(0, 10);
    const value = await new TeachingService(db).generateRule(
      { tenantId: rule.tenantId },
      rule.classId,
      ruleId,
      { from, to },
      randomUUID(),
      true,
    );
    return {
      status: "GENERATED",
      created: value.created,
      skipped: value.skipped,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      "getStatus" in error &&
      typeof error.getStatus === "function"
    ) {
      const status: unknown = error.getStatus();
      if ([403, 404, 409, 422].includes(Number(status)))
        throw new UnrecoverableError(
          status === 409
            ? "SCHEDULE_CONFLICT_REQUIRES_REVIEW"
            : "SCHEDULE_POLICY_REQUIRES_REVIEW",
        );
    }
    // BullMQ stores failureReason; never persist raw Prisma/connection errors there.
    throw new Error("SCHEDULE_GENERATION_FAILED", { cause: error });
  }
}

export async function enqueueSchedulePage(
  db: PrismaClient,
  queue: Queue<{ ruleId: string }>,
  cursor?: string,
  now = new Date(),
) {
  const rules = await db.scheduleRule.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
    take: 50,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, tenantId: true, version: true, validTo: true },
  });
  const tenants = await db.tenant.findMany({
    where: { id: { in: [...new Set(rules.map((v) => v.tenantId))] } },
    select: { id: true, timezone: true, status: true },
  });
  let enqueued = 0;
  for (const rule of rules) {
    const tenant = tenants.find((v) => v.id === rule.tenantId);
    if (!tenant || !["ACTIVE", "PAST_DUE_GRACE"].includes(tenant.status))
      continue;
    const today = localDay(tenant.timezone, now);
    if (rule.validTo.toISOString().slice(0, 10) < today) continue;
    await queue.add(
      "generate",
      { ruleId: rule.id },
      {
        jobId: `${rule.id}-${rule.version}-${today}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 172800 },
        removeOnFail: false,
      },
    );
    enqueued++;
  }
  return { cursor: rules.at(-1)?.id, enqueued };
}
