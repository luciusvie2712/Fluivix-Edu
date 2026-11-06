import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
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
async function fixture(db: PrismaClient) {
  const stamp = randomUUID().slice(0, 8),
    source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
  const tenant = await db.tenant.create({
    data: {
      slug: "audit-ui-" + stamp,
      name: "Trung tâm nhật ký " + stamp,
      status: "ACTIVE",
      timezone: "Asia/Ho_Chi_Minh",
      subscriptionEndsAt: new Date("2040-01-01Z"),
      graceUntil: new Date("2040-02-01Z"),
    },
  });
  const actor = await db.user.create({
    data: {
      email: "audit-ui-" + stamp + "@example.test",
      displayName: "Chủ trung tâm nhật ký",
      passwordHash: source.passwordHash,
      status: "ACTIVE",
    },
  });
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: actor.id,
      status: "ACTIVE",
      roles: {
        create: [
          { role: "owner" },
          { role: "manager" },
          { role: "accountant" },
        ],
      },
    },
  });
  const backup = await db.user.create({
    data: {
      email: "audit-backup-" + stamp + "@example.test",
      displayName: "Chủ trung tâm thứ hai",
      passwordHash: source.passwordHash,
      status: "ACTIVE",
    },
  });
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: backup.id,
      status: "ACTIVE",
      roles: { create: { role: "owner" } },
    },
  });
  const resource = "AUDIT-" + stamp,
    privateMarker = "PRIVATE_AUDIT_" + stamp;
  for (const [i, action] of [
    "attendance.reopened",
    "payment.recorded",
    "staff.role.assign",
  ].entries())
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId: actor.id,
        action,
        resourceId: resource,
        traceId: "AUDIT-TRACE-" + stamp + "-" + i,
        createdAt: new Date("2026-11-02T01:00:00Z"),
        reason: privateMarker,
        metadata: {
          passwordHash: privateMarker,
          before: { score: privateMarker },
          after: { teacherNotesPrivate: privateMarker },
        },
      },
    });
  return { tenant, actor, resource, privateMarker };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function login(page: Page, f: Fixture) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(f.actor.email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  await expect(page).toHaveURL("/app/students");
  await page
    .getByRole("link", { name: "Nhật ký hoạt động", exact: true })
    .click();
  await expect(page).toHaveURL("/app/audit");
}
async function filter(page: Page, resource: string) {
  await page.getByLabel("Nhật ký từ ngày", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Nhật ký đến ngày", { exact: true }).fill("2026-11-30");
  await page
    .getByLabel("Mã tài nguyên chính xác", { exact: true })
    .fill(resource);
  await page
    .getByRole("button", { name: "Áp dụng bộ lọc", exact: true })
    .click();
}
async function switchRole(page: Page, role: string) {
  await page
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
  await page.getByRole("button", { name: role, exact: true }).click();
  await expect(page).toHaveURL("/app/students");
  await page
    .getByRole("link", { name: "Nhật ký hoạt động", exact: true })
    .click();
  await expect(page).toHaveURL("/app/audit");
}
test("tenant audit real filters, safe CSV and READ_ONLY export preserve hidden history", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await filter(page, f.resource);
    await expect(
      page.getByRole("heading", { name: "attendance.reopened", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "staff.role.assign", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(f.privateMarker, { exact: false })).toHaveCount(
      0,
    );
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Xuất CSV nhật ký", exact: true })
      .click();
    const download = await pending,
      file = await download.path();
    if (!file) throw Error("Missing actual download");
    const csv = await readFile(file, "utf8");
    expect(csv).toContain(f.resource);
    expect(csv).toContain("attendance.reopened");
    expect(csv).toContain(f.actor.id);
    expect(csv).not.toContain(f.privateMarker);
    await expect(
      page.getByRole("status").filter({ hasText: "Đã tạo CSV 3 dòng" }),
    ).toBeVisible();
    const audit = await db.auditLog.findFirstOrThrow({
      where: { tenantId: f.tenant.id, action: "audit.exported" },
    });
    expect(audit.actorUserId).toBe(f.actor.id);
    expect(audit.metadata).toMatchObject({
      rowCount: 3,
      scope: "ALL",
      resourceId: f.resource,
    });
    await filter(page, "NO-SUCH-" + f.resource);
    await expect(
      page.getByText("Không có sự kiện trong phạm vi đã áp dụng.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Nhật ký từ ngày", { exact: true })
      .fill("2024-01-01");
    await expect(
      page.getByRole("button", { name: "Áp dụng bộ lọc", exact: true }),
    ).toBeDisabled();
  } finally {
    await db.$disconnect();
  }
});
test("tenant audit switches the same actor to limited operational/finance scope and clears old rows", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await filter(page, f.resource);
    await expect(
      page.getByRole("heading", { name: "staff.role.assign", exact: true }),
    ).toBeVisible();
    await switchRole(page, "Quản lý");
    await filter(page, f.resource);
    await expect(
      page.getByRole("heading", { name: "attendance.reopened", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "payment.recorded", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "staff.role.assign", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Xuất CSV nhật ký", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Vai trò hiện tại chỉ được xem, không được xuất nhật ký.",
        { exact: true },
      ),
    ).toBeVisible();
    await switchRole(page, "Kế toán");
    await filter(page, f.resource);
    await expect(
      page.getByRole("heading", { name: "payment.recorded", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "attendance.reopened", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Xuất CSV nhật ký", exact: true }),
    ).toBeVisible();
    await db.membership.update({
      where: { tenantId_userId: { tenantId: f.tenant.id, userId: f.actor.id } },
      data: { status: "SUSPENDED" },
    });
    await page
      .getByRole("button", { name: "Cập nhật nhật ký", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Không có quyền hoặc trung tâm đang bị hạn chế." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "payment.recorded", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Xuất CSV nhật ký", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});
test("tenant audit retries real transport errors and validates actor UUID without sending invalid filters", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await filter(page, f.resource);
    await expect(
      page.getByRole("heading", { name: "attendance.reopened", exact: true }),
    ).toBeVisible();
    await page.route("**/api/v1/audit-logs?**", (route) =>
      route.abort("failed"),
    );
    await page
      .getByRole("button", { name: "Cập nhật nhật ký", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({
        hasText: "Không thể kết nối dịch vụ. Kiểm tra mạng rồi thử lại.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "attendance.reopened", exact: true }),
    ).toHaveCount(0);
    await page.unroute("**/api/v1/audit-logs?**");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "attendance.reopened", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Mã người thực hiện (UUID)", { exact: true })
      .fill("not-a-uuid");
    await expect(
      page.getByRole("button", { name: "Áp dụng bộ lọc", exact: true }),
    ).toBeDisabled();
  } finally {
    await db.$disconnect();
  }
});
test("tenant audit responsive redacted events have accessible keyboard and reduced-motion filters", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await filter(page, f.resource);
    await expect(
      page.getByRole("heading", { name: "attendance.reopened", exact: true }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    mkdirSync("docs/release/evidence/tenant-audit", { recursive: true });
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const input = page.getByLabel("Mã người thực hiện (UUID)", {
        exact: true,
      });
      await input.focus();
      await page.keyboard.press("Tab");
      await expect(
        page.getByLabel("Hành động chính xác", { exact: true }),
      ).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await reviewTaste(
        page,
        `docs/release/evidence/tenant-audit/events-taste-${width}.json`,
      );
      await page.screenshot({
        path: `docs/release/evidence/tenant-audit/events-${width}.png`,
        fullPage: true,
      });
    }
  } finally {
    await db.$disconnect();
  }
});
