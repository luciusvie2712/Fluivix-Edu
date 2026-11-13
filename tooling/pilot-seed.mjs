// Explicit synthetic pilot fixture, invoked over stdin; never part of an app image.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/app/apps/api/package.json");
const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("/app/apps/api/dist/auth.service.js");
const runtime = JSON.parse(readFileSync("/run/secrets/runtime", "utf8"));
const url = new URL(runtime.DATABASE_URL);
assert.equal(url.hostname, "postgres");
assert.equal(url.pathname, "/fluivixedu_pilot");
assert.equal(url.username, "fluivix_app");
const db = new PrismaClient({ datasourceUrl: runtime.DATABASE_URL });
try {
  assert.equal(
    await db.tenant.count(),
    0,
    "Pilot seed requires an empty synthetic database",
  );
  assert.equal(await db.user.count(), 0);
  assert.equal(await db.platformUser.count(), 0);
  const passwordHash = await hashPassword(
    readFileSync("/run/secrets/smoke_password", "utf8"),
  );
  await db.$transaction(async (tx) => {
    const plan = await tx.plan.create({
      data: {
        code: "SYNTHETIC_PILOT",
        name: "Synthetic pilot only",
        monthlyPriceVnd: 0n,
        limitsJson: {
          maxStudents: 100,
          maxUsers: 100,
          maxClasses: 100,
          maxStorageBytes: "104857600",
        },
        featureFlagsJson: {
          attendance: true,
          grades: true,
          finance: true,
          reports: true,
        },
      },
    });
    for (const [suffix, tenantId] of [
      ["a", "20000000-0000-4000-8000-000000000001"],
      ["b", "20000000-0000-4000-8000-000000000002"],
    ]) {
      await tx.tenant.create({
        data: {
          id: tenantId,
          slug: `synthetic-pilot-${suffix}`,
          name: `Synthetic pilot ${suffix}`,
          status: "ACTIVE",
          subscriptionEndsAt: new Date(Date.now() + 86400000 * 2),
          graceUntil: new Date(Date.now() + 86400000 * 3),
        },
      });
      await tx.subscription.create({
        data: {
          tenantId,
          planId: plan.id,
          startsAt: new Date(Date.now() - 60000),
          endsAt: new Date(Date.now() + 86400000 * 2),
          graceUntil: new Date(Date.now() + 86400000 * 3),
        },
      });
      const user = await tx.user.create({
        data: {
          email: `pilot-${suffix}@example.test`,
          displayName: `Synthetic owner ${suffix}`,
          passwordHash,
          status: "ACTIVE",
        },
      });
      await tx.membership.create({
        data: {
          tenantId,
          userId: user.id,
          status: "ACTIVE",
          roles: { create: { role: "owner" } },
        },
      });
      await tx.student.create({
        data: {
          tenantId,
          studentCode: `PILOT-${suffix.toUpperCase()}`,
          fullName: `Synthetic student ${suffix}`,
        },
      });
    }
    await tx.platformUser.create({
      data: {
        email: "pilot-platform@example.test",
        displayName: "Synthetic platform",
        passwordHash,
        recoveryHashes: [],
      },
    });
  });
  console.log("PILOT_SYNTHETIC_SEED_PASS two isolated tenants; no real data");
} catch {
  console.error("PILOT_SYNTHETIC_SEED_FAILED");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
