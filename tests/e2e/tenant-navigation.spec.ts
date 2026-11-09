import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
const menu = (page: Page) =>
  page.getByRole("navigation", {
    name: "Điều hướng trung tâm",
    includeHidden: true,
  });
const toggle = (page: Page) =>
  page.getByRole("button", { name: /^(Mở|Đóng) menu trung tâm$/ });
async function fixture(page: Page) {
  const url = process.env.E2E_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw Error("Disposable browser database required");
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const suffix = randomUUID().slice(0, 8);
    const source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
    const actor = await db.user.create({
      data: {
        email: `navigation-${suffix}@example.test`,
        displayName: "Người kiểm tra điều hướng",
        passwordHash: source.passwordHash,
        status: "ACTIVE",
      },
    });
    const tenants = [];
    const plan = await db.plan.findUniqueOrThrow({
      where: { code: "SYNTHETIC_TEST" },
    });
    for (const label of ["A", "B"]) {
      const tenant = await db.tenant.create({
        data: {
          slug: `nav-${suffix}-${label.toLowerCase()}`,
          name: `Trung tâm điều hướng ${label}`,
          status: label === "A" ? "ACTIVE" : "READ_ONLY",
          subscriptionEndsAt: new Date("2040-01-01Z"),
          graceUntil: new Date("2040-02-01Z"),
        },
      });
      await db.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          startsAt: new Date("2020-01-01Z"),
          endsAt: new Date("2040-01-01Z"),
          graceUntil: new Date("2040-02-01Z"),
        },
      });
      await db.membership.create({
        data: {
          tenantId: tenant.id,
          userId: actor.id,
          status: "ACTIVE",
          roles: { create: [{ role: "owner" }, { role: "accountant" }] },
        },
      });
      tenants.push(tenant);
    }
    const signed = await page.request.post(
      testOrigins.api + "/api/v1/auth/login",
      {
        headers: { Origin: testOrigins.web },
        data: { email: actor.email, password: "Fluivix-Test-Password-2026" },
      },
    );
    expect(signed.status()).toBe(200);
    const switched = await page.request.post(
      testOrigins.api + "/api/v1/auth/switch-context",
      {
        headers: {
          Origin: testOrigins.web,
          Authorization: "Bearer " + (await signed.json()).data.accessToken,
        },
        data: { tenantId: tenants[0]!.id, role: "owner" },
      },
    );
    expect(switched.status()).toBe(200);
    await page.goto("/app/students");
    await expect(page.getByRole("banner")).toContainText(tenants[0]!.name);
    await expect(
      page.getByRole("heading", { name: "Học viên", exact: true }),
    ).toBeVisible();
    return tenants;
  } finally {
    await db.$disconnect();
  }
}

test("compact navigation keeps content in view, supports keyboard close and preserves an unsaved student draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await fixture(page);
  await expect(menu(page)).toBeHidden();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  expect(
    await page
      .locator("main h1")
      .evaluate((el) => el.getBoundingClientRect().top),
  ).toBeLessThan(320);
  await toggle(page).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Đăng xuất", exact: true }),
  ).toBeFocused();
  await toggle(page).focus();
  await page.keyboard.press("Enter");
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu(page).getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  await page.keyboard.press("Space");
  await menu(page).getByRole("link", { name: "Học viên", exact: true }).click();
  await expect(menu(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  await page.getByRole("link", { name: "Thêm học viên", exact: true }).click();
  const field = page.getByLabel("Họ và tên", { exact: true });
  await field.fill("Bản nháp cần được giữ");
  await toggle(page).click();
  await page.keyboard.press("Escape");
  await expect(field).toHaveValue("Bản nháp cần được giữ");
  await toggle(page).click();
  await expect(menu(page).locator('[aria-current="page"]')).toHaveText(
    "Học viên",
  );
  await menu(page)
    .getByRole("link", { name: "Tài khoản và phiên", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(menu(page)).toBeHidden();
  await toggle(page).click();
  await expect(menu(page).locator('[aria-current="page"]')).toHaveText(
    "Tài khoản và phiên",
  );
});

test("navigation resets across actual role and tenant switches while read-only, offline and logout remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const tenants = await fixture(page);
  await toggle(page).click();
  await menu(page)
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: tenants[0]!.name, exact: true }),
    })
    .getByRole("button", { name: "Kế toán", exact: true })
    .click();
  await expect(page.getByRole("banner")).toContainText("Kế toán");
  await expect(menu(page)).toBeHidden();
  await toggle(page).click();
  await expect(
    menu(page).getByRole("link", { name: "Nhân sự và quyền", exact: true }),
  ).toHaveCount(0);
  await expect(
    menu(page).getByRole("link", { name: "Lớp học và lịch học", exact: true }),
  ).toHaveCount(0);
  await expect(
    menu(page).getByRole("link", {
      name: "Thu tiền và phiếu thu",
      exact: true,
    }),
  ).toBeVisible();
  await menu(page)
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: tenants[1]!.name, exact: true }),
    })
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  await expect(page.getByRole("banner")).toContainText(tenants[1]!.name);
  await expect(menu(page)).toBeHidden();
  await expect(
    page.getByText("Trung tâm ở chế độ chỉ đọc. Các thay đổi đang bị khóa.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await expect(
    page.getByRole("alert").filter({ hasText: "Bạn đang ngoại tuyến" }),
  ).toBeVisible();
  await toggle(page).click();
  await expect(
    menu(page).getByRole("link", { name: "Nhân sự và quyền", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("desktop navigation remains visible and moving to compact returns focus from a hidden link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixture(page);
  await expect(toggle(page)).toBeHidden();
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole("link", { name: "Học viên", exact: true }).focus();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(menu(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(menu(page)).toBeVisible();
  await expect(toggle(page)).toBeHidden();
});

for (const reducedMotion of ["no-preference", "reduce"] as const)
  for (const width of [360, 768, 1024, 1440]) {
    test(`tenant navigation responsive visual and accessibility ${width} ${reducedMotion}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await fixture(page);
      const folder = "docs/release/evidence/tenant-navigation";
      mkdirSync(folder, { recursive: true });
      for (const state of width <= 1024 ? ["closed", "open"] : ["desktop"]) {
        if (state === "open") await toggle(page).click();
        await expect(menu(page)).toBeVisible({ visible: state !== "closed" });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (width <= 1024)
          expect(
            await toggle(page).evaluate(
              (el) => el.getBoundingClientRect().height,
            ),
          ).toBeGreaterThanOrEqual(44);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await reviewTaste(
          page,
          `${folder}/${width}-${reducedMotion}-${state}-taste.json`,
        );
        await page.screenshot({
          path: `${folder}/${width}-${reducedMotion}-${state}.png`,
          fullPage: true,
        });
      }
    });
  }
