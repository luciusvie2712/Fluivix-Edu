import { expect, test, type Page } from "./fixtures";
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

test("a delayed real lesson response cannot overwrite a newer lesson from another session", async ({
  page,
  request,
}) => {
  let token = "";
  async function api(
    method: "GET" | "POST" | "PUT",
    route: string,
    data?: Record<string, unknown>,
  ) {
    const response = await request.fetch(testOrigins.api + "/api/v1" + route, {
      method,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      ...(data ? { data } : {}),
    });
    expect(response.ok(), route).toBe(true);
    return response.json();
  }
  const signed = await api("POST", "/mobile/auth/login", {
    email: "inviter@example.test",
    password: "Fluivix-Test-Password-2026",
  });
  token = signed.data.accessToken;
  const context = await api("POST", "/auth/switch-context", {
    tenantId: "10000000-0000-4000-8000-000000000001",
    role: "owner",
  });
  token = context.data.accessToken;
  const teacher = (await api("GET", "/teachers")).data.find(
    (v: { teacherCode: string }) => v.teacherCode === "WEB-TEACHER",
  );
  const student = (await api("GET", "/students?search=TEST-001")).data[0];
  expect(teacher).toBeTruthy();
  expect(student).toBeTruthy();
  const cls = (
    await api("POST", "/classes", {
      code: "STALE" + Date.now(),
      name: "Lớp kiểm thử phản hồi trễ",
      capacity: 2,
      startDate: "2026-11-01",
      endDate: "2026-12-31",
    })
  ).data;
  await api("POST", `/classes/${cls.id}/teachers`, {
    teacherId: teacher.id,
    effectiveFrom: "2026-11-01",
    effectiveTo: "2026-12-31",
  });
  await api("POST", `/classes/${cls.id}/enrollments`, {
    studentId: student.id,
    joinedAt: "2026-11-01",
  });
  const session = (
    await api("POST", `/classes/${cls.id}/sessions/extra`, {
      teacherId: teacher.id,
      startsAt: "2026-11-03T14:00:00Z",
      endsAt: "2026-11-03T15:00:00Z",
    })
  ).data;
  await page.goto(testOrigins.web + "/login");
  await page.getByLabel("Email", { exact: true }).fill("inviter@example.test");
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
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  await expect(page).toHaveURL(testOrigins.web + "/app/students");
  let release!: () => void;
  const changed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const attendanceRoute = `**/api/v1/sessions/${session.id}/attendance`;
  const lessonRoute = `**/api/v1/sessions/${session.id}/lesson-report`;
  const externalSummary = "Nội dung được xác nhận từ thiết bị khác";
  await page.route(attendanceRoute, async (route) => {
    await changed;
    await route.continue();
  });
  await page.route(lessonRoute, async (route) => {
    // Hold genuine v1 bytes; perform an actual concurrent write, then let the
    // attendance query observe v2. No backend payload or response is fabricated.
    const old = await route.fetch();
    expect((await old.json()).data.sessionVersion).toBe(1);
    try {
      expect(
        (
          await api("PUT", `/sessions/${session.id}/lesson-report`, {
            sessionVersion: 1,
            lessonSummary: externalSummary,
            homeworkText: "",
            teacherNotesPrivate: "",
          })
        ).data.sessionVersion,
      ).toBe(2);
    } finally {
      release();
    }
    await route.fulfill({ response: old });
  });
  await page.goto(testOrigins.web + `/app/sessions/${session.id}`);
  await expect(page.getByText(/SCHEDULED.*Phiên bản 2/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lưu nháp điểm danh", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Lưu nhật ký", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Nhật ký và buổi học đang khác phiên bản" }),
  ).toBeVisible();
  await page.unroute(attendanceRoute);
  await page.unroute(lessonRoute);
  expect(
    (await api("GET", `/sessions/${session.id}/lesson-report`)).data
      .lessonSummary,
  ).toBe(externalSummary);
  await page
    .getByText("Tải lại dữ liệu khi có xung đột phiên bản", { exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Tôi đã đối chiếu và đồng ý bỏ các thay đổi chưa lưu trên màn hình.",
    })
    .check();
  await page
    .getByRole("button", {
      name: "Tải lại và bỏ bản sửa chưa lưu",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Nội dung đã học", { exact: true })).toHaveValue(
    externalSummary,
  );
  await page
    .getByLabel("Bài tập giao", { exact: true })
    .fill("Bài tập sau khi đối chiếu phiên bản");
  await page.getByRole("button", { name: "Lưu nhật ký", exact: true }).click();
  await expect(page.getByText(/SCHEDULED.*Phiên bản 3/)).toBeVisible();
  const stored = (await api("GET", `/sessions/${session.id}/lesson-report`))
    .data;
  expect(stored.lessonSummary).toBe(externalSummary);
  expect(stored.homeworkText).toBe("Bài tập sau khi đối chiếu phiên bản");
});

function teachingDatabase() {
  const url = process.env.E2E_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw Error("Disposable teaching browser database required");
  return new PrismaClient({ datasourceUrl: url });
}
async function teachingFixture(db: PrismaClient) {
  const stamp = randomUUID(),
    source = await db.user.findUniqueOrThrow({
      where: { email: "inviter@example.test" },
    });
  const tenant = await db.tenant.create({
    data: {
      slug: "teaching-journey-" + stamp,
      name: "Trung tâm giảng dạy " + stamp.slice(0, 8),
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
  const owner = await db.user.create({
    data: {
      email: `teaching-owner-${stamp}@example.test`,
      displayName: "Chủ trung tâm giảng dạy kiểm thử",
      status: "ACTIVE",
      passwordHash: source.passwordHash,
    },
  });
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: owner.id,
      status: "ACTIVE",
      roles: { create: [{ role: "owner" }] },
    },
  });
  const teacher = await db.user.create({
    data: {
      email: `teaching-teacher-${stamp}@example.test`,
      displayName: "Giáo viên kiểm thử Web",
      status: "ACTIVE",
      passwordHash: source.passwordHash,
    },
  });
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: teacher.id,
      status: "ACTIVE",
      roles: { create: [{ role: "teacher" }] },
    },
  });
  await db.teacher.create({
    data: {
      tenantId: tenant.id,
      userId: teacher.id,
      teacherCode: "WEB-TEACHER",
      fullName: "Giáo viên kiểm thử Web",
    },
  });
  await db.student.create({
    data: {
      tenantId: tenant.id,
      studentCode: "TEST-001",
      fullName: "Học viên kiểm thử A",
      status: "ACTIVE",
    },
  });
  return { owner, tenant, db };
}
// Both independently selectable cases run every original business assertion.
// Each owns its centre, so teachers/students/sessions never depend on test order.
async function teachingJourney(
  page: Page,
  f: Awaited<ReturnType<typeof teachingFixture>>,
) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: f.tenant.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const midnight = new Date(today + "T00:00:00Z");
  const anchor = midnight.getTime() - (midnight.getUTCDay() || 7) * 86400000;
  const fixtureDay = (offset: number) =>
    new Date(anchor + offset * 86400000).toISOString().slice(0, 10);
  expect(Date.parse(fixtureDay(8))).toBeGreaterThan(Date.parse(today));
  await page.goto(testOrigins.web + "/login");
  await page.getByLabel("Email", { exact: true }).fill(f.owner.email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Fluivix-Test-Password-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: f.tenant.name,
        exact: true,
      }),
    })
    .getByRole("button", { name: "Chủ trung tâm", exact: true })
    .click();
  await expect(page).toHaveURL(testOrigins.web + "/app/students");
  await page
    .getByRole("link", { name: "Lớp học và lịch học", exact: true })
    .click();
  const code = "WEB" + Date.now();
  await page.getByLabel("Mã lớp", { exact: true }).fill(code);
  await page
    .getByLabel("Tên lớp", { exact: true })
    .fill("Lớp vận hành Web kiểm thử");
  await page.getByLabel("Sức chứa lớp", { exact: true }).fill("20");
  await page
    .getByLabel("Ngày bắt đầu lớp", { exact: true })
    .fill(fixtureDay(0));
  await page
    .getByLabel("Ngày kết thúc lớp", { exact: true })
    .fill(fixtureDay(60));
  await page.getByRole("button", { name: "Tạo lớp", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Lớp vận hành Web kiểm thử",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Tìm học viên để ghi danh", { exact: true })
    .fill("TEST-001");
  await page
    .getByLabel("Học viên đang hoạt động", { exact: true })
    .selectOption({ label: "TEST-001 · Học viên kiểm thử A" });
  await page.getByLabel("Ngày ghi danh", { exact: true }).fill(fixtureDay(0));
  await page
    .getByRole("button", { name: "Ghi danh học viên", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Học viên kiểm thử A", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Giáo viên phân công", { exact: true })
    .selectOption({ label: "WEB-TEACHER · Giáo viên kiểm thử Web" });
  await page
    .getByRole("button", { name: "Phân công giáo viên", exact: true })
    .click();
  await expect(
    page
      .locator("form")
      .filter({
        has: page.getByRole("button", {
          name: "Phân công giáo viên",
          exact: true,
        }),
      })
      .getByRole("status"),
  ).toBeVisible();
  await page
    .getByLabel("Giáo viên dạy lịch lặp", { exact: true })
    .selectOption({ label: "WEB-TEACHER · Giáo viên kiểm thử Web" });
  await page
    .getByLabel("Ngày học trong tuần", { exact: true })
    .selectOption("1");
  await page
    .getByLabel("Giờ bắt đầu địa phương", { exact: true })
    .fill("00:00");
  await page
    .getByLabel("Giờ kết thúc địa phương", { exact: true })
    .fill("01:30");
  await page
    .getByLabel("Lịch có hiệu lực đến", { exact: true })
    .fill(fixtureDay(29));
  await page
    .getByRole("button", { name: "Xem trước quy tắc chưa lưu", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Kết quả xem trước quy tắc chưa lưu",
      exact: true,
    }),
  ).toContainText("5 buổi trong tối đa 60 ngày");
  await expect(page.getByLabel("Quy tắc đã lưu", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByRole("button", { name: "Lưu quy tắc lịch", exact: true })
    .click();
  await expect(
    page.getByLabel("Quy tắc đã lưu", { exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Sinh đến ngày", { exact: true }).fill(fixtureDay(29));
  await page
    .getByRole("button", { name: "Kiểm tra xung đột", exact: true })
    .click();
  await expect(
    page.getByText("5 buổi; 0 xung đột; 0 buổi đã có.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận sinh các buổi hợp lệ; hệ thống kiểm tra xung đột lại khi lưu.",
    })
    .check();
  await page
    .getByRole("button", { name: "Xác nhận sinh buổi học", exact: true })
    .click();
  await expect(
    page
      .locator("form")
      .filter({
        has: page.getByRole("button", {
          name: "Xác nhận sinh buổi học",
          exact: true,
        }),
      })
      .getByRole("status"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Lịch buổi học", exact: true }).click();
  await page.getByLabel("Xem theo", { exact: true }).selectOption("range");
  await page.getByLabel("Lịch từ ngày", { exact: true }).fill(fixtureDay(0));
  await page.getByLabel("Lịch đến ngày", { exact: true }).fill(fixtureDay(29));
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
  await page
    .getByRole("link", {
      name: `Mở buổi ${fixtureDay(1).split("-").reverse().join("/")}`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/app\/sessions\/[a-f0-9-]+$/);
  const firstSession = await f.db.classSession.findUniqueOrThrow({
    where: { id: page.url().split("/").at(-1)! },
  });
  expect(firstSession.startsAt.getTime()).toBeLessThan(Date.now());
  await page
    .getByLabel("Điểm danh Học viên kiểm thử A", { exact: true })
    .selectOption("PRESENT");
  await page.getByText("Dời hoặc hủy buổi học", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hủy buổi học", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Lưu nhật ký", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Chốt điểm danh", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Lưu nháp điểm danh", exact: true })
    .click();
  await expect(page.getByText(/IN_PROGRESS.*Phiên bản 2/)).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận điểm danh đã lưu trên hệ thống và đồng ý công bố.",
    })
    .check();
  await page
    .getByRole("button", { name: "Chốt điểm danh", exact: true })
    .click();
  await expect(page.getByText(/COMPLETED.*Phiên bản 3/)).toBeVisible();
  const sessionUrl = page.url();
  await page
    .getByRole("link", { name: "Lớp vận hành Web kiểm thử", exact: true })
    .click();
  await page
    .getByLabel("Quy tắc đã lưu", { exact: true })
    .selectOption({ label: `Thứ 2 · 00:00–01:30 · ${fixtureDay(0)}` });
  const previousRule = await page
    .getByLabel("Quy tắc đã lưu", { exact: true })
    .inputValue();
  await page
    .getByText("Đổi lịch định kỳ trong tương lai và xem lịch sử", {
      exact: true,
    })
    .click();
  const replaceForm = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Xác nhận thay quy tắc lịch",
      exact: true,
    }),
  });
  await replaceForm
    .getByLabel("Thay lịch từ ngày", { exact: true })
    .fill(fixtureDay(8));
  await replaceForm
    .getByLabel("Giờ bắt đầu lịch mới", { exact: true })
    .fill("20:00");
  await replaceForm
    .getByLabel("Giờ kết thúc lịch mới", { exact: true })
    .fill("21:30");
  await replaceForm
    .getByLabel("Lý do thay đổi", { exact: true })
    .fill("Thay lịch tương lai sau khi xác minh lớp học");
  await replaceForm.getByRole("checkbox").check();
  await replaceForm
    .getByRole("button", { name: "Xác nhận thay quy tắc lịch", exact: true })
    .click();
  await expect(
    page.getByLabel("Quy tắc đã lưu", { exact: true }),
  ).not.toHaveValue(previousRule);
  await page
    .getByText("Đổi lịch định kỳ trong tương lai và xem lịch sử", {
      exact: true,
    })
    .click();
  await expect(page.getByText(/00:00–01:30 → 20:00–21:30/)).toBeVisible();
  return sessionUrl;
}

test("Web class enrollment, recurring preview/generation, real calendar, draft and published attendance; rule revision visual checks", async ({
  page,
}) => {
  const db = teachingDatabase();
  try {
    await teachingJourney(page, await teachingFixture(db));
    mkdirSync("docs/release/evidence/visual", { recursive: true });
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
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
      await page
        .getByText("Đổi lịch định kỳ trong tương lai và xem lịch sử", {
          exact: true,
        })
        .locator("..")
        .screenshot({
          path: `docs/release/evidence/visual/rule-revision-${width}.png`,
        });
      await reviewTaste(
        page,
        `docs/release/evidence/visual/rule-revision-taste-${width}.json`,
      );
    }
  } finally {
    await db.$disconnect();
  }
});

test("Web class enrollment, recurring preview/generation, real calendar, draft and published attendance; locked session visual checks", async ({
  page,
}) => {
  const db = teachingDatabase();
  try {
    const sessionUrl = await teachingJourney(page, await teachingFixture(db));
    await page.goto(sessionUrl);
    await expect(page.getByText(/COMPLETED.*Phiên bản 3/)).toBeVisible();
    mkdirSync("docs/release/evidence/visual", { recursive: true });
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
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
      await page.screenshot({
        path: `docs/release/evidence/visual/session-${width}.png`,
        fullPage: true,
      });
      await reviewTaste(
        page,
        `docs/release/evidence/visual/session-taste-${width}.json`,
      );
    }
  } finally {
    await db.$disconnect();
  }
});
