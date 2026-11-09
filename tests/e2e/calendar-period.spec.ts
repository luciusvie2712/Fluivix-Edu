import { test, expect, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { wallClockUtc } from "../../packages/contracts/src";
import { testOrigins } from "../../tooling/test-origins";
import { reviewTaste } from "../../tooling/taste-review";
const requireWeb = createRequire(path.resolve("apps/web/package.json"));
const AxeBuilder = requireWeb("@axe-core/playwright")
  .default as typeof import("../../apps/web/node_modules/@axe-core/playwright").default;
test.use({ timezoneId: "Pacific/Honolulu" });
function resourcePair<T extends { id: string }>(items: T[]): readonly [T, T] {
  const [first, second] = items;
  if (!first || !second || items.length !== 2)
    throw Error("Two actual fixture resources required");
  return [first, second];
}
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
async function fixture(
  page: Page,
  options: { many?: boolean; timezone?: string; sessions?: boolean } = {},
) {
  const db = database();
  try {
    const suffix = randomUUID().slice(0, 8),
      timezone = options.timezone ?? "America/New_York";
    const source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
    const tenant = await db.tenant.create({
      data: {
        slug: "period-" + suffix,
        name: "Trung tâm lịch ngày tuần",
        timezone,
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
        email: `period-${suffix}@example.test`,
        displayName: "Người kiểm tra lịch",
        passwordHash: source.passwordHash,
        status: "ACTIVE",
      },
    });
    await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: actor.id,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }, { role: "teacher" }] },
      },
    });
    // Keep the real last-owner invariant intact when the selected actor is revoked.
    await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: source.id,
        status: "ACTIVE",
        roles: { create: { role: "owner" } },
      },
    });
    const teachers: { id: string; userId: string }[] = [];
    for (let i = 0; i < 2; i++) {
      const user =
        i === 0
          ? actor
          : await db.user.create({
              data: {
                email: `period-teacher-${suffix}@example.test`,
                displayName: "Giáo viên lớp thứ hai",
                passwordHash: source.passwordHash,
                status: "ACTIVE",
              },
            });
      if (i > 0)
        await db.membership.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            status: "ACTIVE",
            roles: { create: { role: "teacher" } },
          },
        });
      teachers.push(
        await db.teacher.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            teacherCode: `GV-${i}`,
            fullName: `Giáo viên lịch ${i}`,
            status: "ACTIVE",
          },
        }),
      );
    }
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
    const rooms: { id: string }[] = [],
      classes: { id: string }[] = [];
    for (let i = 0; i < 2; i++) {
      const room = (
        await api("/rooms", {
          code: `PHONG-${i}`,
          name: `Phòng lịch ${i}`,
          capacity: 20,
        })
      ).data;
      rooms.push(room);
      const cls = (
        await api("/classes", {
          code: `LICH-${i}`,
          name: `Lớp lịch ${i}`,
          roomId: room.id,
          capacity: 10,
          startDate: "2030-01-01",
          endDate: "2031-12-31",
        })
      ).data;
      classes.push(cls);
      await api(`/classes/${cls.id}/teachers`, {
        teacherId: teachers[i]!.id,
        effectiveFrom: "2030-01-01",
        effectiveTo: "2031-12-31",
      });
    }
    const classPair = resourcePair(classes),
      roomPair = resourcePair(rooms),
      teacherPair = resourcePair(teachers);
    async function lesson(day: string, hour = 9, classIndex: 0 | 1 = 0) {
      return (
        await api(`/classes/${classPair[classIndex].id}/sessions/extra`, {
          teacherId: teacherPair[classIndex].id,
          roomId: roomPair[classIndex].id,
          startsAt: wallClockUtc(
            day,
            `${String(hour).padStart(2, "0")}:00`,
            timezone,
          ).toISOString(),
          endsAt: wallClockUtc(
            day,
            `${String(hour + 1).padStart(2, "0")}:00`,
            timezone,
          ).toISOString(),
        })
      ).data as {
        id: string;
        version: number;
        startsAt: string;
        scheduledDate: string;
      };
    }
    const sessions: Record<string, Awaited<ReturnType<typeof lesson>>> = {};
    if (options.sessions !== false) {
      if (options.many) {
        for (let i = 0; i < 25; i++) {
          const day = new Date(Date.UTC(2030, 9, 28 + (i % 7)))
            .toISOString()
            .slice(0, 10);
          await lesson(day, 8 + Math.floor(i / 7));
        }
        sessions.next = await lesson("2030-11-04", 8);
        sessions.other = await lesson("2030-10-29", 14, 1);
      } else {
        sessions.previous = await lesson("2030-10-27");
        sessions.monday = await lesson("2030-10-28");
        sessions.sunday = await lesson("2030-11-03");
        sessions.next = await lesson("2030-11-04");
        sessions.other = await lesson("2030-10-29", 10, 1);
        await api(`/sessions/${sessions.other.id}/cancel`, {
          sessionVersion: sessions.other.version,
          reason: "Hủy buổi kiểm thử lịch tuần",
        });
        await api(`/sessions/${sessions.monday.id}/reschedule`, {
          sessionVersion: sessions.monday.version,
          teacherId: teacherPair[0].id,
          roomId: roomPair[0].id,
          startsAt: wallClockUtc("2030-10-30", "09:00", timezone).toISOString(),
          endsAt: wallClockUtc("2030-10-30", "10:00", timezone).toISOString(),
          reason: "Đổi lịch từ thứ Hai sang thứ Tư",
        });
      }
    }
    async function login(role = "owner") {
      const response = await page.request.post(
        testOrigins.api + "/api/v1/auth/login",
        {
          headers: { Origin: testOrigins.web },
          data: { email: actor.email, password: "Fluivix-Test-Password-2026" },
        },
      );
      expect(response.status()).toBe(200);
      const context = await page.request.post(
        testOrigins.api + "/api/v1/auth/switch-context",
        {
          headers: {
            Origin: testOrigins.web,
            Authorization: "Bearer " + (await response.json()).data.accessToken,
          },
          data: { tenantId: tenant.id, role },
        },
      );
      expect(context.status()).toBe(200);
      await page.goto("/app/schedule");
      await expect(page.getByRole("banner")).toContainText(tenant.name);
      await expect(
        page.getByRole("heading", { name: "Lịch học", exact: true }),
      ).toBeVisible();
    }
    return {
      tenant,
      actor,
      plan,
      rooms: roomPair,
      classes: classPair,
      teachers: teacherPair,
      sessions,
      api,
      login,
    };
  } finally {
    await db.$disconnect();
  }
}
async function week(page: Page) {
  await page.getByLabel("Xem theo", { exact: true }).selectOption("week");
  await page.getByLabel("Ngày trong tuần", { exact: true }).fill("2030-11-03");
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã áp dụng" }),
  ).toHaveText("Đã áp dụng: 28/10/2030 – 03/11/2030.");
}
const rows = (page: Page) =>
  page
    .getByRole("region", { name: "Các buổi học", exact: true })
    .locator("tbody tr");

test("day and Monday-first week show real DST dates, cancelled/rescheduled states and the authorized session detail", async ({
  page,
}) => {
  const f = await fixture(page);
  expect(f.sessions.sunday!.startsAt).toBe("2030-11-03T14:00:00.000Z");
  expect(f.sessions.monday!.startsAt).toBe("2030-10-28T13:00:00.000Z");
  await f.login();
  await week(page);
  await expect(rows(page)).toHaveCount(3);
  const cancelledRow = page
    .locator(`a[href="/app/sessions/${f.sessions.other!.id}"]`)
    .locator("xpath=ancestor::tr");
  await expect(cancelledRow).toContainText("Đã hủy");
  await expect(cancelledRow).not.toContainText("Đã đổi lịch");
  await expect(
    page
      .locator(`a[href="/app/sessions/${f.sessions.monday!.id}"]`)
      .locator("xpath=ancestor::tr"),
  ).toContainText("Đã đổi lịch 1 lần");
  await expect(
    page.getByRole("region", { name: "Các buổi học" }),
  ).toContainText("Đã hủy");
  await expect(
    page.getByRole("region", { name: "Các buổi học" }),
  ).toContainText("Đã đổi lịch 1 lần");
  await expect(
    page.getByRole("link", { name: "Mở buổi 27/10/2030", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Mở buổi 04/11/2030", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Xem theo", { exact: true }).selectOption("day");
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("09:00");
  await page
    .getByRole("button", { name: "Xem khoảng lịch sau", exact: true })
    .click();
  await expect(page.getByLabel("Ngày xem lịch", { exact: true })).toHaveValue(
    "2030-11-04",
  );
  await expect(
    page.getByRole("link", { name: "Mở buổi 04/11/2030", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Xem khoảng lịch trước", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Mở buổi 03/11/2030", exact: true }),
  ).toBeVisible();
  await week(page);
  await page
    .locator(`a[href="/app/sessions/${f.sessions.monday!.id}"]`)
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/app/sessions/${f.sessions.monday!.id}$`),
  );
  await expect(
    page.getByRole("heading", { name: "Buổi học 2030-10-30", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 lần thay lịch/)).toBeVisible();
});

test("period changes retain actual class teacher room filters and reset a 25-session result page", async ({
  page,
}) => {
  const f = await fixture(page, { many: true });
  await f.login();
  await week(page);
  await expect(rows(page)).toHaveCount(20);
  await page.locator(".calendar-resource-filters > summary").click();
  await page
    .getByLabel("Lọc lớp học", { exact: true })
    .selectOption(f.classes[0].id);
  await page
    .getByLabel("Lọc giáo viên", { exact: true })
    .selectOption(f.teachers[0]!.id);
  await page
    .getByLabel("Lọc phòng học", { exact: true })
    .selectOption(f.rooms[0].id);
  await expect(
    page.getByText("25 buổi trong khoảng đã chọn.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lịch sau", exact: true }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText("Trang 2", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Xem khoảng lịch sau", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã áp dụng" }),
  ).toHaveText("Đã áp dụng: 04/11/2030 – 10/11/2030.");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText("Trang 1", { exact: true })).toBeVisible();
  for (const [label, id] of [
    ["Lọc lớp học", f.classes[0].id],
    ["Lọc giáo viên", f.teachers[0]!.id],
    ["Lọc phòng học", f.rooms[0].id],
  ])
    await expect(page.getByLabel(label!, { exact: true })).toHaveValue(id!);
  await page
    .getByRole("button", { name: "Xem khoảng lịch trước", exact: true })
    .click();
  await expect(rows(page)).toHaveCount(20);
  await expect(
    page.getByText("25 buổi trong khoảng đã chọn.", { exact: true }),
  ).toBeVisible();
});

test("unapplied date edits stay explicit and invalid custom ranges do not request misleading data", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.login();
  await week(page);
  await expect(rows(page)).toHaveCount(3);
  const requested: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/v1/schedule?")) requested.push(req.url());
  });
  await page.getByLabel("Ngày trong tuần", { exact: true }).fill("2030-11-10");
  await expect(rows(page)).toHaveCount(3);
  await expect(
    page.getByRole("status").filter({ hasText: "Đã áp dụng" }),
  ).toContainText("28/10/2030 – 03/11/2030");
  expect(requested).toEqual([]);
  await page.getByLabel("Xem theo", { exact: true }).selectOption("range");
  await page.getByLabel("Lịch từ ngày", { exact: true }).fill("2030-01-01");
  await page.getByLabel("Lịch đến ngày", { exact: true }).fill("2030-04-05");
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "khoảng cách tối đa 93 ngày" }),
  ).toBeVisible();
  expect(requested).toEqual([]);
  await page.getByLabel("Lịch đến ngày", { exact: true }).fill("2030-04-04");
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
  await expect(
    page.getByText("Không có buổi học trong khoảng đã chọn.", { exact: true }),
  ).toBeVisible();
  expect(new URL(requested.at(-1)!).searchParams.get("to")).toBe("2030-04-04");
});

function today(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
test("Today uses the actual centre clock and changing to another read-only centre clears the old date draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  const f = await fixture(page, {
    timezone: "Pacific/Kiritimati",
    sessions: false,
  });
  const db = database();
  let second;
  try {
    second = await db.tenant.create({
      data: {
        slug: "period-second-" + randomUUID().slice(0, 8),
        name: "Trung tâm lịch thứ hai",
        timezone: "Pacific/Honolulu",
        status: "READ_ONLY",
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
  await expect(page.getByLabel("Ngày xem lịch", { exact: true })).toHaveValue(
    today("Pacific/Kiritimati"),
  );
  expect(
    await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  ).toBe("Pacific/Honolulu");
  expect(today("Pacific/Kiritimati")).not.toBe(today("Pacific/Honolulu"));
  await page.getByLabel("Ngày xem lịch", { exact: true }).fill("2030-12-31");
  await page.getByRole("button", { name: "Hôm nay", exact: true }).click();
  await expect(page.getByLabel("Ngày xem lịch", { exact: true })).toHaveValue(
    today("Pacific/Kiritimati"),
  );
  await page.getByLabel("Ngày xem lịch", { exact: true }).fill("2030-12-31");
  await page
    .getByRole("button", { name: "Mở menu trung tâm", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
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
  await expect(page).toHaveURL(/\/app\/students$/);
  await expect(page.getByRole("banner")).toContainText(second.name);
  await page.goto("/app/schedule");
  await expect(page.getByRole("banner")).toContainText(second.name);
  await expect(page.getByLabel("Ngày xem lịch", { exact: true })).toHaveValue(
    today("Pacific/Honolulu"),
  );
  await expect(
    page.getByText("Trung tâm ở chế độ chỉ đọc. Các thay đổi đang bị khóa.", {
      exact: true,
    }),
  ).toBeVisible();
  await week(page);
  await expect(
    page.getByText("Không có buổi học trong khoảng đã chọn.", { exact: true }),
  ).toBeVisible();
});

test("day/week remains assigned-teacher scoped and a real failed fetch or revoked membership removes cached sessions", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.login("teacher");
  await week(page);
  await expect(rows(page)).toHaveCount(2);
  await page.locator(".calendar-resource-filters > summary").click();
  await expect(page.getByLabel("Lọc giáo viên", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Lọc phòng học", { exact: true })).toHaveCount(
    0,
  );
  const pattern = "**/api/v1/schedule?*";
  await page.route(pattern, (route) => route.abort("failed"));
  await page
    .getByRole("button", { name: "Xem khoảng lịch sau", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Không thể kết nối dịch vụ" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Các buổi học" })).toHaveCount(
    0,
  );
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  const db = database();
  try {
    await db.membership.update({
      where: { tenantId_userId: { tenantId: f.tenant.id, userId: f.actor.id } },
      data: { status: "SUSPENDED" },
    });
  } finally {
    await db.$disconnect();
  }
  const denied = page.waitForResponse((response) =>
    response.url().includes("/api/v1/schedule?"),
  );
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  expect((await denied).status()).toBe(403);
  await expect(page.getByRole("region", { name: "Các buổi học" })).toHaveCount(
    0,
  );
});

for (const mode of ["no-preference", "reduce"] as const)
  for (const width of [360, 768, 1024, 1440]) {
    test(`calendar day/week real dates visual and accessibility ${width} ${mode}`, async ({
      page,
    }) => {
      const f = await fixture(page);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: mode });
      await f.login();
      await week(page);
      await expect(rows(page)).toHaveCount(3);
      const folder = "docs/release/evidence/calendar-period";
      mkdirSync(folder, { recursive: true });
      for (const view of ["week", "day"]) {
        if (view === "day") {
          await page
            .getByLabel("Xem theo", { exact: true })
            .selectOption("day");
          await page
            .getByRole("button", { name: "Xem lịch", exact: true })
            .click();
          await expect(rows(page)).toHaveCount(1);
        }
        await page.getByLabel("Xem theo", { exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(
          page.getByLabel(
            view === "week" ? "Ngày trong tuần" : "Ngày xem lịch",
            { exact: true },
          ),
        ).toBeFocused();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const firstRow = await rows(page)
          .first()
          .evaluate((el) => ({
            top: el.getBoundingClientRect().top,
            viewport: innerHeight,
          }));
        expect(
          firstRow.top + 44,
          "The first calendar record stays in the initial viewport",
        ).toBeLessThanOrEqual(firstRow.viewport);
        expect(
          await page
            .getByLabel(view === "week" ? "Ngày trong tuần" : "Ngày xem lịch", {
              exact: true,
            })
            .evaluate((el) => el.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(44);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await reviewTaste(
          page,
          `${folder}/${view}-${width}-${mode}-taste.json`,
        );
        await page.screenshot({
          path: `${folder}/${view}-${width}-${mode}.png`,
          fullPage: true,
        });
      }
    });
  }
