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
async function fixture(db: PrismaClient) {
  const stamp = randomUUID().slice(0, 8);
  const source = await db.user.findUniqueOrThrow({
    where: { email: "accountant@example.test" },
  });
  const plan = await db.subscription.findFirstOrThrow({
    where: {
      tenantId: "10000000-0000-4000-8000-000000000001",
      status: "ACTIVE",
    },
  });
  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        slug: "zone-" + stamp,
        name: "Trung tâm múi giờ " + stamp,
        timezone: "America/New_York",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.planId,
        status: "ACTIVE",
        startsAt: new Date("2020-01-01Z"),
        endsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    const actor = await tx.user.create({
      data: {
        email: "zone-" + stamp + "@example.test",
        displayName: "Kế toán múi giờ",
        passwordHash: source.passwordHash,
        status: "ACTIVE",
      },
    });
    await tx.membership.create({
      data: {
        tenantId: tenant.id,
        userId: actor.id,
        status: "ACTIVE",
        roles: { create: { role: "accountant" } },
      },
    });
    const cls = await tx.educationClass.create({
      data: {
        tenantId: tenant.id,
        code: "TZ" + stamp,
        name: "Lớp múi giờ " + stamp,
        capacity: 5,
        status: "ACTIVE",
        startDate: new Date("2020-01-01Z"),
        endDate: new Date("2040-01-01Z"),
      },
    });
    const student = await tx.student.create({
      data: {
        tenantId: tenant.id,
        studentCode: "TZ" + stamp,
        fullName: "Học viên múi giờ " + stamp,
      },
    });
    await tx.enrollment.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        studentId: student.id,
        joinedAt: new Date("2020-01-01Z"),
      },
    });
    const fee = await tx.feePlan.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        name: "Học phí múi giờ " + stamp,
        billingModel: "MONTHLY",
        amountVnd: 1000000n,
        validFrom: new Date("2020-01-01Z"),
      },
    });
    const run = await tx.invoiceRun.create({
      data: {
        tenantId: tenant.id,
        feePlanId: fee.id,
        periodKey: "2026-10",
        requestHash: "a".repeat(64),
        createdBy: actor.id,
      },
    });
    const invoice = await tx.invoice.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        runId: run.id,
        invoiceNo: "TZ-INV-" + stamp,
        totalAmountVnd: 1000000n,
        dueAt: new Date("2026-11-02T04:59:59.999Z"),
        createdBy: actor.id,
      },
    });
    await tx.invoiceItem.create({
      data: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        feePlanId: fee.id,
        description: fee.name,
        totalAmountVnd: 1000000n,
      },
    });
    return { tenant, actor, cls, student, fee, invoice };
  });
}
async function login(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(f.actor.email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const centre = page.locator(".context-card").filter({
    has: page.getByRole("heading", { name: f.tenant.name, exact: true }),
  });
  await centre.getByRole("button", { name: "Kế toán", exact: true }).click();
  await expect(page).toHaveURL("/app/students");
}
async function preparePayment(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
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
    .fill("100000");
  await page
    .getByLabel(`Phân bổ cho ${f.invoice.invoiceNo} (VND)`, { exact: true })
    .fill("100000");
}
test("financial Web rejects skipped local payment time, requires explicit DST occurrence and prints the actual centre clock", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await preparePayment(page, f);
    const clock = page.getByLabel(
      "Thời điểm nhận tiền (múi giờ America/New_York)",
      { exact: true },
    );
    const submit = page.getByRole("button", {
      name: "Xác nhận ghi nhận tiền",
      exact: true,
    });
    await clock.fill("2026-03-08T02:30");
    await expect(
      page.getByRole("alert").filter({ hasText: "không tồn tại" }),
    ).toBeVisible();
    await expect(submit).toBeDisabled();
    expect(await db.payment.count({ where: { tenantId: f.tenant.id } })).toBe(
      0,
    );
    await clock.fill("2026-11-01T01:30");
    const occurrence = page.getByLabel("Chọn lần xuất hiện của giờ nhận tiền", {
      exact: true,
    });
    await expect(occurrence.locator("option")).toHaveCount(3);
    await expect(submit).toBeDisabled();
    await occurrence.selectOption("2026-11-01T06:30:00.000Z");
    await page.getByRole("checkbox").check();
    await expect(submit).toBeEnabled();
    // Changing an actual instant resets financial confirmation.
    await occurrence.selectOption("2026-11-01T05:30:00.000Z");
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await occurrence.selectOption("2026-11-01T06:30:00.000Z");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await occurrence.focus();
    await expect(occurrence).toBeFocused();
    mkdirSync("docs/release/evidence/financial-timezone", { recursive: true });
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
        `docs/release/evidence/financial-timezone/fold-taste-${width}.json`,
      );
      await page.screenshot({
        path: `docs/release/evidence/financial-timezone/fold-${width}.png`,
        fullPage: true,
      });
    }
    await page.getByRole("checkbox").check();
    await submit.click();
    const outcome = page
      .getByRole("status")
      .filter({ hasText: "Đã ghi nhận tiền trên hệ thống." });
    await expect(outcome).toBeVisible();
    const payment = await db.payment.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    expect(payment.receivedAt.toISOString()).toBe("2026-11-01T06:30:00.000Z");
    expect(await db.payment.count({ where: { tenantId: f.tenant.id } })).toBe(
      1,
    );
    await outcome.getByRole("link").click();
    await expect(page).toHaveURL(/\/app\/finance\/payments\/[0-9a-f-]+$/);
    await expect(page.locator(".payment-receipt")).toContainText(
      "01:30:00 GMT-5 1/11/2026",
    );
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
        `docs/release/evidence/financial-timezone/receipt-taste-${width}.json`,
      );
      await page.screenshot({
        path: `docs/release/evidence/financial-timezone/receipt-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("link", { name: "Thu tiền và phiếu thu", exact: true })
      .click();
    await page
      .getByLabel("Nhận tiền từ ngày", { exact: true })
      .fill("2026-11-01");
    await page
      .getByLabel("Nhận tiền đến ngày", { exact: true })
      .fill("2026-11-01");
    await expect(
      page.getByRole("link", { name: payment.receiptNo, exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Nhận tiền đến ngày", { exact: true })
      .fill("2026-10-31");
    await expect(
      page.getByRole("alert").filter({ hasText: "Ngày bắt đầu" }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
test("financial Web previews and issues end-of-day in the selected IANA centre and shares due filters with receivables", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await page
      .getByRole("link", { name: "Chứng từ học phí", exact: true })
      .click();
    await expect(
      page.getByText(/ngày đến hạn theo múi giờ America\/New_York/),
    ).toBeVisible();
    await page
      .getByLabel("Tìm tên biểu phí: Biểu phí phát hành", { exact: true })
      .fill(f.fee.name);
    await page
      .getByLabel("Biểu phí phát hành", { exact: true })
      .selectOption(f.fee.id);
    await page.getByLabel("Tháng phát hành", { exact: true }).fill("2026-11");
    await page
      .getByLabel("Ngày đến hạn kỳ thu", { exact: true })
      .fill("2026-11-01");
    await page
      .getByRole("button", { name: "Xem trước kỳ thu", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Học viên và số tiền dự kiến",
        exact: true,
      }),
    ).toBeVisible();
    expect(await db.invoiceRun.count({ where: { feePlanId: f.fee.id } })).toBe(
      1,
    );
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận phát hành", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Đã phát hành kỳ thu trên hệ thống:" }),
    ).toBeVisible();
    const issuedRun = await db.invoiceRun.findUniqueOrThrow({
      where: {
        tenantId_feePlanId_periodKey: {
          tenantId: f.tenant.id,
          feePlanId: f.fee.id,
          periodKey: "2026-11",
        },
      },
    });
    const issued = await db.invoice.findFirstOrThrow({
      where: { tenantId: f.tenant.id, runId: issuedRun.id },
    });
    expect(issued.dueAt.toISOString()).toBe("2026-11-02T04:59:59.999Z");
    await page
      .getByLabel("Đến hạn từ ngày", { exact: true })
      .fill("2026-11-01");
    await page
      .getByLabel("Đến hạn đến ngày", { exact: true })
      .fill("2026-11-01");
    await expect(
      page.getByRole("link", { name: issued.invoiceNo, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Công nợ học phí", exact: true })
      .click();
    await page
      .getByLabel("Đến hạn từ ngày", { exact: true })
      .fill("2026-11-01");
    await page
      .getByLabel("Đến hạn đến ngày", { exact: true })
      .fill("2026-11-01");
    await expect(
      page.getByRole("link", { name: issued.invoiceNo, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/múi giờ America\/New_York/).first(),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
