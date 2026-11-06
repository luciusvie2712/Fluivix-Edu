import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const project = new URL("../apps/api/", import.meta.url);

// NestJS needs decorator metadata; tsx/esbuild does not emit it.
// Compile before each source-triggered restart and never serve a failed build.
const build = spawnSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"],
  { cwd: project, stdio: "inherit" },
);
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

await import(new URL("dist/main.js", project).href);
