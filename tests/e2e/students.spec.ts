import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
async function login(
  page: Page,
  email = "inviter@example.test",
  role = "Chủ trung tâm",
) {
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/tenant/select");
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Trung tâm kiểm thử A",
        exact: true,
      }),
    })
    .getByRole("button", { name: role, exact: true })
    .click();
  await expect(page).toHaveURL("http://localhost:3000/app/students");
}
async function capture(page: Page, name: string) {
  mkdirSync("docs/ai/evidence/students", { recursive: true });
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
      path: `docs/ai/evidence/students/${name}-${width}.png`,
      fullPage: true,
    });
    await reviewTaste(
      page,
      `docs/ai/evidence/students/taste-${name}-${width}.json`,
    );
  }
}
test("staff creates and edits a real student, resolves version conflict, deactivates with reason and denies another tenant", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const code = "WEB_" + randomUUID().slice(0, 8).toUpperCase();
  await login(page);
  await page.getByRole("link", { name: "Thêm học viên", exact: true }).click();
  await page
    .getByRole("button", { name: "Tạo hồ sơ học viên", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nhập họ tên" }),
  ).toBeVisible();
  await page.getByLabel("Mã học viên", { exact: true }).fill(code);
  await page
    .getByLabel("Họ và tên", { exact: true })
    .fill("Học viên hồ sơ trình duyệt");
  await page.getByLabel("Ngày sinh", { exact: true }).fill("2010-02-28");
  await page
    .getByLabel("Email liên hệ", { exact: true })
    .fill("profile-browser@example.test");
  await page
    .getByLabel("Số điện thoại", { exact: true })
    .fill("+84 901 234567");
  await page
    .getByLabel("Ghi chú riêng tư", { exact: true })
    .fill("Chỉ giáo vụ được xem ghi chú kiểm thử.");
  await capture(page, "create");
  await page
    .getByRole("button", { name: "Tạo hồ sơ học viên", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ học viên", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Ghi chú riêng tư", { exact: true }),
  ).toHaveValue("Chỉ giáo vụ được xem ghi chú kiểm thử.");
  const detailUrl = page.url();
  await capture(page, "detail");
  await page.context().setOffline(true);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Bạn đang ngoại tuyến",
  );
  const onlineResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith("/api/v1/students/" + detailUrl.split("/").at(-1)) &&
      response.ok(),
  );
  await page.context().setOffline(false);
  await onlineResponse;
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  const separate = await browser.newContext();
  try {
    const second = await separate.newPage();
    await login(second);
    await second.goto(detailUrl);
    await expect(second.getByLabel("Họ và tên", { exact: true })).toHaveValue(
      "Học viên hồ sơ trình duyệt",
    );
    await second
      .getByLabel("Họ và tên", { exact: true })
      .fill("Không được ghi đè phiên bản mới");
    await page
      .getByLabel("Họ và tên", { exact: true })
      .fill("Học viên đã cập nhật hồ sơ");
    await page.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Đã lưu hồ sơ học viên",
    );
    // A real background refetch must preserve unsaved values and their original version.
    const background = second.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith("/api/v1/students/" + detailUrl.split("/").at(-1)) &&
        response.ok(),
    );
    await second.bringToFront();
    await second.evaluate(() =>
      window.dispatchEvent(new Event("visibilitychange")),
    );
    await background;
    await expect(second.getByLabel("Họ và tên", { exact: true })).toHaveValue(
      "Không được ghi đè phiên bản mới",
    );
    await second
      .getByRole("button", { name: "Lưu hồ sơ", exact: true })
      .click();
    await expect(
      second.getByRole("alert").filter({ hasText: "Dữ liệu đã thay đổi" }),
    ).toBeVisible();
    second.once("dialog", (dialog) => void dialog.accept());
    await second
      .getByRole("button", { name: "Nhận bản mới", exact: true })
      .click();
    await expect(second.getByLabel("Họ và tên", { exact: true })).toHaveValue(
      "Học viên đã cập nhật hồ sơ",
    );
  } finally {
    await separate.close();
  }
  await page
    .getByLabel("Lý do ngưng hoạt động", { exact: true })
    .fill("Học viên chuyển trung tâm khác");
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Ngưng hoạt động học viên", exact: true })
    .click();
  await expect(page.getByTestId("student-status")).toHaveText(
    "Ngưng hoạt động",
  );
  await page
    .getByRole("link", { name: "Về danh sách học viên", exact: true })
    .click();
  await page.getByLabel("Tìm theo mã hoặc họ tên", { exact: true }).fill(code);
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("INACTIVE");
  await expect(
    page.getByRole("cell", { name: code, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Trạng thái", { exact: true })).toHaveValue(
    "INACTIVE",
  );
  await expect(
    page.getByRole("cell", { name: code, exact: true }),
  ).toBeVisible();
  await capture(page, "list");
  const restricted = await browser.newContext();
  try {
    const accountant = await restricted.newPage();
    await login(accountant, "accountant@example.test", "Kế toán");
    const redactedResponse = accountant.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith("/api/v1/students/" + detailUrl.split("/").at(-1)) &&
        response.ok(),
    );
    await accountant.goto(detailUrl);
    const body: import("../../packages/api-client/src").components["schemas"]["StudentDetailResponse"] =
      await (await redactedResponse).json();
    for (const field of [
      "notesPrivate",
      "dateOfBirth",
      "contactEmail",
      "contactPhone",
    ])
      expect(body.data).not.toHaveProperty(field);
    await expect(
      accountant.getByRole("heading", {
        name: "Học viên đã cập nhật hồ sơ",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      accountant.getByLabel("Ghi chú riêng tư", { exact: true }),
    ).toHaveCount(0);
    await expect(
      accountant.getByRole("button", { name: "Lưu hồ sơ", exact: true }),
    ).toHaveCount(0);
  } finally {
    await restricted.close();
  }
  await page
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Trung tâm kiểm thử B",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  await page.goto(detailUrl);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Không tìm thấy dữ liệu trong trung tâm đang chọn",
  );
  await expect(
    page.getByLabel("Ghi chú riêng tư", { exact: true }),
  ).toHaveCount(0);
});
