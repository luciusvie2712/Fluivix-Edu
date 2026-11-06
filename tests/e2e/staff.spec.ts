import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;

async function openStaff(page: Page, email = "inviter@example.test") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Trung tâm kiểm thử A",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  await expect(page).toHaveURL("/app/students");
  await page
    .getByRole("link", { name: "Nhân sự và quyền", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nhân sự và quyền truy cập" }),
  ).toBeVisible();
}

test("staff directory, real invitation resend, roles and suspension are accessible and server confirmed", async ({
  page,
  request,
}) => {
  await openStaff(page);
  const email = `staff-${Date.now()}@example.test`;
  await page.getByLabel("Email người được mời").fill(email);
  await page.getByLabel("Vai trò được mời").selectOption("teacher");
  await page.getByRole("button", { name: "Gửi lời mời", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã tạo lời mời");
  await page.getByLabel("Tìm tên hoặc email nhân sự").fill(email);
  const invited = page
    .getByRole("region", { name: "Lịch sử lời mời" })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: email, exact: true }) });
  await expect(invited).toContainText("Chờ xác nhận");
  let previousMessage = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(
          "http://127.0.0.1:8025/api/v1/search?query=" +
            encodeURIComponent("to:" + email),
        );
        const result = await response.json();
        previousMessage = result.messages?.[0]?.ID ?? "";
        return !!previousMessage;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await invited.getByRole("button", { name: "Gửi lại", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Lịch sử lời mời" })
      .getByRole("cell", { name: /^Đã thu hồi/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Danh sách nhân sự" }),
  ).toContainText("Chờ kích hoạt");
  await page
    .getByRole("region", { name: "Danh sách nhân sự" })
    .getByRole("link")
    .click();
  await expect(
    page.getByRole("heading", { name: email, exact: true }),
  ).toBeVisible();
  const statusPanel = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Trạng thái thành viên",
      exact: true,
    }),
  });
  const changeStatus = async (status: string) => {
    await statusPanel.getByLabel("Trạng thái mới").selectOption(status);
    await expect(statusPanel.getByLabel("Trạng thái mới")).toHaveValue(status);
    await statusPanel
      .getByLabel("Lý do thay đổi")
      .fill("Xác nhận thao tác nhân sự qua trình duyệt");
    await statusPanel.getByRole("checkbox").check();
    await expect(statusPanel.getByLabel("Trạng thái mới")).toHaveValue(status);
    await statusPanel
      .getByRole("button", { name: "Lưu trạng thái", exact: true })
      .click();
  };
  await changeStatus("ACTIVE");
  await expect(statusPanel.getByRole("alert")).toBeVisible();
  // Activate using the latest real outbox email, then return to the owner's page.
  let link = "";
  await expect
    .poll(
      async () => {
        const found = await request.get(
          "http://127.0.0.1:8025/api/v1/search?query=" +
            encodeURIComponent("to:" + email),
        );
        const data = await found.json();
        const newest = data.messages?.find(
          (m: { ID: string }) => m.ID !== previousMessage,
        );
        if (!newest) return false;
        const message = await request.get(
          "http://127.0.0.1:8025/api/v1/message/" + newest.ID,
        );
        const content = await message.json();
        link =
          String(content.Text).match(
            /https?:\/\/[^\s]+\/invite\/accept#token=[A-Za-z0-9_-]{43}/,
          )?.[0] ?? "";
        return !!link;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const acceptance = await page.context().newPage();
  await acceptance.goto(link);
  await acceptance.getByLabel("Họ và tên").fill("Nhân sự vận hành mới");
  await acceptance
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Staff-Verified-Password-2026");
  await acceptance
    .getByRole("button", { name: "Kích hoạt lời mời", exact: true })
    .click();
  await expect(acceptance.getByRole("status")).toContainText(
    "Đã kích hoạt lời mời",
  );
  await acceptance.close();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Nhân sự vận hành mới", exact: true }),
  ).toBeVisible();
  const rolePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Phân quyền", exact: true }),
  });
  const add = rolePanel.locator("form").filter({
    has: page.getByRole("button", { name: "Gán vai trò", exact: true }),
  });
  await add.getByLabel("Vai trò bổ sung").selectOption("accountant");
  await add.getByLabel("Lý do thay đổi").fill("Bổ sung vai trò đã xác minh");
  await add.getByRole("checkbox").check();
  await add.getByRole("button", { name: "Gán vai trò", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Gỡ vai trò Kế toán", exact: true }),
  ).toBeDisabled();
  const remove = rolePanel.locator("form").filter({
    has: page.getByRole("button", {
      name: "Gỡ vai trò Kế toán",
      exact: true,
    }),
  });
  await remove
    .getByLabel("Lý do thay đổi")
    .fill("Thu hồi vai trò không còn cần thiết");
  await remove.getByRole("checkbox").check();
  let release!: () => void, received!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const committed = new Promise<void>((r) => {
    received = r;
  });
  await page.route("**/api/v1/staff/*/roles/accountant", async (route) => {
    const real = await route.fetch();
    received();
    await held;
    await route.fulfill({ response: real });
  });
  const removed = page.waitForResponse(
    (r) =>
      r.url().endsWith("/roles/accountant") &&
      r.request().method() === "DELETE",
  );
  await remove
    .getByRole("button", { name: "Gỡ vai trò Kế toán", exact: true })
    .click();
  await committed;
  await expect(statusPanel.getByLabel("Trạng thái mới")).toBeDisabled();
  release();
  const result = await removed;
  expect(result.status()).toBe(200);
  const state = await result.json();
  await expect(
    page.locator("main > p").filter({ hasText: email }),
  ).toContainText("Phiên bản " + state.data.version);
  await expect(
    page.getByRole("button", { name: "Gỡ vai trò Kế toán", exact: true }),
  ).toHaveCount(0);
  await changeStatus("SUSPENDED");
  await expect(page.getByText(/Tạm ngưng · Phiên bản/)).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 900 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/release/evidence/staff/detail-360.png",
    fullPage: true,
  });
  await reviewTaste(page, "docs/release/evidence/staff/detail-taste-360.json");
  const signed = await request.post(
    testOrigins.api + "/api/v1/mobile/auth/login",
    { data: { email, password: "Staff-Verified-Password-2026" } },
  );
  expect(signed.status()).toBe(200);
  const auth = await signed.json();
  const denied = await request.post(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      headers: { Authorization: "Bearer " + auth.data.accessToken },
      data: {
        tenantId: "10000000-0000-4000-8000-000000000001",
        role: "teacher",
      },
    },
  );
  expect(denied.status()).toBe(403);
});

test("teacher cannot open staff administration via a direct browser link", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("teaching-browser@example.test");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  const signed = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/auth/login") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Giáo viên", exact: true }),
  ).toBeDisabled();
  const auth = await (await signed).json();
  // The Web chooser intentionally sends teaching roles to Mobile. Persist a
  // genuine authorized context through the API to exercise the direct-link guard.
  const selected = await page.request.post(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      headers: {
        Origin: testOrigins.web,
        Authorization: "Bearer " + auth.data.accessToken,
      },
      data: {
        tenantId: "10000000-0000-4000-8000-000000000001",
        role: "teacher",
      },
    },
  );
  expect(selected.status()).toBe(200);
  await page.goto("/app/staff");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "không có quyền xem nhân sự",
  );
  await expect(page.getByLabel("Email người được mời")).toHaveCount(0);
});

test("staff directory has responsive keyboard access and no accessibility violations", async ({
  page,
}) => {
  await openStaff(page);
  mkdirSync("docs/release/evidence/staff", { recursive: true });
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
      path: `docs/release/evidence/staff/directory-${width}.png`,
      fullPage: true,
    });
    await reviewTaste(
      page,
      `docs/release/evidence/staff/directory-taste-${width}.json`,
    );
  }

  const region = page.getByRole("region", { name: "Danh sách nhân sự" });
  await page.setViewportSize({ width: 360, height: 900 });
  await region.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
});

test("self suspension commits, revokes the selected session and clears cached staff data", async ({
  page,
  request,
  context,
}) => {
  const url = process.env.E2E_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw new Error("Isolated E2E database required");
  const db = new PrismaClient({ datasourceUrl: url });
  const email = `handover-${Date.now()}@example.test`;
  try {
    // Synthetic bootstrap fixture; the invitation journey is separately tested
    // through real API, outbox and Mailpit above. No production seed is changed.
    const owner = await db.user.findUniqueOrThrow({
      where: { email: "inviter@example.test" },
    });
    const user = await db.user.create({
      data: {
        email,
        displayName: "Chủ kiểm thử bàn giao",
        status: "ACTIVE",
        passwordHash: owner.passwordHash,
      },
    });
    const membership = await db.membership.create({
      data: {
        tenantId: "10000000-0000-4000-8000-000000000001",
        userId: user.id,
        status: "ACTIVE",
        roles: { create: { role: "owner" } },
      },
    });
    const switched = page.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/switch-context") &&
        r.request().method() === "POST",
    );
    await openStaff(page, email);
    const selected = await (await switched).json();
    const second = await context.newPage();
    await second.goto("/app/staff");
    await expect(
      second.getByRole("heading", {
        name: "Nhân sự và quyền truy cập",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Tìm tên hoặc email nhân sự").fill(email);
    await page
      .getByRole("region", { name: "Danh sách nhân sự" })
      .getByRole("link")
      .click();
    const form = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Trạng thái thành viên",
        exact: true,
      }),
    });
    await form.getByLabel("Trạng thái mới").selectOption("SUSPENDED");
    await form
      .getByLabel("Lý do thay đổi")
      .fill("Tự tạm ngưng sau khi bàn giao đã xác nhận");
    await form.getByRole("checkbox").check();
    await form
      .getByRole("button", { name: "Lưu trạng thái", exact: true })
      .click();
    await expect(page).toHaveURL("/login");
    await expect(second).toHaveURL("/login");
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === "__Host-fluivix-refresh",
      ),
    ).toBe(false);
    expect(
      await db.authSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: membership.id } }))
        .status,
    ).toBe("SUSPENDED");
    expect(
      (
        await request.get(testOrigins.api + "/api/v1/staff", {
          headers: { Authorization: "Bearer " + selected.data.accessToken },
        })
      ).status(),
    ).toBe(401);
    await page.goto("/app/staff");
    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("heading", { name: "Chủ kiểm thử bàn giao", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});
