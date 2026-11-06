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
  // Synthetic invoices only, in the runner's guarded disposable PostgreSQL database.
  const stamp = randomUUID().slice(0, 8),
    actor = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
  return db.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        tenantId,
        studentCode: "PAY" + stamp,
        fullName: "Học viên phiếu thu " + stamp,
        status: "PAUSED",
      },
    });
    const cls = await tx.educationClass.create({
      data: {
        tenantId,
        code: "PAY" + stamp,
        name: "Lớp phiếu thu " + stamp,
        capacity: 5,
        status: "ACTIVE",
        startDate: new Date(`${year}-01-01Z`),
        endDate: new Date(`${year}-12-31Z`),
      },
    });
    const fee = await tx.feePlan.create({
      data: {
        tenantId,
        classId: cls.id,
        name: "Học phí phiếu thu " + stamp,
        billingModel: "MONTHLY",
        amountVnd: 1000000n,
        validFrom: cls.startDate,
      },
    });
    const invoices = [];
    for (const periodKey of [`${year}-01`, `${year}-02`]) {
      const run = await tx.invoiceRun.create({
        data: {
          tenantId,
          feePlanId: fee.id,
          periodKey,
          requestHash: "a".repeat(64),
          createdBy: actor.id,
        },
      });
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          studentId: student.id,
          runId: run.id,
          invoiceNo: "PAY-INV-" + randomUUID(),
          dueAt: new Date(periodKey + "-15T17:00:00Z"),
          totalAmountVnd: 1000000n,
          createdBy: actor.id,
        },
      });
      await tx.invoiceItem.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          feePlanId: fee.id,
          description: fee.name,
          totalAmountVnd: 1000000n,
        },
      });
      invoices.push(invoice);
    }
    return { student, invoices };
  });
}
async function start(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
  amount = "500000",
) {
  await page
    .getByRole("link", { name: "Thu tiền và phiếu thu", exact: true })
    .click();
  await page
    .getByLabel("Tìm mã hoặc tên học viên thu tiền", { exact: true })
    .fill(f.student.studentCode);
  await page
    .getByLabel("Học viên thu tiền", { exact: true })
    .selectOption(f.student.id);
  await page
    .getByLabel("Số tiền thực nhận (VND)", { exact: true })
    .fill(amount);
  await page
    .getByLabel("Phương thức nhận tiền", { exact: true })
    .selectOption("BANK_TRANSFER");
  await page
    .getByLabel("Thời điểm nhận tiền (giờ Việt Nam)", { exact: true })
    .fill(`${year}-01-16T08:30`);
  await page
    .getByLabel("Tham chiếu giao dịch (nếu có)", { exact: true })
    .fill("BANK-REFERENCE-" + f.student.studentCode);
  await page
    .getByLabel(`Phân bổ cho ${f.invoices[0]!.invoiceNo} (VND)`, {
      exact: true,
    })
    .fill("200000");
  await page
    .getByLabel(`Phân bổ cho ${f.invoices[1]!.invoiceNo} (VND)`, {
      exact: true,
    })
    .fill("300000");
}
async function commit(page: Page) {
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Xác nhận ghi nhận tiền", exact: true })
    .click();
  const outcome = page
    .getByRole("status")
    .filter({ hasText: "Đã ghi nhận tiền trên hệ thống." });
  await expect(outcome).toBeVisible();
  await expect(outcome).toBeFocused();
  return outcome;
}
test("payment Web records partial and final multi-invoice installments, prints actual receipt and reverses with audit", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await start(page, f);
    await expect(
      page.getByRole("button", { name: "Xác nhận ghi nhận tiền", exact: true }),
    ).toBeDisabled();
    const outcome = await commit(page);
    await outcome.getByRole("link").click();
    await expect(page).toHaveURL(/\/app\/finance\/payments\/[0-9a-f-]+$/);
    const receiptPath = new URL(page.url()).pathname;
    await expect(
      page.getByRole("heading", { name: "Phiếu thu nội bộ", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("BANK-REFERENCE-" + f.student.studentCode, {
        exact: true,
      }),
    ).toBeVisible();
    const screenViewport = page.viewportSize();
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".payment-receipt")).toBeVisible();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Xác nhận đảo giao dịch", exact: true }),
    ).toBeHidden();
    mkdirSync("docs/release/evidence/payments", { recursive: true });
    await page.screenshot({
      path: "docs/release/evidence/payments/receipt-print.png",
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });
    if (screenViewport) await page.setViewportSize(screenViewport);
    await start(page, f, "1500000");
    await page
      .getByLabel(`Phân bổ cho ${f.invoices[0]!.invoiceNo} (VND)`, {
        exact: true,
      })
      .fill("800000");
    await page
      .getByLabel(`Phân bổ cho ${f.invoices[1]!.invoiceNo} (VND)`, {
        exact: true,
      })
      .fill("700000");
    await commit(page);
    expect(
      await db.payment.count({
        where: { studentId: f.student.id, status: "CONFIRMED" },
      }),
    ).toBe(2);
    await page.goto(receiptPath);
    await expect(
      page.getByRole("heading", {
        name: "Số dư chứng từ hiện tại",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Đảo phiếu thu sau khi đã xác minh giao dịch");
    await expect(
      page.getByRole("button", { name: "Xác nhận đảo giao dịch", exact: true }),
    ).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận đảo giao dịch", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Đã đảo giao dịch trên hệ thống" }),
    ).toBeFocused();
    await expect(
      page.getByText(
        "Phiếu đã đảo; bản ghi thu tiền và phân bổ gốc được giữ nguyên.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      await db.paymentAllocation.count({ where: { studentId: f.student.id } }),
    ).toBe(4);
    expect(
      await db.paymentReversal.count({
        where: { paymentId: receiptPath.split("/").at(-1)! },
      }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
});
test("payment Web retries a truly committed lost response using the same key and keeps the financial intent locked", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await start(page, f);
    const keys: string[] = [];
    let lose = true;
    await page.route("**/api/v1/payments", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
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
      .getByRole("button", { name: "Xác nhận ghi nhận tiền", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Chưa nhận được kết quả thu tiền" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Số tiền thực nhận (VND)", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Học viên thu tiền", { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Xác nhận ghi nhận tiền", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Đã ghi nhận tiền trên hệ thống." }),
    ).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
    expect(await db.payment.count({ where: { studentId: f.student.id } })).toBe(
      1,
    );
    expect(
      await db.paymentAllocation.count({ where: { studentId: f.student.id } }),
    ).toBe(2);
    await page
      .getByRole("status")
      .filter({ hasText: "Đã ghi nhận tiền trên hệ thống." })
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(/\/app\/finance\/payments\/[0-9a-f-]+$/);
    let reversedRequests = 0;
    await page.route("**/api/v1/payments/*/reverse", async (route) => {
      reversedRequests++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    });
    await page
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Đảo phiếu thu có phản hồi bị mất trên mạng");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận đảo giao dịch", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Máy chủ xác nhận phiếu đã đảo." }),
    ).toBeFocused();
    expect(reversedRequests).toBe(1);
    expect(
      await db.paymentReversal.count({
        where: { paymentId: new URL(page.url()).pathname.split("/").at(-1)! },
      }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
});
test("payment Web exposes honest empty, readonly and missing states and prevents over-allocation before confirmation", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await start(page, f, "400000");
    await page
      .getByLabel(`Phân bổ cho ${f.invoices[0]!.invoiceNo} (VND)`, {
        exact: true,
      })
      .fill("2000000");
    await expect(
      page.getByText("Tổng phân bổ: Chưa hợp lệ", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(`Phân bổ cho ${f.invoices[0]!.invoiceNo} (VND)`, {
        exact: true,
      })
      .fill("200000");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Tổng phân bổ vượt số tiền thực nhận." }),
    ).toBeVisible();
    await page.getByRole("checkbox").check();
    await expect(
      page.getByRole("button", { name: "Xác nhận ghi nhận tiền", exact: true }),
    ).toBeDisabled();
    expect(await db.payment.count({ where: { studentId: f.student.id } })).toBe(
      0,
    );
    await page
      .getByLabel("Tìm số phiếu, mã hoặc tên học viên", { exact: true })
      .fill("NO-PAYMENT-" + f.student.id);
    await expect(
      page.getByText("Chưa có phiếu thu phù hợp.", { exact: true }),
    ).toBeVisible();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(
      page.getByText(
        "Chỉ xem phiếu thu. Vai trò hoặc trạng thái trung tâm hiện tại không cho phép ghi nhận tiền.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Xác nhận ghi nhận tiền", exact: true }),
    ).toHaveCount(0);
    await page.goto("/app/finance/payments/" + randomUUID());
    await expect(
      page.getByRole("alert").filter({
        hasText: "Không tìm thấy dữ liệu trong trung tâm đang chọn.",
      }),
    ).toBeVisible();
  } finally {
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await db.$disconnect();
  }
});
test("payment directory and receipt have accessible responsive keyboard and reduced-motion forms", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await start(page, f);
    const outcome = await commit(page);
    await outcome.getByRole("link").click();
    await expect(page).toHaveURL(/\/app\/finance\/payments\/[0-9a-f-]+$/);
    const detail = new URL(page.url()).pathname;
    mkdirSync("docs/release/evidence/payments", { recursive: true });
    for (const surface of ["directory", "detail"]) {
      await page.goto(
        surface === "directory" ? "/app/finance/payments" : detail,
      );
      if (surface === "directory")
        await page
          .getByLabel("Tìm số phiếu, mã hoặc tên học viên", { exact: true })
          .fill(f.student.studentCode);
      await expect(
        page.getByRole("heading", {
          name:
            surface === "directory"
              ? "Danh sách phiếu thu"
              : "Phiếu thu nội bộ",
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
        await reviewTaste(
          page,
          `docs/release/evidence/payments/${surface}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/payments/${surface}-${width}.png`,
          fullPage: true,
        });
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByLabel("Lý do thay đổi", { exact: true }).focus();
    await page.keyboard.type("Dao giao dich da xac minh hop le");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("checkbox")).toBeFocused();
  } finally {
    await db.$disconnect();
  }
});
test("payment Web enforces actual manager read access and teaching-role deep-link denial", async ({
  page,
}) => {
  const db = database();
  try {
    const source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
    for (const [role, label] of [
      ["manager", "Quản lý"],
      ["academic_staff", "Giáo vụ"],
    ] as const) {
      const email = role + "-receipt-" + randomUUID() + "@example.test";
      const user = await db.user.create({
        data: {
          email,
          displayName: "Vai trò phiếu thu " + role,
          passwordHash: source.passwordHash,
          status: "ACTIVE",
        },
      });
      await db.membership.create({
        data: {
          tenantId,
          userId: user.id,
          status: "ACTIVE",
          roles: { create: { role } },
        },
      });
      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page
        .getByLabel("Mật khẩu", { exact: true })
        .fill("Fluivix-Test-Password-2026");
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page).toHaveURL("/app/students");
      await page.goto("/app/finance/payments");
      if (role === "manager")
        await expect(
          page.getByText(
            "Chỉ xem phiếu thu. Vai trò hoặc trạng thái trung tâm hiện tại không cho phép ghi nhận tiền.",
            { exact: true },
          ),
        ).toBeVisible();
      else {
        await expect(
          page.getByRole("alert").filter({
            hasText: "Vai trò hiện tại không có quyền xem phiếu thu.",
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", {
            name: "Thu tiền và phiếu thu",
            exact: true,
          }),
        ).toHaveCount(0);
      }
      await expect(
        page.getByRole("button", {
          name: "Xác nhận ghi nhận tiền",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Đăng xuất", exact: true })
        .click();
      await expect(page).toHaveURL("/login");
    }
  } finally {
    await db.$disconnect();
  }
});
