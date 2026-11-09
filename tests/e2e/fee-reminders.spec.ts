import { test, expect, type Page } from "./fixtures";
import { PrismaClient, type Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
const clients = new Set<PrismaClient>();
test.use({ timezoneId: "Pacific/Honolulu" });
test.afterEach(async () => {
  for (const db of clients) await db.$disconnect();
  clients.clear();
});
function database() {
  const url = process.env.E2E_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw Error("Disposable E2E reminder database required");
  const db = new PrismaClient({ datasourceUrl: url });
  clients.add(db);
  return db;
}
async function fixture(page: Page) {
  const db = database(),
    stamp = randomUUID().slice(0, 8),
    source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
  const tenant = await db.tenant.create({
    data: {
      slug: "reminder-ui-" + stamp,
      name: "Trung tâm nhắc phí " + stamp,
      timezone: "America/New_York",
      status: "ACTIVE",
      subscriptionEndsAt: new Date("2040-01-01Z"),
      graceUntil: new Date("2040-02-01Z"),
    },
  });
  const plan = await db.plan.findUniqueOrThrow({
    where: { code: "SYNTHETIC_TEST" },
  });
  await db.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      startsAt: new Date("2020-01-01Z"),
      endsAt: new Date("2040-01-01Z"),
      graceUntil: new Date("2040-02-01Z"),
    },
  });
  const actor = await db.user.create({
    data: {
      email: `reminder-ui-${stamp}@example.test`,
      displayName: "Người kiểm chứng nhắc phí",
      passwordHash: source.passwordHash,
      status: "ACTIVE",
    },
  });
  const backup = await db.user.create({
    data: {
      email: `reminder-ui-backup-${stamp}@example.test`,
      displayName: "Chủ trung tâm kiểm chứng",
      passwordHash: source.passwordHash,
      status: "ACTIVE",
    },
  });
  const guardian = await db.user.create({
    data: {
      email: `reminder-ui-guardian-${stamp}@example.test`,
      displayName: "Phụ huynh kiểm chứng",
      passwordHash: source.passwordHash,
      status: "ACTIVE",
    },
  });
  const member = await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: actor.id,
      status: "ACTIVE",
      roles: {
        create: (
          [
            { role: "owner" },
            { role: "accountant" },
            { role: "manager" },
          ] as const
        ).map((r) => ({ ...r })),
      },
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
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: guardian.id,
      status: "ACTIVE",
      roles: { create: { role: "guardian" } },
    },
  });
  const child = await db.student.create({
    data: {
      tenantId: tenant.id,
      studentCode: "HP-" + stamp,
      fullName: "Học viên nhắc phí thực tế",
    },
  });
  await db.guardianLink.create({
    data: {
      tenantId: tenant.id,
      studentId: child.id,
      guardianUserId: guardian.id,
      status: "ACTIVE",
      verifiedBy: backup.id,
      verifiedAt: new Date(),
    },
  });
  const cls = await db.educationClass.create({
    data: {
      tenantId: tenant.id,
      code: "HP-" + stamp,
      name: "Lớp đối chiếu học phí",
      capacity: 20,
      status: "ACTIVE",
      startDate: new Date("2030-01-01Z"),
      endDate: new Date("2030-12-31Z"),
    },
  });
  const invoice = await db.$transaction(async (tx) => {
    const fee = await tx.feePlan.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        name: "Học phí kiểm chứng nhắc tự động",
        billingModel: "MONTHLY",
        amountVnd: 1200000n,
        validFrom: cls.startDate,
      },
    });
    const run = await tx.invoiceRun.create({
      data: {
        tenantId: tenant.id,
        feePlanId: fee.id,
        periodKey: "2030-11",
        requestHash: "a".repeat(64),
        createdBy: backup.id,
      },
    });
    const row = await tx.invoice.create({
      data: {
        tenantId: tenant.id,
        studentId: child.id,
        runId: run.id,
        invoiceNo: "HP-NHAC-" + stamp,
        dueAt: new Date("2030-11-07T04:59:59Z"),
        totalAmountVnd: 1200000n,
        createdBy: backup.id,
      },
    });
    await tx.invoiceItem.create({
      data: {
        tenantId: tenant.id,
        invoiceId: row.id,
        feePlanId: fee.id,
        description: fee.name,
        totalAmountVnd: 1200000n,
      },
    });
    return row;
  });
  async function native(email: string, role: Role = "owner") {
    const signed = await fetch(testOrigins.api + "/api/v1/mobile/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Fluivix-Test-Password-2026" }),
    });
    expect(signed.status).toBe(200);
    const selected = await fetch(
      testOrigins.api + "/api/v1/auth/switch-context",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + (await signed.json()).data.accessToken,
        },
        body: JSON.stringify({ tenantId: tenant.id, role }),
      },
    );
    expect(selected.status).toBe(200);
    return (await selected.json()).data.accessToken as string;
  }
  const token = await native(backup.email),
    guardianToken = await native(guardian.email, "guardian");
  async function request(
    route: string,
    body?: Record<string, unknown>,
    method = "PATCH",
    credential = token,
  ) {
    const r = await fetch(testOrigins.api + "/api/v1" + route, {
      method: body ? method : "GET",
      headers: {
        Authorization: "Bearer " + credential,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    expect(r.ok, route + ": " + r.status).toBe(true);
    return r.json();
  }
  await request(
    "/privacy/consents",
    {
      policyVersion: "synthetic-e2e-notifications-v1",
      purposeCode: "NOTIFICATIONS",
      granted: true,
      subjectStudentId: child.id,
    },
    "POST",
    guardianToken,
  );
  async function policy(
    enabled: boolean,
    reason = "Kiểm chứng lịch nhắc phí đã duyệt",
  ) {
    const p = (await request("/finance/reminder-policy")).data;
    return request("/finance/reminder-policy", {
      version: p.version,
      enabled,
      confirmed: true,
      reason,
      approvalRef: "BIEN-BAN-THU-HP-" + stamp,
    });
  }
  async function hold(
    held: boolean,
    reason = "Đối chiếu ngân hàng trước khi nhắc phí",
  ) {
    const h = (await request(`/invoices/${invoice.id}/reminders`)).data;
    return request(`/invoices/${invoice.id}/reminder-hold`, {
      version: h.version,
      held,
      confirmed: true,
      reason,
      ...(held ? { category: "PENDING_RECONCILIATION" } : {}),
    });
  }
  async function login(role: Role = "owner", detail = false) {
    const signed = await page.request.post(
      testOrigins.api + "/api/v1/auth/login",
      {
        headers: { Origin: testOrigins.web },
        data: { email: actor.email, password: "Fluivix-Test-Password-2026" },
      },
    );
    expect(signed.status()).toBe(200);
    const chosen = await page.request.post(
      testOrigins.api + "/api/v1/auth/switch-context",
      {
        headers: {
          Origin: testOrigins.web,
          Authorization: "Bearer " + (await signed.json()).data.accessToken,
        },
        data: { tenantId: tenant.id, role },
      },
    );
    expect(chosen.status()).toBe(200);
    await page.goto(
      detail ? `/app/finance/invoices/${invoice.id}` : "/app/finance/invoices",
    );
    await expect(page.getByRole("banner")).toContainText(tenant.name);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      detail ? invoice.invoiceNo : "Chứng từ học phí",
    );
  }
  async function generate() {
    const saved = [
      process.env.PRIVACY_POLICY_VERSION,
      process.env.PRIVACY_NOTICE_URL,
    ];
    try {
      process.env.PRIVACY_POLICY_VERSION = "synthetic-e2e-notifications-v1";
      process.env.PRIVACY_NOTICE_URL =
        "https://example.test/e2e-notifications-policy";
      const jobs = await import("../../apps/worker/dist/fee-reminder-jobs.js");
      expect(
        await jobs.generateFeeReminderTenant(
          db,
          tenant.id,
          () => new Date("2030-11-03T14:00:00Z"),
        ),
      ).toEqual({ batches: 1, stages: 1 });
    } finally {
      for (const [i, key] of [
        "PRIVACY_POLICY_VERSION",
        "PRIVACY_NOTICE_URL",
      ].entries()) {
        const value = saved[i];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
  return {
    db,
    tenant,
    plan,
    actor,
    backup,
    member,
    child,
    invoice,
    token,
    native,
    request,
    policy,
    hold,
    login,
    generate,
  };
}
const panel = (page: Page) => page.locator("details.reminder-panel");
async function open(page: Page) {
  const p = panel(page);
  if ((await p.getAttribute("open")) === null)
    await p.locator("summary").first().click();
  return p;
}
async function enableViaUI(page: Page) {
  const p = await open(page);
  await p
    .getByLabel("Trạng thái lịch tự động", { exact: true })
    .selectOption("true");
  await p
    .getByLabel("Mã tham chiếu phê duyệt lịch nhắc", { exact: true })
    .fill("DUYET-LICH-09H-TRUNG-TAM");
  await p
    .getByLabel("Lý do thay đổi", { exact: true })
    .fill("Đã xem xét ba mốc và điều kiện dừng nhắc học phí");
  const button = p.getByRole("button", {
    name: "Xác nhận cấu hình nhắc phí",
    exact: true,
  });
  await expect(button).toBeDisabled();
  await p.getByRole("checkbox").check();
  await button.click();
  await expect(
    p.getByRole("status").filter({ hasText: "Đang bật nhắc phí tự động" }),
  ).toBeVisible();
  return p;
}
async function holdViaUI(page: Page) {
  const p = await open(page);
  await p
    .getByLabel("Quyết định nhắc chứng từ", { exact: true })
    .selectOption("true");
  await p
    .getByLabel("Loại tạm dừng nhắc phí", { exact: true })
    .selectOption("PENDING_RECONCILIATION");
  await p
    .getByLabel("Lý do thay đổi", { exact: true })
    .fill("Chờ đối chiếu khoản chuyển ngân hàng trước khi tiếp tục nhắc");
  await p.getByRole("checkbox").check();
  await p
    .getByRole("button", {
      name: "Xác nhận trạng thái nhắc chứng từ",
      exact: true,
    })
    .click();
  await expect(
    p
      .getByRole("status")
      .filter({ hasText: "Đang tạm dừng: Chờ đối soát ngân hàng" }),
  ).toBeVisible();
  return p;
}

test("reminder Web loads the actual disabled preset on demand and confirms owner enable/pause with real history", async ({
  page,
}) => {
  const f = await fixture(page);
  let reads = 0;
  page.on("request", (r) => {
    if (
      new URL(r.url()).pathname === "/api/v1/finance/reminder-policy" &&
      r.method() === "GET"
    )
      reads++;
  });
  await f.login();
  expect(reads).toBe(0);
  const p = await open(page);
  await expect(
    p.getByText("Đang tắt nhắc phí tự động", { exact: false }),
  ).toBeVisible();
  expect(
    await f.db.feeReminderPolicy.count({ where: { tenantId: f.tenant.id } }),
  ).toBe(0);
  await enableViaUI(page);
  const stored = await f.db.feeReminderPolicy.findUniqueOrThrow({
    where: { tenantId: f.tenant.id },
  });
  expect(stored).toMatchObject({
    enabled: true,
    approvedBy: f.actor.id,
    version: 1,
    approvalRef: "DUYET-LICH-09H-TRUNG-TAM",
  });
  await expect(
    p.getByRole("status").filter({ hasText: "Đang bật" }),
  ).toBeFocused();
  await p
    .getByLabel("Trạng thái lịch tự động", { exact: true })
    .selectOption("false");
  await p
    .getByLabel("Lý do thay đổi", { exact: true })
    .fill("Tạm dừng lịch nhắc tự động để trung tâm đối chiếu");
  await p.getByRole("checkbox").check();
  await p
    .getByRole("button", { name: "Xác nhận cấu hình nhắc phí", exact: true })
    .click();
  await expect(
    p.getByRole("status").filter({ hasText: "Đang tắt" }),
  ).toBeVisible();
  await p.locator("summary").filter({ hasText: "Lịch sử cấu hình" }).click();
  await expect(
    p.getByText("Tạm dừng lịch nhắc · Phiên bản 2", { exact: false }),
  ).toBeVisible();
  expect(
    await f.db.feeReminderPolicyEvent.count({
      where: { tenantId: f.tenant.id },
    }),
  ).toBe(2);
});
test("accountant reminder hold confirms pending reconciliation and resume without changing an issued invoice", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.login("accountant", true);
  const p = await holdViaUI(page);
  await expect(
    p.getByRole("status").filter({ hasText: "Đang tạm dừng" }),
  ).toBeFocused();
  expect(
    await f.db.invoice.findUniqueOrThrow({ where: { id: f.invoice.id } }),
  ).toEqual(f.invoice);
  await p
    .getByLabel("Quyết định nhắc chứng từ", { exact: true })
    .selectOption("false");
  await p
    .getByLabel("Lý do thay đổi", { exact: true })
    .fill("Đã đối soát xong và cho phép tiếp tục xét nhắc");
  await p.getByRole("checkbox").check();
  await p
    .getByRole("button", {
      name: "Xác nhận trạng thái nhắc chứng từ",
      exact: true,
    })
    .click();
  await expect(
    p.getByRole("status").filter({ hasText: "Không có tạm dừng riêng" }),
  ).toBeVisible();
  expect(
    await f.db.invoiceReminderHoldEvent.count({
      where: { tenantId: f.tenant.id, invoiceId: f.invoice.id },
    }),
  ).toBe(2);
  expect(
    await f.db.invoice.findUniqueOrThrow({ where: { id: f.invoice.id } }),
  ).toEqual(f.invoice);
});
test("real reminder policy conflict preserves the entered review until explicit verified reload", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.login();
  const p = await open(page);
  const reason = "Bản nhập cấu hình phải giữ khi có xung đột phiên bản";
  await p
    .getByLabel("Trạng thái lịch tự động", { exact: true })
    .selectOption("true");
  await p
    .getByLabel("Mã tham chiếu phê duyệt lịch nhắc", { exact: true })
    .fill("LOCAL-REVIEW");
  await p.getByLabel("Lý do thay đổi", { exact: true }).fill(reason);
  await p.getByRole("checkbox").check();
  await f.policy(true);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/finance/reminder-policy") &&
      r.request().method() === "PATCH",
  );
  await p
    .getByRole("button", { name: "Xác nhận cấu hình nhắc phí", exact: true })
    .click();
  expect((await response).status()).toBe(409);
  await expect(p.getByLabel("Lý do thay đổi", { exact: true })).toHaveValue(
    reason,
  );
  await expect(p.getByRole("alert")).toContainText(
    "Dữ liệu đã thay đổi hoặc bị trùng. Vui lòng kiểm tra lại.",
  );
  await p
    .getByRole("button", {
      name: "Tải lại cấu hình và bỏ bản nhập",
      exact: true,
    })
    .click();
  await expect(
    p.getByRole("status").filter({ hasText: "Đang bật" }),
  ).toContainText("Phiên bản 1");
  await expect(p.getByLabel("Lý do thay đổi", { exact: true })).toHaveValue("");
});
test("a real failed reminder refresh hides cached state and verified retry retains an unsaved review", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.login();
  const p = await open(page),
    reason = "Bản nhập duyệt lịch không được mất khi kết nối lỗi";
  await p.getByLabel("Lý do thay đổi", { exact: true }).fill(reason);
  const pattern = "**/api/v1/finance/reminder-policy";
  await page.route(pattern, (route) => route.abort("failed"));
  try {
    await p
      .getByRole("button", {
        name: "Tải lại cấu hình và bỏ bản nhập",
        exact: true,
      })
      .click();
    await expect(p.getByRole("alert")).toContainText(
      "Dữ liệu nhắc phí cũ đã được ẩn",
    );
    await expect(
      p.getByRole("status").filter({ hasText: "Đang tắt" }),
    ).toHaveCount(0);
    await expect(p.getByRole("alert")).toBeFocused();
  } finally {
    await page.unroute(pattern);
  }
  await p
    .getByRole("button", { name: "Thử tải lại nhắc phí", exact: true })
    .click();
  await expect(
    p.getByRole("status").filter({ hasText: "Đang tắt" }),
  ).toBeVisible();
  await expect(p.getByLabel("Lý do thay đổi", { exact: true })).toHaveValue(
    reason,
  );
});
test("a truly committed reminder change with a lost HTTP response is verified without a second PATCH", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.login();
  const p = await open(page);
  let writes = 0;
  const pattern = "**/api/v1/finance/reminder-policy";
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    writes++;
    const r = await route.fetch();
    expect(r.status()).toBe(200);
    await route.abort("failed");
  });
  try {
    await p
      .getByLabel("Trạng thái lịch tự động", { exact: true })
      .selectOption("true");
    await p
      .getByLabel("Mã tham chiếu phê duyệt lịch nhắc", { exact: true })
      .fill("LOST-RESPONSE-REVIEW");
    await p
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Kiểm chứng mất phản hồi sau khi máy chủ đã lưu");
    await p.getByRole("checkbox").check();
    await p
      .getByRole("button", { name: "Xác nhận cấu hình nhắc phí", exact: true })
      .click();
    await expect(p.getByRole("alert")).toBeVisible();
    expect(
      (
        await f.db.feeReminderPolicy.findUniqueOrThrow({
          where: { tenantId: f.tenant.id },
        })
      ).enabled,
    ).toBe(true);
    expect(writes).toBe(1);
  } finally {
    await page.unroute(pattern);
  }
  await p
    .getByRole("button", {
      name: "Tải lại cấu hình và bỏ bản nhập",
      exact: true,
    })
    .click();
  await expect(
    p.getByRole("status").filter({ hasText: "Đang bật" }),
  ).toContainText("Phiên bản 1");
  expect(writes).toBe(1);
  expect(
    await f.db.feeReminderPolicyEvent.count({
      where: { tenantId: f.tenant.id },
    }),
  ).toBe(1);
});
test("actual membership revocation through reminder403 removes the parent invoice editor and private cache", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.login("accountant", true);
  const p = await open(page);
  await expect(
    p.getByRole("heading", {
      name: "Trạng thái nhắc phí của chứng từ",
      exact: true,
    }),
  ).toBeVisible();
  await p
    .getByLabel("Lý do thay đổi", { exact: true })
    .fill("Bản nhập phải xóa khi quyền bị thu hồi");
  await f.request(`/staff/${f.member.id}`, {
    version: f.member.version,
    status: "SUSPENDED",
    reason: "Đình chỉ thành viên để kiểm chứng thu hồi quyền nhắc phí",
  });
  const r = page.waitForResponse((v) =>
    v.url().includes(`/invoices/${f.invoice.id}/reminders?`),
  );
  await p
    .getByRole("button", {
      name: "Tải lại trạng thái nhắc và bỏ bản nhập",
      exact: true,
    })
    .click();
  expect((await r).status()).toBe(403);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Tải lại trang để xác minh quyền" }),
  ).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: f.invoice.invoiceNo, exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(f.child.fullName, { exact: false })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Lý do thay đổi", { exact: true })).toHaveCount(
    0,
  );
});
test("selected manager does not fetch reminders, accountant cannot configure, and read-only keeps real history without writes", async ({
  page,
}) => {
  const f = await fixture(page);
  let requests = 0;
  page.on("request", (r) => {
    if (/reminder-policy|reminder-hold|\/reminders\?/.test(r.url())) requests++;
  });
  await f.login("manager", true);
  await expect(panel(page)).toHaveCount(0);
  expect(requests).toBe(0);
  await f.login("accountant");
  const p = await open(page);
  await expect(
    p.getByText("Chỉ chủ trung tâm được bật", { exact: false }),
  ).toBeVisible();
  await expect(
    p.getByLabel("Trạng thái lịch tự động", { exact: true }),
  ).toHaveCount(0);
  await f.hold(true);
  await f.db.tenant.update({
    where: { id: f.tenant.id },
    data: { status: "READ_ONLY" },
  });
  await page.goto(`/app/finance/invoices/${f.invoice.id}`);
  const h = await open(page);
  await expect(
    h.getByRole("status").filter({ hasText: "Đang tạm dừng" }),
  ).toBeVisible();
  await expect(
    h.getByLabel("Quyết định nhắc chứng từ", { exact: true }),
  ).toBeDisabled();
  await expect(
    h.getByRole("button", {
      name: "Xác nhận trạng thái nhắc chứng từ",
      exact: true,
    }),
  ).toBeDisabled();
});
test("policy history paginates actual21 decisions while preserving the current review and keyboard focus", async ({
  page,
}) => {
  const f = await fixture(page);
  for (let i = 0; i < 21; i++)
    await f.policy(i % 2 === 0, "Lịch nhắc thay đổi để đối chiếu trang " + i);
  await f.login();
  const p = await open(page),
    reason = "Bản nhập không đổi khi xem trang lịch sử";
  await p.getByLabel("Lý do thay đổi", { exact: true }).fill(reason);
  await p.locator("summary").filter({ hasText: "Lịch sử cấu hình" }).click();
  await expect(
    p.getByText("Lịch nhắc thay đổi để đối chiếu trang 20", { exact: false }),
  ).toBeVisible();
  const next = p.getByRole("button", { name: "Lịch sử sau", exact: true });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(p.getByText("Trang 2 / 2", { exact: true })).toBeVisible();
  await expect(next).toBeFocused();
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(p.getByText("Trang 2 / 2", { exact: true })).toBeVisible();
  await expect(p.getByLabel("Lý do thay đổi", { exact: true })).toHaveValue(
    reason,
  );
});
test("invoice hold history paginates actual21 decisions without changing its current hold draft", async ({
  page,
}) => {
  const f = await fixture(page);
  for (let i = 0; i < 21; i++)
    await f.hold(i % 2 === 0, "Đối chiếu tạm dừng lần " + i);
  await f.login("accountant", true);
  const p = await open(page),
    reason = "Bản nhập đối soát không đổi khi xem lịch sử";
  await p.getByLabel("Lý do thay đổi", { exact: true }).fill(reason);
  const next = p.getByRole("button", { name: "Lịch sử sau", exact: true });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(p.getByText("Trang 2 / 2", { exact: true })).toBeVisible();
  await expect(next).toBeFocused();
  await expect(
    p.getByText("Lý do: Đối chiếu tạm dừng lần 0", { exact: true }),
  ).toBeVisible();
  await expect(p.getByLabel("Lý do thay đổi", { exact: true })).toHaveValue(
    reason,
  );
});

test("centre switch aborts delayed real reminder bytes and rejects the previous invoice deep link", async ({
  page,
}) => {
  const f = await fixture(page),
    second = await f.db.tenant.create({
      data: {
        slug: "reminder-second-" + randomUUID(),
        name: "Trung tâm nhắc phí thứ hai",
        timezone: "Asia/Ho_Chi_Minh",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
  await f.db.subscription.create({
    data: {
      tenantId: second.id,
      planId: f.plan.id,
      startsAt: new Date("2020-01-01Z"),
      endsAt: new Date("2040-01-01Z"),
      graceUntil: new Date("2040-02-01Z"),
    },
  });
  await f.db.membership.create({
    data: {
      tenantId: second.id,
      userId: f.actor.id,
      status: "ACTIVE",
      roles: { create: { role: "owner" } },
    },
  });
  await f.login("owner", true);
  let release!: () => void, observed!: () => void, finished!: () => void;
  const held = new Promise<void>((r) => {
      release = r;
    }),
    seen = new Promise<void>((r) => {
      observed = r;
    }),
    done = new Promise<void>((r) => {
      finished = r;
    });
  const pattern = `**/api/v1/invoices/${f.invoice.id}/reminders?*`;
  await page.route(pattern, async (route) => {
    try {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      observed();
      await held;
      if (!route.request().failure()) await route.fulfill({ response });
    } finally {
      finished();
    }
  });
  try {
    await open(page);
    await seen;
    const aborted = page.waitForEvent("requestfailed", (r) =>
      r.url().includes(`/invoices/${f.invoice.id}/reminders?`),
    );
    const menu = page.getByRole("button", {
      name: "Mở menu trung tâm",
      exact: true,
    });
    if (await menu.isVisible()) await menu.click();
    await page
      .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
      .click();
    await page
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: second.name, exact: true }),
      })
      .getByRole("button", { name: "Chủ trung tâm", exact: true })
      .click();
    expect((await aborted).failure()).not.toBeNull();
    await expect(page.getByRole("banner")).toContainText(second.name);
    release();
    await done;
    await page.unroute(pattern);
    const denied = page.waitForResponse((r) =>
      r.url().endsWith(`/api/v1/invoices/${f.invoice.id}`),
    );
    await page.goto(`/app/finance/invoices/${f.invoice.id}`);
    expect((await denied).status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: f.invoice.invoiceNo, exact: true }),
    ).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
    await expect(
      page.getByText(f.child.fullName, { exact: false }),
    ).toHaveCount(0);
  } finally {
    release();
    await done;
    await page.unroute(pattern);
  }
});

for (const mode of ["no-preference", "reduce"] as const)
  for (const width of [360, 768, 1024, 1440])
    test(`reminder policy and invoice real history visual accessibility ${width} ${mode}`, async ({
      page,
    }) => {
      const f = await fixture(page);
      await f.policy(true);
      await f.generate();
      await f.policy(false);
      await f.policy(true);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: mode });
      await f.login();
      await expect(
        page.getByRole("link", { name: f.invoice.invoiceNo, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Lọc chứng từ theo biểu phí/lớp", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Biểu phí phát hành", { exact: true }),
      ).toBeVisible();
      const folder = "docs/release/evidence/reminders";
      mkdirSync(folder, { recursive: true });
      await page.screenshot({
        path: `${folder}/overview-${width}-${mode}.png`,
      });
      const p = panel(page),
        summary = p.locator("summary").first();
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(
        p.getByRole("heading", {
          name: "Lịch nhắc học phí của trung tâm",
          exact: true,
        }),
      ).toBeVisible();
      await expect(summary).toBeFocused();
      expect(
        await summary.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
      await p
        .locator("summary")
        .filter({ hasText: "Lịch sử cấu hình" })
        .click();
      await expect(
        p.getByText("Bật lịch nhắc · Phiên bản 3", { exact: false }),
      ).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await reviewTaste(page, `${folder}/policy-${width}-${mode}-taste.json`);
      await p.screenshot({ path: `${folder}/policy-${width}-${mode}.png` });
      await f.hold(true);
      await page.goto(`/app/finance/invoices/${f.invoice.id}`);
      const h = await open(page);
      await expect(
        h.getByText("Trước hạn 3 ngày", { exact: false }),
      ).toBeVisible();
      await expect(h.getByText("Đặt tạm dừng", { exact: false })).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await reviewTaste(page, `${folder}/hold-${width}-${mode}-taste.json`);
      await h.screenshot({ path: `${folder}/hold-${width}-${mode}.png` });
    });
