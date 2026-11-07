import { test, expect, type Page } from "./fixtures";
import { request as requestFactory } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
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
      slug: "privacy-ui-" + stamp,
      name: "Trung tâm quyền riêng tư " + stamp,
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
      email: `privacy-ui-${stamp}@example.test`,
      displayName: "Chủ trung tâm kiểm thử riêng tư",
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
        create: [{ role: "owner" }, { role: "guardian" }, { role: "manager" }],
      },
    },
  });
  const student = await db.student.create({
    data: {
      tenantId: tenant.id,
      studentCode: "PRIVACY-UI",
      fullName: "Học viên quyền riêng tư",
      contactPhone: "0900000001",
      notesPrivate: "SYNTHETIC-PRIVATE-NOTE",
    },
  });
  await db.guardianLink.create({
    data: {
      tenantId: tenant.id,
      studentId: student.id,
      guardianUserId: actor.id,
      status: "ACTIVE",
      verifiedBy: actor.id,
      verifiedAt: new Date(),
    },
  });
  return { tenant, actor, student };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function login(page: Page, f: Fixture, role = "owner") {
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
  await page.goto("/app/privacy");
  await expect(
    page.getByRole("heading", { name: "Quyền riêng tư", exact: true }),
  ).toBeVisible();
  return (await selected.json()).data.accessToken as string;
}
async function select(page: Page, id: string) {
  await page
    .getByRole("button", { name: "Xem yêu cầu " + id.slice(0, 8), exact: true })
    .click();
  await expect(
    page.getByText("Mã yêu cầu: " + id, { exact: true }),
  ).toBeVisible();
}
async function verify(page: Page) {
  await page
    .getByLabel("Lý do xử lý (10–500 ký tự)")
    .fill("Đã đối chiếu phạm vi và người gửi trong ca kiểm thử");
  await page
    .getByLabel("Mã tham chiếu bằng chứng")
    .fill("synthetic-browser-review");
  await page
    .getByRole("button", { name: "Ghi nhận xác minh", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Máy chủ đã ghi nhận xác minh." }),
  ).toBeVisible();
}
async function approve(page: Page) {
  await page
    .getByLabel("Lý do xử lý (10–500 ký tự)")
    .fill("Phê duyệt đúng phạm vi đã xác minh trong kiểm thử");
  await page
    .getByRole("button", { name: "Phê duyệt yêu cầu", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Máy chủ đã phê duyệt;" }),
  ).toBeVisible();
}
async function childRequest(f: Fixture, type: "CORRECT" | "ERASE") {
  const isolated = await requestFactory.newContext();
  try {
    const signed = await isolated.post(
      testOrigins.api + "/api/v1/mobile/auth/login",
      {
        data: { email: f.actor.email, password: "Fluivix-Test-Password-2026" },
      },
    );
    expect(signed.status()).toBe(200);
    const selected = await isolated.post(
      testOrigins.api + "/api/v1/auth/switch-context",
      {
        headers: {
          Authorization: "Bearer " + (await signed.json()).data.accessToken,
        },
        data: { tenantId: f.tenant.id, role: "guardian" },
      },
    );
    expect(selected.status()).toBe(200);
    const created = await isolated.post(
      testOrigins.api + "/api/v1/privacy/requests",
      {
        headers: {
          Authorization: "Bearer " + (await selected.json()).data.accessToken,
        },
        data: { type, subjectStudentId: f.student.id },
      },
    );
    expect(created.status()).toBe(201);
    return (await created.json()).data.id as string;
  } finally {
    await isolated.dispose();
  }
}

test("privacy owner applies reviewed narrow corrections and keeps unconfigured profile erasure blocked with retained-record confirmation", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db),
      correction = await childRequest(f, "CORRECT"),
      erasure = await childRequest(f, "ERASE");
    await login(page, f);
    page.on("dialog", (dialog) => dialog.accept());
    await page
      .getByLabel("Xử lý yêu cầu của trung tâm (chủ trung tâm)")
      .check();
    await select(page, correction);
    await page
      .getByRole("combobox", { name: "Cách xác minh", exact: true })
      .selectOption("VERIFIED_GUARDIAN");
    await verify(page);
    await approve(page);
    await page
      .getByLabel("Email liên hệ", { exact: true })
      .fill("Corrected-Ui@Example.Test");
    await page
      .getByLabel("Xóa giá trị Điện thoại liên hệ", { exact: true })
      .check();
    await page
      .getByLabel("Lý do xử lý (10–500 ký tự)")
      .fill("Sửa email và rút số điện thoại đã đối chiếu trong kiểm thử");
    await page
      .getByRole("button", { name: "Thực hiện yêu cầu", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Máy chủ đã thực hiện yêu cầu." }),
    ).toBeVisible();
    const updated = await db.student.findUniqueOrThrow({
      where: { id: f.student.id },
    });
    expect(updated).toMatchObject({
      contactEmail: "corrected-ui@example.test",
      contactPhone: null,
      notesPrivate: "SYNTHETIC-PRIVATE-NOTE",
      studentCode: f.student.studentCode,
      version: 2,
    });
    await expect(
      page.getByText(/Trường đã xử lý:.*Email liên hệ/),
    ).toBeVisible();
    await select(page, erasure);
    await verify(page);
    await approve(page);
    await page
      .getByLabel("Lý do xử lý (10–500 ký tự)")
      .fill("Kiểm tra chặn khi chưa cấu hình chính sách được phê duyệt");
    await expect(
      page.getByRole("button", { name: "Thực hiện yêu cầu", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel(/Tôi đã đối chiếu chính sách: giữ mã học viên/)
      .check();
    await page
      .getByRole("button", { name: "Thực hiện yêu cầu", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Tải lại để kiểm tra trạng thái hiện tại" }),
    ).toBeVisible();
    expect(
      (
        await db.dataSubjectRequest.findUniqueOrThrow({
          where: { id: erasure },
        })
      ).status,
    ).toBe("APPROVED");
    expect(
      (await db.student.findUniqueOrThrow({ where: { id: f.student.id } }))
        .fullName,
    ).toBe(f.student.fullName);
  } finally {
    await db.$disconnect();
  }
});

test("privacy requester and owner complete a real reviewed encrypted export and download the authenticated file", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    page.on("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("combobox", { name: "Loại yêu cầu", exact: true })
      .selectOption("EXPORT");
    await page
      .getByRole("button", { name: "Gửi yêu cầu", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Máy chủ đã tiếp nhận" }),
    ).toBeVisible();
    const request = await db.dataSubjectRequest.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    expect(request.status).toBe("RECEIVED");
    await page
      .getByLabel("Xử lý yêu cầu của trung tâm (chủ trung tâm)")
      .check();
    await select(page, request.id);
    await verify(page);
    await approve(page);
    await page
      .getByLabel("Lý do xử lý (10–500 ký tự)")
      .fill("Thực hiện bản xuất theo phạm vi tài khoản đã xác minh");
    await page
      .getByRole("button", { name: "Thực hiện yêu cầu", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Máy chủ đã thực hiện yêu cầu." }),
    ).toBeVisible();
    const artifact = await db.privacyExportArtifact.findUniqueOrThrow({
      where: {
        tenantId_requestId: { tenantId: f.tenant.id, requestId: request.id },
      },
    });
    expect(artifact.ciphertext).not.toContain(f.actor.email);
    expect(artifact.ciphertext).not.toContain(f.student.fullName);
    await page
      .getByLabel("Xử lý yêu cầu của trung tâm (chủ trung tâm)")
      .uncheck();
    await select(page, request.id);
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Tải bản xuất riêng tư", exact: true })
      .click();
    const download = await downloaded,
      file = await download.path();
    expect(file).not.toBeNull();
    const json = readFileSync(file!, "utf8");
    expect(createHash("sha256").update(json).digest("hex")).toBe(
      artifact.sha256,
    );
    expect(JSON.parse(json).account.id).toBe(f.actor.id);
    expect(JSON.parse(json).student).toBeNull();
    expect(json).not.toContain("SYNTHETIC-PRIVATE-NOTE");
    expect(json).not.toContain("passwordHash");
    expect(
      await db.privacyRequestEvent.count({
        where: { tenantId: f.tenant.id, requestId: request.id },
      }),
    ).toBe(4);
    expect(
      (
        await db.dataSubjectRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe("COMPLETED");
  } finally {
    await db.$disconnect();
  }
});

test("privacy hides stale data on transport failure, restricts owner review and respects read-only writes", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    page.on("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Gửi yêu cầu", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Máy chủ đã tiếp nhận" }),
    ).toBeVisible();
    const request = await db.dataSubjectRequest.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    await page.route("**/api/v1/privacy/requests?**", (route) =>
      route.abort("failed"),
    );
    await page
      .getByRole("button", { name: "Tải lại yêu cầu", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Danh sách cũ đã được ẩn" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Xem yêu cầu " + request.id.slice(0, 8),
      }),
    ).toHaveCount(0);
    await page.unroute("**/api/v1/privacy/requests?**");
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Gửi yêu cầu", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("Xử lý yêu cầu của trung tâm (chủ trung tâm)")
      .check();
    await select(page, request.id);
    await expect(
      page.getByRole("button", { name: "Ghi nhận xác minh", exact: true }),
    ).toBeDisabled();
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "ACTIVE" },
    });
    await login(page, f, "manager");
    await expect(
      page.getByLabel("Xử lý yêu cầu của trung tâm (chủ trung tâm)"),
    ).toHaveCount(0);
    // Browser startup legitimately rotates/consumes the bootstrapping web
    // session. Use an independent current native session for this policy probe.
    const isolated = await requestFactory.newContext();
    try {
      const signed = await isolated.post(
        testOrigins.api + "/api/v1/mobile/auth/login",
        {
          data: {
            email: f.actor.email,
            password: "Fluivix-Test-Password-2026",
          },
        },
      );
      expect(signed.status()).toBe(200);
      const selected = await isolated.post(
        testOrigins.api + "/api/v1/auth/switch-context",
        {
          headers: {
            Authorization: "Bearer " + (await signed.json()).data.accessToken,
          },
          data: { tenantId: f.tenant.id, role: "manager" },
        },
      );
      expect(selected.status()).toBe(200);
      const denied = await isolated.get(
        testOrigins.api + "/api/v1/privacy/admin/requests",
        {
          headers: {
            Authorization: "Bearer " + (await selected.json()).data.accessToken,
          },
        },
      );
      expect(denied.status()).toBe(403);
    } finally {
      await isolated.dispose();
    }
  } finally {
    await db.$disconnect();
  }
});

test("privacy review remains keyboard accessible across four widths and reduced motion with real requests", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    page.on("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Gửi yêu cầu", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Máy chủ đã tiếp nhận" }),
    ).toBeVisible();
    const request = await db.dataSubjectRequest.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    await page
      .getByLabel("Xử lý yêu cầu của trung tâm (chủ trung tâm)")
      .check();
    await select(page, request.id);
    mkdirSync("docs/release/evidence/privacy", { recursive: true });
    for (const mode of ["no-preference", "reduce"] as const) {
      await page.emulateMedia({ reducedMotion: mode });
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByLabel("Lý do xử lý (10–500 ký tự)").focus();
        await page.keyboard.press("Tab");
        await expect(
          page.getByRole("combobox", { name: "Cách xác minh", exact: true }),
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
          `docs/release/evidence/privacy/review-${mode}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/privacy/review-${mode}-${width}.png`,
          fullPage: true,
        });
      }
    }
  } finally {
    await db.$disconnect();
  }
});
