import { testOrigins, mailLinkPattern } from "../../tooling/test-origins";
import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
test("login, choose A, switch B with no old student data, logout", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("/tenant/select");
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Trung tâm kiểm thử A" }),
    })
    .getByRole("button", { name: "Chủ trung tâm" })
    .click();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử B", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Đổi trung tâm / vai trò" }).click();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Trung tâm kiểm thử B" }),
    })
    .getByRole("button", { name: "Chủ trung tâm" })
    .click();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử B", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/app/students");
  await expect(page).toHaveURL("/login");
});
for (const width of [360, 768, 1024, 1440])
  test(`login accessibility and screenshot ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Đăng nhập" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    mkdirSync("docs/ai/evidence/web", { recursive: true });
    const normal = await page.screenshot({
      path: testInfo.outputPath(`login-${width}.png`),
      fullPage: true,
    });
    writeFileSync(`docs/ai/evidence/web/login-${width}.png`, normal);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const button = page.getByRole("button", { name: "Đăng nhập", exact: true });
    await button.focus();
    await expect(button).toBeFocused();
    const reduced = await page.screenshot({
      path: testInfo.outputPath(`login-${width}-reduced.png`),
      fullPage: true,
    });
    writeFileSync(`docs/ai/evidence/web/login-${width}-reduced.png`, reduced);
  });
test("inline validation and missing invitation token never submit", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("Nhập địa chỉ email hợp lệ.")).toBeVisible();
  await page.goto("/invite/accept");
  await expect(
    page.getByRole("button", { name: "Kích hoạt lời mời", exact: true }),
  ).toBeDisabled();
});
test("Taste app inspection of the live login page", async () => {
  test.setTimeout(60000);
  execFileSync(
    process.execPath,
    [
      ".agents/skills/design-taste-frontend/scripts/inspect.mjs",
      "--app",
      testOrigins.web + "/login",
      "--out",
      "docs/ai/evidence/taste-login",
      "--widths",
      "1440,768,390",
    ],
    { stdio: "pipe", timeout: 55000 },
  );
});
test("forgot password sends through real worker and Mailpit, reset link is one-use", async ({
  page,
}) => {
  const searchUrl =
    "http://127.0.0.1:8025/api/v1/search?query=" +
    encodeURIComponent(
      'to:owner@example.test subject:"Đặt lại mật khẩu FluivixEdu"',
    );
  const previous = await fetch(searchUrl).then((response) => response.json());
  const previousIds = new Set(
    previous.messages.map((message: { ID: string }) => message.ID),
  );
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page
    .getByRole("button", { name: "Quên mật khẩu", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Nếu tài khoản phù hợp");
  let id = "";
  await expect
    .poll(
      async () => {
        const data = await fetch(
          "http://127.0.0.1:8025/api/v1/search?query=" +
            encodeURIComponent(
              'to:owner@example.test subject:"Đặt lại mật khẩu FluivixEdu"',
            ),
        ).then((response) => response.json());
        id =
          data.messages.find(
            (message: { ID: string }) => !previousIds.has(message.ID),
          )?.ID ?? "";
        return !!id;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const message = await fetch(
    `http://127.0.0.1:8025/api/v1/message/${id}`,
  ).then((response) => response.json());
  const link = String(message.Text).match(
    mailLinkPattern("/reset-password"),
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL("/reset-password");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026-new");
  await page
    .getByRole("button", { name: "Đặt lại mật khẩu", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã đổi mật khẩu");
  await page.goto(link!);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026-new");
  await page
    .getByRole("button", { name: "Đặt lại mật khẩu", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "không hợp lệ",
  );
});
test("staff invitation activates a new account from the actual delivered email", async ({
  page,
}) => {
  const recipient = `invite-${Date.now()}@example.test`;
  const headers = {
    "Content-Type": "application/json",
    Origin: testOrigins.web,
  };
  const signedIn = await fetch(testOrigins.api + "/api/v1/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: "inviter@example.test",
      password: "Fluivix-Test-Password-2026",
    }),
  }).then((response) => response.json());
  const selected = await fetch(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      method: "POST",
      headers: {
        ...headers,
        Authorization: `Bearer ${signedIn.data.accessToken}`,
      },
      body: JSON.stringify({
        tenantId: "10000000-0000-4000-8000-000000000001",
        role: "owner",
      }),
    },
  ).then((response) => response.json());
  const created = await fetch(testOrigins.api + "/api/v1/staff", {
    method: "POST",
    headers: {
      ...headers,
      Authorization: `Bearer ${selected.data.accessToken}`,
    },
    body: JSON.stringify({ email: recipient, role: "academic_staff" }),
  });
  expect(created.status).toBe(201);
  let messageId = "";
  await expect
    .poll(
      async () => {
        const result = await fetch(
          "http://127.0.0.1:8025/api/v1/search?query=" +
            encodeURIComponent("to:" + recipient),
        ).then((response) => response.json());
        messageId = result.messages[0]?.ID ?? "";
        return !!messageId;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const message = await fetch(
    "http://127.0.0.1:8025/api/v1/message/" + messageId,
  ).then((response) => response.json());
  const link = String(message.Text).match(
    mailLinkPattern("/invite/accept"),
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
  await page.getByLabel("Họ và tên").fill("Nhân sự kiểm thử");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Invitation-Test-Password-2026");
  await page
    .getByRole("button", { name: "Kích hoạt lời mời", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã kích hoạt lời mời");
  await page
    .getByRole("status")
    .getByRole("link", { name: "Về đăng nhập" })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(recipient);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Invitation-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("/tenant/select");
  await page.getByRole("button", { name: "Giáo vụ", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
});
