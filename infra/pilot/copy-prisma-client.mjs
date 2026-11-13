import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  realpathSync,
  readdirSync,
  readFileSync,
  existsSync,
  copyFileSync,
  chmodSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const source = dirname(
  require.resolve(".prisma/client/package.json", {
    paths: [
      dirname(realpathSync(require.resolve("@prisma/client/package.json"))),
    ],
  }),
);
for (const destination of process.argv.slice(2)) {
  const client = realpathSync(
    resolve(destination, "node_modules/@prisma/client"),
  );
  cpSync(source, resolve(client, "../../.prisma/client"), { recursive: true });
}

// Offline production installation intentionally does not run postinstall.
// Package the verified build's native engines before entering read-only runtime;
// never make runtime writable or download binaries from the isolated network.
const buildPrisma = createRequire(require.resolve("prisma/package.json"));
const migration = createRequire(
  "/runtime-migration/packages/migration-cli/package.json",
);
const migrationPrisma = createRequire(migration.resolve("prisma/package.json"));
const engineSource = dirname(
  buildPrisma.resolve("@prisma/engines/package.json"),
);
const engineDestination = dirname(
  migrationPrisma.resolve("@prisma/engines/package.json"),
);
const binaries = readdirSync(engineSource).filter(
  (name) =>
    (/^schema-engine-/.test(name) ||
      /^libquery_engine-.*\.so\.node$/.test(name)) &&
    statSync(resolve(engineSource, name)).isFile(),
);
assert(
  binaries.some((name) => name.startsWith("schema-engine-")),
  "Schema engine missing from verified build",
);
for (const name of binaries) {
  const sourceFile = resolve(engineSource, name),
    destinationFile = resolve(engineDestination, name);
  if (existsSync(destinationFile)) {
    assert.equal(
      createHash("sha256").update(readFileSync(destinationFile)).digest("hex"),
      createHash("sha256").update(readFileSync(sourceFile)).digest("hex"),
    );
  } else {
    copyFileSync(sourceFile, destinationFile);
    chmodSync(destinationFile, statSync(sourceFile).mode & 0o777);
  }
}
console.log(`PILOT_MIGRATION_ENGINES_PACKAGED ${binaries.length}`);
