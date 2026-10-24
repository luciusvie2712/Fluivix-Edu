import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;

test("Web class enrollment, recurring preview/generation, real calendar, draft and published attendance", async ({
  page,
}) => {
  await page.goto(testOrigins.web + "/login");
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
  await expect(page).toHaveURL(testOrigins.web + "/app/students");
  await page
    .getByRole("link", { name: "Lớp học và lịch học", exact: true })
    .click();
  const code = "WEB" + Date.now();
  await page.getByLabel("Mã lớp", { exact: true }).fill(code);
  await page
    .getByLabel("Tên lớp", { exact: true })
    .fill("Lớp vận hành Web kiểm thử");
  await page.getByLabel("Sức chứa lớp", { exact: true }).fill("20");
  await page.getByLabel("Ngày bắt đầu lớp", { exact: true }).fill("2026-11-01");
  await page
    .getByLabel("Ngày kết thúc lớp", { exact: true })
    .fill("2026-12-31");
  await page.getByRole("button", { name: "Tạo lớp", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Lớp vận hành Web kiểm thử",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Tìm học viên để ghi danh", { exact: true })
    .fill("TEST-001");
  await page
    .getByLabel("Học viên đang hoạt động", { exact: true })
    .selectOption({ label: "TEST-001 · Học viên kiểm thử A" });
  await page.getByLabel("Ngày ghi danh", { exact: true }).fill("2026-11-01");
  await page
    .getByRole("button", { name: "Ghi danh học viên", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Giáo viên phân công", { exact: true })
    .selectOption({ label: "WEB-TEACHER · Giáo viên kiểm thử Web" });
  await page
    .getByRole("button", { name: "Phân công giáo viên", exact: true })
    .click();
  await expect(
    page
      .locator("form")
      .filter({
        has: page.getByRole("button", {
          name: "Phân công giáo viên",
          exact: true,
        }),
      })
      .getByRole("status"),
  ).toBeVisible();
  await page
    .getByLabel("Giáo viên dạy lịch lặp", { exact: true })
    .selectOption({ label: "WEB-TEACHER · Giáo viên kiểm thử Web" });
  await page
    .getByLabel("Ngày học trong tuần", { exact: true })
    .selectOption("1");
  await page
    .getByLabel("Giờ bắt đầu địa phương", { exact: true })
    .fill("18:00");
  await page
    .getByLabel("Giờ kết thúc địa phương", { exact: true })
    .fill("19:30");
  await page
    .getByLabel("Lịch có hiệu lực đến", { exact: true })
    .fill("2026-11-30");
  await page
    .getByRole("button", { name: "Lưu quy tắc lịch", exact: true })
    .click();
  await expect(
    page.getByLabel("Quy tắc đã lưu", { exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Sinh đến ngày", { exact: true }).fill("2026-11-30");
  await page
    .getByRole("button", { name: "Kiểm tra xung đột", exact: true })
    .click();
  await expect(
    page.getByText("5 buổi; 0 xung đột; 0 buổi đã có.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận sinh các buổi hợp lệ; hệ thống kiểm tra xung đột lại khi lưu.",
    })
    .check();
  await page
    .getByRole("button", { name: "Xác nhận sinh buổi học", exact: true })
    .click();
  await expect(
    page
      .locator("form")
      .filter({
        has: page.getByRole("button", {
          name: "Xác nhận sinh buổi học",
          exact: true,
        }),
      })
      .getByRole("status"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Lịch buổi học", exact: true }).click();
  await page.getByLabel("Lịch từ ngày", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Lịch đến ngày", { exact: true }).fill("2026-11-30");
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
  await page
    .getByRole("link", { name: "Mở buổi 2026-11-02", exact: true })
    .click();
  await page
    .getByLabel("Điểm danh Học viên kiểm thử A", { exact: true })
    .selectOption("PRESENT");
  await page.getByText("Dời hoặc hủy buổi học", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hủy buổi học", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Lưu nhật ký", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Chốt điểm danh", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Lưu nháp điểm danh", exact: true })
    .click();
  await expect(page.getByText(/IN_PROGRESS.*Phiên bản 2/)).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận điểm danh đã lưu trên hệ thống và đồng ý công bố.",
    })
    .check();
  await page
    .getByRole("button", { name: "Chốt điểm danh", exact: true })
    .click();
  await expect(page.getByText(/COMPLETED.*Phiên bản 3/)).toBeVisible();
  mkdirSync("docs/release/evidence/visual", { recursive: true });
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
      path: `docs/release/evidence/visual/session-${width}.png`,
      fullPage: true,
    });
    await reviewTaste(
      page,
      `docs/release/evidence/visual/session-taste-${width}.json`,
    );
  }
});
