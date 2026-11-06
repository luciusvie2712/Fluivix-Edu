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
  const value = process.env.E2E_DATABASE_URL;
  if (
    !value ||
    !["127.0.0.1", "localhost"].includes(new URL(value).hostname) ||
    !new URL(value).pathname.endsWith("_test")
  )
    throw Error("Disposable browser database required");
  return new PrismaClient({ datasourceUrl: value });
}
async function fixture(db: PrismaClient) {
  const stamp = randomUUID().slice(0, 8),
    source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
  const tenant = await db.tenant.create({
    data: {
      slug: "notification-ui-" + stamp,
      name: "Trung tâm thông báo " + stamp,
      status: "ACTIVE",
      timezone: "Asia/Ho_Chi_Minh",
      subscriptionEndsAt: new Date("2040-01-01Z"),
      graceUntil: new Date("2040-02-01Z"),
    },
  });
  const plan = await db.plan.findFirstOrThrow({
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
      email: `notification-ui-${stamp}@example.test`,
      displayName: "Người nhận thông báo kiểm thử",
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
        create: [{ role: "owner" }, { role: "teacher" }, { role: "guardian" }],
      },
    },
  });
  const teacher = await db.teacher.create({
    data: {
      tenantId: tenant.id,
      userId: actor.id,
      teacherCode: "NOTIFY-UI",
      fullName: "Giáo viên thông báo kiểm thử",
    },
  });
  const cls = await db.educationClass.create({
    data: {
      tenantId: tenant.id,
      code: "NOTIFY-UI",
      name: "Lớp thông báo kiểm thử",
      capacity: 10,
      startDate: new Date("2030-01-01Z"),
      endDate: new Date("2030-12-31Z"),
    },
  });
  await db.classTeacher.create({
    data: {
      tenantId: tenant.id,
      classId: cls.id,
      teacherId: teacher.id,
      effectiveFrom: new Date("2030-01-01Z"),
    },
  });
  const children = [];
  for (let i = 0; i < 2; i++) {
    const child = await db.student.create({
      data: {
        tenantId: tenant.id,
        studentCode: "NOTIFY-UI-" + i,
        fullName: "Học viên thông báo kiểm thử " + i,
      },
    });
    children.push(child);
    await db.enrollment.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        studentId: child.id,
        joinedAt: new Date("2030-01-01Z"),
      },
    });
    await db.guardianLink.create({
      data: {
        tenantId: tenant.id,
        studentId: child.id,
        guardianUserId: actor.id,
        status: "ACTIVE",
        verifiedBy: actor.id,
        verifiedAt: new Date(),
      },
    });
  }
  const session = await db.classSession.create({
    data: {
      tenantId: tenant.id,
      classId: cls.id,
      teacherId: teacher.id,
      scheduledDate: new Date("2030-06-10Z"),
      startsAt: new Date("2030-06-10T01:00Z"),
      endsAt: new Date("2030-06-10T02:00Z"),
    },
  });
  const event = await db.outboxEvent.create({
    data: {
      tenantId: tenant.id,
      eventType: "CLASS_SCHEDULE_CHANGED",
      aggregateId: session.id,
      eventVersion: 1,
      payload: {},
      processedAt: new Date(),
    },
  });
  // Historical recipient rows exercise the real API projection; worker
  // materialization/faults are covered separately against real PG and Redis.
  for (const role of ["teacher", "guardian"] as const)
    await db.notification.create({
      data: {
        tenantId: tenant.id,
        recipientUserId: actor.id,
        recipientRole: role,
        subjectStudentId: role === "guardian" ? children[0]!.id : null,
        eventId: event.id,
        type: event.eventType,
        entityType: "session",
        entityId: session.id,
      },
    });
  return { tenant, actor, session, event };
}
async function login(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
  role: "teacher" | "owner" = "teacher",
) {
  // The browser selector keeps educator roles mobile-only. These real API
  // sessions exercise the shared inbox with a valid selected recipient role.
  const signed = await page.request.post(
    testOrigins.api + "/api/v1/auth/login",
    {
      headers: { Origin: testOrigins.web },
      data: { email: f.actor.email, password: "Fluivix-Test-Password-2026" },
    },
  );
  expect(signed.status()).toBe(200);
  const token = (await signed.json()).data.accessToken;
  const selected = await page.request.post(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      headers: { Origin: testOrigins.web, Authorization: "Bearer " + token },
      data: { tenantId: f.tenant.id, role },
    },
  );
  expect(selected.status()).toBe(200);
  await page.goto("/app/notifications");
  await expect(
    page.getByRole("heading", { name: "Thông báo", exact: true }),
  ).toBeVisible();
}
test("notification inbox marks the real recipient event read across roles and persists preferences without changing consent", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await expect(
      page.getByRole("heading", { name: "Lịch học thay đổi", exact: true }),
    ).toHaveCount(1);
    await expect(page.getByText("Chưa đọc", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Máy chủ đã đánh dấu" }),
    ).toBeVisible();
    await expect(page.getByText("Đã đọc", { exact: true })).toBeVisible();
    expect(
      await db.notification.count({
        where: { eventId: f.event.id, readAt: null },
      }),
    ).toBe(0);
    const category = page.getByLabel("Thay đổi lịch học", { exact: true });
    await category.uncheck();
    await page
      .getByRole("button", { name: "Lưu tùy chọn", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Máy chủ đã lưu tùy chọn" }),
    ).toBeVisible();
    expect(
      (
        await db.notificationPreference.findUniqueOrThrow({
          where: {
            tenantId_userId: { tenantId: f.tenant.id, userId: f.actor.id },
          },
        })
      ).schedule,
    ).toBe(false);
    expect(
      await db.privacyConsent.count({ where: { tenantId: f.tenant.id } }),
    ).toBe(0);
    await page.reload();
    await expect(category).not.toBeChecked();
    await expect(page.getByText("Đã đọc", { exact: true })).toBeVisible();
    await page
      .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Chủ trung tâm", exact: true })
      .click();
    await expect(page).toHaveURL("/app/students");
    await page.getByRole("link", { name: "Thông báo", exact: true }).click();
    await expect(
      page.getByText("Chưa có thông báo trong ngữ cảnh này.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Lịch học thay đổi", exact: true }),
    ).toHaveCount(0);
    await expect(category).not.toBeChecked();
  } finally {
    await db.$disconnect();
  }
});
test("notification inbox hides stale rows on transport errors and revoked assignment, and keeps READ_ONLY writes disabled", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await expect(
      page.getByRole("heading", { name: "Lịch học thay đổi", exact: true }),
    ).toBeVisible();
    await page.route("**/api/v1/notifications?**", (route) =>
      route.abort("failed"),
    );
    await page
      .getByRole("button", { name: "Tải lại hộp thư", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Hộp thư cũ đã được ẩn" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Lịch học thay đổi", exact: true }),
    ).toHaveCount(0);
    await page.unroute("**/api/v1/notifications?**");
    await page
      .getByRole("button", { name: "Tải lại hộp thư", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Lịch học thay đổi", exact: true }),
    ).toBeVisible();
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Đánh dấu đã đọc", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Lưu tùy chọn", exact: true }),
    ).toBeDisabled();
    await db.classTeacher.updateMany({
      where: { tenantId: f.tenant.id },
      data: { effectiveTo: new Date("2030-05-01Z") },
    });
    await page
      .getByRole("button", { name: "Tải lại hộp thư", exact: true })
      .click();
    await expect(
      page.getByText("Chưa có thông báo trong ngữ cảnh này.", { exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
test("notification inbox has responsive keyboard and reduced-motion preferences with real scoped rows", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await expect(
      page.getByRole("heading", { name: "Lịch học thay đổi", exact: true }),
    ).toBeVisible();
    mkdirSync("docs/release/evidence/notifications", { recursive: true });
    for (const mode of ["no-preference", "reduce"] as const) {
      await page.emulateMedia({ reducedMotion: mode });
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByLabel("Chuyên cần", { exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(
          page.getByLabel("Kết quả học tập", { exact: true }),
        ).toBeFocused();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await reviewTaste(
          page,
          `docs/release/evidence/notifications/inbox-${mode}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/notifications/inbox-${mode}-${width}.png`,
          fullPage: true,
        });
      }
    }
  } finally {
    await db.$disconnect();
  }
});
