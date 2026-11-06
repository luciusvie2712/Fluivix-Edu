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

/** Full app inspection through Playwright's existing browser transport.
 * Uses the audited general/layout/app rules and scrolling frame probes unchanged.
 * General/layout exclusions follow upstream --app mode; app findings are not waived.
 */
export async function inspectTasteApp(
  page: Page,
  output: string,
  widths = [1440, 1024, 768, 390, 360],
) {
  const root = path.resolve(".agents/skills/design-taste-frontend/scripts/lib");
  const probes: unknown = requireSkill(path.join(root, "probe.mjs"));
  const rules: unknown = requireSkill(path.join(root, "rules.mjs"));
  const exports = z.record(z.string(), z.unknown()).parse(rules);
  if (!(exports.APP_SKIP instanceof Set))
    throw new Error("Audited Taste APP_SKIP export missing");
  const skip = exports.APP_SKIP;
  const findings: z.infer<typeof findingSchema> = [];
  const viewports: unknown[] = [];
  mkdirSync(output, { recursive: true });
  const frameSchema = z.object({
    filled: z.number(),
    covered: z.array(z.object({ text: z.string() })).default([]),
    clipped: z.array(z.object({ text: z.string() })).default([]),
  });
  for (const width of widths) {
    const height = width === 768 ? 1024 : width < 600 ? 844 : 900;
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    const initial = await page.evaluate(exportedFunction(probes, "probe"));
    const size = z
      .object({ page: z.object({ height: z.number() }) })
      .parse(initial);
    const frames: z.infer<typeof frameSchema>[] = [];
    const screens = Math.min(
      11,
      Math.max(0, Math.ceil(size.page.height / height) - 1),
    );
    const fold = await page.screenshot({
      path: path.join(output, `${width}-fold.png`),
    });
    for (let screen = 0; screen <= screens; screen++) {
      await page.evaluate(
        (top) => window.scrollTo({ top, behavior: "instant" }),
        screen * height,
      );
      if (screen) {
        await page.mouse.wheel(0, 2);
        await page.screenshot({
          path: path.join(output, `${width}-screen-${screen}.png`),
        });
      }
      frames.push(
        frameSchema.parse(
          await page.evaluate(exportedFunction(probes, "frame")),
        ),
      );
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const metrics = await page.evaluate(exportedFunction(probes, "probe"));
    const layout = await page.evaluate(exportedFunction(probes, "layout"));
    const app = z
      .record(z.string(), z.unknown())
      .parse(await page.evaluate(exportedFunction(probes, "app")));
    app.colourShare = await page.evaluate(
      exportedFunction(probes, "colourShare"),
      "data:image/png;base64," + fold.toString("base64"),
    );
    const options = { width, allow: [] };
    const general = findingSchema.parse(
      exportedFunction(rules, "judge")(metrics, options),
    );
    const layoutFindings = findingSchema.parse(
      exportedFunction(rules, "judgeLayout")(layout, options),
    );
    const appFindings = findingSchema.parse(
      exportedFunction(rules, "judgeApp")(app, metrics, options),
    );
    findings.push(
      ...general
        .concat(layoutFindings)
        .filter(
          (finding) =>
            !skip.has(finding.id) &&
            !["no-title", "small-title"].includes(finding.id),
        ),
      ...appFindings,
    );
    for (const [field, id] of [
      ["covered", "covered-text"],
      ["clipped", "clipped-text"],
    ] as const) {
      const affected = frames.flatMap((frame) => frame[field]);
      if (affected.length)
        findings.push({
          level: "FAIL",
          id,
          width,
          message: affected.map((item) => item.text).join("; "),
          fix: "Keep text visible and unclipped at every scroll position.",
        });
    }
    viewports.push({ width, height, metrics, layout, app, frames });
  }
  writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(
      {
        sourceSha: "6010f91a9935f1c167dfc500fb1a475681892e6b",
        transport: "existing Playwright browser",
        viewports,
        findings,
      },
      null,
      2,
    ),
  );
  const failures = findings.filter((finding) => finding.level === "FAIL");
  if (failures.length)
    throw new Error("Taste app inspection: " + JSON.stringify(failures));
}
