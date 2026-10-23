import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { totp } from "../../apps/api/src/platform.security";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
const origin = "http://localhost:3001";
test("platform enrollment, persisted MFA session, recovery re-enrollment and logout", async ({
  page,
}) => {
  async function login() {
    await page.goto(origin + "/platform/login");
    await page.getByLabel("Email quản trị").fill("platform@example.test");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Fluivix-Test-Password-2026");
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  }
  await login();
  await expect(
    page.getByRole("heading", { name: "Thiết lập xác thực hai bước" }),
  ).toBeVisible();
  const secret = (await page.locator(".secret code").textContent())!;
  await page
    .getByLabel("Mã xác minh")
    .fill(totp(secret, Math.floor(Date.now() / 30000)));
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lưu mã khôi phục" }),
  ).toBeVisible();
  const codes = await page.locator(".recovery-codes code").allTextContents();
  expect(codes).toHaveLength(10);
  await page.getByRole("button", { name: "Đã lưu mã, tiếp tục" }).click();
  await expect(
    page.getByRole("heading", { name: "Tổng quan nền tảng" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Đang hoạt động", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "2", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Đang hoạt động", exact: true }),
  ).toBeVisible();
  mkdirSync("docs/ai/evidence/platform", { recursive: true });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `docs/ai/evidence/platform/overview-${width}.png`,
      fullPage: true,
    });
  }
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(origin + "/platform/login");
  await login();
  await expect(
    page.getByRole("heading", { name: "Xác thực hai bước", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mất thiết bị xác thực?" }).click();
  await page.getByLabel("Mã khôi phục", { exact: true }).fill(codes[0]!);
  await page
    .getByRole("button", { name: "Dùng mã khôi phục", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Thiết lập xác thực hai bước" }),
  ).toBeVisible();
  const nextSecret = (await page.locator(".secret code").textContent())!;
  expect(nextSecret).not.toBe(secret);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "docs/ai/evidence/platform/mfa-360.png",
    fullPage: true,
    mask: [page.locator(".secret")],
  });
  await page
    .getByLabel("Mã xác minh")
    .fill(totp(nextSecret, Math.floor(Date.now() / 30000)));
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lưu mã khôi phục" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đã lưu mã, tiếp tục" }).click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.goto(origin + "/platform/overview");
  await expect(page).toHaveURL(origin + "/platform/login");
});
for (const width of [360, 768, 1024, 1440])
  test(`platform login accessibility ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/platform/login");
    await expect(
      page.getByRole("button", { name: "Tiếp tục", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    mkdirSync("docs/ai/evidence/platform", { recursive: true });
    await page.screenshot({
      path: `docs/ai/evidence/platform/login-${width}.png`,
      fullPage: true,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const button = page.getByRole("button", { name: "Tiếp tục", exact: true });
    await button.focus();
    await expect(button).toBeFocused();
    await page.screenshot({
      path: `docs/ai/evidence/platform/login-${width}-reduced.png`,
      fullPage: true,
    });
  });
test("Taste browser inspector reviews separate platform login", async () => {
  execFileSync(
    process.execPath,
    [
      ".agents/skills/design-taste-frontend/scripts/inspect.mjs",
      "--app",
      origin + "/platform/login",
      "--out",
      "docs/ai/evidence/platform/taste-login",
      "--widths",
      "1440,768,390",
    ],
    { env: process.env, stdio: "pipe", timeout: 25000 },
  );
});
