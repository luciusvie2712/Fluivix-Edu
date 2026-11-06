import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
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
async function login(
  page: Page,
  email = "accountant@example.test",
  role = "Kế toán",
) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: role, exact: true }).click();
  await expect(page).toHaveURL("/app/students");
}
async function fixture(db: PrismaClient, large = false, extra = 0) {
  // Guarded synthetic ledger bootstrap; all browser reads and later reversals/voids use the real API.
  const stamp = randomUUID().slice(0, 8),
    actor = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
  return db.$transaction(async (tx) => {
    const cls = await tx.educationClass.create({
      data: {
        tenantId,
        code: "DEBT" + stamp,
        name: "Lớp công nợ " + stamp,
        capacity: 10,
        status: "ACTIVE",
        startDate: new Date("2020-01-01Z"),
        endDate: new Date("2040-01-01Z"),
      },
    });
    const student = await tx.student.create({
      data: {
        tenantId,
        studentCode: "DEBT" + stamp,
        fullName: "Học viên công nợ " + stamp,
        status: "PAUSED",
      },
    });
    const rows = [];
    const amounts = large
      ? [6000000000000000000n, 6000000000000000000n, 0n, 2000000n]
      : [1200000n, 1000000n, 0n, 2000000n];
    amounts.push(...Array.from({ length: extra }, () => 10000n));
    for (let n = 0; n < amounts.length; n++) {
      const amount = amounts[n]!;
      const fee = await tx.feePlan.create({
        data: {
          tenantId,
          classId: cls.id,
          name: "Học phí công nợ " + stamp + "-" + n,
          billingModel: "MONTHLY",
          amountVnd: amount,
          validFrom: new Date("2020-01-01Z"),
        },
      });
      const run = await tx.invoiceRun.create({
        data: {
          tenantId,
          feePlanId: fee.id,
          periodKey: "2026-11",
          requestHash: "a".repeat(64),
          createdBy: actor.id,
        },
      });
      const row = await tx.invoice.create({
        data: {
          tenantId,
          studentId: student.id,
          runId: run.id,
          invoiceNo: "DEBT-INV-" + randomUUID(),
          dueAt: new Date(Date.now() + (n === 1 ? 30 : -1) * 86400000),
          totalAmountVnd: amount,
          createdBy: actor.id,
          ...(n === 3
            ? {
                billingState: "VOID",
                voidReason: "Chứng từ đã hủy trong bộ dữ liệu kiểm thử công nợ",
              }
            : {}),
        },
      });
      await tx.invoiceItem.create({
        data: {
          tenantId,
          invoiceId: row.id,
          feePlanId: fee.id,
          description: fee.name,
          totalAmountVnd: amount,
        },
      });
      rows.push(row);
    }
    const payment = await tx.payment.create({
      data: {
        tenantId,
        studentId: student.id,
        receiptNo: "DEBT-PAY-" + randomUUID(),
        method: "CASH",
        receivedAmountVnd: 500000n,
        receivedAt: new Date(),
        receivedBy: actor.id,
      },
    });
    await tx.paymentAllocation.create({
      data: {
        tenantId,
        studentId: student.id,
        paymentId: payment.id,
        invoiceId: rows[0]!.id,
        amountVnd: 500000n,
      },
    });
    return { cls, student, rows, payment };
  });
}
async function selectClass(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page
    .getByLabel("Tìm lớp cho báo cáo công nợ", { exact: true })
    .fill(f.cls.code);
  await page
    .getByLabel("Lớp trong báo cáo công nợ", { exact: true })
    .selectOption(f.cls.id);
  await expect(
    page.getByRole("heading", {
      name: "Tổng hợp trong phạm vi đã chọn",
      exact: true,
    }),
  ).toBeVisible();
}
async function open(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page
    .getByRole("link", { name: "Công nợ học phí", exact: true })
    .click();
  await selectClass(page, f);
}
const balance = (page: Page, value: string) =>
  page.locator("dl").getByText(value, { exact: true });
test("receivables Web filters actual issued debt and refreshes exact balances after real reversal and void", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await open(page, f);
    await expect(balance(page, "1.700.000\u00a0₫")).toBeVisible();
    await expect(
      page.getByRole("link", { name: f.rows[0]!.invoiceNo, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: f.rows[1]!.invoiceNo, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: f.rows[2]!.invoiceNo, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: f.rows[3]!.invoiceNo, exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("checkbox", { name: "Chỉ xem công nợ quá hạn", exact: true })
      .check();
    await expect(balance(page, "700.000\u00a0₫").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: f.rows[1]!.invoiceNo, exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: f.rows[0]!.invoiceNo, exact: true })
      .click();
    await expect(page).toHaveURL("/app/finance/invoices/" + f.rows[0]!.id);
    await expect(
      page.getByRole("heading", {
        name: "Khoản phí đã phát hành",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/app/finance/payments/" + f.payment.id);
    await page
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Đảo khoản thu đã được xác minh để đối chiếu công nợ");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận đảo giao dịch", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Đã đảo giao dịch trên hệ thống" }),
    ).toBeVisible();
    await open(page, f);
    await expect(balance(page, "2.200.000\u00a0₫").first()).toBeVisible();
    await page
      .getByRole("link", { name: f.rows[0]!.invoiceNo, exact: true })
      .click();
    await expect(page).toHaveURL("/app/finance/invoices/" + f.rows[0]!.id);
    await page
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Hủy chứng từ đã được đối chiếu và không còn thanh toán");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Hủy chứng từ", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Đã hủy chứng từ trên hệ thống" }),
    ).toBeVisible();
    await open(page, f);
    await expect(balance(page, "1.000.000\u00a0₫").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: f.rows[0]!.invoiceNo, exact: true }),
    ).toHaveCount(0);
    expect(await db.invoice.count({ where: { studentId: f.student.id } })).toBe(
      4,
    );
  } finally {
    await db.$disconnect();
  }
});
test("receivables Web handles empty and invalid ranges, real transport failure/retry and readonly views", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await open(page, f);
    await page
      .getByLabel("Tìm mã, tên học viên hoặc số chứng từ", { exact: true })
      .fill("NO-DEBT-" + f.student.id);
    await expect(
      page.getByText("Không có chứng từ còn công nợ phù hợp.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Tìm mã, tên học viên hoặc số chứng từ", { exact: true })
      .fill("");
    await expect(balance(page, "1.700.000\u00a0₫")).toBeVisible();
    await page
      .getByLabel("Đến hạn từ ngày", { exact: true })
      .fill("2030-01-17");
    await page
      .getByLabel("Đến hạn đến ngày", { exact: true })
      .fill("2030-01-16");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Ngày bắt đầu không được sau ngày kết thúc." }),
    ).toBeVisible();
    await page.getByLabel("Đến hạn từ ngày", { exact: true }).fill("");
    await page.getByLabel("Đến hạn đến ngày", { exact: true }).fill("");
    await expect(balance(page, "1.700.000\u00a0₫")).toBeVisible();
    await page.route("**/api/v1/finance/reports/receivables**", (route) =>
      route.abort("failed"),
    );
    await page
      .getByRole("button", { name: "Cập nhật công nợ", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Không thể kết nối dịch vụ." }),
    ).toBeVisible();
    await page.unroute("**/api/v1/finance/reports/receivables**");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(balance(page, "1.700.000\u00a0₫")).toBeVisible();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await selectClass(page, f);
    await expect(balance(page, "1.700.000\u00a0₫")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cập nhật công nợ", exact: true }),
    ).toBeEnabled();
  } finally {
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await db.$disconnect();
  }
});
test("receivables Web presents exact large totals with accessible responsive and reduced-motion keyboard filters", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db, true);
    await login(page);
    await open(page, f);
    await expect(
      balance(page, "11.999.999.999.999.500.000\u00a0₫"),
    ).toBeVisible();
    mkdirSync("docs/release/evidence/receivables", { recursive: true });
    for (const mode of ["overview", "overdue"]) {
      if (mode === "overdue") {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page
          .getByRole("checkbox", {
            name: "Chỉ xem công nợ quá hạn",
            exact: true,
          })
          .focus();
        await page.keyboard.press("Space");
        await expect(
          page.getByRole("checkbox", {
            name: "Chỉ xem công nợ quá hạn",
            exact: true,
          }),
        ).toBeChecked();
        await expect(
          balance(page, "5.999.999.999.999.500.000\u00a0₫").first(),
        ).toBeVisible();
        await page.keyboard.press("Tab");
        await expect(
          page.getByRole("button", { name: "Cập nhật công nợ", exact: true }),
        ).toBeFocused();
      }
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await reviewTaste(
          page,
          `docs/release/evidence/receivables/${mode}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/receivables/${mode}-${width}.png`,
          fullPage: true,
        });
      }
    }
  } finally {
    await db.$disconnect();
  }
});
test("receivables Web rejects a real manager context despite its separate invoice and receipt read permissions", async ({
  page,
}) => {
  const db = database();
  try {
    const source = await db.user.findUniqueOrThrow({
        where: { email: "accountant@example.test" },
      }),
      email = "debt-manager-" + randomUUID() + "@example.test";
    const user = await db.user.create({
      data: {
        email,
        displayName: "Quản lý kiểm thử công nợ",
        passwordHash: source.passwordHash,
        status: "ACTIVE",
      },
    });
    await db.membership.create({
      data: {
        tenantId,
        userId: user.id,
        status: "ACTIVE",
        roles: { create: { role: "manager" } },
      },
    });
    await login(page, email, "Quản lý");
    await expect(
      page.getByRole("link", { name: "Công nợ học phí", exact: true }),
    ).toHaveCount(0);
    await page.goto("/app/finance/receivables");
    await expect(
      page.getByRole("alert").filter({
        hasText: "Vai trò hiện tại không có quyền xem báo cáo công nợ.",
      }),
    ).toBeVisible();
    await page.goto("/app/finance/invoices");
    await expect(
      page.getByRole("heading", { name: "Danh sách chứng từ", exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
test("receivables Web recovers an out-of-range page after a synthetic concurrent ledger state change", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db, false, 19);
    await login(page);
    await open(page, f);
    await page.getByRole("button", { name: "Trang sau", exact: true }).click();
    await expect(page.getByText("Trang 2", { exact: true })).toBeVisible();
    // Only owned disposable fixture rows change; no response is mocked and no financial record is deleted.
    await db.invoice.updateMany({
      where: { tenantId, id: { in: f.rows.slice(4).map((i) => i.id) } },
      data: {
        billingState: "VOID",
        voidReason: "Synthetic concurrent financial fixture state update",
      },
    });
    await page
      .getByRole("button", { name: "Cập nhật công nợ", exact: true })
      .click();
    await expect(
      page.getByText(
        "Trang hiện tại không còn bản ghi sau khi công nợ thay đổi. Vẫn còn chứng từ phù hợp trên trang đầu.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Về trang đầu", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: f.rows[0]!.invoiceNo, exact: true }),
    ).toBeVisible();
    await expect(balance(page, "1.700.000\u00a0₫")).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
