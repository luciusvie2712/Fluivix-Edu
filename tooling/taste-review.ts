import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { z } from "zod";
const requireSkill = createRequire(path.resolve("package.json"));
const findingSchema = z.array(
  z.object({
    level: z.enum(["FAIL", "WARN"]),
    id: z.string(),
    message: z.string(),
    fix: z.string(),
    width: z.number(),
  }),
);
function exportedFunction(
  module: unknown,
  name: string,
): (...args: unknown[]) => unknown {
  if (
    !module ||
    typeof module !== "object" ||
    !(name in module) ||
    typeof Reflect.get(module, name) !== "function"
  )
    throw new Error("Audited Taste export missing: " + name);
  return Reflect.get(module, name) as (...args: unknown[]) => unknown;
}
// Use the unmodified audited skill's browser probes on the already authenticated page.
// No cookies/tokens are exported to an auxiliary browser or written to disk.
export async function reviewTaste(page: Page, output: string) {
  const root = path.resolve(".agents/skills/design-taste-frontend/scripts/lib");
  const probes: unknown = requireSkill(path.join(root, "probe.mjs"));
  const rules: unknown = requireSkill(path.join(root, "rules.mjs"));
  const metrics = await page.evaluate(exportedFunction(probes, "probe"));
  const app = await page.evaluate(exportedFunction(probes, "app"));
  const findings = findingSchema.parse(
    exportedFunction(rules, "judgeApp")(app, metrics, {
      width: page.viewportSize()?.width,
    }),
  );
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      { sourceSha: "6010f91a9935f1c167dfc500fb1a475681892e6b", findings },
      null,
      2,
    ),
  );
  const failures = findings.filter((finding) => finding.level === "FAIL");
  if (failures.length)
    throw new Error("Taste app review: " + JSON.stringify(failures));
}
