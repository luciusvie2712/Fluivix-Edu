import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
function database() {
  const url = process.env.E2E_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw Error("Disposable browser database required");
  return new PrismaClient({ datasourceUrl: url });
}
async function fixture(db: PrismaClient) {
  const stamp = randomUUID().slice(0, 8),
    source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
  const tenant = await db.tenant.create({
    data: {
      slug: "settings-ui-" + stamp,
      name: "Trung tâm cài đặt kiểm thử",
      contactEmail: "centre@example.test",
      status: "ACTIVE",
      subscriptionEndsAt: new Date("2040-01-01Z"),
      graceUntil: new Date("2040-02-01Z"),
    },
  });
  const plan = await db.plan.findUniqueOrThrow({
    where: { code: "SYNTHETIC_TEST" },
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
  const actor = await db.user.create({
    data: {
      email: `settings-ui-${stamp}@example.test`,
      displayName: "Chủ trung tâm kiểm thử cài đặt",
      passwordHash: source.passwordHash,
      status: "ACTIVE",
    },
  });
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: actor.id,
      status: "ACTIVE",
      roles: {
        create: [{ role: "owner" }, { role: "manager" }, { role: "teacher" }],
      },
    },
  });
  return { tenant, actor };
}
async function login(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
  role = "owner",
) {
  const signed = await page.request.post(
    testOrigins.api + "/api/v1/auth/login",
    {
      headers: { Origin: testOrigins.web },
      data: { email: f.actor.email, password: "Fluivix-Test-Password-2026" },
    },
  );
  expect(signed.status()).toBe(200);
  const selected = await page.request.post(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      headers: {
        Origin: testOrigins.web,
        Authorization: "Bearer " + (await signed.json()).data.accessToken,
      },
      data: { tenantId: f.tenant.id, role },
    },
  );
  expect(selected.status()).toBe(200);
  await page.goto("/app/settings");
}
test("centre settings validates owner edits, clears contact and preserves unsaved values after actual version conflict until explicit reload", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveValue(
      f.tenant.name,
    );
    await page
      .getByRole("button", { name: "Lưu cấu hình trung tâm", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Kiểm tra các trường" }),
    ).toBeFocused();
    await expect(
      page.getByText("Nêu lý do thay đổi từ 10 ký tự.", { exact: true }).last(),
    ).toBeVisible();
    await page
      .getByLabel("Tên trung tâm", { exact: true })
      .fill("Trung tâm cập nhật thực tế");
    await page.getByLabel("Email liên hệ trung tâm", { exact: true }).fill("");
    await page
      .getByLabel("Lý do thay đổi cấu hình", { exact: true })
      .fill("Cập nhật email liên hệ đã được đối chiếu");
    await page
      .getByRole("button", { name: "Lưu cấu hình trung tâm", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Máy chủ đã lưu cấu hình phiên bản 2" }),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toContainText(
      "Trung tâm cập nhật thực tế",
    );
    expect(
      await db.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } }),
    ).toMatchObject({
      name: "Trung tâm cập nhật thực tế",
      contactEmail: null,
      settingsVersion: 2,
    });
    await page
      .getByLabel("Tên trung tâm", { exact: true })
      .fill("Nội dung người dùng chưa lưu");
    await expect(
      page.getByText("Nội dung đang sửa chưa được lưu.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Lý do thay đổi cấu hình", { exact: true })
      .fill("Giữ nguyên nội dung nhập khi gặp xung đột");
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { name: "Thay đổi đồng thời từ quản trị" },
    });
    const conflictResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/tenant/settings") &&
        response.request().method() === "PATCH",
    );
    await page
      .getByRole("button", { name: "Lưu cấu hình trung tâm", exact: true })
      .click();
    expect((await conflictResponse).status()).toBe(409);
    await expect(
      page.getByRole("alert").filter({ hasText: "Cấu hình đã thay đổi" }),
    ).toBeVisible();
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveValue(
      "Nội dung người dùng chưa lưu",
    );
    expect(
      await db.auditLog.count({
        where: { tenantId: f.tenant.id, action: "tenant.settings.updated" },
      }),
    ).toBe(1);
    page.on("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Tải lại cấu hình", exact: true })
      .click();
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveValue(
      "Thay đổi đồng thời từ quản trị",
    );
    await expect(
      page.getByLabel("Lý do thay đổi cấu hình", { exact: true }),
    ).toHaveValue("");
  } finally {
    await db.$disconnect();
  }
});
test("centre settings respects manager and read-only roles, removes editor data on real transport failure and supports retry", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f, "manager");
    await expect(
      page.getByLabel("Tên trung tâm", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Lưu cấu hình trung tâm", exact: true }),
    ).toHaveCount(0);
    await login(page, f);
    await expect(
      page.getByLabel("Tên trung tâm", { exact: true }),
    ).toBeEnabled();
    await page.route("**/api/v1/tenant/settings", (route) =>
      route.abort("internetdisconnected"),
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Thử lại cấu hình", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveCount(
      0,
    );
    await page.unroute("**/api/v1/tenant/settings");
    await page
      .getByRole("button", { name: "Thử lại cấu hình", exact: true })
      .click();
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveValue(
      f.tenant.name,
    );
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(
      page.getByLabel("Tên trung tâm", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Sử dụng và hạn mức", exact: true }),
    ).toBeVisible();
    await login(page, f, "teacher");
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("alert").filter({ hasText: "không có quyền" }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
test("a slow real profile refresh after a saved centre edit cannot restore settings after queued logout", async ({
  page,
}) => {
  const db = database();
  let release = () => {};
  try {
    const f = await fixture(db);
    await login(page, f);
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveValue(
      f.tenant.name,
    );
    let observed = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let intercepted = false;
    await page.route("**/api/v1/auth/web-session", async (route) => {
      if (intercepted) {
        await route.continue();
        return;
      }
      intercepted = true;
      const actual = await route.fetch();
      expect(actual.status()).toBe(200);
      observed = true;
      await gate;
      await route.fulfill({ response: actual });
    });
    await page
      .getByLabel("Tên trung tâm", { exact: true })
      .fill("Trung tâm đã lưu trước đăng xuất");
    await page
      .getByLabel("Lý do thay đổi cấu hình", { exact: true })
      .fill("Đối chiếu phiên khi phản hồi cập nhật chậm");
    await page
      .getByRole("button", { name: "Lưu cấu hình trung tâm", exact: true })
      .click();
    await expect.poll(() => observed).toBe(true);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Máy chủ đã lưu cấu hình phiên bản 2" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Cấu hình máy chủ đã thay đổi" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    release();
    await expect(page).toHaveURL("/login");
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveCount(
      0,
    );
    expect(
      await db.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } }),
    ).toMatchObject({
      name: "Trung tâm đã lưu trước đăng xuất",
      settingsVersion: 2,
    });
    await page.goto("/app/settings");
    await expect(page).toHaveURL("/login");
    await expect(page.getByLabel("Tên trung tâm", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    release();
    await db.$disconnect();
  }
});
for (const mode of ["no-preference", "reduce"] as const) {
  test(`centre settings and real usage keep keyboard access and readable boundaries across four widths (${mode})`, async ({
    page,
  }) => {
    const db = database();
    try {
      const f = await fixture(db);
      await db.educationClass.create({
        data: {
          tenantId: f.tenant.id,
          code: "UI-SETTINGS",
          name: "Lớp giữ nguyên múi giờ",
          capacity: 15,
          startDate: new Date("2030-01-01Z"),
          endDate: new Date("2030-12-31Z"),
        },
      });
      await db.student.create({
        data: {
          tenantId: f.tenant.id,
          studentCode: "UI-SETTINGS",
          fullName: "Học viên kiểm thử hạn mức",
        },
      });
      await login(page, f);
      await expect(
        page.getByLabel("Múi giờ trung tâm (IANA)", { exact: true }),
      ).toHaveAttribute("readonly", "");
      await expect(
        page.getByRole("cell", { name: "Lớp hoạt động/nháp", exact: true }),
      ).toBeVisible();
      mkdirSync("docs/release/evidence/tenant-settings", { recursive: true });
      await page.emulateMedia({ reducedMotion: mode });
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        if (width === 360) {
          const table = page.getByRole("region", {
            name: "Bảng sử dụng thực tế, có thể cuộn ngang",
            exact: true,
          });
          await table.focus();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => table.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await table.evaluate((element) => {
            element.scrollLeft = 0;
          });
        }
        if (width === 1440) {
          const price = await page
            .getByText("Giá tháng", { exact: true })
            .boundingBox();
          expect(price).not.toBeNull();
          if (price) expect(price.y + price.height).toBeLessThanOrEqual(900);
        }
        await page.getByLabel("Tên trung tâm", { exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(
          page.getByLabel("Email liên hệ trung tâm", { exact: true }),
        ).toBeFocused();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await reviewTaste(
          page,
          `docs/release/evidence/tenant-settings/settings-${mode}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/tenant-settings/settings-${mode}-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      await db.$disconnect();
    }
  });
}
