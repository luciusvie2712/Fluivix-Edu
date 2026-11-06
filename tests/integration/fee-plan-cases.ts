import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export function feePlanCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("fee plan future terms and financial actor boundaries against PostgreSQL", () => {
    const tenant = randomUUID(),
      foreign = randomUUID(),
      cls = randomUUID(),
      foreignClass = randomUUID(),
      student = randomUUID();
    const ids = {
      owner: randomUUID(),
      backup: randomUUID(),
      accountant: randomUUID(),
      manager: randomUUID(),
      academic_staff: randomUUID(),
      teacher: randomUUID(),
      guardian: randomUUID(),
      student: randomUUID(),
    };
    const tokens: Partial<Record<keyof typeof ids, string>> = {};
    const year = new Date().getUTCFullYear() + 1,
      jan = `${year}-01`,
      feb = `${year}-02`;
    let primary = "";
    async function api(
      route: string,
      method = "GET",
      body?: unknown,
      token = tokens.owner,
      key?: string,
    ) {
      const response = await fetch(getBase() + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    }
    const baseInput = (name: string) => ({
      classId: cls,
      name,
      billingModel: "MONTHLY",
      amountVnd: "1000000",
      validFrom: jan + "-01",
      validTo: `${year}-12-31`,
    });
    const term = (version: number, amountVnd = "1500000") => ({
      version,
      effectiveFrom: feb + "-01",
      name: "Future tuition terms",
      amountVnd,
      reason: "Verified future tuition terms for next billing period",
    });
    const runInput = (feePlanId: string, periodKey = jan) => ({
      feePlanId,
      periodKey,
      dueAt: periodKey + "-15T17:00:00Z",
    });
    async function create(name: string) {
      const r = await api("/fee-plans", "POST", baseInput(name));
      expect(r.status).toBe(201);
      return r.body.data;
    }
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash(),
        plan = await db.plan.findUniqueOrThrow({
          where: { code: "TEST_PLAN" },
        });
      for (const id of [tenant, foreign]) {
        await db.tenant.create({
          data: {
            id,
            slug: "fees-" + id,
            name: "Synthetic fee centre",
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
      for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
        const role = key === "backup" ? "owner" : key;
        await db.user.create({
          data: {
            id: ids[key],
            email: ids[key] + "@example.test",
            displayName: "Synthetic fee " + key,
            status: "ACTIVE",
            passwordHash,
          },
        });
        await db.membership.create({
          data: {
            tenantId: tenant,
            userId: ids[key],
            status: "ACTIVE",
            roles: { create: { role } },
          },
        });
        if (key === "backup") continue;
        const login = await api(
          "/mobile/auth/login",
          "POST",
          { email: ids[key] + "@example.test", password },
          "",
        );
        expect(login.status).toBe(200);
        const selected = await api(
          "/auth/switch-context",
          "POST",
          { tenantId: tenant, role },
          login.body.data.accessToken,
        );
        expect(selected.status).toBe(200);
        tokens[key] = selected.body.data.accessToken;
      }
      for (const [id, tenantId] of [
        [cls, tenant],
        [foreignClass, foreign],
      ])
        await db.educationClass.create({
          data: {
            id: id!,
            tenantId: tenantId!,
            code: "F" + id!.slice(0, 8),
            name: "Synthetic fee class",
            capacity: 20,
            status: "ACTIVE",
            startDate: new Date(jan + "-01Z"),
            endDate: new Date(`${year}-12-31Z`),
          },
        });
      await db.student.create({
        data: {
          id: student,
          tenantId: tenant,
          studentCode: "FEE-STUDENT",
          fullName: "Synthetic fee student",
        },
      });
      await db.enrollment.create({
        data: {
          tenantId: tenant,
          classId: cls,
          studentId: student,
          joinedAt: new Date(jan + "-01Z"),
        },
      });
    });
    it("lists minimal financial class options, validates exact money and enforces owner/accountant configuration scope", async () => {
      const options = await api(
        "/fee-plans/classes?search=Synthetic&limit=1",
        "GET",
        undefined,
        tokens.accountant,
      );
      expect(options.status).toBe(200);
      expect(options.body.data).toHaveLength(1);
      expect(Object.keys(options.body.data[0]).sort()).toEqual([
        "code",
        "id",
        "name",
      ]);
      const created = await api(
        "/fee-plans",
        "POST",
        baseInput("Fee directory primary"),
        tokens.accountant,
      );
      expect(created.status).toBe(201);
      primary = created.body.data.id;
      expect(created.body.data).toMatchObject({
        version: 1,
        amountVnd: "1000000",
        effectiveAmountVnd: "1000000",
      });
      const list = await api(
        `/fee-plans?search=Fee%20directory&classId=${cls}&limit=1`,
      );
      expect(list.status).toBe(200);
      expect(list.body.data.map((r: { id: string }) => r.id)).toEqual([
        primary,
      ]);
      expect(list.body.page.total).toBe(1);
      for (const key of [
        "manager",
        "academic_staff",
        "teacher",
        "guardian",
        "student",
      ] as const) {
        expect(
          (await api("/fee-plans", "GET", undefined, tokens[key])).status,
        ).toBe(403);
        expect(
          (await api("/fee-plans/classes", "GET", undefined, tokens[key]))
            .status,
        ).toBe(403);
        expect(
          (
            await api(
              "/fee-plans",
              "POST",
              baseInput("Denied plan"),
              tokens[key],
            )
          ).status,
        ).toBe(403);
        expect(
          (await api(`/fee-plans/${primary}`, "PATCH", term(1), tokens[key]))
            .status,
        ).toBe(403);
      }
      for (const amountVnd of ["-1", "1.5", "9223372036854775808"])
        expect(
          (
            await api("/fee-plans", "POST", {
              ...baseInput("Invalid amount"),
              amountVnd,
            })
          ).status,
        ).toBe(422);
      expect(
        (
          await api("/fee-plans", "POST", {
            ...baseInput("Foreign class"),
            classId: foreignClass,
          })
        ).status,
      ).toBe(404);
      const foreignPlan = await getDb().feePlan.create({
        data: {
          tenantId: foreign,
          classId: foreignClass,
          name: "Foreign fee",
          billingModel: "MONTHLY",
          amountVnd: 1n,
          validFrom: new Date(jan + "-01Z"),
        },
      });
      for (const route of [
        `/fee-plans/${foreignPlan.id}`,
        `/fee-plans/${foreignPlan.id}/terms`,
      ])
        expect((await api(route)).status).toBe(404);
      expect(
        (await api(`/fee-plans/${foreignPlan.id}`, "PATCH", term(1))).status,
      ).toBe(404);
      expect(
        (
          await api("/fee-plans", "POST", {
            ...baseInput("Zero tuition"),
            amountVnd: "0",
          })
        ).status,
      ).toBe(201);
      const closed = await getDb().educationClass.create({
        data: {
          tenantId: tenant,
          code: "CLOSED-FEE",
          name: "Closed financial class",
          capacity: 5,
          status: "CLOSED",
          startDate: new Date(jan + "-01Z"),
          endDate: new Date(`${year}-12-31Z`),
        },
      });
      expect((await api("/fee-plans/classes?search=Closed")).body.data).toEqual(
        [],
      );
      expect(
        (
          await api("/fee-plans/classes?search=Closed&includeClosed=true")
        ).body.data.map((r: { id: string }) => r.id),
      ).toEqual([closed.id]);
      expect(
        (await api("/fee-plans/classes?includeClosed=invalid")).status,
      ).toBe(422);
      expect(
        (
          await api("/fee-plans", "POST", {
            ...baseInput("Closed class denied"),
            classId: closed.id,
          })
        ).status,
      ).toBe(409);
    });
    it("keeps issued snapshots immutable while future revisions change only subsequent periods under the same billing key", async () => {
      const first = await api(
        "/invoices/generate-run",
        "POST",
        runInput(primary),
        tokens.owner,
        "fees-january-original",
      );
      expect(first.status).toBe(201);
      expect(first.body.data.invoices).toHaveLength(1);
      expect(first.body.data.invoices[0].totalAmountVnd).toBe("1000000");
      const id = first.body.data.invoices[0].id;
      expect(
        (await api(`/fee-plans/${primary}`, "PATCH", term(1))).status,
      ).toBe(200);
      const history = await api(`/fee-plans/${primary}/terms?limit=1`);
      expect(history.body.data[0]).toMatchObject({
        version: 2,
        effectiveFrom: feb + "-01",
        amountVnd: "1500000",
        actorUserId: ids.owner,
        actorDisplayName: "Synthetic fee owner",
      });
      expect(
        (
          await api(
            `/fee-plans/${primary}`,
            "PATCH",
            term(2, "1700000"),
            tokens.accountant,
          )
        ).status,
      ).toBe(200);
      const febRun = await api(
        "/invoices/generate-run",
        "POST",
        runInput(primary, feb),
        tokens.owner,
        "fees-february-revised",
      );
      expect(febRun.status).toBe(201);
      expect(febRun.body.data.invoices[0].totalAmountVnd).toBe("1700000");
      const retry = await api(
        "/invoices/generate-run",
        "POST",
        runInput(primary, feb),
        tokens.owner,
        "fees-february-new-key",
      );
      expect(retry.status).toBe(201);
      expect(retry.body.data.runId).toBe(febRun.body.data.runId);
      expect(
        await getDb().invoice.count({
          where: { tenantId: tenant, runId: febRun.body.data.runId },
        }),
      ).toBe(1);
      const replay = await api(
        "/invoices/generate-run",
        "POST",
        runInput(primary),
        tokens.owner,
        "fees-january-original",
      );
      expect(replay.body.data).toEqual(first.body.data);
      expect(
        (await getDb().invoice.findUniqueOrThrow({ where: { id } }))
          .totalAmountVnd,
      ).toBe(1000000n);
      expect(
        (
          await getDb().invoiceItem.findFirstOrThrow({
            where: { invoiceId: id },
          })
        ).description,
      ).toBe("Fee directory primary · " + jan);
      const futureItem = await getDb().invoiceItem.findFirstOrThrow({
        where: { invoiceId: febRun.body.data.invoices[0].id },
      });
      expect(futureItem.description).toBe("Future tuition terms · " + feb);
      expect((await api(`/fee-plans/${primary}`)).body.data).toMatchObject({
        amountVnd: "1000000",
        effectiveAmountVnd: "1000000",
        version: 3,
      });
      const row = await getDb().feePlanTerm.findFirstOrThrow({
        where: { feePlanId: primary },
      });
      await expect(
        getDb().feePlanTerm.update({
          where: { id: row.id },
          data: { amountVnd: 2n },
        }),
      ).rejects.toThrow();
      await expect(
        getDb().feePlanTerm.delete({ where: { id: row.id } }),
      ).rejects.toThrow();
      await expect(
        getDb().feePlan.update({
          where: { id: primary },
          data: { amountVnd: 2n },
        }),
      ).rejects.toThrow();
      await expect(
        getDb().feePlan.delete({ where: { id: primary } }),
      ).rejects.toThrow();
    });
    it("rejects stale revisions, past/mid-month terms, issued-course edits and read-only writes without changing history", async () => {
      const fee = await create("Concurrent future fee");
      const outcomes = await Promise.all([
        api(`/fee-plans/${fee.id}`, "PATCH", term(1, "10")),
        api(`/fee-plans/${fee.id}`, "PATCH", term(1, "20")),
      ]);
      expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await getDb().feePlanTerm.count({ where: { feePlanId: fee.id } }),
      ).toBe(1);
      for (const input of [
        { ...term(2), effectiveFrom: feb + "-02" },
        { ...term(2), effectiveFrom: "2000-01-01" },
        { ...term(2), reason: "          " },
        { ...term(2), effectiveFrom: `${year + 1}-01-01` },
      ])
        expect((await api(`/fee-plans/${fee.id}`, "PATCH", input)).status).toBe(
          422,
        );
      const course = await api("/fee-plans", "POST", {
        ...baseInput("Future whole course"),
        billingModel: "COURSE",
      });
      expect(course.status).toBe(201);
      expect(
        (
          await api(`/fee-plans/${course.body.data.id}`, "PATCH", {
            ...term(1),
            effectiveFrom: jan + "-01",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api(
            "/invoices/generate-run",
            "POST",
            runInput(course.body.data.id, "COURSE"),
            tokens.owner,
            "fees-course-issued",
          )
        ).status,
      ).toBe(422);
      const issued = await api(
        "/invoices/generate-run",
        "POST",
        {
          feePlanId: course.body.data.id,
          periodKey: "COURSE",
          dueAt: jan + "-15T17:00:00Z",
        },
        tokens.owner,
        "fees-course-valid-issue",
      );
      expect(issued.status).toBe(201);
      expect(issued.body.data.invoices[0].totalAmountVnd).toBe("1500000");
      expect(
        (
          await api(`/fee-plans/${course.body.data.id}`, "PATCH", {
            ...term(2),
            effectiveFrom: jan + "-01",
          })
        ).status,
      ).toBe(409);
      await getDb().tenant.update({
        where: { id: tenant },
        data: { status: "READ_ONLY" },
      });
      try {
        expect((await api(`/fee-plans/${fee.id}`)).status).toBe(200);
        expect(
          (await api(`/fee-plans/${fee.id}`, "PATCH", term(2))).status,
        ).toBe(403);
        expect(
          (await api("/fee-plans", "POST", baseInput("Read only denied")))
            .status,
        ).toBe(403);
      } finally {
        await getDb().tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("rechecks live owner rights after waiting on fee creation, future terms, invoice run, payment, void and reversal", async () => {
      const db = getDb(),
        fee = await create("Waiting fee"),
        run = await api(
          "/invoices/generate-run",
          "POST",
          runInput(fee.id),
          tokens.owner,
          "fees-waiting-invoice",
        );
      expect(run.status).toBe(201);
      const invoice = run.body.data.invoices[0];
      const paymentInput = {
        studentId: student,
        method: "CASH",
        receivedAmountVnd: "10",
        receivedAt: new Date().toISOString(),
        allocations: [{ invoiceId: invoice.id, amountVnd: "10" }],
      };
      const payment = await api(
        "/payments",
        "POST",
        paymentInput,
        tokens.owner,
        "fees-waiting-payment",
      );
      expect(payment.status).toBe(201);
      const member = await db.membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: tenant, userId: ids.owner } },
      });
      const counts = {
        terms: await db.feePlanTerm.count({ where: { tenantId: tenant } }),
        runs: await db.invoiceRun.count({ where: { tenantId: tenant } }),
        payments: await db.payment.count({ where: { tenantId: tenant } }),
      };
      for (const [route, method, body, key] of [
        ["/fee-plans", "POST", baseInput("Denied waiting fee"), undefined],
        [`/fee-plans/${fee.id}`, "PATCH", term(1), undefined],
        [
          "/invoices/generate-run",
          "POST",
          runInput(fee.id, feb),
          "fees-denied-wait-run",
        ],
        ["/payments", "POST", paymentInput, "fees-denied-wait-payment"],
        [
          `/invoices/${invoice.id}/void`,
          "POST",
          { reason: "Denied waiting invoice void" },
          undefined,
        ],
        [
          `/payments/${payment.body.data.id}/reverse`,
          "POST",
          { reason: "Denied waiting payment reversal" },
          undefined,
        ],
      ] as const) {
        let pending: ReturnType<typeof api> | undefined;
        try {
          await db.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenant}::uuid FOR UPDATE`;
              pending = api(route, method, body, tokens.owner, key);
              await expect
                .poll(async () => {
                  const rows = await tx.$queryRaw<
                    { waiting: bigint }[]
                  >`SELECT count(*) AS waiting FROM pg_locks pending JOIN pg_locks held ON held.locktype=pending.locktype AND held.transactionid=pending.transactionid AND held.granted WHERE NOT pending.granted AND held.pid=pg_backend_pid()`;
                  return Number(rows[0]?.waiting ?? 0n);
                })
                .toBeGreaterThan(0);
              await tx.membership.update({
                where: { id: member.id },
                data: { status: "SUSPENDED", version: { increment: 1 } },
              });
            },
            { timeout: 10000 },
          );
          expect((await pending!).status).toBe(403);
        } finally {
          await db.membership.update({
            where: { id: member.id },
            data: { status: "ACTIVE", version: { increment: 1 } },
          });
        }
      }
      expect(
        await db.feePlan.count({
          where: { tenantId: tenant, name: "Denied waiting fee" },
        }),
      ).toBe(0);
      expect(await db.feePlanTerm.count({ where: { tenantId: tenant } })).toBe(
        counts.terms,
      );
      expect(await db.invoiceRun.count({ where: { tenantId: tenant } })).toBe(
        counts.runs,
      );
      expect(await db.payment.count({ where: { tenantId: tenant } })).toBe(
        counts.payments,
      );
      expect(
        (
          await db.payment.findUniqueOrThrow({
            where: { id: payment.body.data.id },
          })
        ).status,
      ).toBe("CONFIRMED");
      expect(
        (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
          .billingState,
      ).toBe("ISSUED");
    });
  });
}
