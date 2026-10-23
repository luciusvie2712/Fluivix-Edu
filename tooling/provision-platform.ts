import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../apps/api/dist/auth.service";
// Operator-only bootstrap. Never expose this through a public API or seed production credentials.
async function run() {
  const email = z
    .email()
    .max(254)
    .parse(process.env.PLATFORM_BOOTSTRAP_EMAIL)
    .trim()
    .toLowerCase();
  const password = z
    .string()
    .min(16)
    .max(128)
    .parse(process.env.PLATFORM_BOOTSTRAP_PASSWORD);
  const displayName = z
    .string()
    .trim()
    .min(1)
    .max(150)
    .parse(process.env.PLATFORM_BOOTSTRAP_NAME);
  const db = new PrismaClient();
  try {
    await db.platformUser.create({
      data: {
        email,
        displayName,
        passwordHash: await hashPassword(password),
        recoveryHashes: [],
      },
    });
    process.stdout.write(
      "Platform identity created. MFA enrollment required on first login.\n",
    );
  } finally {
    await db.$disconnect();
  }
}
void run().catch(() => {
  process.stderr.write(
    "Provisioning failed; existing identities are never overwritten.\n",
  );
  process.exitCode = 1;
});
