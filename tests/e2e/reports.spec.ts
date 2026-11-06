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
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw Error("Isolated E2E database required");
  return new PrismaClient({ datasourceUrl: url });
}
const vnd = (value: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
async function fixture(db: PrismaClient) {
  const stamp = randomUUID().slice(0, 8),
    source = await db.user.findUniqueOrThrow({
      where: { email: "accountant@example.test" },
    }),
    plan = await db.subscription.findFirstOrThrow({
      where: {
        tenantId: "10000000-0000-4000-8000-000000000001",
        status: "ACTIVE",
      },
    });
  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        slug: "report-" + stamp,
        name: "Trung tâm báo cáo " + stamp,
        status: "ACTIVE",
        timezone: "Asia/Ho_Chi_Minh",
        subscriptionEndsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.planId,
        startsAt: new Date("2020-01-01Z"),
        endsAt: new Date("2040-01-01Z"),
        graceUntil: new Date("2040-02-01Z"),
      },
    });
    const actor = await tx.user.create({
      data: {
        email: "report-" + stamp + "@example.test",
        displayName: "Chủ trung tâm báo cáo",
        passwordHash: source.passwordHash,
        status: "ACTIVE",
      },
    });
    await tx.membership.create({
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
    const teacherUser = await tx.user.create({
      data: {
        email: "report-teacher-" + stamp + "@example.test",
        displayName: "Giáo viên báo cáo",
        passwordHash: source.passwordHash,
        status: "ACTIVE",
      },
    });
    await tx.membership.create({
      data: {
        tenantId: tenant.id,
        userId: teacherUser.id,
        status: "ACTIVE",
        roles: { create: { role: "teacher" } },
      },
    });
    const teacher = await tx.teacher.create({
      data: {
        tenantId: tenant.id,
        userId: teacherUser.id,
        teacherCode: "RPT" + stamp,
        fullName: "Giáo viên báo cáo",
      },
    });
    const classes = [];
    for (let n = 0; n < 2; n++)
      classes.push(
        await tx.educationClass.create({
          data: {
            tenantId: tenant.id,
            code: "RPT" + stamp + n,
            name: n === 0 ? "=SUM(1,1)" : "Lớp phân bổ thứ hai",
            capacity: 5,
            status: "ACTIVE",
            startDate: new Date("2020-01-01Z"),
            endDate: new Date("2040-01-01Z"),
          },
        }),
      );
    const cls = classes[0]!,
      other = classes[1]!;
    await tx.classTeacher.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        teacherId: teacher.id,
        effectiveFrom: new Date("2020-01-01Z"),
        effectiveTo: new Date("2040-01-01Z"),
      },
    });
    const student = await tx.student.create({
      data: {
        tenantId: tenant.id,
        studentCode: "RPT" + stamp,
        fullName: "Học viên báo cáo " + stamp,
        notesPrivate: "REPORT_BROWSER_PRIVATE_NOTE",
      },
    });
    const enrollment = await tx.enrollment.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        studentId: student.id,
        joinedAt: new Date("2020-01-01Z"),
      },
    });
    await tx.enrollment.create({
      data: {
        tenantId: tenant.id,
        classId: other.id,
        studentId: student.id,
        joinedAt: new Date("2020-01-01Z"),
      },
    });
    const starts = [
      "2026-10-31T16:00Z",
      "2026-10-31T17:00Z",
      "2026-11-02T02:00Z",
      "2026-11-03T02:00Z",
      "2026-11-04T02:00Z",
      "2026-11-05T02:00Z",
      "2026-11-30T16:00Z",
      "2026-11-30T17:00Z",
    ];
    const states = [
      "COMPLETED",
      "COMPLETED",
      "IN_PROGRESS",
      "REOPENED",
      "CANCELLED",
      "COMPLETED",
      "SCHEDULED",
      "COMPLETED",
    ];
    for (let n = 0; n < starts.length; n++) {
      const start = new Date(starts[n]!),
        session = await tx.classSession.create({
          data: {
            tenantId: tenant.id,
            classId: cls.id,
            teacherId: teacher.id,
            startsAt: start,
            endsAt: new Date(start.getTime() + 30 * 60000),
            scheduledDate: new Date(
              start.toISOString().slice(0, 10) + "T00:00:00Z",
            ),
            status: states[n]!,
            ...(["COMPLETED", "REOPENED"].includes(states[n]!)
              ? { finalizedAt: new Date(), finalizedBy: actor.id }
              : {}),
          },
        });
      await tx.rosterRow.create({
        data: {
          tenantId: tenant.id,
          classId: cls.id,
          sessionId: session.id,
          studentId: student.id,
          enrollmentId: enrollment.id,
          displayName: student.fullName,
        },
      });
      await tx.attendanceRecord.create({
        data: {
          tenantId: tenant.id,
          sessionId: session.id,
          studentId: student.id,
          status:
            n === 1
              ? "PRESENT"
              : n === 5
                ? "ABSENT_EXCUSED"
                : "ABSENT_UNEXCUSED",
          note: "REPORT_BROWSER_PRIVATE_ATTENDANCE",
          markedBy: actor.id,
          markedAt: new Date(),
        },
      });
    }
    const invoices = [];
    for (let n = 0; n < 4; n++) {
      const amount = [9007199254740993n, 1000000n, 500000n, 20000n][n]!,
        classId = n === 1 ? other.id : cls.id;
      const fee = await tx.feePlan.create({
        data: {
          tenantId: tenant.id,
          classId,
          name: "Học phí báo cáo " + stamp + n,
          billingModel: "MONTHLY",
          amountVnd: amount,
          validFrom: new Date("2020-01-01Z"),
        },
      });
      const run = await tx.invoiceRun.create({
        data: {
          tenantId: tenant.id,
          feePlanId: fee.id,
          periodKey: "2026-11",
          requestHash: "a".repeat(64),
          createdBy: actor.id,
        },
      });
      const row = await tx.invoice.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          runId: run.id,
          invoiceNo: "RPT-INV-" + stamp + n,
          issuedAt: new Date(
            [
              "2026-10-31T17:00Z",
              "2026-11-30T16:59:59Z",
              "2026-11-30T17:00Z",
              "2026-11-05T00:00Z",
            ][n]!,
          ),
          dueAt: new Date("2026-11-15T00:00Z"),
          totalAmountVnd: amount,
          createdBy: actor.id,
          ...(n === 3
            ? {
                billingState: "VOID",
                voidReason: "Chứng từ hủy trong dữ liệu báo cáo thử nghiệm",
              }
            : {}),
        },
      });
      await tx.invoiceItem.create({
        data: {
          tenantId: tenant.id,
          invoiceId: row.id,
          feePlanId: fee.id,
          description: fee.name,
          totalAmountVnd: amount,
        },
      });
      invoices.push(row);
    }
    const payments = [];
    for (let n = 0; n < 2; n++) {
      const payment = await tx.payment.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          receiptNo: "RPT-PAY-" + stamp + n,
          method: "CASH",
          receivedAmountVnd: n === 0 ? 600000n : 100000n,
          receivedAt: new Date(
            n === 0 ? "2026-10-31T17:00Z" : "2026-11-30T16:59:59Z",
          ),
          receivedBy: actor.id,
        },
      });
      if (n === 0)
        await tx.paymentAllocation.create({
          data: {
            tenantId: tenant.id,
            studentId: student.id,
            paymentId: payment.id,
            invoiceId: invoices[0]!.id,
            amountVnd: 200000n,
          },
        });
      await tx.paymentAllocation.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          paymentId: payment.id,
          invoiceId: invoices[1]!.id,
          amountVnd: n === 0 ? 300000n : 100000n,
        },
      });
      payments.push(payment);
    }
    return {
      tenant,
      actor,
      teacherUser,
      cls,
      other,
      student,
      invoices,
      payments,
    };
  });
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
}
async function chooseRole(page: Page, role: string) {
  await page
    .getByRole("link", { name: "Đổi trung tâm / vai trò", exact: true })
    .click();
  await page.getByRole("button", { name: role, exact: true }).click();
  await expect(page).toHaveURL("/app/students");
}
async function range(page: Page, f?: Fixture) {
  await page.getByLabel("Báo cáo từ ngày", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Báo cáo đến ngày", { exact: true }).fill("2026-11-30");
  if (f) {
    await page
      .getByLabel("Tìm lớp trong báo cáo", { exact: true })
      .fill(f.cls.code);
    await page
      .getByLabel("Lớp trong phạm vi báo cáo", { exact: true })
      .selectOption(f.cls.id);
  }
  await page
    .getByRole("button", { name: "Áp dụng phạm vi", exact: true })
    .click();
}
const metric = (page: Page, label: string) =>
  page
    .locator("dt")
    .filter({ hasText: label })
    .locator("xpath=following-sibling::dd[1]");
async function csv(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV", exact: true }).click();
  const download = await pending,
    file = await download.path();
  if (!file) throw Error("No actual downloaded report file");
  return {
    name: download.suggestedFilename(),
    text: await readFile(file, "utf8"),
  };
}
test("November Vietnam dashboard, published attendance and enrollment exports use actual scope and remove owner finance after role switch", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await page
      .getByRole("link", { name: "Tổng quan trung tâm", exact: true })
      .click();
    await range(page, f);
    await expect(metric(page, "Buổi theo lịch, chưa hủy")).toHaveText("5");
    await expect(metric(page, "Buổi đã chốt")).toHaveText("2");
    await expect(
      metric(page, "Lượt học viên trong danh sách đã chốt"),
    ).toHaveText("2");
    await expect(metric(page, "Vắng không phép")).toHaveText("0");
    await expect(metric(page, "Tiền đã phân bổ cho lớp")).toHaveText(
      vnd("200000"),
    );
    await expect(page.locator("main")).not.toContainText(
      "REPORT_BROWSER_PRIVATE",
    );
    await page
      .getByRole("link", { name: "Báo cáo trung tâm", exact: true })
      .click();
    await range(page, f);
    await expect(
      page.getByRole("heading", {
        name: "Chuyên cần trong phạm vi đã chọn",
        exact: true,
      }),
    ).toBeVisible();
    const attendance = await csv(page);
    expect(attendance.name).toBe(
      "fluivixedu-attendance-2026-11-01-2026-11-30.csv",
    );
    expect(attendance.text).toContain('"\'=SUM(1,1)"');
    expect(attendance.text).not.toContain("REPORT_BROWSER_PRIVATE");
    expect(
      await db.auditLog.count({
        where: {
          tenantId: f.tenant.id,
          action: "report.attendance.exported",
          actorUserId: f.actor.id,
        },
      }),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Ghi danh và lớp", exact: true })
      .click();
    await expect(
      metric(page, "Lượt ghi danh có thời gian trùng kỳ"),
    ).toHaveText("1");
    const enrollments = await csv(page);
    expect(enrollments.text).toContain('"\'=SUM(1,1)"');
    await chooseRole(page, "Quản lý");
    await page
      .getByRole("link", { name: "Tổng quan trung tâm", exact: true })
      .click();
    await range(page, f);
    await expect(
      page.getByText(
        "Nhóm tài chính chỉ dành cho chủ trung tâm, kế toán và gói có tài chính.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText(vnd("200000"));
  } finally {
    await db.$disconnect();
  }
});
test("financial reports distinguish centre receipts from class allocations, update after actual reversal and export readonly", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await page
      .getByRole("link", { name: "Báo cáo trung tâm", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Học phí và thu tiền", exact: true })
      .click();
    await range(page);
    await expect(metric(page, "Tiền thực nhận có hiệu lực")).toHaveText(
      vnd("700000"),
    );
    await expect(metric(page, "Chưa phân bổ, cấp trung tâm")).toHaveText(
      vnd("100000"),
    );
    await range(page, f);
    await expect(metric(page, "Tiền đã phân bổ cho lớp")).toHaveText(
      vnd("200000"),
    );
    await expect(metric(page, "Chưa phân bổ, cấp trung tâm")).toHaveText(
      "Không gán tiền chưa phân bổ cho một lớp",
    );
    const classCsv = await csv(page);
    expect(classCsv.text).toContain('"CLASS_ALLOCATED"');
    expect(classCsv.text).toContain('"9007199254740993"');
    await page
      .getByRole("link", { name: "Thu tiền và phiếu thu", exact: true })
      .click();
    await page
      .getByRole("link", { name: f.payments[1]!.receiptNo, exact: true })
      .click();
    await page
      .getByLabel("Lý do thay đổi", { exact: true })
      .fill("Đảo khoản thu để đối chiếu báo cáo thực tế");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Xác nhận đảo giao dịch", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Đã đảo giao dịch trên hệ thống" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Báo cáo trung tâm", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Học phí và thu tiền", exact: true })
      .click();
    await range(page);
    await expect(metric(page, "Tiền thực nhận có hiệu lực")).toHaveText(
      vnd("600000"),
    );
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { status: "READ_ONLY" },
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Học phí và thu tiền", exact: true })
      .click();
    await range(page);
    await expect(
      page.getByText(/Trung tâm chỉ đọc: có thể xem và xuất báo cáo/),
    ).toBeVisible();
    const centreCsv = await csv(page);
    expect(centreCsv.text).toContain('"RECEIVED"');
    expect(centreCsv.text).toContain('"600000"');
    expect(centreCsv.text).not.toContain("REPORT_BROWSER_PRIVATE");
    expect(
      await db.paymentReversal.count({
        where: { tenantId: f.tenant.id, paymentId: f.payments[1]!.id },
      }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
});
test("reports expose honest empty, invalid range, actual transport error/retry and membership revocation", async ({
  page,
}) => {
  const db = database();
  try {
    const f = await fixture(db);
    await login(page, f);
    await page.route("**/api/v1/reports/dashboard**", (route) => route.abort());
    await page
      .getByRole("link", { name: "Tổng quan trung tâm", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Không thể kết nối dịch vụ." }),
    ).toBeVisible();
    await page.unroute("**/api/v1/reports/dashboard**");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Cập nhật tổng quan", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Báo cáo từ ngày", { exact: true })
      .fill("2032-01-01");
    await page
      .getByLabel("Báo cáo đến ngày", { exact: true })
      .fill("2032-01-03");
    await page
      .getByRole("button", { name: "Áp dụng phạm vi", exact: true })
      .click();
    await expect(
      page.getByText("Không có buổi chưa hủy trong phạm vi đã chọn.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(metric(page, "Tỷ lệ chốt buổi đã kết thúc")).toHaveText(
      "Chưa có mẫu số",
    );
    await page
      .getByLabel("Báo cáo từ ngày", { exact: true })
      .fill("2034-01-01");
    await expect(
      page.getByRole("alert").filter({ hasText: "tối đa 366 ngày" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Áp dụng phạm vi", exact: true }),
    ).toBeDisabled();
    const remainingOwner = await db.user.create({
      data: {
        email: randomUUID() + "@example.test",
        displayName: "Chủ trung tâm dự phòng thử nghiệm",
        passwordHash: f.teacherUser.passwordHash,
        status: "ACTIVE",
      },
    });
    await db.membership.create({
      data: {
        tenantId: f.tenant.id,
        userId: remainingOwner.id,
        status: "ACTIVE",
        roles: { create: { role: "owner" } },
      },
    });
    await db.membership.update({
      where: { tenantId_userId: { tenantId: f.tenant.id, userId: f.actor.id } },
      data: { status: "SUSPENDED" },
    });
    await page
      .getByRole("button", { name: "Cập nhật tổng quan", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Không có quyền hoặc trung tâm đang bị hạn chế." })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cập nhật tổng quan", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});
for (const mode of [
  "dashboard",
  "attendance",
  "enrollments",
  "collections",
] as const)
  test(`report ${mode} has accessible responsive values and reduced-motion keyboard controls`, async ({
    page,
  }) => {
    const db = database();
    try {
      const f = await fixture(db);
      if (mode === "enrollments")
        await db.educationClass.update({
          where: { id: f.cls.id },
          data: { name: "NhãnLớpKhôngKhoảngTrắng".repeat(5) },
        });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await login(page, f);
      await page
        .getByRole("link", {
          name:
            mode === "dashboard" ? "Tổng quan trung tâm" : "Báo cáo trung tâm",
          exact: true,
        })
        .click();
      if (mode === "collections")
        await page
          .getByRole("button", { name: "Học phí và thu tiền", exact: true })
          .click();
      if (mode === "enrollments")
        await page
          .getByRole("button", { name: "Ghi danh và lớp", exact: true })
          .click();
      await range(page, f);
      await expect(
        page
          .getByText("Phạm vi đang xem:", { exact: false })
          .filter({ hasText: f.cls.code }),
      ).toBeVisible();
      if (mode === "dashboard" || mode === "collections") {
        const chart = page.getByLabel(
          mode === "dashboard"
            ? "Ngày xem giá trị: Xu hướng buổi chưa hủy"
            : "Ngày xem giá trị: Xu hướng phân bổ cho lớp",
          { exact: true },
        );
        await chart.focus();
        await expect(chart).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(chart).toHaveValue("1");
      } else
        await expect(
          page.getByRole("button", { name: "Xuất CSV", exact: true }),
        ).toBeVisible();
      mkdirSync("docs/release/evidence/reports", { recursive: true });
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
        await reviewTaste(
          page,
          `docs/release/evidence/reports/${mode}-taste-${width}.json`,
        );
        await page.screenshot({
          path: `docs/release/evidence/reports/${mode}-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      await db.$disconnect();
    }
  });
