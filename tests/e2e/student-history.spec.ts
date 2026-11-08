import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { testOrigins } from "../../tooling/test-origins";
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
    throw Error("Disposable browser database required");
  return new PrismaClient({ datasourceUrl: url });
}
async function actorFixture(db: PrismaClient) {
  const stamp = randomUUID().slice(0, 8),
    source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
  const tenant = await db.tenant.create({
    data: {
      slug: "history-ui-" + stamp,
      name: "Trung tâm lịch sử học viên kiểm thử",
      contactEmail: "centre@example.test",
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
      email: `history-ui-${stamp}@example.test`,
      displayName: "Người quản lý học viên kiểm thử",
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
          { role: "teacher" },
          { role: "academic_staff" },
          { role: "accountant" },
        ],
      },
    },
  });
  return { tenant, actor };
}
async function login(
  page: Page,
  f: Awaited<ReturnType<typeof actorFixture>>,
  role = "owner",
) {
  const signed = await page.request.post(
    testOrigins.api + "/api/v1/auth/login",
    {
      headers: { Origin: testOrigins.web },
      data: { email: f.actor.email, password: "Fluivix-Test-Password-2026" },
    },
  );
  expect(signed.status()).toBe(200);
  const selected = await page.request.post(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      headers: {
        Origin: testOrigins.web,
        Authorization: "Bearer " + (await signed.json()).data.accessToken,
      },
      data: { tenantId: f.tenant.id, role },
    },
  );
  expect(selected.status()).toBe(200);
  await page.goto("/app/students");
  await expect(page.getByRole("banner")).toContainText(f.tenant.name);
  return (await selected.json()).data.accessToken as string;
}
async function fixture(db: PrismaClient, count = 1) {
  const f = await actorFixture(db);
  const student = await db.student.create({
    data: {
      tenantId: f.tenant.id,
      studentCode: "HISTORY-SELECTED",
      fullName: "Học viên lịch sử đối chiếu",
      notesPrivate: "PRIVATE_SELECTED_HISTORY",
    },
  });
  const other = await db.student.create({
    data: {
      tenantId: f.tenant.id,
      studentCode: "HISTORY-OTHER",
      fullName: "OTHER_LEARNER_HISTORY",
    },
  });
  const classes = [];
  for (let i = 0; i < count; i++) {
    const cls = await db.educationClass.create({
      data: {
        tenantId: f.tenant.id,
        code: `HISTORY-${String(i).padStart(2, "0")}`,
        name: `Lớp lịch sử ${i}`,
        capacity: 10,
        status: "ACTIVE",
        startDate: new Date("2030-01-01Z"),
        endDate: new Date("2030-12-31Z"),
      },
    });
    await db.enrollment.create({
      data: {
        tenantId: f.tenant.id,
        classId: cls.id,
        studentId: student.id,
        joinedAt: new Date("2030-01-01Z"),
      },
    });
    classes.push(cls);
  }
  const unrelated = await db.educationClass.create({
    data: {
      tenantId: f.tenant.id,
      code: "OTHER-ONLY",
      name: "OTHER_LEARNER_CLASS",
      capacity: 10,
      startDate: new Date("2030-01-01Z"),
      endDate: new Date("2030-12-31Z"),
    },
  });
  await db.enrollment.create({
    data: {
      tenantId: f.tenant.id,
      classId: unrelated.id,
      studentId: other.id,
      joinedAt: new Date("2030-01-01Z"),
    },
  });
  return { ...f, student, classes };
}
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Các mục hồ sơ học viên" });
async function open(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
  pane = "overview",
) {
  await page.goto(`/app/students/${f.student.id}?tab=${pane}`);
  await expect(
    page.getByRole("heading", { name: f.student.fullName, exact: true }),
  ).toBeVisible();
}
async function api(
  page: Page,
  token: string,
  endpoint: string,
  method = "GET",
  data?: unknown,
  headers: Record<string, string> = {},
) {
  return page.request.fetch(testOrigins.api + "/api/v1" + endpoint, {
    method,
    headers: {
      Origin: testOrigins.web,
      Authorization: "Bearer " + token,
      ...headers,
    },
    ...(data === undefined ? {} : { data }),
  });
}
async function nativeToken(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
  role = "owner",
) {
  // Native login must carry neither web cookies nor an Origin header.
  const signed = await fetch(testOrigins.api + "/api/v1/mobile/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: f.actor.email,
      password: "Fluivix-Test-Password-2026",
    }),
  });
  expect(signed.status).toBe(200);
  const selected = await api(
    page,
    (await signed.json()).data.accessToken,
    "/auth/switch-context",
    "POST",
    { tenantId: f.tenant.id, role },
  );
  expect(selected.status()).toBe(200);
  return (await selected.json()).data.accessToken as string;
}

test("student history paginates and searches only the selected learner while keeping an unsaved profile across navigation", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db, 21);
    await login(page, f);
    await open(page, f);
    await page
      .getByLabel("Họ và tên", { exact: true })
      .fill("Bản sửa học viên chưa lưu");
    await nav(page).getByRole("link", { name: "Lớp học", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("21 lượt ghi danh");
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(20);
    await expect(
      page.getByText("OTHER_LEARNER_CLASS", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Trang sau", exact: true }).click();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
    await page.getByLabel("Tìm mã hoặc tên lớp").fill("HISTORY-07");
    await page.getByRole("button", { name: "Tìm lớp", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("HISTORY-07");
    await expect(page.getByRole("table")).toContainText("1 lượt ghi danh");
    await nav(page)
      .getByRole("link", { name: "Tổng quan", exact: true })
      .click();
    await expect(page.getByLabel("Họ và tên", { exact: true })).toHaveValue(
      "Bản sửa học viên chưa lưu",
    );
    expect(
      (await db.student.findUniqueOrThrow({ where: { id: f.student.id } }))
        .fullName,
    ).toBe(f.student.fullName);
  } finally {
    await db.$disconnect();
  }
});

test("student profile selected accountant sees limited enrollment and actual finance without forbidden attendance grades or guardian fetches", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      paths: string[] = [];
    await login(page, f, "accountant");
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/"))
        paths.push(new URL(request.url()).pathname);
    });
    await open(page, f, "attendance");
    await expect(
      page.getByRole("alert").filter({ hasText: "Mục hồ sơ không tồn tại" }),
    ).toContainText("không được phép");
    await expect(nav(page).getByRole("link")).toHaveCount(3);
    await expect(
      page.getByText("PRIVATE_SELECTED_HISTORY", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Ghi chú riêng", { exact: true })).toHaveCount(
      0,
    );
    await nav(page).getByRole("link", { name: "Lớp học", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("HISTORY-00");
    await expect(page.getByRole("table").getByRole("link")).toHaveCount(0);
    await nav(page).getByRole("link", { name: "Học phí", exact: true }).click();
    await expect(
      page.getByText("Chưa có hóa đơn học phí.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Chưa có phiếu thu.", { exact: true }),
    ).toBeVisible();
    expect(
      paths.filter((path) =>
        /\/(attendance|grades|guardians)(\/|$)/.test(path),
      ),
    ).toEqual([]);
    expect(paths).toContain("/api/v1/invoices");
    expect(paths).toContain("/api/v1/payments");
  } finally {
    await db.$disconnect();
  }
});

test("student attendance displays only actual finalized records and removes privileged reopened records", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    const token = await nativeToken(page, f);
    const teacher = await db.teacher.create({
      data: {
        tenantId: f.tenant.id,
        userId: f.actor.id,
        teacherCode: "HISTORY-TEACHER",
        fullName: "Giáo viên lịch sử",
      },
    });
    const cls = f.classes[0]!;
    await db.classTeacher.create({
      data: {
        tenantId: f.tenant.id,
        classId: cls.id,
        teacherId: teacher.id,
        effectiveFrom: new Date("2030-01-01Z"),
      },
    });
    const created = await api(
      page,
      token,
      `/classes/${cls.id}/sessions/extra`,
      "POST",
      {
        teacherId: teacher.id,
        startsAt: "2030-06-03T01:00:00Z",
        endsAt: "2030-06-03T02:00:00Z",
      },
    );
    expect(created.status()).toBe(201);
    const sessionId = (await created.json()).data.id as string;
    const current = async () => {
      const response = await api(page, token, `/sessions/${sessionId}`);
      expect(response.status()).toBe(200);
      return (await response.json()).data.version as number;
    };
    const draft = await api(
      page,
      token,
      `/sessions/${sessionId}/attendance/draft`,
      "PUT",
      {
        sessionVersion: await current(),
        records: [{ studentId: f.student.id, status: "PRESENT" }],
      },
    );
    expect(draft.status()).toBe(200);
    await open(page, f, "attendance");
    const load = async () => {
      await page.getByLabel("Từ ngày", { exact: true }).fill("2030-06-01");
      await page.getByLabel("Đến ngày", { exact: true }).fill("2030-06-30");
      await page
        .getByRole("button", { name: "Xem điểm danh", exact: true })
        .click();
    };
    await load();
    await expect(
      page.getByText("Chưa có điểm danh đã chốt trong khoảng ngày này."),
    ).toBeVisible();
    const finalized = await api(
      page,
      token,
      `/sessions/${sessionId}/attendance/finalize`,
      "POST",
      { sessionVersion: await current() },
    );
    expect(finalized.status()).toBe(201);
    await page.reload();
    await load();
    await expect(page.getByRole("table")).toContainText("Có mặt");
    await expect(page.getByRole("table")).toContainText("03/06/2030");
    const reopened = await api(
      page,
      token,
      `/sessions/${sessionId}/attendance/reopen`,
      "POST",
      {
        sessionVersion: await current(),
        reason: "Đối chiếu lại kết quả điểm danh thực tế",
      },
    );
    expect(reopened.status()).toBe(201);
    await page.reload();
    await load();
    await expect(
      page.getByText("Chưa có điểm danh đã chốt trong khoảng ngày này."),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("student history shows transport errors and verified retry, read-only history, and offline save lock", async ({
  page,
  context,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await open(page, f);
    await context.setOffline(true);
    await expect(page.getByLabel("Họ và tên", { exact: true })).toBeDisabled();
    await expect(
      page.getByRole("status").filter({ hasText: "Bạn đang ngoại tuyến." }),
    ).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByLabel("Họ và tên", { exact: true })).toBeEnabled();
    await page.route(
      `**/api/v1/students/${f.student.id}/enrollments*`,
      (route) => route.abort(),
    );
    await nav(page).getByRole("link", { name: "Lớp học", exact: true }).click();
    await expect(
      page.locator(".student-profile").getByRole("alert"),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.unroute(`**/api/v1/students/${f.student.id}/enrollments*`);
    await page
      .getByRole("button", { name: "Thử tải lại", exact: true })
      .click();
    await expect(page.getByRole("table")).toContainText("HISTORY-00");
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(page.getByRole("table")).toContainText("HISTORY-00");
    await nav(page)
      .getByRole("link", { name: "Tổng quan", exact: true })
      .click();
    await expect(page.getByLabel("Họ và tên", { exact: true })).toBeDisabled();
  } finally {
    await db.$disconnect();
  }
});

async function financeFixture(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
) {
  const token = await nativeToken(page, f);
  const fee = await api(page, token, "/fee-plans", "POST", {
    classId: f.classes[0]!.id,
    name: "Học phí lịch sử thật",
    billingModel: "MONTHLY",
    amountVnd: "1200000",
    validFrom: "2030-01-01",
  });
  expect(fee.status()).toBe(201);
  const issued = await api(
    page,
    token,
    "/invoices/generate-run",
    "POST",
    {
      feePlanId: (await fee.json()).data.id,
      periodKey: "2030-06",
      dueAt: "2030-06-15T02:00:00Z",
    },
    { "idempotency-key": randomUUID() },
  );
  expect(issued.status()).toBe(201);
  const invoice = (await issued.json()).data.invoices[0] as {
    id: string;
    invoiceNo: string;
  };
  const received = await api(
    page,
    token,
    "/payments",
    "POST",
    {
      studentId: f.student.id,
      method: "CASH",
      receivedAmountVnd: "500000",
      receivedAt: "2030-06-10T02:00:00Z",
      allocations: [{ invoiceId: invoice.id, amountVnd: "500000" }],
    },
    { "idempotency-key": randomUUID() },
  );
  expect(received.status()).toBe(201);
  return {
    invoice,
    payment: (await received.json()).data as { id: string; receiptNo: string },
  };
}

test("student finance renders actual issued balance and receipt for this learner with exact VND and scoped links", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    const financial = await financeFixture(page, f);
    await open(page, f, "finance");
    const invoices = page.getByRole("table").filter({
      has: page.getByRole("link", {
        name: financial.invoice.invoiceNo,
        exact: true,
      }),
    });
    await expect(invoices).toContainText("1.200.000");
    await expect(invoices).toContainText("500.000");
    await expect(invoices).toContainText("700.000");
    await expect(
      page.getByRole("link", {
        name: financial.invoice.invoiceNo,
        exact: true,
      }),
    ).toHaveAttribute("href", `/app/finance/invoices/${financial.invoice.id}`);
    await expect(
      page.getByRole("link", {
        name: financial.payment.receiptNo,
        exact: true,
      }),
    ).toHaveAttribute("href", `/app/finance/payments/${financial.payment.id}`);
    await expect(page.locator(".student-profile")).not.toContainText(
      "OTHER_LEARNER_HISTORY",
    );
    expect(
      await db.payment.count({
        where: { tenantId: f.tenant.id, studentId: f.student.id },
      }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
});

test("student profile preserves a draft over actual failed GET and verified retry then clears it after owner revokes access", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      owner = await db.user.create({
        data: {
          email: `history-revoker-${randomUUID()}@example.test`,
          displayName: "Chủ trung tâm thu hồi quyền",
          passwordHash: f.actor.passwordHash,
          status: "ACTIVE",
        },
      });
    await db.membership.create({
      data: {
        tenantId: f.tenant.id,
        userId: owner.id,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }] },
      },
    });
    const member = await db.membership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: f.tenant.id, userId: f.actor.id } },
    });
    await login(page, f, "manager");
    await open(page, f);
    const input = page.getByLabel("Họ và tên", { exact: true });
    await input.fill("Giữ bản sửa khi mạng lỗi");
    const pattern = `**/api/v1/students/${f.student.id}`;
    await page.route(pattern, (route) => route.abort());
    await page
      .getByRole("button", { name: "Làm mới hồ sơ", exact: true })
      .click();
    await expect(
      page.locator(".student-profile").getByRole("alert"),
    ).toBeVisible();
    await expect(input).toBeHidden();
    await page.unroute(pattern);
    await page
      .getByRole("button", { name: "Thử tải lại", exact: true })
      .click();
    await expect(input).toHaveValue("Giữ bản sửa khi mạng lỗi");
    const token = await nativeToken(page, { ...f, actor: owner });
    const revoked = await api(page, token, `/staff/${member.id}`, "PATCH", {
      version: member.version,
      status: "SUSPENDED",
      reason: "Thu hồi quyền sau khi đối chiếu nhân sự trung tâm",
    });
    expect(revoked.status()).toBe(200);
    const forbidden = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/students/${f.student.id}`) &&
        response.request().method() === "GET",
    );
    await page
      .getByRole("button", { name: "Làm mới hồ sơ", exact: true })
      .click();
    expect((await forbidden).status()).toBe(403);
    await expect(input).toHaveCount(0);
    await expect(nav(page)).toHaveCount(0);
    await expect(page.locator(".student-profile")).not.toContainText(
      "PRIVATE_SELECTED_HISTORY",
    );
    expect(
      (await db.student.findUniqueOrThrow({ where: { id: f.student.id } }))
        .fullName,
    ).toBe(f.student.fullName);
  } finally {
    await db.$disconnect();
  }
});

test("student history rejects foreign deeplinks and invalid attendance dates without inventing zero results", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      foreign = await fixture(db);
    await login(page, f);
    await page.goto(`/app/students/${foreign.student.id}?tab=enrollments`);
    await expect(
      page.locator(".student-profile").getByRole("alert"),
    ).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
    await open(page, f, "attendance");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(`/students/${f.student.id}/attendance`))
        requests.push(request.url());
    });
    await page.getByLabel("Từ ngày", { exact: true }).fill("2030-06-30");
    await page.getByLabel("Đến ngày", { exact: true }).fill("2030-06-01");
    await page
      .getByRole("button", { name: "Xem điểm danh", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Chọn ngày hợp lệ" }),
    ).toBeVisible();
    expect(requests).toEqual([]);
    await expect(page.getByRole("table")).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});

for (const role of ["student", "guardian"] as const) {
  test(`basic student profile keeps existing ${role} scope without staff panes`, async ({
    page,
  }) => {
    const db = database();
    try {
      const f = await fixture(db),
        viewer = await db.user.create({
          data: {
            email: `history-${role}-${randomUUID()}@example.test`,
            displayName: "Người xem hồ sơ cơ bản",
            passwordHash: f.actor.passwordHash,
            status: "ACTIVE",
          },
        });
      await db.membership.create({
        data: {
          tenantId: f.tenant.id,
          userId: viewer.id,
          status: "ACTIVE",
          roles: { create: [{ role }] },
        },
      });
      if (role === "student")
        await db.student.update({
          where: { id: f.student.id },
          data: { userId: viewer.id },
        });
      else {
        const token = await nativeToken(page, f);
        const profile = await api(page, token, "/guardians", "POST", {
          email: viewer.email,
        });
        expect(profile.status()).toBe(201);
        const linked = await api(
          page,
          token,
          `/students/${f.student.id}/guardians`,
          "POST",
          { guardianUserId: viewer.id, relationType: "PARENT" },
        );
        expect(linked.status()).toBe(201);
        const link = (await linked.json()).data as {
          id: string;
          version: number;
        };
        const approved = await api(
          page,
          token,
          `/students/${f.student.id}/guardians/${link.id}/approve`,
          "POST",
          {
            version: link.version,
            verificationMethod:
              "Đã đối chiếu quan hệ trong hồ sơ kiểm thử tổng hợp",
          },
        );
        expect(approved.status()).toBe(201);
      }
      const personal = { ...f, actor: viewer };
      await login(page, personal, role);
      const token = await nativeToken(page, personal, role);
      const allowed = await api(page, token, `/students/${f.student.id}`);
      expect(allowed.status()).toBe(200);
      const paths: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/api/v1/"))
          paths.push(new URL(request.url()).pathname);
      });
      await open(page, f, "finance");
      await expect(nav(page).getByRole("link")).toHaveCount(1);
      await expect(
        page.getByRole("alert").filter({ hasText: "Mục hồ sơ không tồn tại" }),
      ).toBeVisible();
      await nav(page)
        .getByRole("link", { name: "Tổng quan", exact: true })
        .click();
      await expect(page.getByTestId("student-status")).toHaveText("Đang học");
      await expect(
        page.getByLabel("Ghi chú riêng tư", { exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".student-profile")).not.toContainText(
        "PRIVATE_SELECTED_HISTORY",
      );
      expect(
        paths.filter((path) =>
          /\/(enrollments|attendance|grades|guardians|invoices|payments)(\/|$)/.test(
            path,
          ),
        ),
      ).toEqual([]);
      const other = await db.student.findFirstOrThrow({
        where: { tenantId: f.tenant.id, studentCode: "HISTORY-OTHER" },
      });
      await page.goto(`/app/students/${other.id}`);
      await expect(
        page.locator(".student-profile").getByRole("alert"),
      ).toBeVisible();
      await expect(nav(page)).toHaveCount(0);
    } finally {
      await db.$disconnect();
    }
  });
}

for (const mode of ["no-preference", "reduce"] as const) {
  for (const pane of ["overview", "attendance", "finance"] as const) {
    test(`student profile ${pane} visual ${mode} at four widths with real data keyboard and axe`, async ({
      page,
    }) => {
      const db = database();
      try {
        const f = await fixture(db);
        await login(page, f);
        const financial =
          pane === "finance" ? await financeFixture(page, f) : null;
        await open(page, f, pane);
        if (pane === "overview")
          await expect(
            page.getByLabel("Họ và tên", { exact: true }),
          ).toHaveValue(f.student.fullName);
        if (pane === "attendance") {
          await page.getByLabel("Từ ngày", { exact: true }).fill("2030-06-01");
          await page.getByLabel("Đến ngày", { exact: true }).fill("2030-06-30");
          await page
            .getByRole("button", { name: "Xem điểm danh", exact: true })
            .click();
          await expect(
            page.getByText("Chưa có điểm danh đã chốt trong khoảng ngày này."),
          ).toBeVisible();
        }
        if (financial)
          await expect(
            page.getByRole("link", {
              name: financial.payment.receiptNo,
              exact: true,
            }),
          ).toBeVisible();
        await page.emulateMedia({ reducedMotion: mode });
        mkdirSync("docs/release/evidence/student-history", { recursive: true });
        for (const width of [360, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          if (financial) {
            const invoiceTable = page.getByRole("table").filter({
              has: page.getByRole("link", {
                name: financial.invoice.invoiceNo,
                exact: true,
              }),
            });
            const paymentTable = page.getByRole("table").filter({
              has: page.getByRole("link", {
                name: financial.payment.receiptNo,
                exact: true,
              }),
            });
            const moneyCells = [/^1\.200\.000/, /^500\.000/, /^700\.000/].map(
              (name) => invoiceTable.getByRole("cell", { name }),
            );
            moneyCells.push(
              paymentTable.getByRole("cell", { name: /^500\.000/ }),
            );
            for (const cell of moneyCells) {
              const lines = await cell.evaluate((element) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                return Array.from(range.getClientRects()).filter(
                  (rect) => rect.width > 0,
                ).length;
              });
              expect(
                lines,
                `VND must stay on one visual line at ${width}px`,
              ).toBe(1);
            }
            await expect(
              page.getByRole("cell", { name: "Đã xác nhận", exact: true }),
            ).toBeVisible();
          }
          await nav(page)
            .getByRole("link", { name: "Tổng quan", exact: true })
            .focus();
          await page.keyboard.press("Tab");
          await expect(
            nav(page).getByRole("link", { name: "Lớp học", exact: true }),
          ).toBeFocused();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          expect(
            (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
          await reviewTaste(
            page,
            `docs/release/evidence/student-history/${pane}-${mode}-taste-${width}.json`,
          );
          await page.screenshot({
            path: `docs/release/evidence/student-history/${pane}-${mode}-${width}.png`,
            fullPage: true,
          });
        }
      } finally {
        await db.$disconnect();
      }
    });
  }
  test(`student history selected enrollment visual ${mode} at four widths with keyboard and axe`, async ({
    page,
  }) => {
    const db = database();
    try {
      const f = await fixture(db);
      await login(page, f);
      await open(page, f, "enrollments");
      await expect(page.getByRole("table")).toContainText("HISTORY-00");
      await page.emulateMedia({ reducedMotion: mode });
      mkdirSync("docs/release/evidence/student-history", { recursive: true });
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByLabel("Tìm mã hoặc tên lớp").focus();
        await page.keyboard.press("Tab");
        await expect(
          page.getByRole("button", { name: "Tìm lớp", exact: true }),
        ).toBeFocused();
        if (width === 360) {
          const region = page.getByRole("region", {
            name: "Lịch sử lớp học, có thể cuộn ngang",
          });
          await region.focus();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => region.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await region.evaluate((element) => {
            element.scrollLeft = 0;
          });
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await reviewTaste(
          page,
          `docs/release/evidence/student-history/enrollments-${mode}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/student-history/enrollments-${mode}-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      await db.$disconnect();
    }
  });
}
