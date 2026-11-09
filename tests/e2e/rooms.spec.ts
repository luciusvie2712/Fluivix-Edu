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
async function fixture(db: PrismaClient) {
  const stamp = randomUUID().slice(0, 8),
    source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    });
  const tenant = await db.tenant.create({
    data: {
      slug: "rooms-ui-" + stamp,
      name: "Trung tâm phòng học kiểm thử",
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
      email: `rooms-ui-${stamp}@example.test`,
      displayName: "Người quản lý phòng kiểm thử",
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
  await page.goto("/app/settings/rooms");
  await expect(page.getByRole("banner")).toContainText(f.tenant.name);
}
async function seedRoom(db: PrismaClient, tenantId: string, code = "ROOM-A") {
  return db.room.create({
    data: { tenantId, code, name: "Phòng học đối chiếu", capacity: 20 },
  });
}
test("rooms creates on the real server, validates inline, edits with history and confirms archive without deleting", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await page.getByRole("button", { name: "Tạo phòng", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Kiểm tra các trường" }),
    ).toBeFocused();
    await page.getByLabel("Mã phòng", { exact: true }).fill("NEW-ROOM");
    await page
      .getByLabel("Tên phòng", { exact: true })
      .fill("Phòng mới thực tế");
    await page.getByLabel("Sức chứa phòng", { exact: true }).fill("24");
    await page.getByRole("button", { name: "Tạo phòng", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã tạo phòng NEW-ROOM" }),
    ).toBeVisible();
    const room = await db.room.findFirstOrThrow({
      where: { tenantId: f.tenant.id, code: "NEW-ROOM" },
    });
    expect(room).toMatchObject({
      name: "Phòng mới thực tế",
      capacity: 24,
      version: 1,
    });
    await page
      .getByRole("link", { name: "Xem phòng vừa tạo NEW-ROOM" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Phòng NEW-ROOM", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Mã phòng", { exact: true })).toHaveValue(
      "NEW-ROOM",
    );
    await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveValue(
      "Phòng mới thực tế",
    );
    await page
      .getByLabel("Tên phòng", { exact: true })
      .fill("Phòng đã sửa trên máy chủ");
    await page
      .getByLabel("Lý do thay đổi phòng")
      .fill("Đối chiếu tên phòng theo sơ đồ trung tâm");
    await page
      .getByRole("button", { name: "Lưu thay đổi phòng", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "phiên bản 2" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cập nhật phòng", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Lý do: Đối chiếu tên phòng theo sơ đồ trung tâm", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Phòng đang sử dụng").uncheck();
    await page
      .getByLabel("Lý do thay đổi phòng")
      .fill("Ngưng sử dụng phòng đã hết nhu cầu học");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Lưu thay đổi phòng", exact: true })
      .click();
    expect(
      (await db.room.findUniqueOrThrow({ where: { id: room.id } })).active,
    ).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Lưu thay đổi phòng", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "phiên bản 3" }),
    ).toBeVisible();
    expect(
      await db.room.findUniqueOrThrow({ where: { id: room.id } }),
    ).toMatchObject({ active: false, version: 3 });
    expect(
      await db.auditLog.count({
        where: {
          tenantId: f.tenant.id,
          resourceId: room.id,
          action: { in: ["room.created", "room.updated"] },
        },
      }),
    ).toBe(3);
  } finally {
    await db.$disconnect();
  }
});
test("rooms preserves unsaved input after real version conflict and reloads only after confirmation", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      room = await seedRoom(db, f.tenant.id);
    await login(page, f);
    await page.goto(`/app/settings/rooms/${room.id}`);
    await page
      .getByLabel("Tên phòng", { exact: true })
      .fill("Nội dung chưa lưu của người dùng");
    await page
      .getByLabel("Lý do thay đổi phòng")
      .fill("Giữ nguyên nội dung khi xung đột phiên bản");
    await db.room.update({
      where: { id: room.id },
      data: { name: "Thay đổi đồng thời đã lưu" },
    });
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/rooms/${room.id}`) &&
        r.request().method() === "PATCH",
    );
    await page
      .getByRole("button", { name: "Lưu thay đổi phòng", exact: true })
      .click();
    expect((await response).status()).toBe(409);
    await expect(
      page.getByRole("alert").filter({ hasText: "Phòng đã thay đổi" }),
    ).toBeVisible();
    await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveValue(
      "Nội dung chưa lưu của người dùng",
    );
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Tải lại phòng", exact: true })
      .click();
    await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveValue(
      "Nội dung chưa lưu của người dùng",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Tải lại phòng", exact: true })
      .click();
    await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveValue(
      "Thay đổi đồng thời đã lưu",
    );
    expect(
      await db.auditLog.count({
        where: { tenantId: f.tenant.id, resourceId: room.id },
      }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});
test("rooms shows actual usage and rejects archive or shrink while a class still reserves it", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      room = await seedRoom(db, f.tenant.id);
    const cls = await db.educationClass.create({
      data: {
        tenantId: f.tenant.id,
        roomId: room.id,
        code: "ROOM-CLASS",
        name: "Lớp cần phòng thực tế",
        capacity: 16,
        startDate: new Date("2030-01-01Z"),
        endDate: new Date("2030-12-31Z"),
      },
    });
    await login(page, f);
    await page.goto(`/app/settings/rooms/${room.id}`);
    await expect(
      page.getByText("Lớp hoạt động hoặc nháp dùng phòng mặc định", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Sức chứa phòng", { exact: true }).fill("15");
    await page
      .getByLabel("Lý do thay đổi phòng")
      .fill("Kiểm tra sức chứa dưới nhu cầu của lớp");
    const rejected = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/rooms/${room.id}`) &&
        r.request().method() === "PATCH",
    );
    await page
      .getByRole("button", { name: "Lưu thay đổi phòng", exact: true })
      .click();
    expect((await rejected).status()).toBe(409);
    await expect(
      page.getByLabel("Sức chứa phòng", { exact: true }),
    ).toHaveValue("15");
    expect(
      await db.room.findUniqueOrThrow({ where: { id: room.id } }),
    ).toMatchObject({ capacity: 20, version: 1, active: true });
    expect(
      (await db.educationClass.findUniqueOrThrow({ where: { id: cls.id } }))
        .roomId,
    ).toBe(room.id);
  } finally {
    await db.$disconnect();
  }
});
test("room access follows selected role, read-only mode and offline state", async ({
  page,
  context,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await seedRoom(db, f.tenant.id);
    await login(page, f, "teacher");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Vai trò hiện tại không có quyền" }),
    ).toContainText("Vai trò hiện tại không có quyền");
    await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveCount(0);
    await login(page, f, "academic_staff");
    await expect(
      page.getByRole("button", { name: "Tạo phòng", exact: true }),
    ).toBeEnabled();
    await context.setOffline(true);
    await expect(
      page.getByRole("button", { name: "Tạo phòng", exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Đang ngoại tuyến. Nội dung nhập chưa được gửi." }),
    ).toBeVisible();
    await context.setOffline(false);
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    await login(page, f, "manager");
    await expect(
      page.getByText(
        "Trung tâm đang ở chế độ chỉ đọc. Bạn có thể xem phòng và lịch sử.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tạo phòng", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Mở phòng ROOM-A", exact: true }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
    await db.$disconnect();
  }
});
test("room picker searches and paginates actual rooms, retains an off-page selection and saves or clears a class default", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    const created = await db.room.createManyAndReturn({
      data: Array.from({ length: 23 }, (_, i) => ({
        tenantId: f.tenant.id,
        code: `PICK-${String(i).padStart(2, "0")}`,
        name: `Phòng chọn ${String(i).padStart(2, "0")}`,
        capacity: 20,
      })),
    });
    const chosen = created.find((room) => room.code === "PICK-22");
    expect(chosen).toBeDefined();
    if (!chosen) throw new Error("Actual selected room missing");
    await login(page, f);
    await page.goto("/app/classes");
    await page
      .getByRole("button", { name: "Phòng trang sau", exact: true })
      .click();
    await expect(
      page
        .getByLabel("Phòng mặc định của lớp", { exact: true })
        .getByRole("option", { name: /PICK-22/ }),
    ).toHaveCount(1);
    await page
      .getByLabel("Phòng mặc định của lớp", { exact: true })
      .selectOption(chosen.id);
    await page
      .getByRole("button", { name: "Phòng trang trước", exact: true })
      .click();
    await expect(
      page.getByLabel("Phòng mặc định của lớp", { exact: true }),
    ).toHaveValue(chosen.id);
    await page
      .getByLabel("Tìm phòng cho phòng mặc định của lớp", { exact: true })
      .fill("PICK-01");
    await expect(
      page
        .getByLabel("Phòng mặc định của lớp", { exact: true })
        .getByRole("option", { name: /PICK-01/ }),
    ).toHaveCount(1);
    await expect(
      page.getByLabel("Phòng mặc định của lớp", { exact: true }),
    ).toHaveValue(chosen.id);
    await page.getByLabel("Mã lớp", { exact: true }).fill("ROOM-PICK");
    await page
      .getByLabel("Tên lớp", { exact: true })
      .fill("Lớp chọn phòng thực tế");
    await page.getByLabel("Sức chứa lớp", { exact: true }).fill("10");
    await page
      .getByLabel("Ngày bắt đầu lớp", { exact: true })
      .fill("2030-01-01");
    await page
      .getByLabel("Ngày kết thúc lớp", { exact: true })
      .fill("2030-12-31");
    await page.getByRole("button", { name: "Tạo lớp", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Lớp chọn phòng thực tế",
        exact: true,
      }),
    ).toBeVisible();
    const cls = await db.educationClass.findFirstOrThrow({
      where: { tenantId: f.tenant.id, code: "ROOM-PICK" },
    });
    expect(cls.roomId).toBe(chosen.id);
    await page
      .getByText("Sửa thông tin hoặc đóng lớp", { exact: true })
      .click();
    await expect(
      page.getByLabel("Phòng mặc định mới của lớp", { exact: true }),
    ).toHaveValue(chosen.id);
    await page
      .getByLabel("Phòng mặc định mới của lớp", { exact: true })
      .selectOption("");
    const editor = page
      .getByRole("button", { name: "Lưu thông tin lớp", exact: true })
      .locator("xpath=ancestor::form");
    await editor
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Bỏ phòng mặc định sau khi đối chiếu lớp");
    await page
      .getByRole("button", { name: "Lưu thông tin lớp", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.educationClass.findUniqueOrThrow({ where: { id: cls.id } }))
            .roomId,
      )
      .toBeNull();
    expect(
      (await db.educationClass.findUniqueOrThrow({ where: { id: cls.id } }))
        .version,
    ).toBe(2);
  } finally {
    await db.$disconnect();
  }
});
test("extra session and reschedule persist the chosen room and calendar filters return actual matching sessions", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      first = await seedRoom(db, f.tenant.id, "DEFAULT"),
      second = await seedRoom(db, f.tenant.id, "OVERRIDE");
    const teacher = await db.teacher.create({
      data: {
        tenantId: f.tenant.id,
        userId: f.actor.id,
        teacherCode: "ROOM-TEACHER",
        fullName: "Giáo viên phòng kiểm thử",
      },
    });
    const cls = await db.educationClass.create({
      data: {
        tenantId: f.tenant.id,
        code: "ROOM-SESSION",
        name: "Lớp chọn phòng cho buổi học",
        roomId: first.id,
        capacity: 10,
        startDate: new Date("2030-01-01Z"),
        endDate: new Date("2030-12-31Z"),
      },
    });
    await db.classTeacher.create({
      data: {
        tenantId: f.tenant.id,
        classId: cls.id,
        teacherId: teacher.id,
        effectiveFrom: new Date("2030-01-01Z"),
      },
    });
    await login(page, f);
    await page.goto(`/app/classes/${cls.id}`);
    await page
      .getByLabel("Giáo viên buổi bổ sung", { exact: true })
      .selectOption(teacher.id);
    await page
      .getByLabel("Phòng cho buổi bổ sung", { exact: true })
      .selectOption(second.id);
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
    const session = await db.classSession.findFirstOrThrow({
      where: { tenantId: f.tenant.id, classId: cls.id },
    });
    expect(session.roomId).toBe(second.id);
    await page.getByText("Dời hoặc hủy buổi học", { exact: true }).click();
    await expect(
      page.getByLabel("Phòng cho buổi dời lịch", { exact: true }),
    ).toHaveValue(second.id);
    await page
      .getByLabel("Phòng cho buổi dời lịch", { exact: true })
      .selectOption(first.id);
    await page.getByLabel("Ngày học mới", { exact: true }).fill("2030-06-04");
    await page.getByLabel("Giờ bắt đầu mới", { exact: true }).fill("10:00");
    await page.getByLabel("Giờ kết thúc mới", { exact: true }).fill("11:00");
    const form = page
      .getByLabel("Ngày học mới", { exact: true })
      .locator("xpath=ancestor::form");
    await form
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Đổi phòng và ngày sau khi đối chiếu lịch");
    await form.getByRole("checkbox").check();
    await form
      .getByRole("button", { name: "Dời buổi học", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.classSession.findUniqueOrThrow({
              where: { id: session.id },
            })
          ).roomId,
      )
      .toBe(first.id);
    const change = await db.sessionChange.findFirstOrThrow({
      where: { tenantId: f.tenant.id, sessionId: session.id },
    });
    expect(change.oldSnapshot).toMatchObject({ roomId: second.id });
    expect(change.newSnapshot).toMatchObject({ roomId: first.id });
    await page.goto("/app/schedule");
    await page
      .getByText("Lọc lớp, giáo viên và phòng", { exact: true })
      .click();
    await page.getByLabel("Xem theo", { exact: true }).selectOption("range");
    await page.getByLabel("Lịch từ ngày", { exact: true }).fill("2030-06-04");
    await page.getByLabel("Lịch đến ngày", { exact: true }).fill("2030-06-04");
    await page
      .getByLabel("Lọc phòng học", { exact: true })
      .selectOption(second.id);
    await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
    await expect(
      page.getByText("Không có buổi học trong khoảng đã chọn.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Lọc phòng học", { exact: true })
      .selectOption(first.id);
    await expect(
      page.getByRole("link", { name: "Mở buổi 04/06/2030", exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
test("recurring rule preview, create and replacement save explicitly selected rooms through the real schedule workflow", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      first = await seedRoom(db, f.tenant.id, "RULE-FIRST"),
      second = await seedRoom(db, f.tenant.id, "RULE-SECOND");
    const teacher = await db.teacher.create({
      data: {
        tenantId: f.tenant.id,
        userId: f.actor.id,
        teacherCode: "RULE-TEACHER",
        fullName: "Giáo viên phòng lịch lặp",
      },
    });
    const cls = await db.educationClass.create({
      data: {
        tenantId: f.tenant.id,
        code: "RULE-ROOM",
        name: "Lớp chọn phòng lịch lặp",
        roomId: first.id,
        capacity: 10,
        startDate: new Date("2030-01-01Z"),
        endDate: new Date("2030-12-31Z"),
      },
    });
    await db.classTeacher.create({
      data: {
        tenantId: f.tenant.id,
        classId: cls.id,
        teacherId: teacher.id,
        effectiveFrom: new Date("2030-01-01Z"),
      },
    });
    await login(page, f);
    await page.goto(`/app/classes/${cls.id}`);
    await page
      .getByLabel("Giáo viên dạy lịch lặp", { exact: true })
      .selectOption(teacher.id);
    await page
      .getByLabel("Phòng cho lịch định kỳ", { exact: true })
      .selectOption(second.id);
    await page
      .getByLabel("Ngày học trong tuần", { exact: true })
      .selectOption("1");
    await page
      .getByLabel("Giờ bắt đầu địa phương", { exact: true })
      .fill("08:00");
    await page
      .getByLabel("Giờ kết thúc địa phương", { exact: true })
      .fill("09:00");
    await page
      .getByLabel("Lịch có hiệu lực từ", { exact: true })
      .fill("2030-06-03");
    await page
      .getByLabel("Lịch có hiệu lực đến", { exact: true })
      .fill("2030-06-24");
    const preview = page.waitForResponse((response) =>
      response.url().endsWith(`/classes/${cls.id}/schedule-rules/preview`),
    );
    await page
      .getByRole("button", { name: "Xem trước quy tắc chưa lưu", exact: true })
      .click();
    expect((await preview).status()).toBe(200);
    expect(
      await db.scheduleRule.count({
        where: { tenantId: f.tenant.id, classId: cls.id },
      }),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Lưu quy tắc lịch", exact: true })
      .click();
    await expect(
      page.getByText("Đổi lịch định kỳ trong tương lai và xem lịch sử", {
        exact: true,
      }),
    ).toBeVisible();
    const rule = await db.scheduleRule.findFirstOrThrow({
      where: { tenantId: f.tenant.id, classId: cls.id },
    });
    expect(rule.roomId).toBe(second.id);
    await page
      .getByText("Đổi lịch định kỳ trong tương lai và xem lịch sử", {
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel("Phòng cho lịch thay thế", { exact: true }),
    ).toHaveValue(second.id);
    await page
      .getByLabel("Phòng cho lịch thay thế", { exact: true })
      .selectOption(first.id);
    await page
      .getByLabel("Thay lịch từ ngày", { exact: true })
      .fill("2030-06-10");
    const form = page
      .getByRole("button", { name: "Xác nhận thay quy tắc lịch", exact: true })
      .locator("xpath=ancestor::form");
    await form
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Đổi phòng cho lịch định kỳ đã đối chiếu");
    await form.getByRole("checkbox").check();
    await form
      .getByRole("button", { name: "Xác nhận thay quy tắc lịch", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.scheduleRule.findUniqueOrThrow({ where: { id: rule.id } }))
            .version,
      )
      .toBe(rule.version + 1);
    const retained = await db.scheduleRule.findUniqueOrThrow({
      where: { id: rule.id },
    });
    expect(retained).toMatchObject({
      active: true,
      roomId: second.id,
      version: 2,
    });
    expect(retained.validTo.toISOString().slice(0, 10)).toBe("2030-06-09");
    const replacement = await db.scheduleRule.findFirstOrThrow({
      where: {
        tenantId: f.tenant.id,
        classId: cls.id,
        active: true,
        id: { not: rule.id },
      },
    });
    expect(replacement.roomId).toBe(first.id);
    expect(replacement.lineageId).toBe(rule.lineageId);
    expect(replacement.validFrom.toISOString().slice(0, 10)).toBe("2030-06-10");
  } finally {
    await db.$disconnect();
  }
});
for (const mode of ["no-preference", "reduce"] as const) {
  test(`rooms real detail retains keyboard access and readable boundaries at four widths (${mode})`, async ({
    page,
  }) => {
    const db = database();
    try {
      const f = await fixture(db),
        room = await seedRoom(db, f.tenant.id);
      await login(page, f);
      await page.goto(`/app/settings/rooms/${room.id}`);
      await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveValue(
        room.name,
      );
      await db.educationClass.create({
        data: {
          tenantId: f.tenant.id,
          roomId: room.id,
          code: "VISUAL-ROOM",
          name: "Lớp sử dụng phòng kiểm thử",
          capacity: 16,
          startDate: new Date("2030-01-01Z"),
          endDate: new Date("2030-12-31Z"),
        },
      });
      await page
        .getByLabel("Tên phòng", { exact: true })
        .fill("Phòng học đã đối chiếu sơ đồ trung tâm");
      await page
        .getByLabel("Lý do thay đổi phòng", { exact: true })
        .fill("Đối chiếu tên phòng theo sơ đồ đã kiểm tra");
      await page
        .getByRole("button", { name: "Lưu thay đổi phòng", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Cập nhật phòng", exact: true }),
      ).toBeVisible();
      await page.emulateMedia({ reducedMotion: mode });
      mkdirSync("docs/release/evidence/rooms", { recursive: true });
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveValue(
          "Phòng học đã đối chiếu sơ đồ trung tâm",
        );
        await page.getByLabel("Tên phòng", { exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(
          page.getByLabel("Sức chứa phòng", { exact: true }),
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
          `docs/release/evidence/rooms/detail-${mode}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/rooms/detail-${mode}-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      await db.$disconnect();
    }
  });
  test(`rooms real directory retains keyboard scrolling and readable boundaries at four widths (${mode})`, async ({
    page,
  }) => {
    const db = database();
    try {
      const f = await fixture(db),
        room = await seedRoom(db, f.tenant.id);
      await db.room.update({
        where: { id: room.id },
        data: { name: "Phòng học đã đối chiếu sơ đồ trung tâm" },
      });
      await login(page, f);
      await expect(
        page.getByRole("link", { name: "Mở phòng ROOM-A", exact: true }),
      ).toBeVisible();
      await page.emulateMedia({ reducedMotion: mode });
      mkdirSync("docs/release/evidence/rooms", { recursive: true });
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(
          page.getByRole("link", { name: "Mở phòng ROOM-A", exact: true }),
        ).toBeVisible();
        if (width === 360) {
          const table = page.getByRole("region", {
            name: "Danh sách phòng học, có thể cuộn ngang",
            exact: true,
          });
          await table.focus();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => table.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await table.evaluate((element) => {
            element.scrollLeft = 0;
          });
        }
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
          `docs/release/evidence/rooms/directory-${mode}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/rooms/directory-${mode}-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      await db.$disconnect();
    }
  });
}

test("room draft survives a real transport failure and successful retry while actual owner suspension removes access", async ({
  page,
  request,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      room = await seedRoom(db, f.tenant.id);
    const member = await db.membership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: f.tenant.id, userId: f.actor.id } },
    });
    const owner = await db.user.create({
      data: {
        email: `room-revoker-${randomUUID()}@example.test`,
        displayName: "Chủ trung tâm đối chiếu quyền phòng",
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
    await login(page, f, "manager");
    await page.goto(`/app/settings/rooms/${room.id}`);
    const draft = "Nội dung phòng đang sửa trước lỗi kết nối";
    await page.getByLabel("Tên phòng", { exact: true }).fill(draft);
    await page
      .getByLabel("Lý do thay đổi phòng", { exact: true })
      .fill("Giữ nội dung nhập khi kết nối tạm gián đoạn");
    const pattern = `**/api/v1/rooms/${room.id}`;
    await page.route(pattern, async (route) => {
      await route.abort("failed");
    });
    const failed = page.waitForEvent(
      "requestfailed",
      (req) =>
        req.url().endsWith(`/rooms/${room.id}`) && req.method() === "GET",
    );
    await page
      .getByRole("button", { name: "Làm mới tình trạng sử dụng", exact: true })
      .click();
    await failed;
    await expect(
      page.getByRole("button", { name: "Thử tải lại", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Tên phòng", { exact: true })).toBeHidden();
    await page.unroute(pattern);
    await page
      .getByRole("button", { name: "Thử tải lại", exact: true })
      .click();
    await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveValue(
      draft,
    );
    await expect(
      page.getByLabel("Lý do thay đổi phòng", { exact: true }),
    ).toHaveValue("Giữ nội dung nhập khi kết nối tạm gián đoạn");
    const signed = await request.post(
      testOrigins.api + "/api/v1/mobile/auth/login",
      { data: { email: owner.email, password: "Fluivix-Test-Password-2026" } },
    );
    expect(signed.status()).toBe(200);
    const selected = await request.post(
      testOrigins.api + "/api/v1/auth/switch-context",
      {
        headers: {
          Authorization: "Bearer " + (await signed.json()).data.accessToken,
        },
        data: { tenantId: f.tenant.id, role: "owner" },
      },
    );
    expect(selected.status()).toBe(200);
    const suspended = await request.patch(
      testOrigins.api + `/api/v1/staff/${member.id}`,
      {
        headers: {
          Authorization: "Bearer " + (await selected.json()).data.accessToken,
        },
        data: {
          version: member.version,
          status: "SUSPENDED",
          reason: "Đối chiếu và thu hồi quyền quản lý phòng",
        },
      },
    );
    expect(suspended.status()).toBe(200);
    const forbidden = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/rooms/${room.id}`) &&
        response.request().method() === "GET",
    );
    await page
      .getByRole("button", { name: "Làm mới tình trạng sử dụng", exact: true })
      .click();
    expect((await forbidden).status()).toBe(403);
    await expect(page.getByLabel("Tên phòng", { exact: true })).toHaveCount(0);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Bạn không còn quyền truy cập phòng này." }),
    ).toBeVisible();
    expect(
      await db.room.findUniqueOrThrow({ where: { id: room.id } }),
    ).toMatchObject({ name: room.name, version: 1 });
  } finally {
    await db.$disconnect();
  }
});
test("maximum valid unbroken room code remains within a 360px screen and preserves native keyboard access", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      room = await seedRoom(db, f.tenant.id, "R".repeat(40));
    await page.setViewportSize({ width: 360, height: 900 });
    await login(page, f);
    await page.goto(`/app/settings/rooms/${room.id}`);
    await expect(page.getByLabel("Mã phòng", { exact: true })).toHaveValue(
      room.code,
    );
    for (const mode of ["no-preference", "reduce"] as const) {
      await page.emulateMedia({ reducedMotion: mode });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .getByRole("heading", { level: 1 })
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.getByLabel("Mã phòng", { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Tên phòng", { exact: true })).toBeFocused();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  } finally {
    await db.$disconnect();
  }
});
