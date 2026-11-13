import assert from "node:assert/strict";
import { cpSync, mkdirSync } from "node:fs";

assert(process.platform === "linux" && process.cwd() === "/app");
// Retain the reviewed workspace layout and frozen graph. Install only this
// package's production closure. Do not re-resolve a
// deploy graph or copy host dependencies, app source, fixtures, keys or .env.
mkdirSync("/runtime-backup/packages/backup-cli", { recursive: true });
for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
  cpSync(name, `/runtime-backup/${name}`);
}
cpSync(
  "packages/backup-cli/package.json",
  "/runtime-backup/packages/backup-cli/package.json",
);
cpSync("packages/backup-cli/dist", "/runtime-backup/packages/backup-cli/dist", {
  recursive: true,
});
