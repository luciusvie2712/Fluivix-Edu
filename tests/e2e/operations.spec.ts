import { expect, test, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { totp } from "../../apps/api/src/platform.security";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;

async function healthSession(page: Page) {
  const value = process.env.E2E_DATABASE_URL;
  if (
    !value ||
    !["localhost", "127.0.0.1"].includes(new URL(value).hostname) ||
    !new URL(value).pathname.endsWith("_test")
  )
    throw new Error("Owned isolated operations browser database required");
  const db = new PrismaClient({ datasourceUrl: value });
  let email: string;
  try {
    const source = await db.platformUser.findUniqueOrThrow({
      where: { email: "platform@example.test" },
    });
    email = "operations-" + randomUUID() + "@example.test";
    await db.platformUser.create({
      data: {
        email,
        displayName: "Quản trị kiểm thử vận hành",
        passwordHash: source.passwordHash,
        recoveryHashes: [],
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page.goto(testOrigins.platform + "/platform/login");
  await page.getByLabel("Email quản trị").fill(email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Thiết lập xác thực hai bước",
      exact: true,
    }),
  ).toBeVisible();
  const secret = (await page.locator(".secret code").textContent())!;
  await page
    .getByLabel("Mã xác minh")
    .fill(totp(secret, Math.floor(Date.now() / 30000)));
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lưu mã khôi phục", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Đã lưu mã, tiếp tục", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tổng quan nền tảng", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Tình trạng hệ thống", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Worker đang hoạt động; chưa thấy dấu hiệu bất thường",
  );
}

test("operational health real transport failure hides cached metrics and verified retry restores them", async ({
  page,
}) => {
  await healthSession(page);
  const pattern = "**/api/v1/platform/system-health";
  await page.route(pattern, (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Kiểm tra lại", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Không thể kết nối" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Giám sát worker và hàng đợi",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByTestId("health-checked-at")).toHaveCount(0);
  await page.unroute(pattern);
  const refreshed = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/platform/system-health") && r.status() === 200,
  );
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  const result = await (await refreshed).json();
  expect(result.data.worker.status).toBe("HEALTHY");
  await expect(page.getByTestId("health-checked-at")).toHaveText(
    new Date(result.data.checkedAt).toLocaleString("vi-VN"),
  );
  await expect(
    page.getByRole("heading", { name: "Email tài khoản", exact: true }),
  ).toBeVisible();
});

test("platform logout aborts delayed actual health bytes and prevents cached telemetry returning", async ({
  page,
}) => {
  await healthSession(page);
  const pattern = "**/api/v1/platform/system-health";
  let release!: () => void, arrived!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let finished!: () => void;
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  await page.route(pattern, async (route) => {
    try {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      arrived();
      await barrier;
      await route.fulfill({ response }).catch(() => {});
    } finally {
      finished();
    }
  });
  try {
    await page
      .getByRole("button", { name: "Kiểm tra lại", exact: true })
      .click();
    await ready;
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page).toHaveURL(testOrigins.platform + "/platform/login");
    release();
    await done;
    await expect(
      page.getByRole("heading", { name: "Đăng nhập nền tảng", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("health-checked-at")).toHaveCount(0);
    await page.goto(testOrigins.platform + "/platform/system-health");
    await expect(page).toHaveURL(testOrigins.platform + "/platform/login");
    await expect(
      page.getByRole("heading", { name: "Giám sát worker", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
    await done;
    await page.unroute(pattern);
  }
});

for (const motion of ["no-preference", "reduce"] as const)
  for (const width of [360, 768, 1024, 1440])
    test(`real worker queue health visual accessibility ${width} ${motion}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: motion });
      await healthSession(page);
      for (const name of [
        "Email tài khoản",
        "Thông báo nghiệp vụ",
        "Sinh lịch định kỳ",
      ])
        await expect(
          page.getByRole("heading", { name, exact: true }),
        ).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const refresh = page.getByRole("button", {
        name: "Kiểm tra lại",
        exact: true,
      });
      await refresh.focus();
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/v1/platform/system-health") &&
          r.status() === 200,
      );
      await page.keyboard.press("Enter");
      const actual = await (await response).json();
      await expect(refresh).toBeEnabled();
      await expect(refresh).toBeFocused();
      expect(actual.data.worker.queues).toHaveLength(3);
      await expect(page.getByTestId("health-checked-at")).toHaveText(
        new Date(actual.data.checkedAt).toLocaleString("vi-VN"),
      );
      mkdirSync("docs/release/evidence/operations", { recursive: true });
      await reviewTaste(
        page,
        `docs/release/evidence/operations/health-${width}-${motion}-taste.json`,
      );
      await page.screenshot({
        path: `docs/release/evidence/operations/health-${width}-${motion}.png`,
        fullPage: true,
      });
    });
