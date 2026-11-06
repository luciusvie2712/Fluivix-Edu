import { test, expect, type Page } from "./fixtures";
import { testOrigins } from "../../tooling/test-origins";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
function database() {
  const url = process.env.E2E_DATABASE_URL;
  if (
    !url ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw Error("Isolated loopback test DB required");
  return new PrismaClient({ datasourceUrl: url });
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("/tenant/select");
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
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
}
async function noStorage(page: Page) {
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
}
test("two real tabs retain the same verified scope and draft while shared HttpOnly refresh rotates", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .getByLabel("Tìm theo mã hoặc họ tên", { exact: true })
    .fill("Học viên");
  const second = await context.newPage();
  await second.goto("/app/students");
  await expect(
    second.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/app\/students(?:\?.*)?$/);
  await expect(
    page.getByLabel("Tìm theo mã hoặc họ tên", { exact: true }),
  ).toHaveValue("Học viên");
  for (const tab of [page, second]) await noStorage(tab);
  await Promise.all([page.reload(), second.reload()]);
  for (const tab of [page, second])
    await expect(
      tab.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
    ).toBeVisible();
  const cookie = (await context.cookies(testOrigins.api)).find(
    (c) => c.name === "__Host-fluivix-refresh",
  );
  if (!cookie) throw Error("Missing actual HttpOnly cookie");
  expect({
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }).toEqual({ httpOnly: true, secure: true, sameSite: "Strict" });
});
test("another tab's centre switch clears old drafts and deep links, and logout removes both tabs' access", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .getByLabel("Tìm theo mã hoặc họ tên", { exact: true })
    .fill("DRAFT-ONLY-A");
  const second = await context.newPage();
  await second.goto("/app/students");
  await expect(
    second.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  await second
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
  await second
    .locator("section")
    .filter({
      has: second.getByRole("heading", {
        name: "Trung tâm kiểm thử B",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  for (const tab of [page, second]) {
    await expect(
      tab.getByRole("cell", { name: "Học viên kiểm thử B", exact: true }),
    ).toBeVisible();
    await expect(
      tab.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
    ).toHaveCount(0);
    await expect(
      tab.getByLabel("Tìm theo mã hoặc họ tên", { exact: true }),
    ).toHaveValue("");
    await noStorage(tab);
  }
  await second.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(second).toHaveURL("/login");
  await expect(page).toHaveURL("/login");
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử B", exact: true }),
  ).toHaveCount(0);
});
test("a real external cookie rotation recovers a safe GET while elapsed-time renewal tolerates a changed client wall clock", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await login(page);
  const rotated = await context.request.post(
    testOrigins.api + "/api/v1/auth/refresh",
    {
      headers: { Origin: testOrigins.web, "Content-Type": "application/json" },
      data: {},
    },
  );
  expect(rotated.status()).toBe(200);
  await page
    .getByLabel("Tìm theo mã hoặc họ tên", { exact: true })
    .fill("Học viên");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  const renewed = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/auth/refresh") && r.status() === 200,
  );
  await page.clock.fastForward(240000);
  await renewed;
  await page
    .getByLabel("Tìm theo mã hoặc họ tên", { exact: true })
    .fill("kiểm thử");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  await noStorage(page);
});
test("a genuine payment 401 recovers credentials but never automatically replays the financial POST", async ({
  page,
  context,
}) => {
  const db = database();
  try {
    const stamp = randomUUID().slice(0, 8),
      student = await db.student.create({
        data: {
          tenantId: "10000000-0000-4000-8000-000000000001",
          studentCode: "AUTH-PAY-" + stamp,
          fullName: "Học viên kiểm tra phiên " + stamp,
          status: "PAUSED",
        },
      });
    const year = new Date().getUTCFullYear() + 1,
      actor = await db.user.findUniqueOrThrow({
        where: { email: "owner@example.test" },
      });
    const invoice = await db.$transaction(async (tx) => {
      const cls = await tx.educationClass.create({
        data: {
          tenantId: student.tenantId,
          code: "AUTH-PAY-" + stamp,
          name: "Lớp kiểm tra phiên " + stamp,
          capacity: 5,
          status: "ACTIVE",
          startDate: new Date(`${year}-01-01Z`),
          endDate: new Date(`${year}-12-31Z`),
        },
      });
      const fee = await tx.feePlan.create({
        data: {
          tenantId: student.tenantId,
          classId: cls.id,
          name: "Biểu phí kiểm tra phiên",
          billingModel: "MONTHLY",
          amountVnd: 100000n,
          validFrom: cls.startDate,
        },
      });
      const run = await tx.invoiceRun.create({
        data: {
          tenantId: student.tenantId,
          feePlanId: fee.id,
          periodKey: `${year}-01`,
          requestHash: "a".repeat(64),
          createdBy: actor.id,
        },
      });
      const issued = await tx.invoice.create({
        data: {
          tenantId: student.tenantId,
          studentId: student.id,
          runId: run.id,
          invoiceNo: "AUTH-INV-" + stamp,
          dueAt: new Date(`${year}-01-15T17:00:00Z`),
          totalAmountVnd: 100000n,
          createdBy: actor.id,
        },
      });
      await tx.invoiceItem.create({
        data: {
          tenantId: student.tenantId,
          invoiceId: issued.id,
          feePlanId: fee.id,
          description: fee.name,
          totalAmountVnd: 100000n,
        },
      });
      return issued;
    });
    await login(page);
    await page
      .getByRole("link", { name: "Thu tiền và phiếu thu", exact: true })
      .click();
    await expect(page).toHaveURL("/app/finance/payments");
    await page
      .getByLabel("Tìm mã hoặc tên học viên thu tiền", { exact: true })
      .fill(student.studentCode);
    await page
      .getByLabel("Học viên thu tiền", { exact: true })
      .selectOption(student.id);
    await page
      .getByLabel("Số tiền thực nhận (VND)", { exact: true })
      .fill("100000");
    await page
      .getByLabel("Phương thức nhận tiền", { exact: true })
      .selectOption("CASH");
    await page
      .getByLabel("Thời điểm nhận tiền (giờ Việt Nam)", { exact: true })
      .fill(`${new Date().getUTCFullYear() + 1}-01-16T08:30`);
    await page
      .getByLabel(`Phân bổ cho ${invoice.invoiceNo} (VND)`, { exact: true })
      .fill("100000");
    const statuses: number[] = [],
      keys: string[] = [];
    await page.route("**/api/v1/payments", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]!);
      if (keys.length === 1) {
        const rotated = await context.request.post(
          testOrigins.api + "/api/v1/auth/refresh",
          {
            headers: {
              Origin: testOrigins.web,
              "Content-Type": "application/json",
            },
            data: {},
          },
        );
        expect(rotated.status()).toBe(200);
      }
      const response = await route.fetch();
      statuses.push(response.status());
      await route.fulfill({ response });
    });
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận ghi nhận tiền", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({
        hasText: "Phiên đăng nhập hết hạn hoặc thông tin không hợp lệ.",
      }),
    ).toBeVisible();
    expect(statuses).toEqual([401]);
    expect(keys).toHaveLength(1);
    expect(await db.payment.count({ where: { studentId: student.id } })).toBe(
      0,
    );
    await expect(
      page.getByLabel("Số tiền thực nhận (VND)", { exact: true }),
    ).toHaveValue("100000");
    await page
      .getByRole("button", { name: "Xác nhận ghi nhận tiền", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Đã ghi nhận tiền trên hệ thống." }),
    ).toBeVisible();
    expect(statuses).toEqual([401, 201]);
    expect(keys).toHaveLength(2);
    expect(keys.every(Boolean)).toBe(true);
    expect(await db.payment.count({ where: { studentId: student.id } })).toBe(
      1,
    );
    await noStorage(page);
  } finally {
    await db.$disconnect();
  }
});
test("a committed context switch with a genuinely lost response is verified without repeating its POST", async ({
  page,
  context,
}) => {
  await login(page);
  const second = await context.newPage();
  await second.goto("/app/students");
  await expect(
    second.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  let posts = 0;
  await second.route("**/api/v1/auth/switch-context", async (route) => {
    posts++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await second
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
  await second
    .locator("section")
    .filter({
      has: second.getByRole("heading", {
        name: "Trung tâm kiểm thử B",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  for (const tab of [page, second]) {
    await expect(
      tab.getByRole("cell", { name: "Học viên kiểm thử B", exact: true }),
    ).toBeVisible();
    await expect(
      tab.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
    ).toHaveCount(0);
    await noStorage(tab);
  }
  expect(posts).toBe(1);
});
test("foreign-family peer tokens are rejected and an explicit different-user login clears the old identity in every tab", async ({
  page,
  context,
  browser,
}) => {
  await login(page);
  await page
    .getByLabel("Tìm theo mã hoặc họ tên", { exact: true })
    .fill("OWNER-DRAFT-ONLY");
  const other = await browser.newContext({ baseURL: testOrigins.web });
  try {
    const otherPage = await other.newPage();
    let foreign = "";
    otherPage.on("request", (r) => {
      if (r.url().includes("/api/v1/students?"))
        foreign = r.headers().authorization?.replace(/^Bearer /, "") ?? "";
    });
    await otherPage.goto("/login");
    await otherPage
      .getByLabel("Email", { exact: true })
      .fill("accountant@example.test");
    await otherPage
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Fluivix-Test-Password-2026");
    await otherPage
      .getByRole("button", { name: "Đăng nhập", exact: true })
      .click();
    await otherPage
      .getByRole("button", { name: "Kế toán", exact: true })
      .click();
    await expect(
      otherPage.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
    ).toBeVisible();
    expect(Boolean(foreign)).toBe(true);
    const rejected = page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/auth/web-session") && r.status() === 401,
    );
    await page.evaluate((token) => {
      const channel = new BroadcastChannel("fluivixedu-tenant-web-session");
      channel.postMessage({ kind: "token", token });
      channel.close();
    }, foreign);
    await rejected;
    await expect(page.locator(".topbar")).toContainText("Chủ trung tâm");
    await expect(
      page.getByRole("link", { name: "Nhân sự và quyền", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Tìm theo mã hoặc họ tên", { exact: true }),
    ).toHaveValue("OWNER-DRAFT-ONLY");
    const second = await context.newPage();
    await second.goto("/login");
    await second
      .getByLabel("Email", { exact: true })
      .fill("accountant@example.test");
    await second
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Fluivix-Test-Password-2026");
    await second
      .getByRole("button", { name: "Đăng nhập", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Chọn trung tâm và vai trò",
        exact: true,
      }),
    ).toBeVisible();
    await second.getByRole("button", { name: "Kế toán", exact: true }).click();
    for (const tab of [page, second]) {
      await expect(
        tab.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
      ).toBeVisible();
      await expect(tab.locator(".topbar")).toContainText("Kế toán");
      await expect(
        tab.getByRole("link", { name: "Nhân sự và quyền", exact: true }),
      ).toHaveCount(0);
      await expect(
        tab.getByLabel("Tìm theo mã hoặc họ tên", { exact: true }),
      ).toHaveValue("");
      await noStorage(tab);
    }
  } finally {
    await other.close();
  }
});
test("a role switch cancels real delayed owner audit bytes and removes the previous deep link", async ({
  page,
  context,
}) => {
  const db = database();
  let release = () => {};
  try {
    const tenantId = "10000000-0000-4000-8000-000000000001",
      actor = await db.user.findUniqueOrThrow({
        where: { email: "owner@example.test" },
      }),
      member = await db.membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId, userId: actor.id } },
      }),
      resource = "AUTH-AUDIT-" + randomUUID();
    await db.membershipRole.upsert({
      where: {
        membershipId_role: { membershipId: member.id, role: "manager" },
      },
      create: { membershipId: member.id, role: "manager" },
      update: {},
    });
    await db.auditLog.createMany({
      data: ["staff.role.assign", "attendance.reopened"].map((action) => ({
        tenantId,
        actorUserId: actor.id,
        action,
        resourceId: resource,
        traceId: randomUUID(),
      })),
    });
    await login(page);
    await page
      .getByRole("link", { name: "Nhật ký hoạt động", exact: true })
      .click();
    await expect(page).toHaveURL("/app/audit");
    await page
      .getByLabel("Mã tài nguyên chính xác", { exact: true })
      .fill(resource);
    await page
      .getByRole("button", { name: "Áp dụng bộ lọc", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "staff.role.assign", exact: true }),
    ).toBeVisible();
    let captured = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready = () => {};
    const bytes = new Promise<void>((resolve) => {
      ready = resolve;
    });
    await page.route("**/api/v1/audit-logs?**", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      captured = body.data.rows.some(
        (r: { action: string }) => r.action === "staff.role.assign",
      );
      ready();
      await held;
      // Invalidating the scope may abort this genuine request before release.
      await route.fulfill({ response }).catch(() => {});
    });
    await page
      .getByRole("button", { name: "Cập nhật nhật ký", exact: true })
      .click();
    await bytes;
    expect(captured).toBe(true);
    const second = await context.newPage();
    await second.goto("/app/students");
    await expect(
      second.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
    ).toBeVisible();
    await second
      .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
      .click();
    await second
      .locator("section")
      .filter({
        has: second.getByRole("heading", {
          name: "Trung tâm kiểm thử A",
          exact: true,
        }),
      })
      .getByRole("button", { name: "Quản lý", exact: true })
      .click();
    await expect(page).toHaveURL("/app/students");
    await expect(page.locator(".topbar")).toContainText("Quản lý");
    release();
    await page.unroute("**/api/v1/audit-logs?**");
    await expect(
      page.getByRole("heading", { name: "staff.role.assign", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Nhật ký hoạt động", exact: true })
      .click();
    await expect(page).toHaveURL("/app/audit");
    await page
      .getByLabel("Mã tài nguyên chính xác", { exact: true })
      .fill(resource);
    await page
      .getByRole("button", { name: "Áp dụng bộ lọc", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "attendance.reopened", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "staff.role.assign", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Xuất CSV nhật ký", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
    await db.$disconnect();
  }
});
test("session verification network failures have accessible retry and recover real cookie state", async ({
  page,
  context,
}) => {
  await login(page);
  const second = await context.newPage();
  await second.route("**/api/v1/auth/web-session", (route) =>
    route.abort("failed"),
  );
  await second.goto("/app/students");
  const notice = second.getByRole("region", {
    name: "Trạng thái phiên đăng nhập",
    exact: true,
  });
  await expect(notice.getByRole("alert")).toContainText(
    "Không thể kết nối dịch vụ",
  );
  await expect(
    second.getByRole("button", {
      name: "Thử lại phiên đăng nhập",
      exact: true,
    }),
  ).toBeVisible();
  await second.emulateMedia({ reducedMotion: "reduce" });
  mkdirSync("docs/release/evidence/web-session", { recursive: true });
  for (const width of [360, 768, 1024, 1440]) {
    await second.setViewportSize({ width, height: 900 });
    await second
      .getByRole("button", { name: "Thử lại phiên đăng nhập", exact: true })
      .focus();
    await expect(
      second.getByRole("button", {
        name: "Thử lại phiên đăng nhập",
        exact: true,
      }),
    ).toBeFocused();
    expect(
      (await new AxeBuilder({ page: second }).analyze()).violations,
    ).toEqual([]);
    await reviewTaste(
      second,
      `docs/release/evidence/web-session/retry-taste-${width}.json`,
    );
    await second.screenshot({
      path: `docs/release/evidence/web-session/retry-${width}.png`,
      fullPage: true,
    });
  }
  await second.unroute("**/api/v1/auth/web-session");
  await second
    .getByRole("button", { name: "Thử lại phiên đăng nhập", exact: true })
    .click();
  await expect(
    second.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  await noStorage(second);
});
