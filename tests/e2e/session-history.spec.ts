import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
test.use({ timezoneId: "Pacific/Honolulu" });

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
async function fixture(page: Page, count = 1) {
  const db = database();
  try {
    const stamp = randomUUID().slice(0, 8);
    const source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
    const tenant = await db.tenant.create({
      data: {
        slug: "session-log-" + stamp,
        name: "Trung tâm lịch sử buổi học",
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
        email: `session-log-${stamp}@example.test`,
        displayName: "Người đối chiếu lịch sử",
        passwordHash: source.passwordHash,
        status: "ACTIVE",
      },
    });
    const owner = await db.user.create({
      data: {
        email: `session-log-owner-${stamp}@example.test`,
        displayName: "Chủ trung tâm kiểm chứng",
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
          create: [
            { role: "owner" },
            { role: "teacher" },
            { role: "accountant" },
          ],
        },
      },
    });
    await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }, { role: "teacher" }] },
      },
    });
    const teacher = await db.teacher.create({
      data: {
        tenantId: tenant.id,
        userId: actor.id,
        teacherCode: "GV-LICHSU",
        fullName: "Giáo viên buổi học",
      },
    });
    const otherTeacher = await db.teacher.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        teacherCode: "GV-THAY",
        fullName: "Giáo viên nhận buổi thay",
      },
    });
    async function native(email: string) {
      const login = await fetch(testOrigins.api + "/api/v1/mobile/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "Fluivix-Test-Password-2026" }),
      });
      expect(login.status).toBe(200);
      const chosen = await fetch(
        testOrigins.api + "/api/v1/auth/switch-context",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + (await login.json()).data.accessToken,
          },
          body: JSON.stringify({ tenantId: tenant.id, role: "owner" }),
        },
      );
      expect(chosen.status).toBe(200);
      return (await chosen.json()).data.accessToken as string;
    }
    const token = await native(actor.email);
    let ownerToken: string | undefined;
    async function request(
      route: string,
      data?: Record<string, unknown>,
      method = "POST",
      independentOwner = false,
    ) {
      if (independentOwner && !ownerToken)
        ownerToken = await native(owner.email);
      const response = await fetch(testOrigins.api + "/api/v1" + route, {
        method: data ? method : "GET",
        headers: {
          Authorization: "Bearer " + (independentOwner ? ownerToken : token),
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      expect(response.ok, route + ": " + response.status).toBe(true);
      return response.json();
    }
    const room = (
      await request("/rooms", {
        code: "PHONG-A",
        name: "Phòng học ban đầu",
        capacity: 20,
      })
    ).data;
    const changedRoom = (
      await request("/rooms", {
        code: "PHONG-B",
        name: "Phòng học sau thay đổi",
        capacity: 20,
      })
    ).data;
    const cls = (
      await request("/classes", {
        code: "LOP-LS",
        name: "Lớp đối chiếu buổi học",
        capacity: 10,
        roomId: room.id,
        startDate: "2030-01-01",
        endDate: "2031-01-01",
      })
    ).data;
    for (const profile of [teacher, otherTeacher])
      await request(`/classes/${cls.id}/teachers`, {
        teacherId: profile.id,
        effectiveFrom: "2030-01-01",
      });
    const student = (
      await request("/students", {
        studentCode: "HV-LICHSU",
        fullName: "Học viên lịch sử",
      })
    ).data;
    await request(`/classes/${cls.id}/enrollments`, {
      studentId: student.id,
      joinedAt: "2030-01-01",
    });
    const session = (
      await request(`/classes/${cls.id}/sessions/extra`, {
        teacherId: teacher.id,
        roomId: room.id,
        startsAt: "2030-11-02T13:00:00Z",
        endsAt: "2030-11-02T14:00:00Z",
      })
    ).data;
    const reason = "Đổi buổi học để đối chiếu lịch sử đã lưu";
    async function move(index = 0, teacherId = teacher.id) {
      const current = (await request(`/sessions/${session.id}`)).data;
      const day = index % 2 ? "2030-11-04" : "2030-11-03";
      return request(`/sessions/${session.id}/reschedule`, {
        sessionVersion: current.version,
        teacherId,
        roomId: changedRoom.id,
        startsAt: day + "T14:00:00Z",
        endsAt: day + "T15:00:00Z",
        reason,
      });
    }
    async function cancel() {
      const current = (await request(`/sessions/${session.id}`)).data;
      await request(`/sessions/${session.id}/cancel`, {
        sessionVersion: current.version,
        reason: "Hủy buổi học và giữ nguyên lịch sử đối chiếu",
      });
    }
    for (let i = 0; i < count; i++) await move(i);
    async function login(role = "owner") {
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
      await page.goto(`/app/sessions/${session.id}`);
      await expect(page.getByRole("banner")).toContainText(tenant.name);
      await expect(
        page.getByRole("heading", { level: 1, name: /Buổi học/ }),
      ).toBeVisible();
    }
    return {
      tenant,
      actor,
      owner,
      member,
      plan,
      teacher,
      otherTeacher,
      session,
      reason,
      move,
      cancel,
      login,
      request,
    };
  } finally {
    await db.$disconnect();
  }
}
const history = (page: Page) => page.locator(".session-change-history");
const entries = (page: Page) => history(page).getByRole("article");
async function open(page: Page) {
  await history(page).locator("summary").click();
}
async function contextPicker(page: Page) {
  const menu = page.getByRole("button", {
    name: "Mở menu trung tâm",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
}

test("session change history loads on demand and shows actual DST reschedule and cancellation snapshots", async ({
  page,
}) => {
  const f = await fixture(page);
  const reads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(`/sessions/${f.session.id}/changes`))
      reads.push(request.url());
  });
  await f.login();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Buổi học 03/11/2030",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Nội dung đã học", { exact: true }),
  ).toBeVisible();
  expect(reads).toHaveLength(0);
  await open(page);
  await expect(entries(page)).toHaveCount(1);
  expect(reads).toHaveLength(1);
  const change = entries(page).first();
  await expect(
    change.getByRole("region", {
      name: "Trước thay đổi, phiên bản 1",
      exact: true,
    }),
  ).toContainText("02/11/2030");
  await expect(
    change.getByRole("region", {
      name: "Sau thay đổi, phiên bản 2",
      exact: true,
    }),
  ).toContainText("03/11/2030");
  const before = await change
    .locator("time[datetime='2030-11-02T13:00:00.000Z']")
    .innerText();
  const after = await change
    .locator("time[datetime='2030-11-03T14:00:00.000Z']")
    .innerText();
  expect(before).toContain("09:00");
  expect(after).toContain("09:00");
  expect(before).toContain("GMT-4");
  expect(after).toContain("GMT-5");
  await expect(change).toContainText(f.reason);
  await expect(change).toContainText("Phòng học ban đầu");
  await expect(change).toContainText("Phòng học sau thay đổi");
  await f.cancel();
  await page.reload();
  await open(page);
  await expect(entries(page)).toHaveCount(2);
  await expect(entries(page).first()).toHaveAccessibleName(
    "Hủy buổi học, phiên bản 3",
  );
  await expect(
    entries(page)
      .first()
      .getByRole("region", { name: "Sau thay đổi, phiên bản 3", exact: true }),
  ).toContainText("Đã hủy");
  await expect(
    page.getByRole("button", { name: "Lưu nhật ký", exact: true }),
  ).toHaveCount(0);
});
test("empty history and real transport retry keep an unsaved lesson while hiding failed history data", async ({
  page,
}) => {
  const f = await fixture(page, 0);
  await f.login();
  const draft = "Nội dung nhật ký chưa lưu được giữ nguyên";
  await page.getByLabel("Nội dung đã học", { exact: true }).fill(draft);
  await open(page);
  await expect(history(page)).toContainText(
    "Buổi học chưa có thay đổi lịch hoặc hủy.",
  );
  await f.move();
  await history(page)
    .getByRole("button", { name: "Tải lại lịch sử", exact: true })
    .click();
  await expect(entries(page)).toHaveCount(1);
  const pattern = `**/api/v1/sessions/${f.session.id}/changes?*`;
  await page.route(pattern, (route) => route.abort("failed"));
  await history(page)
    .getByRole("button", { name: "Tải lại lịch sử", exact: true })
    .click();
  await expect(
    history(page).getByRole("button", {
      name: "Thử tải lại lịch sử",
      exact: true,
    }),
  ).toBeVisible();
  await expect(entries(page)).toHaveCount(0);
  await expect(page.getByLabel("Nội dung đã học", { exact: true })).toHaveValue(
    draft,
  );
  await page.unroute(pattern);
  await history(page)
    .getByRole("button", { name: "Thử tải lại lịch sử", exact: true })
    .click();
  await expect(entries(page)).toHaveCount(1);
  await expect(history(page)).toContainText(
    "Lịch sử có thay đổi mới hơn phiên bản đang mở.",
  );
  await expect(page.getByLabel("Nội dung đã học", { exact: true })).toHaveValue(
    draft,
  );
});
test("actual 25-change history paginates and preserves keyboard focus and an unsaved lesson", async ({
  page,
}) => {
  const f = await fixture(page, 25);
  await f.login();
  const draft = "Bản nhật ký đang nhập trong khi đối chiếu trang lịch sử";
  await page.getByLabel("Nội dung đã học", { exact: true }).fill(draft);
  await open(page);
  await expect(entries(page)).toHaveCount(20);
  const next = history(page).getByRole("button", {
    name: "Lịch sử sau",
    exact: true,
  });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(entries(page)).toHaveCount(5);
  await expect(next).toBeFocused();
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(history(page)).toContainText("Trang lịch sử 2 / 2");
  await expect(entries(page).first()).toHaveAccessibleName(
    "Đổi lịch buổi học, phiên bản 6",
  );
  await history(page)
    .getByRole("button", { name: "Lịch sử trước", exact: true })
    .click();
  await expect(entries(page)).toHaveCount(20);
  await expect(entries(page).first()).toHaveAccessibleName(
    "Đổi lịch buổi học, phiên bản 26",
  );
  await expect(page.getByLabel("Nội dung đã học", { exact: true })).toHaveValue(
    draft,
  );
});
test("real teacher reassignment denied by history clears the parent roster lesson editor and old cached history", async ({
  page,
}) => {
  const f = await fixture(page, 25);
  await f.login("teacher");
  await page
    .getByLabel("Nội dung đã học", { exact: true })
    .fill("Bản nháp riêng phải xóa sau khi mất quyền buổi học");
  await open(page);
  await expect(entries(page)).toHaveCount(20);
  await f.move(1, f.otherTeacher.id);
  const denied = page.waitForResponse(
    (response) =>
      response.url().includes(`/sessions/${f.session.id}/changes?`) &&
      response.url().includes("page=2"),
  );
  await history(page)
    .getByRole("button", { name: "Lịch sử sau", exact: true })
    .click();
  expect((await denied).status()).toBe(404);
  await expect(
    page.getByText(/Quyền truy cập buổi học đã thay đổi/),
  ).toBeVisible();
  await expect(history(page)).toHaveCount(0);
  await expect(page.getByLabel("Nội dung đã học", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Học viên lịch sử", { exact: true })).toHaveCount(
    0,
  );
  const verifiedDenial = page.waitForResponse((response) =>
    response.url().endsWith(`/sessions/${f.session.id}/attendance`),
  );
  await page
    .getByRole("button", { name: "Kiểm tra lại quyền truy cập", exact: true })
    .click();
  expect((await verifiedDenial).status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: /Buổi học/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Nội dung đã học", { exact: true })).toHaveCount(
    0,
  );
});
test("real membership suspension clears cached history and the parent editor after an actual history 403", async ({
  page,
}) => {
  const f = await fixture(page, 25);
  await f.login("teacher");
  await page
    .getByLabel("Nội dung đã học", { exact: true })
    .fill("Bản nháp phải xóa khi thành viên bị đình chỉ");
  await open(page);
  await expect(entries(page)).toHaveCount(20);
  await f.request(
    `/staff/${f.member.id}`,
    {
      version: f.member.version,
      status: "SUSPENDED",
      reason: "Đình chỉ thành viên để kiểm chứng lịch sử buổi học",
    },
    "PATCH",
    true,
  );
  const denied = page.waitForResponse(
    (response) =>
      response.url().includes(`/sessions/${f.session.id}/changes?`) &&
      response.url().includes("page=2"),
  );
  await history(page)
    .getByRole("button", { name: "Lịch sử sau", exact: true })
    .click();
  expect((await denied).status()).toBe(403);
  await expect(
    page.getByText(/Quyền truy cập buổi học đã thay đổi/),
  ).toBeVisible();
  await expect(entries(page)).toHaveCount(0);
  await expect(page.getByLabel("Nội dung đã học", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Học viên lịch sử", { exact: true })).toHaveCount(
    0,
  );
});

test("READ_ONLY session history remains readable while financial-role context cannot inherit its cached rows", async ({
  page,
}) => {
  const f = await fixture(page);
  const db = database();
  try {
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
  } finally {
    await db.$disconnect();
  }
  await f.login();
  await open(page);
  await expect(entries(page)).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Lưu nhật ký", exact: true }),
  ).toBeDisabled();
  await contextPicker(page);
  const changed = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/switch-context") &&
      response.request().method() === "POST",
  );
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: f.tenant.name, exact: true }),
    })
    .getByRole("button", { name: "Kế toán", exact: true })
    .click();
  expect((await changed).status()).toBe(200);
  await expect(page.getByRole("banner")).toContainText("Kế toán");
  await page.goto(`/app/sessions/${f.session.id}`);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Vai trò hiện tại không có quyền xem buổi học." }),
  ).toContainText("Vai trò hiện tại không có quyền xem buổi học.");
  await expect(entries(page)).toHaveCount(0);
  await expect(page.getByText(f.reason, { exact: false })).toHaveCount(0);
});
test("centre switch aborts actual delayed history bytes and the old session deep link stays private", async ({
  page,
}) => {
  const f = await fixture(page);
  const db = database();
  let second;
  try {
    second = await db.tenant.create({
      data: {
        slug: "session-log-second-" + randomUUID().slice(0, 8),
        name: "Trung tâm lịch sử thứ hai",
        timezone: "Asia/Ho_Chi_Minh",
        status: "ACTIVE",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    await db.subscription.create({
      data: {
        tenantId: second.id,
        planId: f.plan.id,
        startsAt: new Date("2020-01-01Z"),
        endsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    await db.membership.create({
      data: {
        tenantId: second.id,
        userId: f.actor.id,
        status: "ACTIVE",
        roles: { create: { role: "owner" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
  await f.login();
  let release!: () => void, observed!: () => void, finish!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    seen = new Promise<void>((resolve) => {
      observed = resolve;
    }),
    finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
  const pattern = `**/api/v1/sessions/${f.session.id}/changes?*`;
  await page.route(pattern, async (route) => {
    try {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      observed();
      await held;
      if (!route.request().failure()) await route.fulfill({ response });
    } finally {
      finish();
    }
  });
  try {
    await open(page);
    await seen;
    const aborted = page.waitForEvent("requestfailed", (request) =>
      request.url().includes(`/sessions/${f.session.id}/changes?`),
    );
    await contextPicker(page);
    const switching = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/auth/switch-context") &&
        response.request().method() === "POST",
    );
    await page
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: second.name, exact: true }),
      })
      .getByRole("button", { name: "Chủ trung tâm", exact: true })
      .click();
    expect((await switching).status()).toBe(200);
    expect((await aborted).failure()).not.toBeNull();
    await expect(page.getByRole("banner")).toContainText(second.name);
    release();
    await finished;
    await page.unroute(pattern);
    const foreignDenied = page.waitForResponse((response) =>
      response.url().endsWith(`/sessions/${f.session.id}/attendance`),
    );
    await page.goto(`/app/sessions/${f.session.id}`);
    expect((await foreignDenied).status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: /Buổi học/ }),
    ).toHaveCount(0);
    await expect(page.getByText(f.reason, { exact: false })).toHaveCount(0);
    await expect(entries(page)).toHaveCount(0);
  } finally {
    release();
    await finished;
    await page.unroute(pattern);
  }
});

for (const mode of ["no-preference", "reduce"] as const)
  for (const width of [360, 768, 1024, 1440])
    test(`session history real snapshots visual and accessibility ${width} ${mode}`, async ({
      page,
    }) => {
      const f = await fixture(page);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: mode });
      await f.login();
      const folder = "docs/release/evidence/session-history";
      mkdirSync(folder, { recursive: true });
      await expect(
        page.getByText("Học viên lịch sử", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${folder}/overview-${width}-${mode}.png`,
      });
      const summary = history(page).locator("summary");
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(entries(page)).toHaveCount(1);
      await expect(summary).toBeFocused();
      expect(
        await summary.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await reviewTaste(
        page,
        `${folder}/rescheduled-${width}-${mode}-taste.json`,
      );
      await history(page).screenshot({
        path: `${folder}/rescheduled-${width}-${mode}.png`,
      });
      await f.cancel();
      await page.reload();
      await open(page);
      await expect(entries(page)).toHaveCount(2);
      await expect(entries(page).first()).toHaveAccessibleName(
        "Hủy buổi học, phiên bản 3",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await reviewTaste(
        page,
        `${folder}/cancelled-${width}-${mode}-taste.json`,
      );
      await history(page).screenshot({
        path: `${folder}/cancelled-${width}-${mode}.png`,
      });
    });
