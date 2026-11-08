import { test, expect, type Page } from "./fixtures";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
async function openGuardians(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("inviter@example.test");
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
    .getByRole("link", { name: "Phụ huynh và quan hệ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Phụ huynh và quan hệ học viên",
      exact: true,
    }),
  ).toBeVisible();
}
test("guardian administration verifies a relationship, activates through real email and revokes child access", async ({
  page,
  request,
  browser,
}) => {
  await openGuardians(page);
  const email = `guardian-web-${Date.now()}@example.test`;
  await page.getByLabel("Email phụ huynh", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Ghi nhận hồ sơ", exact: true })
    .click();
  await page
    .getByRole("link", {
      name: `Mở hồ sơ ${email} để ghi nhận quan hệ`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: email, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Xác minh ít nhất một quan hệ học viên trước khi gửi lời mời.",
    ),
  ).toBeVisible();
  await page.getByLabel("Tìm học viên theo tên hoặc mã").fill("TEST-001");
  await expect(
    page.getByLabel("Học viên", { exact: true }).locator("option"),
  ).toHaveCount(2);
  const studentId = await page
    .getByLabel("Học viên", { exact: true })
    .locator("option")
    .last()
    .getAttribute("value");
  expect(studentId).toBeTruthy();
  await page.getByLabel("Học viên", { exact: true }).selectOption(studentId!);
  await page
    .getByRole("button", { name: "Ghi nhận quan hệ", exact: true })
    .click();
  await expect(
    page.getByText("Cha / mẹ · Chờ xác minh · Phiên bản 1"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Xem chi tiết quan hệ", exact: true })
    .click();
  await page
    .getByLabel("Căn cứ xác minh quan hệ")
    .fill("Đã kiểm tra giấy tờ quan hệ trong luồng kiểm thử");
  const approve = page.locator("form").filter({
    has: page.getByRole("button", { name: "Duyệt quan hệ", exact: true }),
  });
  await expect(approve.getByRole("button")).toBeDisabled();
  await approve.getByRole("checkbox").check();
  await approve.getByRole("button").click();
  await expect(
    page.getByText("Cha / mẹ · Đang hoạt động · Phiên bản 2"),
  ).toBeVisible();
  await expect(
    page.getByText(/Duyệt quan hệ · Đang hoạt động · Phiên bản 2/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Gửi lời mời phụ huynh", exact: true })
    .click();
  await expect(
    page.getByText("Đã ghi nhận lời mời và đưa email vào hàng đợi gửi."),
  ).toBeVisible();
  let invitation = "";
  await expect
    .poll(
      async () => {
        const search = await request.get(
          "http://127.0.0.1:8025/api/v1/search?query=" +
            encodeURIComponent("to:" + email),
        );
        const id = (await search.json()).messages?.[0]?.ID;
        if (!id) return false;
        const content = await (
          await request.get("http://127.0.0.1:8025/api/v1/message/" + id)
        ).json();
        invitation =
          String(content.Text).match(
            /https?:\/\/[^\s]+\/invite\/accept#token=[A-Za-z0-9_-]{43}/,
          )?.[0] ?? "";
        return !!invitation;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const recipient = await browser.newContext();
  try {
    const acceptance = await recipient.newPage();
    await acceptance.goto(invitation);
    await acceptance
      .getByLabel("Họ và tên")
      .fill("Phụ huynh xác minh trình duyệt");
    await acceptance
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Guardian-Verified-Password-2026");
    await acceptance
      .getByRole("button", { name: "Kích hoạt lời mời", exact: true })
      .click();
    await expect(acceptance.getByRole("status")).toContainText(
      "Đã kích hoạt lời mời",
    );
  } finally {
    await recipient.close();
  }
  const login = await request.post(
    testOrigins.api + "/api/v1/mobile/auth/login",
    { data: { email, password: "Guardian-Verified-Password-2026" } },
  );
  expect(login.ok()).toBe(true);
  const switched = await request.post(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      headers: {
        Authorization: "Bearer " + (await login.json()).data.accessToken,
      },
      data: {
        tenantId: "10000000-0000-4000-8000-000000000001",
        role: "guardian",
      },
    },
  );
  expect(switched.ok()).toBe(true);
  const headers = {
    Authorization: "Bearer " + (await switched.json()).data.accessToken,
  };
  const profileUrl =
    testOrigins.api + `/api/v1/mobile/guardian/students/${studentId}/profile`;
  expect((await request.get(profileUrl, { headers })).ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByText("Đã kích hoạt tài khoản phụ huynh", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Xem chi tiết quan hệ", exact: true })
    .click();
  const revoke = page.locator("form").filter({
    has: page.getByRole("button", { name: "Thu hồi quan hệ", exact: true }),
  });
  await revoke
    .getByLabel("Lý do thay đổi")
    .fill("Thu hồi quan hệ đã xác minh trong kiểm thử");
  await expect(revoke.getByRole("button")).toBeDisabled();
  await revoke.getByRole("checkbox").check();
  await revoke.getByRole("button").click();
  await expect(
    page.getByText("Cha / mẹ · Đã thu hồi · Phiên bản 3"),
  ).toBeVisible();
  expect((await request.get(profileUrl, { headers })).status()).toBe(404);
  const children = await request.get(
    testOrigins.api + "/api/v1/mobile/guardian/students",
    { headers },
  );
  expect((await children.json()).data).toEqual([]);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("guardian directory and detail remain accessible across widths and reduced motion", async ({
  page,
}) => {
  await openGuardians(page);
  const email = `guardian-visual-${Date.now()}@example.test`;
  await page.getByLabel("Email phụ huynh", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Ghi nhận hồ sơ", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: `Mở hồ sơ ${email} để ghi nhận quan hệ`,
      exact: true,
    }),
  ).toBeVisible();
  mkdirSync("docs/release/evidence/guardians", { recursive: true });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("region", { name: "Danh sách phụ huynh" }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `docs/release/evidence/guardians/directory-${width}.png`,
      fullPage: true,
    });
    await reviewTaste(
      page,
      `docs/release/evidence/guardians/directory-taste-${width}.json`,
    );
  }
  await page.setViewportSize({ width: 360, height: 900 });
  const directory = page.getByRole("region", { name: "Danh sách phụ huynh" });
  await directory.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => directory.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await page
    .getByRole("region", { name: "Danh sách phụ huynh" })
    .getByRole("link", { name: email, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ phụ huynh", exact: true }),
  ).toBeVisible();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(
      page.getByRole("heading", { name: "Quan hệ học viên và phụ huynh" }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `docs/release/evidence/guardians/detail-${width}.png`,
      fullPage: true,
    });
    await reviewTaste(
      page,
      `docs/release/evidence/guardians/detail-taste-${width}.json`,
    );
  }
});

test("guardian screens show empty, read-only, missing and forbidden states without stale profile data", async ({
  page,
}) => {
  const url = process.env.E2E_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw new Error("Isolated E2E database required");
  const db = new PrismaClient({ datasourceUrl: url });
  const tenantId = "10000000-0000-4000-8000-000000000001";
  try {
    await openGuardians(page);
    await page
      .getByLabel("Tìm tên hoặc email phụ huynh")
      .fill("no-synthetic-guardian-match");
    await expect(
      page.getByText("Chưa có phụ huynh phù hợp với bộ lọc."),
    ).toBeVisible();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(
      page.getByText("Trung tâm ở chế độ chỉ đọc. Các thay đổi đang bị khóa."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ghi nhận hồ sơ", exact: true }),
    ).toBeDisabled();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await page.goto("/app/guardians/00000000-0000-4000-8000-000000000099");
    await expect(
      page.getByRole("alert").filter({ hasText: "Không tìm thấy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Lời mời kích hoạt", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("accountant@example.test");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Fluivix-Test-Password-2026");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.getByRole("button", { name: "Kế toán", exact: true }).click();
    await expect(page).toHaveURL("/app/students");
    await expect(
      page.getByRole("link", { name: "Phụ huynh và quan hệ", exact: true }),
    ).toHaveCount(0);
    await page.goto("/app/guardians");
    await expect(
      page.getByText("Vai trò hiện tại không có quyền quản lý phụ huynh."),
    ).toBeVisible();
    await expect(
      page.getByLabel("Email phụ huynh", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await db.$disconnect();
  }
});
