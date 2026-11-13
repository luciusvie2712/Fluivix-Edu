import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Normalize Windows checkout transport ONLY inside the Linux build workspace.
// Published SQL in git remains byte-for-byte unchanged (canonical git blobs LF).
assert.equal(process.platform, "linux");
assert.equal(process.cwd(), "/app");
const root = "/app/infra/prisma/migrations";
let count = 0;
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = resolve(root, entry.name, "migration.sql");
  const source = readFileSync(file, "utf8");
  const canonical = source.replaceAll("\r\n", "\n");
  assert(!canonical.includes("\r"), "Unsupported SQL line ending");
  if (canonical !== source) writeFileSync(file, canonical);
  count++;
}
assert.equal(
  count,
  33,
  "Review the migration inventory before changing the pilot",
);
console.log("PILOT_MIGRATION_CANONICAL_LF_PASS 33 immutable SQL sources");
