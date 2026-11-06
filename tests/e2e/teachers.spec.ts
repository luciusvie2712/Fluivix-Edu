import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
const tenantId = "10000000-0000-4000-8000-000000000001";
function database() {
  const url = process.env.E2E_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw new Error("Isolated E2E database required");
  return new PrismaClient({ datasourceUrl: url });
}
async function openTeachers(page: Page) {
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
  await page.getByRole("link", { name: "Giáo viên", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Giáo viên", exact: true }),
  ).toBeVisible();
}
test("teacher profile creation, class assignment and deactivation commit through the operational Web", async ({
  page,
}) => {
  const db = database(),
    stamp = Date.now(),
    email = `teacher-profile-${stamp}@example.test`,
    code = "TP" + stamp;
  let teacherId: string;
  try {
    // Synthetic active account bootstrap; Staff E2E independently proves the real
    // invitation/email/credential activation journey. Pending accounts are denied
    // by the actual teacher integration cases, never activated by this UI.
    const owner = await db.user.findUniqueOrThrow({
      where: { email: "inviter@example.test" },
    });
    const user = await db.user.create({
      data: {
        email,
        displayName: "Tài khoản giáo viên kiểm thử",
        status: "ACTIVE",
        passwordHash: owner.passwordHash,
      },
    });
    await db.membership.create({
      data: {
        tenantId,
        userId: user.id,
        status: "ACTIVE",
        roles: { create: { role: "teacher" } },
      },
    });
    const cls = await db.educationClass.create({
      data: {
        tenantId,
        code: "TC" + stamp,
        name: "Lớp phân công giáo viên kiểm thử",
        capacity: 10,
        status: "ACTIVE",
        startDate: new Date("2026-11-01Z"),
        endDate: new Date("2026-12-31Z"),
      },
    });
    await openTeachers(page);
    await page
      .getByLabel("Tìm tài khoản giáo viên theo tên hoặc email")
      .fill(email);
    await page
      .getByLabel("Tài khoản giáo viên", { exact: true })
      .selectOption(user.id);
    await page.getByLabel("Mã giáo viên", { exact: true }).fill(code);
    await page
      .getByLabel("Họ và tên trên hồ sơ giáo viên")
      .fill("Giáo viên vận hành kiểm thử");
    await page
      .getByRole("button", { name: "Tạo hồ sơ giáo viên", exact: true })
      .click();
    const result = page
      .getByRole("status")
      .filter({ hasText: "Đã tạo hồ sơ:" });
    await result.getByRole("link").click();
    teacherId = (
      await db.teacher.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      })
    ).id;
    await expect(page).toHaveURL(`/app/teachers/${teacherId}`);
    await page.getByLabel("Tìm tên lớp để phân công").fill(cls.name);
    await page
      .getByLabel("Lớp đang hoạt động", { exact: true })
      .selectOption(cls.id);
    await page
      .getByRole("button", { name: "Lưu phân công lớp", exact: true })
      .click();
    await expect(
      page.getByText("Đã ghi nhận phân công lớp trên hệ thống.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: cls.code + " · " + cls.name,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Trạng thái mới của giáo viên")
      .selectOption("INACTIVE");
    await page
      .getByLabel("Lý do thay đổi")
      .fill("Ngưng hoạt động giáo viên đã xác minh trong kiểm thử");
    await expect(
      page.getByRole("button", { name: "Lưu hồ sơ giáo viên", exact: true }),
    ).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Lưu hồ sơ giáo viên", exact: true })
      .click();
    await expect(
      page.getByText(
        "Hồ sơ và tài khoản giáo viên phải đang hoạt động để nhận phân công mới.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: cls.code + " · " + cls.name,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await db.teacher.findUniqueOrThrow({ where: { id: teacherId } }),
    ).toMatchObject({ status: "INACTIVE", version: 2 });
    expect(
      await db.classTeacher.count({
        where: { tenantId, teacherId, classId: cls.id },
      }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
});
test("teacher directory and profile have responsive keyboard access and accessible reduced-motion forms", async ({
  page,
}) => {
  await openTeachers(page);
  mkdirSync("docs/release/evidence/teachers", { recursive: true });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("region", { name: "Danh sách giáo viên" }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `docs/release/evidence/teachers/directory-${width}.png`,
      fullPage: true,
    });
    await reviewTaste(
      page,
      `docs/release/evidence/teachers/directory-taste-${width}.json`,
    );
  }
  await page.setViewportSize({ width: 360, height: 900 });
  const directory = page.getByRole("region", { name: "Danh sách giáo viên" });
  await directory.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => directory.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await directory.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ giáo viên", exact: true }),
  ).toBeVisible();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(
      page.getByRole("button", { name: "Lưu hồ sơ giáo viên", exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `docs/release/evidence/teachers/detail-${width}.png`,
      fullPage: true,
    });
    await reviewTaste(
      page,
      `docs/release/evidence/teachers/detail-taste-${width}.json`,
    );
  }
});
test("teacher management shows honest empty/read-only/missing states and rejects accountant deep links", async ({
  page,
}) => {
  const db = database();
  try {
    await openTeachers(page);
    await page
      .getByLabel("Tìm tên hoặc mã giáo viên")
      .fill("no-synthetic-teacher-match");
    await expect(
      page.getByText("Chưa có giáo viên phù hợp với bộ lọc."),
    ).toBeVisible();
    await page.getByLabel("Tìm tên hoặc mã giáo viên").fill("");
    await page
      .getByRole("region", { name: "Danh sách giáo viên" })
      .getByRole("link")
      .first()
      .click();
    const profilePath = new URL(page.url()).pathname;
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(
      page.getByText("Trung tâm ở chế độ chỉ đọc. Các thay đổi đang bị khóa."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Lưu hồ sơ giáo viên", exact: true }),
    ).toBeDisabled();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await page.goto("/app/teachers/00000000-0000-4000-8000-000000000099");
    await expect(
      page.getByRole("alert").filter({ hasText: "Không tìm thấy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Lớp đã phân công", exact: true }),
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
      page.getByRole("link", { name: "Giáo viên", exact: true }),
    ).toHaveCount(0);
    await page.goto(profilePath);
    await expect(
      page.getByText(
        "Vai trò hiện tại không có quyền quản lý hồ sơ giáo viên.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Lưu hồ sơ giáo viên", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await db.$disconnect();
  }
});
