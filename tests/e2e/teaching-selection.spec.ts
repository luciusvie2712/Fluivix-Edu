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
async function fixture(db: PrismaClient) {
  const stamp = randomUUID().slice(0, 8);
  const source = await db.user.findUniqueOrThrow({
    where: { email: "accountant@example.test" },
  });
  const tenant = await db.tenant.create({
    data: {
      slug: "selection-" + stamp,
      name: "Trung tâm lựa chọn lịch học",
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
      email: `selection-${stamp}@example.test`,
      displayName: "Người đối chiếu lịch học",
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
          { role: "teacher" },
          { role: "accountant" },
        ],
      },
    },
  });
  const teachers = [];
  for (let i = 0; i < 26; i++) {
    const suffix = String(i).padStart(2, "0");
    const user =
      i === 0
        ? actor
        : await db.user.create({
            data: {
              email: `teacher-${stamp}-${suffix}@example.test`,
              displayName: `Giáo viên ${suffix}`,
              passwordHash: source.passwordHash,
              status: "ACTIVE",
            },
          });
    if (i > 0)
      await db.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          status: i === 25 ? "SUSPENDED" : "ACTIVE",
          roles: { create: { role: "teacher" } },
        },
      });
    teachers.push(
      await db.teacher.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          teacherCode: "GV-" + suffix,
          fullName: `Giáo viên ${suffix} đối chiếu lịch`,
          status: i === 24 ? "INACTIVE" : "ACTIVE",
        },
      }),
    );
  }
  await db.educationClass.createMany({
    data: Array.from({ length: 26 }, (_, i) => ({
      tenantId: tenant.id,
      code: "LOP-" + String(i).padStart(2, "0"),
      name: `Lớp ${String(i).padStart(2, "0")} luyện tập lịch học`,
      capacity: 10,
      startDate: new Date("2030-01-01Z"),
      endDate: new Date("2030-12-31Z"),
    })),
  });
  const signed = await fetch(testOrigins.api + "/api/v1/mobile/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: actor.email,
      password: "Fluivix-Test-Password-2026",
    }),
  });
  expect(signed.status).toBe(200);
  const switched = await fetch(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (await signed.json()).data.accessToken,
      },
      body: JSON.stringify({ tenantId: tenant.id, role: "owner" }),
    },
  );
  expect(switched.status).toBe(200);
  const token = (await switched.json()).data.accessToken as string;
  async function api(route: string, data?: Record<string, unknown>) {
    const response = await fetch(testOrigins.api + "/api/v1" + route, {
      method: data ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    expect(response.ok, route + ": " + response.status).toBe(true);
    return response.json();
  }
  const secondTeachers = await api("/teachers?page=2&limit=20&status=ACTIVE");
  const target = secondTeachers.data.find(
    (v: { accountReady: boolean }) => v.accountReady,
  ) as { id: string; teacherCode: string; fullName: string };
  expect(target).toBeTruthy();
  expect(
    (await api("/teachers?page=1&limit=20&status=ACTIVE")).data.some(
      (v: { id: string }) => v.id === target.id,
    ),
  ).toBe(false);
  const cls = (await api("/classes?page=2&limit=20")).data[0] as {
    id: string;
    code: string;
    name: string;
  };
  expect(
    (await api("/classes?page=1&limit=20")).data.some(
      (v: { id: string }) => v.id === cls.id,
    ),
  ).toBe(false);
  return { tenant, actor, teachers, target, cls, api };
}
async function login(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
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
  const switched = await page.request.post(
    testOrigins.api + "/api/v1/auth/switch-context",
    {
      headers: {
        Origin: testOrigins.web,
        Authorization: "Bearer " + (await signed.json()).data.accessToken,
      },
      data: { tenantId: f.tenant.id, role },
    },
  );
  expect(switched.status()).toBe(200);
  await page.goto("/app/schedule");
  await expect(page.getByRole("banner")).toContainText(f.tenant.name);
  await page.locator(".calendar-resource-filters > summary").click();
}
function picker(page: Page, label: string) {
  return page
    .getByLabel(label, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'room-picker')]");
}
async function selectTeacher(
  page: Page,
  label: string,
  f: Awaited<ReturnType<typeof fixture>>,
) {
  const region = picker(page, label);
  await region
    .getByRole("button", { name: "Giáo viên trang sau", exact: true })
    .click();
  await expect(region.getByText(/Trang giáo viên 2/)).toBeVisible();
  await page.getByLabel(label, { exact: true }).selectOption(f.target.id);
  await expect(page.getByLabel(label, { exact: true })).toHaveJSProperty(
    "validationMessage",
    "",
  );
}

test("off-page teacher assignment and native verification retain selection through searched pages and reject an unready account", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await page.goto(`/app/classes/${f.cls.id}`);
    const label = "Giáo viên phân công",
      region = picker(page, label);
    await selectTeacher(page, label, f);
    await region
      .getByRole("button", { name: "Giáo viên trang trước", exact: true })
      .click();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(
      f.target.id,
    );
    await expect(
      page.getByLabel(label, { exact: true }).locator("option:checked"),
    ).toContainText(f.target.teacherCode);
    await region.getByRole("textbox").fill("GV-25");
    await expect(
      page
        .getByLabel(label, { exact: true })
        .locator(`option[value="${f.teachers[25]!.id}"]`),
    ).toBeDisabled();
    await expect(region.getByText(/1 kết quả/)).toBeVisible();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(
      f.target.id,
    );
    const form = page
      .getByLabel(label, { exact: true })
      .locator("xpath=ancestor::form");
    const selectedMembership = {
      tenantId_userId: {
        tenantId: f.tenant.id,
        userId: f.teachers.find((v) => v.id === f.target.id)!.userId,
      },
    };
    await db.membership.update({
      where: selectedMembership,
      data: { status: "SUSPENDED" },
    });
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await form
      .getByRole("button", { name: "Phân công giáo viên", exact: true })
      .click();
    expect(
      await db.classTeacher.count({
        where: { tenantId: f.tenant.id, classId: f.cls.id },
      }),
    ).toBe(0);
    await db.membership.update({
      where: selectedMembership,
      data: { status: "ACTIVE" },
    });
    await region
      .getByRole("button", { name: "Xác minh lại giáo viên", exact: true })
      .click();
    await expect(page.getByLabel(label, { exact: true })).toHaveJSProperty(
      "validationMessage",
      "",
    );
    await form
      .getByRole("button", { name: "Phân công giáo viên", exact: true })
      .click();
    await expect(
      form.getByRole("status").filter({ hasText: "Đã lưu thay đổi" }),
    ).toBeVisible();
    expect(
      await db.classTeacher.count({
        where: {
          tenantId: f.tenant.id,
          classId: f.cls.id,
          teacherId: f.target.id,
        },
      }),
    ).toBe(1);
    await db.membership.update({
      where: {
        tenantId_userId: {
          tenantId: f.tenant.id,
          userId: f.teachers.find((v) => v.id === f.target.id)!.userId,
        },
      },
      data: { status: "SUSPENDED" },
    });
    await page.reload();
    await region.getByRole("textbox").fill(f.target.teacherCode);
    await expect(
      page
        .getByLabel(label, { exact: true })
        .locator(`option[value="${f.target.id}"]`),
    ).toBeDisabled();
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
  } finally {
    await db.$disconnect();
  }
});

test("off-page teachers drive actual recurring preview, save and replacement with verified current metadata", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await f.api(`/classes/${f.cls.id}/teachers`, {
      teacherId: f.target.id,
      effectiveFrom: "2030-01-01",
      effectiveTo: "2030-12-31",
    });
    await login(page, f);
    await page.goto(`/app/classes/${f.cls.id}`);
    await selectTeacher(page, "Giáo viên dạy lịch lặp", f);
    await page
      .getByLabel("Giờ bắt đầu địa phương", { exact: true })
      .fill("10:00");
    await page
      .getByLabel("Giờ kết thúc địa phương", { exact: true })
      .fill("11:00");
    await page
      .getByLabel("Lịch có hiệu lực từ", { exact: true })
      .fill("2030-06-03");
    await page
      .getByLabel("Lịch có hiệu lực đến", { exact: true })
      .fill("2030-06-24");
    await page
      .getByRole("button", { name: "Xem trước quy tắc chưa lưu", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Kết quả xem trước quy tắc chưa lưu" }),
    ).toContainText("0 xung đột");
    expect(
      await db.scheduleRule.count({ where: { tenantId: f.tenant.id } }),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Lưu quy tắc lịch", exact: true })
      .click();
    await expect(
      page.getByLabel("Quy tắc đã lưu", { exact: true }),
    ).not.toHaveValue("");
    await page
      .getByText("Đổi lịch định kỳ trong tương lai và xem lịch sử", {
        exact: true,
      })
      .click();
    await expect(
      page
        .getByLabel("Giáo viên lịch thay thế", { exact: true })
        .locator("option:checked"),
    ).toContainText(f.target.teacherCode);
    await expect(
      page.getByLabel("Giáo viên lịch thay thế", { exact: true }),
    ).toHaveJSProperty("validationMessage", "");
    await page
      .getByLabel("Thay lịch từ ngày", { exact: true })
      .fill("2030-06-10");
    const form = page
      .getByLabel("Giáo viên lịch thay thế", { exact: true })
      .locator("xpath=ancestor::form");
    await form
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Đối chiếu giáo viên ngoài trang đầu trước khi thay lịch");
    await form.getByRole("checkbox").check();
    await form
      .getByRole("button", { name: "Xác nhận thay quy tắc lịch", exact: true })
      .click();
    await expect
      .poll(() =>
        db.scheduleRule.count({
          where: { tenantId: f.tenant.id, teacherId: f.target.id },
        }),
      )
      .toBe(2);
  } finally {
    await db.$disconnect();
  }
});

test("extra and rescheduled sessions use off-page assigned teachers, preserve history and feed class/teacher calendar filters", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    for (const id of [f.target.id, f.teachers[0]!.id])
      await f.api(`/classes/${f.cls.id}/teachers`, {
        teacherId: id,
        effectiveFrom: "2030-01-01",
        effectiveTo: "2030-12-31",
      });
    await login(page, f);
    await page.goto(`/app/classes/${f.cls.id}`);
    await selectTeacher(page, "Giáo viên buổi bổ sung", f);
    await page
      .getByLabel("Ngày học bổ sung", { exact: true })
      .fill("2030-06-03");
    await page
      .getByLabel("Giờ bắt đầu buổi bổ sung", { exact: true })
      .fill("10:00");
    await page
      .getByLabel("Giờ kết thúc buổi bổ sung", { exact: true })
      .fill("11:00");
    await page
      .getByRole("button", { name: "Tạo buổi học bổ sung", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/sessions\/[a-f0-9-]+$/);
    await page.getByText("Dời hoặc hủy buổi học", { exact: true }).click();
    await expect(
      page
        .getByLabel("Giáo viên cho buổi dời lịch", { exact: true })
        .locator("option:checked"),
    ).toContainText(f.target.teacherCode);
    await page
      .getByLabel("Giáo viên cho buổi dời lịch", { exact: true })
      .selectOption(f.teachers[0]!.id);
    await page.getByLabel("Ngày học mới", { exact: true }).fill("2030-06-04");
    await page.getByLabel("Giờ bắt đầu mới", { exact: true }).fill("10:00");
    await page.getByLabel("Giờ kết thúc mới", { exact: true }).fill("11:00");
    const form = page
      .getByLabel("Ngày học mới", { exact: true })
      .locator("xpath=ancestor::form");
    await form
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Đổi giáo viên đã được phân công sau khi đối chiếu");
    await form.getByRole("checkbox").check();
    await form
      .getByRole("button", { name: "Dời buổi học", exact: true })
      .click();
    await expect
      .poll(() => db.sessionChange.count({ where: { tenantId: f.tenant.id } }))
      .toBe(1);
    const change = await db.sessionChange.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    expect(change.oldSnapshot).toMatchObject({ teacherId: f.target.id });
    expect(change.newSnapshot).toMatchObject({
      teacherId: f.teachers[0]!.id,
      version: 2,
    });
    await page.goto("/app/schedule");
    await page.locator(".calendar-resource-filters > summary").click();
    await picker(page, "Lọc lớp học")
      .getByRole("button", { name: "Lớp trang sau", exact: true })
      .click();
    await page
      .getByLabel("Lọc lớp học", { exact: true })
      .selectOption(f.cls.id);
    await picker(page, "Lọc lớp học")
      .getByRole("button", { name: "Lớp trang trước", exact: true })
      .click();
    await expect(page.getByLabel("Lọc lớp học", { exact: true })).toHaveValue(
      f.cls.id,
    );
    await picker(page, "Lọc giáo viên")
      .getByRole("textbox")
      .fill(f.target.teacherCode);
    await page
      .getByLabel("Lọc giáo viên", { exact: true })
      .selectOption(f.target.id);
    await page.getByLabel("Xem theo", { exact: true }).selectOption("range");
    await page.getByLabel("Lịch từ ngày", { exact: true }).fill("2030-06-04");
    await page.getByLabel("Lịch đến ngày", { exact: true }).fill("2030-06-04");
    await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
    await expect(
      page.getByText("Không có buổi học trong khoảng đã chọn.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Lọc giáo viên", { exact: true }).selectOption("");
    await expect(
      page.getByRole("link", { name: "Mở buổi 04/06/2030", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Các buổi học", exact: true }),
    ).toContainText("Đã đổi lịch 1 lần");
  } finally {
    await db.$disconnect();
  }
});

test("selected teacher only queries assigned classes; calendar failure removes cached rows and real membership revocation denies refresh", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await f.api(`/classes/${f.cls.id}/teachers`, {
      teacherId: f.teachers[0]!.id,
      effectiveFrom: "2030-01-01",
      effectiveTo: "2030-12-31",
    });
    await f.api(`/classes/${f.cls.id}/sessions/extra`, {
      teacherId: f.teachers[0]!.id,
      startsAt: "2030-06-03T03:00:00Z",
      endsAt: "2030-06-03T04:00:00Z",
    });
    const directoryRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/v1\/(teachers|rooms)(\?|$)/.test(request.url()))
        directoryRequests.push(request.url());
    });
    await login(page, f, "teacher");
    await expect(page.getByLabel("Lọc giáo viên", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Lọc phòng học", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      picker(page, "Lọc lớp học").getByText(/1 kết quả/),
    ).toBeVisible();
    await page.getByLabel("Xem theo", { exact: true }).selectOption("range");
    await page.getByLabel("Lịch từ ngày", { exact: true }).fill("2030-06-03");
    await page.getByLabel("Lịch đến ngày", { exact: true }).fill("2030-06-03");
    await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Mở buổi 03/06/2030", exact: true }),
    ).toBeVisible();
    const pattern = "**/api/v1/schedule?*";
    await page.route(pattern, (route) => route.abort("failed"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    // A repeat submit uses the same key; explicit refetch by online reconnect.
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await expect(
      page.getByRole("alert").filter({ hasText: "Không thể kết nối dịch vụ" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Các buổi học", exact: true }),
    ).toHaveCount(0);
    await page.unroute(pattern);
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Mở buổi 03/06/2030", exact: true }),
    ).toBeVisible();
    // Preserve the real last-owner invariant while revoking this selected teacher.
    const otherOwner = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
    await db.membership.create({
      data: {
        tenantId: f.tenant.id,
        userId: otherOwner.id,
        status: "ACTIVE",
        roles: { create: { role: "owner" } },
      },
    });
    await db.membership.update({
      where: { tenantId_userId: { tenantId: f.tenant.id, userId: f.actor.id } },
      data: { status: "SUSPENDED" },
    });
    const denied = page.waitForResponse((response) =>
      response.url().includes("/api/v1/schedule?"),
    );
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    expect((await denied).status()).toBe(403);
    await expect(
      page.getByRole("region", { name: "Các buổi học", exact: true }),
    ).toHaveCount(0);
    expect(directoryRequests).toEqual([]);
  } finally {
    await db.$disconnect();
  }
});

for (const mode of ["no-preference", "reduce"] as const)
  for (const width of [360, 768, 1024, 1440]) {
    test(`teaching selectors preserve keyboard, real counts and readable responsive layout ${width} ${mode}`, async ({
      page,
    }) => {
      const db = database();
      try {
        const f = await fixture(db);
        await f.api(`/classes/${f.cls.id}/teachers`, {
          teacherId: f.teachers[0]!.id,
          effectiveFrom: "2030-01-01",
          effectiveTo: "2030-12-31",
        });
        await f.api(`/classes/${f.cls.id}/sessions/extra`, {
          teacherId: f.teachers[0]!.id,
          startsAt: "2030-06-03T03:00:00Z",
          endsAt: "2030-06-03T04:00:00Z",
        });
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: mode });
        await login(page, f);
        await page
          .getByLabel("Xem theo", { exact: true })
          .selectOption("range");
        await page
          .getByLabel("Lịch từ ngày", { exact: true })
          .fill("2030-06-03");
        await page
          .getByLabel("Lịch đến ngày", { exact: true })
          .fill("2030-06-03");
        await page
          .getByRole("button", { name: "Xem lịch", exact: true })
          .click();
        await expect(
          page.getByRole("link", { name: "Mở buổi 03/06/2030", exact: true }),
        ).toBeVisible();
        await expect(
          picker(page, "Lọc lớp học").getByText(/26 kết quả/),
        ).toBeVisible();
        const folder = "docs/release/evidence/teaching-selection";
        mkdirSync(folder, { recursive: true });
        for (const surface of ["calendar", "assignment"]) {
          if (surface === "assignment") {
            await page.goto(`/app/classes/${f.cls.id}`);
            await selectTeacher(page, "Giáo viên phân công", f);
          }
          const label =
            surface === "calendar" ? "Lọc lớp học" : "Giáo viên phân công";
          const region = picker(page, label);
          await region.getByRole("textbox").focus();
          await page.keyboard.press("Tab");
          await expect(page.getByLabel(label, { exact: true })).toBeFocused();
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
            `${folder}/${surface}-${width}-${mode}-taste.json`,
          );
          if (surface === "calendar") {
            await page.screenshot({
              path: `${folder}/${surface}-${width}-${mode}.png`,
              fullPage: true,
            });
            const disclosure = page.locator(
              ".calendar-resource-filters > summary",
            );
            await disclosure.focus();
            await page.keyboard.press("Enter");
            await expect(page.getByLabel(label, { exact: true })).toBeHidden();
            expect(
              await disclosure.evaluate(
                (el) => el.getBoundingClientRect().height,
              ),
            ).toBeGreaterThanOrEqual(44);
            const tableRegion = page.getByRole("region", {
              name: "Các buổi học",
              exact: true,
            });
            const overflow = await tableRegion.evaluate(
              (el) => el.scrollWidth > el.clientWidth,
            );
            expect(
              await tableRegion
                .locator("tbody td")
                .first()
                .evaluate((el) => {
                  const range = document.createRange();
                  range.selectNodeContents(el);
                  return new Set(
                    [...range.getClientRects()].map((rect) =>
                      Math.round(rect.top),
                    ),
                  ).size;
                }),
            ).toBe(1);
            await page.getByRole("main").screenshot({
              path: `${folder}/calendar-collapsed-${width}-${mode}.png`,
            });
            if (overflow) {
              await tableRegion.focus();
              await page.keyboard.press("ArrowRight");
              await expect
                .poll(() => tableRegion.evaluate((el) => el.scrollLeft))
                .toBeGreaterThan(0);
              await tableRegion.evaluate((el) => {
                el.scrollLeft = 0;
              });
            }
            await disclosure.focus();
            await page.keyboard.press("Enter");
            await expect(page.getByLabel(label, { exact: true })).toBeVisible();
          } else
            await region.locator("xpath=ancestor::section").screenshot({
              path: `${folder}/${surface}-${width}-${mode}.png`,
            });
        }
      } finally {
        await db.$disconnect();
      }
    });
  }
