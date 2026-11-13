import { cpSync, mkdirSync } from "node:fs";

// Preserve workspace paths and the exact reviewed lockfile. Do not re-resolve a
// deploy graph or copy dev dependencies, source, tooling, tests or agent caches.
mkdirSync("/runtime", { recursive: true });
for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
  cpSync(name, `/runtime/${name}`);
}
for (const name of [
  "apps/api",
  "apps/worker",
  "packages/contracts",
  "packages/server-crypto",
]) {
  mkdirSync(`/runtime/${name}`, { recursive: true });
  cpSync(`${name}/package.json`, `/runtime/${name}/package.json`);
  cpSync(`${name}/dist`, `/runtime/${name}/dist`, { recursive: true });
}
mkdirSync("/runtime-migration/packages/migration-cli", { recursive: true });
for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
  cpSync(name, `/runtime-migration/${name}`);
}
cpSync(
  "packages/migration-cli/package.json",
  "/runtime-migration/packages/migration-cli/package.json",
);
