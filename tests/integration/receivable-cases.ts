import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export function receivableCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("exact receivables and shared financial read scopes", () => {
    const tenant = randomUUID(),
      foreign = randomUUID(),
      student = randomUUID(),
      foreignStudent = randomUUID(),
      cls = randomUUID(),
      foreignClass = randomUUID();
    const roles = [
      "owner",
      "accountant",
      "manager",
      "academic_staff",
      "teacher",
      "student",
      "guardian",
      "foreignOwner",
    ] as const;
    type Actor = (typeof roles)[number];
    const users = Object.fromEntries(
      roles.map((r) => [r, randomUUID()]),
    ) as Record<Actor, string>;
    const tokens: Partial<Record<Actor, string>> = {};
    let planId = "";
    async function api(
      route: string,
      method = "GET",
      body?: unknown,
      actor: Actor = "owner",
      key?: string,
    ) {
      const r = await fetch(getBase() + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(tokens[actor]
            ? { Authorization: "Bearer " + tokens[actor] }
            : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    }
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash();
      const source = await db.plan.findUniqueOrThrow({
        where: { code: "TEST_PLAN" },
      });
      const plan = await db.plan.create({
        data: {
          code: "RCV-" + tenant.slice(0, 30),
          name: "Synthetic receivables plan",
          monthlyPriceVnd: 0n,
          limitsJson: source.limitsJson as Prisma.InputJsonValue,
          featureFlagsJson: {
            attendance: true,
            grades: true,
            finance: true,
            reports: true,
          },
        },
      });
      planId = plan.id;
      for (const id of [tenant, foreign]) {
        await db.tenant.create({
          data: {
            id,
            slug: "receivable-" + id,
            name: "Synthetic receivables centre",
            status: "ACTIVE",
            subscriptionEndsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
        await db.subscription.create({
          data: {
            tenantId: id,
            planId: plan.id,
            startsAt: new Date("2020-01-01Z"),
            endsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
      }
      for (const actor of roles) {
        const role = actor === "foreignOwner" ? "owner" : actor,
          tenantId = actor === "foreignOwner" ? foreign : tenant;
        await db.user.create({
          data: {
            id: users[actor],
            email: users[actor] + "@example.test",
            displayName: "Synthetic receivables " + actor,
            status: "ACTIVE",
            passwordHash,
          },
        });
        await db.membership.create({
          data: {
            tenantId,
            userId: users[actor],
            status: "ACTIVE",
            roles: { create: { role } },
          },
        });
        const login = await fetch(getBase() + "/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: users[actor] + "@example.test",
            password,
          }),
        });
        expect(login.status).toBe(200);
        const logged = await login.json();
        tokens[actor] = logged.data.accessToken;
        const selected = await api(
          "/auth/switch-context",
          "POST",
          { tenantId, role },
          actor,
        );
        expect(selected.status).toBe(200);
        tokens[actor] = selected.body.data.accessToken;
      }
      for (const [id, tenantId, studentId] of [
        [cls, tenant, student],
        [foreignClass, foreign, foreignStudent],
      ]) {
        await db.educationClass.create({
          data: {
            id: id!,
            tenantId: tenantId!,
            code: "RCV-" + id!.slice(0, 8),
            name: "Receivable class",
            capacity: 10,
            status: "ACTIVE",
            startDate: new Date("2020-01-01Z"),
            endDate: new Date("2040-01-01Z"),
          },
        });
        await db.student.create({
          data: {
            id: studentId!,
            tenantId: tenantId!,
            studentCode: "RCV-" + studentId!.slice(0, 8),
            fullName:
              tenantId === tenant
                ? "Receivable learner"
                : "Foreign receivable learner",
          },
        });
      }
    });
    async function invoice(
      amount: bigint,
      dueAt: Date,
      options: {
        tenantId?: string;
        classId?: string;
        studentId?: string;
        actor?: string;
        void?: boolean;
      } = {},
    ) {
      const tenantId = options.tenantId ?? tenant,
        classId = options.classId ?? cls,
        studentId = options.studentId ?? student,
        actor = options.actor ?? users.owner;
      return getDb().$transaction(async (tx) => {
        const fee = await tx.feePlan.create({
          data: {
            tenantId,
            classId,
            name: "Receivable snapshot " + randomUUID().slice(0, 8),
            billingModel: "MONTHLY",
            amountVnd: amount,
            validFrom: new Date("2020-01-01Z"),
          },
        });
        const run = await tx.invoiceRun.create({
          data: {
            tenantId,
            feePlanId: fee.id,
            periodKey: "2026-11",
            requestHash: "a".repeat(64),
            createdBy: actor,
          },
        });
        const row = await tx.invoice.create({
          data: {
            tenantId,
            studentId,
            runId: run.id,
            invoiceNo: "RCV-" + randomUUID(),
            dueAt,
            totalAmountVnd: amount,
            createdBy: actor,
            ...(options.void
              ? {
                  billingState: "VOID",
                  voidReason:
                    "Synthetic voided invoice for receivables exclusion",
                }
              : {}),
          },
        });
        await tx.invoiceItem.create({
          data: {
            tenantId,
            invoiceId: row.id,
            feePlanId: fee.id,
            description: fee.name,
            totalAmountVnd: amount,
          },
        });
        return { ...row, feePlanId: fee.id };
      });
    }
    it("receivables share exact filtered invoice balances across installments, unallocated money, reversal, zero and void", async () => {
      const now = Date.now();
      const a = await invoice(1200000n, new Date(now - 86400000)),
        b = await invoice(1000000n, new Date(now + 30 * 86400000));
      await invoice(0n, new Date(now - 86400000));
      await invoice(2000000n, new Date(now - 86400000), { void: true });
      const paid = await api(
        "/payments",
        "POST",
        {
          studentId: student,
          method: "CASH",
          receivedAmountVnd: "600000",
          receivedAt: new Date().toISOString(),
          allocations: [
            { invoiceId: a.id, amountVnd: "300000" },
            { invoiceId: b.id, amountVnd: "200000" },
          ],
        },
        "accountant",
        randomUUID(),
      );
      expect(paid.status).toBe(201);
      expect(paid.body.data.unallocatedAmountVnd).toBe("100000");
      const base = `/finance/reports/receivables?classId=${cls}`;
      const first = await api(base + "&limit=1");
      expect(first.status).toBe(200);
      expect(first.body.data.timezone).toBe("Asia/Ho_Chi_Minh");
      expect(first.body.data.summary).toEqual({
        issuedCount: 3,
        outstandingCount: 2,
        totalAmountVnd: "2200000",
        paidAmountVnd: "500000",
        balanceVnd: "1700000",
        overdueAmountVnd: "900000",
      });
      expect(first.body.data.page).toMatchObject({ total: 2, totalPages: 2 });
      expect(first.body.data.invoices.map((i: { id: string }) => i.id)).toEqual(
        [b.id],
      );
      const second = await api(base + "&limit=1&page=2");
      expect(
        second.body.data.invoices.map((i: { id: string }) => i.id),
      ).toEqual([a.id]);
      const list = await api(`/invoices?classId=${cls}`);
      const debt = list.body.data.filter(
        (i: { billingState: string; balanceVnd: string }) =>
          i.billingState === "ISSUED" && BigInt(i.balanceVnd) > 0n,
      );
      expect(
        debt
          .reduce(
            (sum: bigint, i: { balanceVnd: string }) =>
              sum + BigInt(i.balanceVnd),
            0n,
          )
          .toString(),
      ).toBe(first.body.data.summary.balanceVnd);
      const overdue = await api(base + "&paymentStatus=OVERDUE");
      expect(
        overdue.body.data.invoices.map((i: { id: string }) => i.id),
      ).toEqual([a.id]);
      expect(overdue.body.data.summary.balanceVnd).toBe("900000");
      expect(
        (await api(base + `&feePlanId=${b.feePlanId}`)).body.data.summary
          .balanceVnd,
      ).toBe("800000");
      expect(
        (
          await api(
            `/payments/${paid.body.data.id}/reverse`,
            "POST",
            {
              reason:
                "Verified complete reversal for receivables recalculation",
            },
            "accountant",
          )
        ).status,
      ).toBe(201);
      expect((await api(base)).body.data.summary).toMatchObject({
        paidAmountVnd: "0",
        balanceVnd: "2200000",
        overdueAmountVnd: "1200000",
      });
      expect(
        (
          await api(
            "/payments",
            "POST",
            {
              studentId: student,
              method: "BANK_TRANSFER",
              receivedAmountVnd: "2200000",
              receivedAt: new Date().toISOString(),
              allocations: [
                { invoiceId: a.id, amountVnd: "1200000" },
                { invoiceId: b.id, amountVnd: "1000000" },
              ],
            },
            "accountant",
            randomUUID(),
          )
        ).status,
      ).toBe(201);
      const settled = await api(base);
      expect(settled.body.data.invoices).toEqual([]);
      expect(settled.body.data.summary).toMatchObject({
        issuedCount: 3,
        outstandingCount: 0,
        totalAmountVnd: "2200000",
        paidAmountVnd: "2200000",
        balanceVnd: "0",
        overdueAmountVnd: "0",
      });
    });
    it("receivables preserve sums beyond bigint and stable Vietnam day paging without unsupported-date or offset500 errors", async () => {
      const db = getDb(),
        largeClass = await db.educationClass.create({
          data: {
            tenantId: tenant,
            code: "BIG-" + tenant.slice(0, 8),
            name: "Large receivable class",
            capacity: 5,
            status: "ACTIVE",
            startDate: new Date("2020-01-01Z"),
            endDate: new Date("2040-01-01Z"),
          },
        });
      for (let n = 0; n < 3; n++)
        await invoice(6000000000000000000n, new Date("2030-01-15T17:00:00Z"), {
          classId: largeClass.id,
        });
      const base = `/finance/reports/receivables?classId=${largeClass.id}`;
      const all = await api(base);
      expect(all.status).toBe(200);
      expect(all.body.data.summary).toMatchObject({
        totalAmountVnd: "18000000000000000000",
        paidAmountVnd: "0",
        balanceVnd: "18000000000000000000",
        overdueAmountVnd: "0",
        outstandingCount: 3,
      });
      expect(
        (await api(base + "&from=2030-01-16&to=2030-01-16&limit=2")).body.data
          .page,
      ).toMatchObject({ total: 3, totalPages: 2 });
      expect((await api(base + "&to=2030-01-15")).body.data.invoices).toEqual(
        [],
      );
      expect((await api(base + "&search=%25")).body.data.invoices).toEqual([]);
      for (const route of [
        "/finance/reports/receivables",
        "/invoices",
        "/payments",
      ]) {
        for (const query of [
          "to=9999-12-31",
          "from=2030-01-17&to=2030-01-16",
          "page=1000000000000000000000000000000",
        ]) {
          expect(
            (await api(route + "?" + query)).status,
            route + "?" + query,
          ).toBe(422);
        }
      }
    });
    it("financial reads use the actual tenant IANA calendar across DST, midnight gaps and fractional offsets", async () => {
      const db = getDb();
      try {
        for (const [timezone, day, start, end] of [
          [
            "America/New_York",
            "2026-03-08",
            "2026-03-08T05:00:00Z",
            "2026-03-09T04:00:00Z",
          ],
          [
            "America/New_York",
            "2026-11-01",
            "2026-11-01T04:00:00Z",
            "2026-11-02T05:00:00Z",
          ],
          [
            "Asia/Kathmandu",
            "2031-01-07",
            "2031-01-06T18:15:00Z",
            "2031-01-07T18:15:00Z",
          ],
          [
            "America/Sao_Paulo",
            "2018-11-04",
            "2018-11-04T03:00:00Z",
            "2018-11-05T02:00:00Z",
          ],
        ] as const) {
          await db.tenant.update({ where: { id: tenant }, data: { timezone } });
          const testClass = await db.educationClass.create({
            data: {
              tenantId: tenant,
              code: "TZ-" + randomUUID().slice(0, 8),
              name: "Isolated IANA calendar class",
              capacity: 10,
              status: "ACTIVE",
              startDate: new Date("2010-01-01Z"),
              endDate: new Date("2040-01-01Z"),
            },
          });
          const instants = [
            new Date(Date.parse(start!) - 1),
            new Date(start!),
            new Date(Date.parse(end!) - 1),
            new Date(end!),
          ];
          const invoices = [];
          const payments: string[] = [];
          for (const instant of instants) {
            const row = await invoice(100000n, instant, {
              classId: testClass.id,
            });
            invoices.push(row);
            const payment = await api(
              "/payments",
              "POST",
              {
                studentId: student,
                method: "CASH",
                receivedAmountVnd: "100",
                receivedAt: instant.toISOString(),
                allocations: [{ invoiceId: row.id, amountVnd: "100" }],
              },
              "accountant",
              randomUUID(),
            );
            expect(payment.status).toBe(201);
            payments.push(payment.body.data.id);
          }
          const params = `classId=${testClass.id}&from=${day}&to=${day}`;
          const report = await api("/finance/reports/receivables?" + params);
          expect(report.status).toBe(200);
          expect(report.body.data.timezone).toBe(timezone);
          expect(report.body.data.summary).toMatchObject({
            issuedCount: 2,
            totalAmountVnd: "200000",
            paidAmountVnd: "200",
            balanceVnd: "199800",
          });
          const expected = [invoices[1]!.id, invoices[2]!.id].sort();
          expect(
            report.body.data.invoices.map((i: { id: string }) => i.id).sort(),
          ).toEqual(expected);
          const list = await api("/invoices?" + params);
          expect(
            list.body.data.map((i: { id: string }) => i.id).sort(),
          ).toEqual(expected);
          expect(
            (await api("/invoices/" + invoices[1]!.id)).body.data.timezone,
          ).toBe(timezone);
          const receipts = await api(
            `/payments?studentId=${student}&from=${day}&to=${day}`,
          );
          expect(receipts.status).toBe(200);
          expect(
            receipts.body.data.map((p: { id: string }) => p.id).sort(),
          ).toEqual([payments[1], payments[2]].sort());
          expect(
            (await api("/payments/" + payments[1])).body.data.timezone,
          ).toBe(timezone);
          expect(
            (
              await api(
                "/finance/reports/receivables?" + params,
                "GET",
                undefined,
                "foreignOwner",
              )
            ).body.data.summary.issuedCount,
          ).toBe(0);
        }
        await db.tenant.update({
          where: { id: tenant },
          data: { timezone: "Pacific/Apia" },
        });
        for (const route of [
          "/invoices",
          "/payments",
          "/finance/reports/receivables",
        ])
          expect(
            (await api(route + "?from=2011-12-30&to=2011-12-30")).status,
          ).toBe(422);
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { timezone: "Asia/Ho_Chi_Minh" },
        });
      }
    });
    it("future fee terms and effective snapshots use the same scoped tenant calendar in API and SQL", async () => {
      const db = getDb();
      try {
        for (const timezone of ["Pacific/Kiritimati", "Etc/GMT+12"]) {
          await db.tenant.update({ where: { id: tenant }, data: { timezone } });
          const today = new Intl.DateTimeFormat("sv-SE", {
            timeZone: timezone,
          }).format(new Date());
          const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86400000)
            .toISOString()
            .slice(0, 10);
          const fee = await db.feePlan.create({
            data: {
              tenantId: tenant,
              classId: cls,
              name: "IANA future course",
              billingModel: "COURSE",
              amountVnd: 100000n,
              validFrom: new Date(tomorrow + "T00:00:00Z"),
            },
          });
          const changed = await api("/fee-plans/" + fee.id, "PATCH", {
            version: 1,
            effectiveFrom: tomorrow,
            name: "IANA future course revised",
            amountVnd: "200000",
            reason: "Confirmed future course terms in actual centre calendar",
          });
          expect(changed.status).toBe(200);
          const current = await api("/fee-plans/" + fee.id);
          expect(current.body.data).toMatchObject({
            termsAsOf: today,
            effectiveAmountVnd: "100000",
            version: 2,
          });
          expect(
            await db.feePlanTerm.count({
              where: { tenantId: tenant, feePlanId: fee.id },
            }),
          ).toBe(1);
          const sameDay = await db.feePlan.create({
            data: {
              tenantId: tenant,
              classId: cls,
              name: "SQL local today rejection",
              billingModel: "COURSE",
              amountVnd: 100000n,
              version: 2,
              validFrom: new Date(today + "T00:00:00Z"),
            },
          });
          await expect(
            db.feePlanTerm.create({
              data: {
                tenantId: tenant,
                feePlanId: sameDay.id,
                version: 2,
                effectiveFrom: new Date(today + "T00:00:00Z"),
                name: "Forbidden current-day term",
                amountVnd: 200000n,
                reason:
                  "Current-day term must fail SQL guard independently of API",
                createdBy: users.owner,
                actorDisplayName: "Synthetic owner",
                traceId: randomUUID(),
              },
            }),
          ).rejects.toThrow(
            "fee terms must take effect in the future valid interval",
          );
        }
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { timezone: "Asia/Ho_Chi_Minh" },
        });
      }
    });
    it("receivables enforce named owner/accountant and finance-plan scopes, tenant isolation, readonly reads and revocation", async () => {
      const foreignInvoice = await invoice(1000000n, new Date("2030-01-01Z"), {
        tenantId: foreign,
        classId: foreignClass,
        studentId: foreignStudent,
        actor: users.foreignOwner,
      });
      const base = "/finance/reports/receivables";
      expect((await api(base, "GET", undefined, "accountant")).status).toBe(
        200,
      );
      for (const role of [
        "manager",
        "academic_staff",
        "teacher",
        "student",
        "guardian",
      ] as const)
        expect((await api(base, "GET", undefined, role)).status).toBe(403);
      const their = await api(base, "GET", undefined, "foreignOwner");
      expect(their.body.data.invoices.map((i: { id: string }) => i.id)).toEqual(
        [foreignInvoice.id],
      );
      expect(their.body.data.summary.balanceVnd).toBe("1000000");
      for (const query of [
        `classId=${foreignClass}`,
        `studentId=${foreignStudent}`,
        `feePlanId=${foreignInvoice.feePlanId}`,
      ]) {
        const denied = await api(base + "?" + query);
        expect(denied.status).toBe(200);
        expect(denied.body.data.invoices).toEqual([]);
        expect(denied.body.data.summary.balanceVnd).toBe("0");
      }
      const db = getDb();
      await db.tenant.update({
        where: { id: tenant },
        data: { status: "READ_ONLY" },
      });
      try {
        expect((await api(base)).status).toBe(200);
      } finally {
        await db.tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
      const sourcePlan = await db.plan.findUniqueOrThrow({
        where: { id: planId },
      });
      for (const finance of [true, false]) {
        // Plan terms are immutable after subscription. Use distinct real plan/
        // tenant/session fixtures rather than mutating a subscribed catalogue row.
        const id = randomUUID();
        const featurePlan = await db.plan.create({
          data: {
            code: "RCV-F-" + id.slice(0, 30),
            name: "Synthetic finance feature scope",
            monthlyPriceVnd: 0n,
            limitsJson: sourcePlan.limitsJson as Prisma.InputJsonValue,
            featureFlagsJson: {
              attendance: true,
              grades: true,
              finance,
              reports: !finance,
            },
          },
        });
        await db.tenant.create({
          data: {
            id,
            slug: "feature-" + id,
            name: "Synthetic feature centre",
            status: "ACTIVE",
            subscriptionEndsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
        await db.subscription.create({
          data: {
            tenantId: id,
            planId: featurePlan.id,
            startsAt: new Date("2020-01-01Z"),
            endsAt: new Date("2040-01-01Z"),
            graceUntil: new Date("2040-02-01Z"),
          },
        });
        await db.membership.create({
          data: {
            tenantId: id,
            userId: users.owner,
            status: "ACTIVE",
            roles: { create: { role: "owner" } },
          },
        });
        const login = await fetch(getBase() + "/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: users.owner + "@example.test",
            password,
          }),
        });
        expect(login.status).toBe(200);
        const logged = await login.json();
        const selected = await fetch(getBase() + "/auth/switch-context", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + logged.data.accessToken,
          },
          body: JSON.stringify({ tenantId: id, role: "owner" }),
        });
        expect(selected.status).toBe(200);
        const context = await selected.json();
        const result = await fetch(getBase() + base, {
          headers: { Authorization: "Bearer " + context.data.accessToken },
        });
        expect(result.status).toBe(finance ? 200 : 403);
      }
      const member = await db.membership.findUniqueOrThrow({
        where: {
          tenantId_userId: { tenantId: tenant, userId: users.accountant },
        },
      });
      await db.membership.update({
        where: { id: member.id },
        data: { status: "SUSPENDED" },
      });
      expect((await api(base, "GET", undefined, "accountant")).status).toBe(
        403,
      );
    });
  });
}
