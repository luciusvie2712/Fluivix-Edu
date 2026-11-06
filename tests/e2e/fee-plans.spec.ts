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
const year = new Date().getUTCFullYear() + 1;
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
  await expect(page).toHaveURL("/app/students");
}
async function fixture(db: PrismaClient) {
  const stamp = Date.now();
  const cls = await db.educationClass.create({
    data: {
      tenantId,
      code: "FE" + stamp,
      name: "Lớp biểu phí " + stamp,
      capacity: 10,
      status: "ACTIVE",
      startDate: new Date(`${year}-01-01Z`),
      endDate: new Date(`${year}-12-31Z`),
    },
  });
  return { cls, name: "Biểu phí vận hành " + stamp };
}
async function create(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
  billingModel = "MONTHLY",
) {
  await page.getByRole("link", { name: "Biểu phí", exact: true }).click();
  await page.getByLabel("Tìm tên hoặc mã lớp cho biểu phí").fill(f.cls.code);
  await page
    .getByLabel("Lớp áp dụng biểu phí", { exact: true })
    .selectOption(f.cls.id);
  await page.getByLabel("Tên biểu phí", { exact: true }).fill(f.name);
  await page
    .getByLabel("Cách tính học phí", { exact: true })
    .selectOption(billingModel);
  await page.getByLabel("Số tiền gốc (VND)", { exact: true }).fill("0");
  await page
    .getByLabel("Hiệu lực từ ngày", { exact: true })
    .fill(`${year}-01-01`);
  await page
    .getByLabel("Hiệu lực đến ngày (không bắt buộc)", { exact: true })
    .fill(`${year}-12-31`);
  await page.getByRole("button", { name: "Tạo biểu phí", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Biểu phí đã tạo:" })
    .getByRole("link")
    .click();
  await expect(
    page.getByRole("heading", { name: f.name, exact: true }),
  ).toBeVisible();
}
async function fillTerm(page: Page, amount = "9007199254740993") {
  await page
    .getByLabel("Tên áp dụng cho kỳ tương lai", { exact: true })
    .fill("Học phí đã kiểm tra kỳ tới");
  await page
    .getByLabel("Số tiền cho kỳ tương lai (VND)", { exact: true })
    .fill(amount);
  await page
    .getByLabel("Ngày áp dụng điều khoản mới", { exact: true })
    .fill(`${year}-02-01`);
  await page
    .getByLabel("Lý do thay đổi", { exact: true })
    .fill("Điều chỉnh học phí tương lai đã được kiểm tra");
}

test("accountant creates real zero/monthly and course fee plans and confirms exact future terms", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await create(page, f);
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(
      (await db.feePlan.findUniqueOrThrow({ where: { id } })).amountVnd,
    ).toBe(0n);
    await fillTerm(page);
    await expect(
      page.getByRole("button", {
        name: "Lưu điều khoản tương lai",
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Lưu điều khoản tương lai", exact: true })
      .click();
    const outcome = page.getByText(
      "Đã ghi nhận điều khoản tương lai; các chứng từ đã phát hành giữ nguyên.",
      { exact: true },
    );
    await expect(outcome).toBeVisible();
    await expect(outcome).toBeFocused();
    await expect(
      page.getByRole("heading", {
        name: `Phiên bản 2 · từ 01/02/${year}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/9\.007\.199\.254\.740\.993\s*₫/),
    ).toBeVisible();
    expect(
      (await db.feePlanTerm.findFirstOrThrow({ where: { feePlanId: id } }))
        .amountVnd,
    ).toBe(9007199254740993n);
    expect(
      (await db.feePlan.findUniqueOrThrow({ where: { id } })).amountVnd,
    ).toBe(0n);
    await create(page, await fixture(db), "COURSE");
    await expect(page.getByText("Toàn khóa", { exact: true })).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
test("fee plan conflict retains the entered future amount until explicit reload", async ({
  page,
  context,
}) => {
  const db = database(),
    other = await context.browser()!.newContext(),
    second = await other.newPage();
  try {
    const f = await fixture(db);
    await login(page);
    await create(page, f);
    await login(second, "inviter@example.test", "Chủ trung tâm");
    await second.goto(page.url());
    await fillTerm(page, "1500000");
    await fillTerm(second, "1800000");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Lưu điều khoản tương lai", exact: true })
      .click();
    await expect(
      page.getByText(
        "Đã ghi nhận điều khoản tương lai; các chứng từ đã phát hành giữ nguyên.",
        { exact: true },
      ),
    ).toBeVisible();
    await second.getByRole("checkbox").check();
    await second
      .getByRole("button", { name: "Lưu điều khoản tương lai", exact: true })
      .click();
    await expect(
      second
        .getByRole("alert")
        .filter({ hasText: "Nội dung đang nhập được giữ lại" }),
    ).toBeVisible();
    await expect(
      second.getByLabel("Số tiền cho kỳ tương lai (VND)", { exact: true }),
    ).toHaveValue("1800000");
    await expect(
      second.getByRole("button", {
        name: "Lưu điều khoản tương lai",
        exact: true,
      }),
    ).toBeDisabled();
    second.once("dialog", (d) => d.accept());
    await second
      .getByRole("button", { name: "Dùng phiên bản mới nhất", exact: true })
      .click();
    await expect(
      second.getByLabel("Số tiền cho kỳ tương lai (VND)", { exact: true }),
    ).toHaveValue("0");
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(await db.feePlanTerm.count({ where: { feePlanId: id } })).toBe(1);
  } finally {
    await other.close();
    await db.$disconnect();
  }
});
test("fee plan directory and terms forms have responsive accessible keyboard and reduced-motion feedback", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await create(page, f);
    const detail = new URL(page.url()).pathname;
    mkdirSync("docs/release/evidence/fee-plans", { recursive: true });
    for (const surface of ["directory", "detail"]) {
      await page.goto(
        surface === "directory" ? "/app/finance/fee-plans" : detail,
      );
      if (surface === "directory")
        await page.getByLabel("Tìm tên biểu phí gốc").fill(f.name);
      await expect(
        page.getByRole("heading", {
          name:
            surface === "directory"
              ? "Danh sách biểu phí"
              : "Ghi nhận điều khoản tương lai",
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
          path: `docs/release/evidence/fee-plans/${surface}-${width}.png`,
          fullPage: true,
        });
        await reviewTaste(
          page,
          `docs/release/evidence/fee-plans/${surface}-taste-${width}.json`,
        );
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByLabel("Số tiền cho kỳ tương lai (VND)", { exact: true })
      .focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("1500000");
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel("Ngày áp dụng điều khoản mới", { exact: true }),
    ).toBeFocused();
  } finally {
    await db.$disconnect();
  }
});
test("fee plans show empty/read-only/missing states and manager cannot enter configuration", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page);
    await create(page, f);
    const detail = new URL(page.url()).pathname;
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Lưu điều khoản tương lai",
        exact: true,
      }),
    ).toBeDisabled();
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await page.goto("/app/finance/fee-plans");
    await page
      .getByLabel("Tìm tên biểu phí gốc")
      .fill("absent-synthetic-fee-plan");
    await expect(
      page.getByText("Chưa có biểu phí phù hợp.", { exact: true }),
    ).toBeVisible();
    await page.goto(
      "/app/finance/fee-plans/00000000-0000-4000-8000-000000000099",
    );
    await expect(
      page.getByRole("alert").filter({ hasText: "Không tìm thấy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Ghi nhận điều khoản tương lai",
        exact: true,
      }),
    ).toHaveCount(0);
    const owner = await db.user.findUniqueOrThrow({
        where: { email: "inviter@example.test" },
      }),
      email = `fee-manager-${Date.now()}@example.test`;
    // Only synthetic account bootstrap; Staff E2E independently proves activation.
    const user = await db.user.create({
      data: {
        email,
        displayName: "Quản lý kiểm thử biểu phí",
        status: "ACTIVE",
        passwordHash: owner.passwordHash,
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
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await login(page, email, "Quản lý");
    await expect(
      page.getByRole("link", { name: "Biểu phí", exact: true }),
    ).toHaveCount(0);
    await page.goto(detail);
    await expect(
      page.getByRole("alert").filter({
        hasText: "Chỉ chủ trung tâm và kế toán được quản lý biểu phí.",
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Số tiền cho kỳ tương lai (VND)", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });
    await db.$disconnect();
  }
});
