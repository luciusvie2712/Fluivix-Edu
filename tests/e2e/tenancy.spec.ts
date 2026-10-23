import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { totp } from "../../apps/api/src/platform.security";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
async function capture(page: Page, name: string) {
  mkdirSync("docs/ai/evidence/tenancy", { recursive: true });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
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
      path: `docs/ai/evidence/tenancy/${name}-${width}.png`,
      fullPage: true,
    });
  }
}
test("platform creates plan and tenant, delivers owner invitation, activates and renews with isolation", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const code = "E2E_" + randomUUID().slice(0, 8).toUpperCase(),
    slug = "e2e-" + randomUUID().slice(0, 8),
    name = "Trung tâm " + slug,
    email = slug + "@example.test";
  await page.goto("http://localhost:3001/platform/login");
  await page
    .getByLabel("Email quản trị")
    .fill("platform-onboarding@example.test");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
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
  await page.getByRole("button", { name: "Đã lưu mã, tiếp tục" }).click();
  await page.getByRole("link", { name: "Gói dịch vụ", exact: true }).click();
  await page.getByLabel("Mã gói", { exact: true }).fill(code);
  await page
    .getByLabel("Tên gói", { exact: true })
    .fill("Gói onboarding kiểm thử");
  await page.getByLabel("Giá tháng (VND)", { exact: true }).fill("250000");
  await page.getByLabel("Giới hạn học viên hoạt động").fill("1");
  await page.getByLabel("Giới hạn lớp hoạt động").fill("1");
  await page.getByLabel("Giới hạn tài khoản").fill("2");
  await page.getByLabel("Tài chính", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Tạo gói", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã tạo gói dịch vụ");
  await expect(
    page.getByRole("cell", { name: code, exact: true }),
  ).toBeVisible();
  await capture(page, "plans");
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: code, exact: true }) }),
  ).not.toContainText("Tài chính");
  await page.getByRole("link", { name: "Trung tâm", exact: true }).click();
  await page.getByLabel("Tên trung tâm", { exact: true }).fill(name);
  await page.getByLabel("Mã đường dẫn (slug)").fill(slug);
  await page.getByLabel("Email owner", { exact: true }).fill(email);
  await page
    .getByLabel("Gói dịch vụ", { exact: true })
    .selectOption({ label: code + " · Gói onboarding kiểm thử" });
  const dates = await page.evaluate(() => {
    function local(days: number) {
      const d = new Date(Date.now() + days * 86400000);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }
    return {
      start: local(-1),
      end: local(30),
      grace: local(37),
      nextEnd: local(60),
      nextGrace: local(67),
    };
  });
  await page.getByLabel("Bắt đầu thuê bao", { exact: true }).fill(dates.start);
  await page.getByLabel("Kết thúc thuê bao", { exact: true }).fill(dates.end);
  await page.getByLabel("Kết thúc ân hạn", { exact: true }).fill(dates.grace);
  await capture(page, "tenants-create");
  await page
    .getByRole("button", { name: "Tạo trung tâm và mời owner", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Chi tiết trung tâm" }),
  ).toBeVisible();
  const tenantId = page.url().split("/").at(-1)!;
  await expect(
    page.getByTestId("tenant-status").filter({ hasText: "Chờ kích hoạt" }),
  ).toBeVisible();
  // Identify messages delivered after resend, never pick a stale pre-resend link.
  await expect
    .poll(
      async () => {
        const mailbox = await fetch(
          "http://127.0.0.1:8025/api/v1/search?query=" +
            encodeURIComponent("to:" + email),
        ).then((result) => result.json());
        return mailbox.messages.length;
      },
      { timeout: 15000 },
    )
    .toBe(1);
  const oldMailbox = await fetch(
    "http://127.0.0.1:8025/api/v1/search?query=" +
      encodeURIComponent("to:" + email),
  ).then((result) => result.json());
  const oldIds = new Set(
    oldMailbox.messages.map((message: { ID: string }) => message.ID),
  );
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Gửi lại lời mời owner" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Lời mời mới đã đưa vào hàng đợi",
  );
  let messageId = "";
  await expect
    .poll(
      async () => {
        const mailbox = await fetch(
          "http://127.0.0.1:8025/api/v1/search?query=" +
            encodeURIComponent("to:" + email),
        ).then((result) => result.json());
        messageId =
          mailbox.messages.find(
            (message: { ID: string }) => !oldIds.has(message.ID),
          )?.ID ?? "";
        return !!messageId;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const message = await fetch(
    "http://127.0.0.1:8025/api/v1/message/" + messageId,
  ).then((result) => result.json());
  const link = String(message.Text).match(
    /http:\/\/localhost:3000\/invite\/accept#token=[A-Za-z0-9_-]{43}/,
  )?.[0];
  expect(link).toBeTruthy();
  const owner = await context.newPage();
  await owner.goto(link!);
  await owner.getByLabel("Họ và tên").fill("Owner onboarding");
  await owner
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Onboarding-Owner-Password-2026");
  await owner
    .getByRole("button", { name: "Kích hoạt lời mời", exact: true })
    .click();
  await expect(owner.getByRole("status")).toContainText("Đã kích hoạt lời mời");
  await owner
    .getByRole("status")
    .getByRole("link", { name: "Về đăng nhập" })
    .click();
  await owner.getByLabel("Email", { exact: true }).fill(email);
  await owner
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Onboarding-Owner-Password-2026");
  await owner.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(owner).toHaveURL("http://localhost:3000/tenant/select");
  await expect(
    owner.getByRole("heading", { name: "Trung tâm kiểm thử A" }),
  ).toHaveCount(0);
  await owner
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  await owner.getByRole("link", { name: "Gói dịch vụ", exact: true }).click();
  await expect(
    owner.getByRole("heading", { name: "Gói onboarding kiểm thử" }),
  ).toBeVisible();
  await capture(owner, "tenant-plan");
  await page.getByRole("button", { name: "Làm mới thông tin" }).click();
  await expect(
    page.getByTestId("tenant-status").filter({ hasText: "Đang hoạt động" }),
  ).toBeVisible();
  await capture(page, "tenant-detail");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Làm mới thông tin" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Bạn đang ngoại tuyến",
  );
  const reconnected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/platform/tenants/" + tenantId) &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await context.setOffline(false);
  await reconnected;
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("tenant-status")).toHaveAttribute(
    "data-status",
    "ACTIVE",
  );
  await page
    .getByLabel("Lý do thay đổi trạng thái")
    .fill("Tạm khóa để kiểm thử cách ly");
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Tạm khóa trung tâm", exact: true })
    .click();
  await expect(
    page.getByTestId("tenant-status").filter({ hasText: "Tạm khóa" }),
  ).toBeVisible();
  await owner.getByRole("link", { name: "Học viên", exact: true }).click();
  await expect(owner.getByRole("main").getByRole("alert")).toContainText(
    "Không có quyền",
  );
  await page
    .getByLabel("Lý do thay đổi trạng thái")
    .fill("Mở lại sau kiểm thử cách ly");
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Mở khóa trung tâm", exact: true })
    .click();
  await expect(
    page.getByTestId("tenant-status").filter({ hasText: "Đang hoạt động" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Xem và gia hạn thuê bao" }).click();
  await expect(
    page.getByRole("cell", { name: code, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Gói dịch vụ", { exact: true })
    .selectOption({ label: code + " · Gói onboarding kiểm thử" });
  await page.getByLabel("Bắt đầu", { exact: true }).fill(dates.end);
  await page.getByLabel("Kết thúc", { exact: true }).fill(dates.nextEnd);
  await page.getByLabel("Ân hạn đến", { exact: true }).fill(dates.nextGrace);
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Gán kỳ thuê bao", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã gán kỳ thuê bao");
  await expect(page.getByRole("cell", { name: code, exact: true })).toHaveCount(
    2,
  );
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Gán kỳ thuê bao", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "chồng lấn",
  );
  await expect(page.getByRole("cell", { name: code, exact: true })).toHaveCount(
    2,
  );
  await capture(page, "subscriptions");
  expect(tenantId).toMatch(/^[0-9a-f-]{36}$/);
  await owner.close();
});
