import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
const tenantId = "10000000-0000-4000-8000-000000000001",
  year = new Date().getUTCFullYear() + 1;
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
  await page
    .getByLabel("Email", { exact: true })
    .fill("accountant@example.test");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Kế toán", exact: true }).click();
  await expect(page).toHaveURL("/app/students");
}
async function fixture(db: PrismaClient) {
  const stamp = Date.now(),
    name = "Học phí hóa đơn " + stamp;
  const cls = await db.educationClass.create({
    data: {
      tenantId,
      code: "INV" + stamp,
      name: "Lớp hóa đơn " + stamp,
      capacity: 20,
      status: "ACTIVE",
      startDate: new Date(`${year}-01-01Z`),
      endDate: new Date(`${year}-12-31Z`),
    },
  });
  const students = [];
  for (const n of [1, 2]) {
    const s = await db.student.create({
      data: {
        tenantId,
        studentCode: "INV" + stamp + n,
        fullName: "Học viên hóa đơn " + n,
      },
    });
    students.push(s);
    await db.enrollment.create({
      data: {
        tenantId,
        classId: cls.id,
        studentId: s.id,
        joinedAt: cls.startDate,
      },
    });
  }
  const fee = await db.feePlan.create({
    data: {
      tenantId,
      classId: cls.id,
      name,
      billingModel: "MONTHLY",
      amountVnd: 1200000n,
      validFrom: cls.startDate,
      validTo: cls.endDate,
    },
  });
  return { cls, students, fee };
}
async function preview(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page
    .getByRole("link", { name: "Chứng từ học phí", exact: true })
    .click();
  await page
    .getByLabel("Tìm tên biểu phí: Biểu phí phát hành", { exact: true })
    .fill(f.fee.name);
  await page
    .getByLabel("Biểu phí phát hành", { exact: true })
    .selectOption(f.fee.id);
  await page
    .getByLabel("Ngày đến hạn kỳ thu", { exact: true })
    .fill(`${year}-01-15`);
  await page
    .getByRole("button", { name: "Xem trước kỳ thu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Học viên và số tiền dự kiến",
      exact: true,
    }),
  ).toBeVisible();
}
test("invoice Web previews eligible learners then issues once, shows real item history and voids with confirmation", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await preview(page, f);
    expect(await db.invoiceRun.count({ where: { feePlanId: f.fee.id } })).toBe(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Xác nhận phát hành", exact: true }),
    ).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận phát hành", exact: true })
      .click();
    const outcome = page
      .getByRole("status")
      .filter({ hasText: "Đã phát hành kỳ thu trên hệ thống:" });
    await expect(outcome).toContainText("2 chứng từ");
    await expect(outcome).toBeFocused();
    expect(await db.invoiceRun.count({ where: { feePlanId: f.fee.id } })).toBe(
      1,
    );
    await outcome.getByRole("link").first().click();
    await expect(
      page.getByRole("heading", {
        name: "Khoản phí đã phát hành",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(f.fee.name + ` · ${year}-01 · 1.200.000\u00a0₫`, {
        exact: true,
      }),
    ).toBeVisible();
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    await page
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Hủy sau khi đã kiểm tra chứng từ phát hành");
    await expect(
      page.getByRole("button", { name: "Hủy chứng từ", exact: true }),
    ).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Hủy chứng từ", exact: true })
      .click();
    await expect(
      page.getByText("Đã hủy: Hủy sau khi đã kiểm tra chứng từ phát hành", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Đã hủy chứng từ trên hệ thống; lịch sử và khoản phí gốc được giữ nguyên.",
      }),
    ).toBeFocused();
    expect(
      (await db.invoice.findUniqueOrThrow({ where: { id } })).billingState,
    ).toBe("VOID");
    expect(await db.invoiceItem.count({ where: { invoiceId: id } })).toBe(1);
    await page
      .getByRole("link", { name: "← Danh sách chứng từ", exact: true })
      .click();
    await page
      .getByLabel("Trạng thái thu học phí", { exact: true })
      .selectOption("VOID");
    await expect(
      page.getByRole("link", {
        name: (await db.invoice.findUniqueOrThrow({ where: { id } })).invoiceNo,
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
test("invoice Web handles a committed response lost on the network by retrying the same idempotency key", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await preview(page, f);
    const keys: string[] = [];
    let lose = true;
    await page.route("**/api/v1/invoices/generate-run", async (route) => {
      keys.push(route.request().headers()["idempotency-key"]!);
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      if (lose) {
        lose = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    });
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận phát hành", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Chưa nhận được kết quả phát hành" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Ngày đến hạn kỳ thu", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Xem trước kỳ thu", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Xác nhận phát hành", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Đã phát hành kỳ thu trên hệ thống:" }),
    ).toContainText("2 chứng từ");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toBeTruthy();
    const runs = await db.invoiceRun.findMany({
      where: { feePlanId: f.fee.id },
    });
    expect(runs).toHaveLength(1);
    expect(await db.invoice.count({ where: { runId: runs[0]!.id } })).toBe(2);
  } finally {
    await db.$disconnect();
  }
});
test("invoice Web rejects an eligibility change after preview and retains read-only/empty/missing states", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await preview(page, f);
    const s = await db.student.create({
      data: {
        tenantId,
        studentCode: "NEW" + Date.now(),
        fullName: "Học viên thêm sau xem trước",
      },
    });
    await db.enrollment.create({
      data: {
        tenantId,
        classId: f.cls.id,
        studentId: s.id,
        joinedAt: f.cls.startDate,
      },
    });
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận phát hành", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Xem trước và xác nhận lại trước khi phát hành." }),
    ).toBeVisible();
    expect(await db.invoiceRun.count({ where: { feePlanId: f.fee.id } })).toBe(
      0,
    );
    await page
      .getByRole("button", { name: "Xem trước kỳ thu", exact: true })
      .click();
    await expect(page.getByText(/3 học viên · Tổng dự kiến/)).toBeVisible();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Xem trước kỳ thu", exact: true }),
    ).toBeDisabled();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await page.reload();
    await page
      .getByLabel("Tìm số chứng từ, mã hoặc tên học viên", { exact: true })
      .fill("absent-synthetic-invoice");
    await expect(
      page.getByText("Chưa có chứng từ phù hợp.", { exact: true }),
    ).toBeVisible();
    await page.goto(
      "/app/finance/invoices/00000000-0000-4000-8000-000000000099",
    );
    await expect(
      page.getByRole("alert").filter({ hasText: "Không tìm thấy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Hủy chứng từ", exact: true }),
    ).toHaveCount(0);
    const owner = await db.user.findUniqueOrThrow({
        where: { email: "inviter@example.test" },
      }),
      email = `invoice-academic-${Date.now()}@example.test`;
    // Synthetic identity only; actual Staff invitation/activation is covered separately.
    const user = await db.user.create({
      data: {
        email,
        displayName: "Giáo vụ kiểm thử chứng từ",
        status: "ACTIVE",
        passwordHash: owner.passwordHash,
      },
    });
    await db.membership.create({
      data: {
        tenantId,
        userId: user.id,
        status: "ACTIVE",
        roles: { create: { role: "academic_staff" } },
      },
    });
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Fluivix-Test-Password-2026");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.getByRole("button", { name: "Giáo vụ", exact: true }).click();
    await expect(page).toHaveURL("/app/students");
    await expect(
      page.getByRole("link", { name: "Chứng từ học phí", exact: true }),
    ).toHaveCount(0);
    await page.goto("/app/finance/invoices");
    await expect(
      page.getByRole("alert").filter({
        hasText: "Vai trò hiện tại không có quyền quản lý chứng từ học phí.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Xem trước kỳ thu", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await db.$disconnect();
  }
});
test("invoice list and detail have accessible responsive forms and reduced-motion keyboard access", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await preview(page, f);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận phát hành", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Đã phát hành kỳ thu trên hệ thống:" })
      .getByRole("link")
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/finance\/invoices\/[0-9a-f-]+$/);
    const detail = new URL(page.url()).pathname;
    mkdirSync("docs/release/evidence/invoices", { recursive: true });
    for (const surface of ["directory", "detail"]) {
      await page.goto(
        surface === "directory" ? "/app/finance/invoices" : detail,
      );
      if (surface === "directory")
        await page
          .getByLabel("Tìm số chứng từ, mã hoặc tên học viên", { exact: true })
          .fill(f.students[0]!.studentCode);
      await expect(
        page.getByRole("heading", {
          name:
            surface === "directory"
              ? "Danh sách chứng từ"
              : "Khoản phí đã phát hành",
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
          path: `docs/release/evidence/invoices/${surface}-${width}.png`,
          fullPage: true,
        });
        await reviewTaste(
          page,
          `docs/release/evidence/invoices/${surface}-taste-${width}.json`,
        );
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByLabel("Lý do thay đổi", { exact: true }).focus();
    await page.keyboard.type("Huy chung tu theo yeu cau da xac minh");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("checkbox")).toBeFocused();
  } finally {
    await db.$disconnect();
  }
});
