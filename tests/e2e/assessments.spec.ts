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
async function login(page: Page) {
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
}
async function fixture(db: PrismaClient) {
  const stamp = Date.now().toString();
  // Only synthetic roster bootstrap. Assessment creation and all score/lifecycle
  // mutations below use the actual operational UI and validated API.
  const cls = await db.educationClass.create({
    data: {
      tenantId,
      code: "AG" + stamp,
      name: "Lớp bảng điểm " + stamp,
      capacity: 10,
      status: "ACTIVE",
      startDate: new Date("2026-11-01Z"),
      endDate: new Date("2026-12-31Z"),
    },
  });
  const students = [];
  for (const n of [1, 2]) {
    const student = await db.student.create({
      data: {
        tenantId,
        studentCode: "AG" + stamp + n,
        fullName: "Học viên bảng điểm " + n,
      },
    });
    await db.enrollment.create({
      data: {
        tenantId,
        classId: cls.id,
        studentId: student.id,
        joinedAt: cls.startDate,
      },
    });
    students.push(student);
  }
  return { cls, students, title: "Kiểm tra kết quả " + stamp };
}
async function create(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page.goto(`/app/assessments?classId=${f.cls.id}`);
  await page.getByLabel("Tiêu đề đầu điểm", { exact: true }).fill(f.title);
  await page.getByRole("button", { name: "Tạo đầu điểm", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Mở đầu điểm vừa tạo:" })
    .getByRole("link")
    .click();
  await expect(
    page.getByRole("heading", { name: f.title, exact: true }),
  ).toBeVisible();
}
const panel = (page: Page, title: string) =>
  page.locator("section").filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });

test("assessment Web handles empty, read-only, missing and forbidden states", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await page.goto(`/app/classes/${f.cls.id}`);
    await expect(
      page.getByRole("heading", {
        name: `Đầu điểm của lớp ${f.cls.code}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(`/app/assessments?classId=${f.cls.id}`);
    await expect(
      page.getByText("Chưa có đầu điểm phù hợp.", { exact: true }),
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
      page.getByRole("button", { name: "Tạo đầu điểm", exact: true }),
    ).toBeDisabled();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await page.goto("/app/assessments/00000000-0000-4000-8000-000000000099");
    await expect(
      page.getByRole("alert").filter({ hasText: "Không tìm thấy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nhập điểm nháp", exact: true }),
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
      page.getByRole("link", { name: "Đầu điểm và kết quả", exact: true }),
    ).toHaveCount(0);
    await page.goto(`/app/assessments?classId=${f.cls.id}`);
    await expect(
      page.getByRole("alert").filter({
        hasText: "Vai trò hiện tại không có quyền quản lý đầu điểm trên Web.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tạo đầu điểm", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await db.$disconnect();
  }
});

test("assessment Web saves partial zero/max drafts, publishes and corrects with explicit confirmation and history", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await create(page, f);
    const input = (n: number) =>
      page.getByLabel(
        `Điểm ${f.students[n]!.studentCode} · ${f.students[n]!.fullName}`,
        { exact: true },
      );
    await input(0).fill("0");
    await page
      .getByRole("button", { name: "Lưu bản nháp", exact: true })
      .click();
    await expect(
      page.getByText(
        "Đã lưu bản nháp; học viên và phụ huynh chưa thấy thay đổi này.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Công bố kết quả", exact: true }),
    ).toBeDisabled();
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(
      await db.assessmentResult.count({ where: { assessmentId: id } }),
    ).toBe(1);
    await input(1).fill("10.01");
    await expect(input(1)).toHaveAttribute("aria-invalid", "true");
    await page
      .getByRole("button", { name: "Lưu bản nháp", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Kiểm tra các ô điểm" }),
    ).toBeVisible();
    expect(
      await db.assessmentResult.count({ where: { assessmentId: id } }),
    ).toBe(1);
    await input(1).fill("10,00");
    await page
      .getByRole("button", { name: "Lưu bản nháp", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Lưu bản nháp", exact: true }),
    ).toBeDisabled();
    const publish = panel(page, "Công bố kết quả");
    await publish.getByRole("checkbox").check();
    await publish
      .getByRole("button", { name: "Công bố kết quả", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Kết quả đã công bố", exact: true }),
    ).toBeVisible();
    expect(
      await db.assessment.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ status: "PUBLISHED", version: 4 });
    const correction = panel(page, "Sửa kết quả đã công bố");
    await correction
      .getByLabel("Lý do thay đổi")
      .fill("Sửa theo bài kiểm tra đã đối chiếu lại");
    await expect(
      correction.getByRole("button", { name: "Mở sửa kết quả", exact: true }),
    ).toBeDisabled();
    await correction.getByRole("checkbox").check();
    await correction
      .getByRole("button", { name: "Mở sửa kết quả", exact: true })
      .click();
    await expect(input(0)).toHaveValue("0.00");
    await input(0).fill("8.25");
    await page
      .getByRole("button", { name: "Lưu bản nháp", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Lưu bản nháp", exact: true }),
    ).toBeDisabled();
    await publish.getByRole("checkbox").check();
    await publish
      .getByRole("button", { name: "Công bố kết quả", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Kết quả đã công bố", exact: true }),
    ).toBeVisible();
    await expect(
      panel(page, "Lịch sử thay đổi điểm").getByText(
        "Sau: 8,25 · Không có nhận xét",
        { exact: true },
      ),
    ).toBeVisible();
    expect(await db.gradeChange.count({ where: { assessmentId: id } })).toBe(3);
    await page.goto(`/app/students/${f.students[0]!.id}`);
    await expect(
      panel(page, "Điểm đã công bố của học viên").getByRole("link", {
        name: f.title,
      }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("assessment concurrent Web editors retain unsaved input after a real version conflict", async ({
  page,
  context,
}) => {
  const db = database();
  // Two independent authenticated editors. Reusing a browser's rotating refresh
  // family would invalidate the first tab's access session on the second restore.
  const otherContext = await context.browser()!.newContext();
  const second = await otherContext.newPage();
  try {
    const f = await fixture(db);
    await login(page);
    await create(page, f);
    await login(second);
    await second.goto(page.url());
    const label = `Điểm ${f.students[0]!.studentCode} · ${f.students[0]!.fullName}`;
    await second.getByLabel(label, { exact: true }).fill("7.00");
    await page.getByLabel(label, { exact: true }).fill("6.00");
    await page
      .getByRole("button", { name: "Lưu bản nháp", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Lưu bản nháp", exact: true }),
    ).toBeDisabled();
    await second
      .getByRole("button", { name: "Lưu bản nháp", exact: true })
      .click();
    await expect(
      second.getByRole("alert").filter({ hasText: "Bản đang nhập được giữ" }),
    ).toBeVisible();
    await expect(second.getByLabel(label, { exact: true })).toHaveValue("7.00");
    await expect(
      second.getByRole("button", { name: "Lưu bản nháp", exact: true }),
    ).toBeDisabled();
    second.once("dialog", (d) => d.accept());
    await second
      .getByRole("button", { name: "Tải lại bảng điểm", exact: true })
      .click();
    await expect(second.getByLabel(label, { exact: true })).toHaveValue("6.00");
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(await db.gradeChange.count({ where: { assessmentId: id } })).toBe(1);
  } finally {
    await otherContext.close();
    await db.$disconnect();
  }
});

test("assessment directory and draft editor support narrow viewports, keyboard and reduced motion", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await create(page, f);
    const detail = new URL(page.url()).pathname;
    mkdirSync("docs/release/evidence/assessments", { recursive: true });
    for (const surface of ["directory", "editor"]) {
      await page.goto(
        surface === "editor" ? detail : `/app/assessments?classId=${f.cls.id}`,
      );
      await expect(
        page.getByRole("heading", {
          name:
            surface === "editor"
              ? "Nhập điểm nháp"
              : `Đầu điểm của lớp ${f.cls.code}`,
          exact: true,
        }),
      ).toBeVisible();
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: `docs/release/evidence/assessments/${surface}-${width}.png`,
          fullPage: true,
        });
        await reviewTaste(
          page,
          `docs/release/evidence/assessments/${surface}-taste-${width}.json`,
        );
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    const field = page.getByLabel(
      `Điểm ${f.students[0]!.studentCode} · ${f.students[0]!.fullName}`,
      { exact: true },
    );
    await field.focus();
    await page.keyboard.type("0");
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel(
        `Nhận xét / lý do ${f.students[0]!.studentCode} · ${f.students[0]!.fullName}`,
        { exact: true },
      ),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Lưu bản nháp", exact: true }),
    ).toBeEnabled();
  } finally {
    await db.$disconnect();
  }
});
