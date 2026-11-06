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
    it("payment receipts preserve exact multi-invoice installments, original allocation history and actual actor snapshots", async () => {
      const fee1 = await create("Receipt first"),
        fee2 = await create("Receipt second");
      const first = await api(
        "/invoices/generate-run",
        "POST",
        runInput(fee1.id),
        tokens.accountant,
        randomUUID(),
      );
      const second = await api(
        "/invoices/generate-run",
        "POST",
        runInput(fee2.id),
        tokens.accountant,
        randomUUID(),
      );
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const invoice1 = first.body.data.invoices[0].id,
        invoice2 = second.body.data.invoices[0].id;
      const input = {
        studentId: student,
        method: "BANK_TRANSFER",
        receivedAmountVnd: "600000",
        receivedAt: jan + "-15T17:00:00Z",
        externalReference: "Receipt-private-reference",
        allocations: [
          { invoiceId: invoice1, amountVnd: "200000" },
          { invoiceId: invoice2, amountVnd: "300000" },
        ],
      };
      const key = randomUUID(),
        paid = await api("/payments", "POST", input, tokens.accountant, key);
      expect(paid.status).toBe(201);
      expect(
        (await api("/payments", "POST", input, tokens.accountant, key)).body
          .data,
      ).toEqual(paid.body.data);
      expect(
        (
          await api(
            "/payments",
            "POST",
            { ...input, receivedAmountVnd: "700000" },
            tokens.accountant,
            key,
          )
        ).status,
      ).toBe(409);
      const id = paid.body.data.id,
        original = await api(`/payments/${id}`);
      expect(original.status).toBe(200);
      expect(original.body.data).toMatchObject({
        studentCode: "FEE-STUDENT",
        receivedBy: ids.accountant,
        receiverDisplayName: "Synthetic fee accountant",
        externalReference: input.externalReference,
        status: "CONFIRMED",
        receivedAmountVnd: "600000",
        unallocatedAmountVnd: "100000",
      });
      expect(
        original.body.data.invoiceBalances
          .map((i: { balanceVnd: string }) => i.balanceVnd)
          .sort(),
      ).toEqual(["700000", "800000"]);
      await getDb().user.update({
        where: { id: ids.accountant },
        data: { displayName: "Renamed accountant after receipt" },
      });
      expect((await api(`/payments/${id}`)).body.data.receiverDisplayName).toBe(
        "Synthetic fee accountant",
      );
      await getDb().user.update({
        where: { id: ids.accountant },
        data: { displayName: "Synthetic fee accountant" },
      });
      expect(
        (await api(`/payments/${id}/history?limit=1`)).body.data[0]
          .actorDisplayName,
      ).toBe("Synthetic fee accountant");
      const remaining = {
        ...input,
        method: "CASH",
        receivedAmountVnd: "1500000",
        allocations: [
          { invoiceId: invoice1, amountVnd: "800000" },
          { invoiceId: invoice2, amountVnd: "700000" },
        ],
      };
      expect(
        (
          await api(
            "/payments",
            "POST",
            remaining,
            tokens.accountant,
            randomUUID(),
          )
        ).status,
      ).toBe(201);
      expect(
        (await api(`/payments/${id}`)).body.data.invoiceBalances.every(
          (i: { balanceVnd: string }) => i.balanceVnd === "0",
        ),
      ).toBe(true);
      expect(
        (
          await api(
            `/payments/${id}/reverse`,
            "POST",
            { reason: "            " },
            tokens.accountant,
          )
        ).status,
      ).toBe(422);
      const reason = "Verified full reversal of the initial partial payment";
      expect(
        (
          await api(
            `/payments/${id}/reverse`,
            "POST",
            { reason },
            tokens.accountant,
          )
        ).status,
      ).toBe(201);
      const reversed = (await api(`/payments/${id}`)).body.data;
      expect(reversed).toMatchObject({
        status: "REVERSED",
        reversalReason: reason,
        reversalActorName: "Synthetic fee accountant",
      });
      expect(
        reversed.invoiceBalances
          .map((i: { balanceVnd: string }) => i.balanceVnd)
          .sort(),
      ).toEqual(["200000", "300000"]);
      expect(reversed.allocations).toEqual(original.body.data.allocations);
      expect(
        (await api(`/payments/${id}/history?limit=1&page=1`)).body.page,
      ).toMatchObject({ total: 2, totalPages: 2 });
      expect(
        (await api(`/payments/${id}/history?limit=1&page=2`)).body.data[0]
          .action,
      ).toBe("payment.recorded");
      expect(
        (
          await api(
            `/payments/${id}/reverse`,
            "POST",
            { reason },
            tokens.accountant,
          )
        ).status,
      ).toBe(409);
      expect(
        await getDb().paymentAllocation.count({ where: { paymentId: id } }),
      ).toBe(2);
      expect(
        (
          await api(
            `/payments?search=FEE-STUDENT&status=REVERSED&method=BANK_TRANSFER&from=${jan}-16&to=${jan}-16`,
          )
        ).body.data.map((p: { id: string }) => p.id),
      ).toContain(id);
      expect(
        (
          await api(
            `/payments?search=${original.body.data.receiptNo}&to=${jan}-15`,
          )
        ).body.data,
      ).toEqual([]);
      expect((await api(`/payments?from=${jan}-16&to=${jan}-15`)).status).toBe(
        422,
      );
    });
    it("payment reads redact internal references and reversal actors for verified guardians and deny foreign or teaching history", async () => {
      const db = getDb();
      const p = await db.payment.create({
        data: {
          tenantId: tenant,
          studentId: student,
          receiptNo: "LEGACY-" + randomUUID(),
          method: "CASH",
          receivedAmountVnd: 9007199254740993n,
          receivedAt: new Date(jan + "-15T17:00:00Z"),
          receivedBy: ids.owner,
          externalReference: "Private legacy reference",
        },
      });
      const staff = await api(`/payments/${p.id}`);
      expect(staff.body.data.receivedAmountVnd).toBe("9007199254740993");
      expect(staff.body.data.receiverDisplayName).toBeNull();
      expect(
        (await api(`/payments/${p.id}`, "GET", undefined, tokens.guardian))
          .status,
      ).toBe(404);
      const link = await db.guardianLink.create({
        data: {
          tenantId: tenant,
          studentId: student,
          guardianUserId: ids.guardian,
          status: "ACTIVE",
          verifiedBy: ids.owner,
          verifiedAt: new Date(),
          verificationMethod: "Synthetic receipt scope verification",
        },
      });
      const guardian = await api(
        `/payments/${p.id}`,
        "GET",
        undefined,
        tokens.guardian,
      );
      expect(guardian.status).toBe(200);
      for (const field of [
        "externalReference",
        "receivedBy",
        "receiverDisplayName",
        "reversalReason",
        "reversalActorName",
        "reversedAt",
      ])
        expect(guardian.body.data[field]).toBeNull();
      expect(
        (
          await api(
            `/payments/${p.id}/history`,
            "GET",
            undefined,
            tokens.guardian,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(
            `/mobile/guardian/students/${student}/payments?studentId=${randomUUID()}`,
            "GET",
            undefined,
            tokens.guardian,
          )
        ).body.data.map((r: { id: string }) => r.id),
      ).toContain(p.id);
      await db.guardianLink.update({
        where: { id: link.id },
        data: { status: "REVOKED" },
      });
      expect(
        (await api(`/payments/${p.id}`, "GET", undefined, tokens.guardian))
          .status,
      ).toBe(404);
      for (const role of ["teacher", "academic_staff", "student"] as const) {
        expect(
          (await api(`/payments/${p.id}`, "GET", undefined, tokens[role]))
            .status,
        ).toBe(403);
        expect(
          (
            await api(
              `/payments/${p.id}/history`,
              "GET",
              undefined,
              tokens[role],
            )
          ).status,
        ).toBe(403);
      }
      expect((await api(`/payments/${randomUUID()}`)).status).toBe(404);
      expect((await api(`/payments/${randomUUID()}/history`)).status).toBe(404);
      const foreignActor = await db.user.create({
        data: {
          email: randomUUID() + "@example.test",
          displayName: "Foreign receipt actor",
          status: "ACTIVE",
        },
      });
      await db.membership.create({
        data: {
          tenantId: foreign,
          userId: foreignActor.id,
          status: "ACTIVE",
          roles: { create: { role: "owner" } },
        },
      });
      const foreignStudent = await db.student.create({
        data: {
          tenantId: foreign,
          studentCode: "FOREIGN-RECEIPT",
          fullName: "Foreign receipt learner",
        },
      });
      const foreignReceipt = await db.payment.create({
        data: {
          tenantId: foreign,
          studentId: foreignStudent.id,
          receiptNo: "FOREIGN-RECEIPT",
          method: "CASH",
          receivedAmountVnd: 1n,
          receivedAt: new Date(),
          receivedBy: foreignActor.id,
        },
      });
      expect((await api(`/payments/${foreignReceipt.id}`)).status).toBe(404);
      expect((await api(`/payments/${foreignReceipt.id}/history`)).status).toBe(
        404,
      );
      expect((await api(`/payments?search=FOREIGN-RECEIPT`)).body.data).toEqual(
        [],
      );
      expect(
        (await api(`/payments/${p.id}`, "GET", undefined, tokens.manager))
          .status,
      ).toBe(200);
      expect(
        (
          await api(
            `/payments/${p.id}/reverse`,
            "POST",
            { reason: "Manager must not reverse a payment" },
            tokens.manager,
          )
        ).status,
      ).toBe(403);
      expect((await api("/payments?method=UNSAFE")).status).toBe(422);
      expect((await api("/payments?search=%25")).body.data).toEqual([]);
    });
    it("invoice administration previews exact intersected eligibility without billing writes and rejects a changed preview atomically", async () => {
      const db = getDb(),
        scopedClass = await db.educationClass.create({
          data: {
            tenantId: tenant,
            code: "PREVIEW",
            name: "Invoice preview class",
            capacity: 20,
            status: "ACTIVE",
            startDate: new Date(jan + "-01Z"),
            endDate: new Date(`${year}-12-31Z`),
          },
        });
      const students = [];
      for (const [code, joined, left] of [
        ["LEFT", "01", "09"],
        ["VALID", "10", "20"],
        ["AFTER", "21", null],
      ] as const) {
        const s = await db.student.create({
          data: {
            tenantId: tenant,
            studentCode: code,
            fullName: "Preview " + code,
          },
        });
        students.push(s);
        await db.enrollment.create({
          data: {
            tenantId: tenant,
            classId: scopedClass.id,
            studentId: s.id,
            joinedAt: new Date(jan + "-" + joined + "Z"),
            ...(left
              ? {
                  leftAt: new Date(jan + "-" + left + "Z"),
                  status: "WITHDRAWN",
                }
              : {}),
          },
        });
      }
      const fee = await api("/fee-plans", "POST", {
        ...baseInput("Intersected invoice fee"),
        classId: scopedClass.id,
        amountVnd: "9007199254740993",
        validFrom: jan + "-10",
        validTo: jan + "-20",
      });
      expect(fee.status).toBe(201);
      const input = runInput(fee.body.data.id);
      const count = async () => ({
        runs: await db.invoiceRun.count({ where: { tenantId: tenant } }),
        invoices: await db.invoice.count({ where: { tenantId: tenant } }),
        items: await db.invoiceItem.count({ where: { tenantId: tenant } }),
        outbox: await db.outboxEvent.count({ where: { tenantId: tenant } }),
        audit: await db.auditLog.count({ where: { tenantId: tenant } }),
        keys: await db.idempotencyRecord.count({ where: { tenantId: tenant } }),
      });
      const before = await count();
      const preview = await api(
        "/invoices/preview-run?limit=1",
        "POST",
        input,
        tokens.accountant,
      );
      expect(preview.status).toBe(201);
      expect(preview.body.data).toMatchObject({
        eligibleCount: 1,
        totalAmountVnd: "9007199254740993",
        existingRunId: null,
      });
      expect(
        preview.body.data.students.map(
          (s: { studentId: string }) => s.studentId,
        ),
      ).toEqual([students[1]!.id]);
      expect(await count()).toEqual(before);
      const added = await db.student.create({
        data: {
          tenantId: tenant,
          studentCode: "ADDED",
          fullName: "Added after preview",
        },
      });
      await db.enrollment.create({
        data: {
          tenantId: tenant,
          classId: scopedClass.id,
          studentId: added.id,
          joinedAt: new Date(jan + "-15Z"),
        },
      });
      const stale = await api(
        "/invoices/generate-run",
        "POST",
        { ...input, previewFingerprint: preview.body.data.fingerprint },
        tokens.accountant,
        "invoice-stale-preview",
      );
      expect(stale.status).toBe(409);
      expect(await count()).toEqual(before);
      const fresh = await api(
        "/invoices/preview-run?limit=1&page=2",
        "POST",
        input,
      );
      expect(fresh.body.data).toMatchObject({
        eligibleCount: 2,
        totalAmountVnd: "18014398509481986",
      });
      expect(fresh.body.data.students).toHaveLength(1);
      const body = {
        ...input,
        previewFingerprint: fresh.body.data.fingerprint,
      };
      const generated = await api(
        "/invoices/generate-run",
        "POST",
        body,
        tokens.owner,
        "invoice-confirmed-preview",
      );
      expect(generated.status).toBe(201);
      expect(generated.body.data.invoices).toHaveLength(2);
      expect(
        generated.body.data.invoices.every(
          (i: { totalAmountVnd: string }) =>
            i.totalAmountVnd === "9007199254740993",
        ),
      ).toBe(true);
      expect(
        (
          await api(
            "/invoices/generate-run",
            "POST",
            body,
            tokens.owner,
            "invoice-confirmed-preview",
          )
        ).body.data,
      ).toEqual(generated.body.data);
      const duplicate = await api(
        "/invoices/generate-run",
        "POST",
        input,
        tokens.owner,
        "invoice-business-retry",
      );
      expect(duplicate.status).toBe(201);
      expect(duplicate.body.data.runId).toBe(generated.body.data.runId);
      expect(
        (await api("/invoices/preview-run", "POST", input)).body.data
          .existingRunId,
      ).toBe(generated.body.data.runId);
      const invoice = generated.body.data.invoices[0];
      const filtered = await api(
        `/invoices?classId=${scopedClass.id}&periodKey=${jan}&paymentStatus=UNPAID&limit=1`,
      );
      expect(filtered.status).toBe(200);
      expect(filtered.body.page.total).toBe(2);
      expect(filtered.body.data).toHaveLength(1);
      expect(filtered.body.data[0]).toMatchObject({
        classId: scopedClass.id,
        feePlanId: fee.body.data.id,
        totalAmountVnd: "9007199254740993",
        periodKey: jan,
      });
      expect((await api(`/invoices/${invoice.id}`)).body.data).toMatchObject({
        itemsCount: 1,
        voidReason: null,
      });
      expect(
        (await api(`/invoices/${invoice.id}/items`)).body.data[0],
      ).toMatchObject({
        description: "Intersected invoice fee · " + jan,
        totalAmountVnd: "9007199254740993",
      });
      expect(
        (await api(`/invoices/${invoice.id}/history`)).body.data[0],
      ).toMatchObject({
        action: "invoice.run.generated",
        actorUserId: ids.owner,
        actorDisplayName: "Synthetic fee owner",
      });
      expect(
        (
          await api(`/invoices/${invoice.id}/void`, "POST", {
            reason: "             ",
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await api(`/invoices/${invoice.id}/void`, "POST", {
            reason: "Invoice cancelled after checked correction",
          })
        ).status,
      ).toBe(201);
      expect(
        (await api(`/invoices?classId=${scopedClass.id}&paymentStatus=VOID`))
          .body.page.total,
      ).toBe(1);
      // End-of-day Vietnam boundary: 16:59:59.999Z belongs to the15th,
      // 17:00:00Z belongs to the16th. The original test dueAt is17:00Z.
      expect(
        (
          await api(
            `/invoices?classId=${scopedClass.id}&from=${jan}-15&to=${jan}-15`,
          )
        ).body.page.total,
      ).toBe(0);
      expect(
        (
          await api(
            `/invoices?classId=${scopedClass.id}&from=${jan}-16&to=${jan}-16`,
          )
        ).body.page.total,
      ).toBe(2);
      expect(
        (await api(`/invoices?classId=${foreignClass}`)).body.page.total,
      ).toBe(0);
      expect(
        (
          await api("/invoices/preview-run", "POST", {
            ...input,
            feePlanId: randomUUID(),
          })
        ).status,
      ).toBe(404);
      for (const route of ["items", "history"]) {
        expect((await api(`/invoices/${randomUUID()}/${route}`)).status).toBe(
          404,
        );
      }
      expect(
        (await api(`/invoices/${invoice.id}/history`)).body.data.some(
          (h: { action: string }) => h.action === "invoice.voided",
        ),
      ).toBe(true);
      expect(
        (await api("/invoices?from=2027-12-01&to=2027-11-01")).status,
      ).toBe(422);
      for (const role of [
        "teacher",
        "student",
        "guardian",
        "academic_staff",
      ] as const) {
        expect(
          (await api("/invoices/preview-run", "POST", input, tokens[role]))
            .status,
        ).toBe(403);
        expect(
          (
            await api(
              `/invoices/${invoice.id}/items`,
              "GET",
              undefined,
              tokens[role],
            )
          ).status,
        ).toBe(403);
      }
    });
    it("invoice preview rate limits fresh operations without blocking an idempotent committed replay", async () => {
      const fee = await create("Rate limited invoice plan"),
        input = runInput(fee.id);
      await getDb().financeOperationLimit.upsert({
        where: {
          tenantId_userId_operation: {
            tenantId: tenant,
            userId: ids.owner,
            operation: "INVOICE_PREVIEW",
          },
        },
        create: {
          tenantId: tenant,
          userId: ids.owner,
          operation: "INVOICE_PREVIEW",
          attempts: 30,
          windowStart: new Date(),
        },
        update: { attempts: 30, windowStart: new Date() },
      });
      try {
        expect((await api("/invoices/preview-run", "POST", input)).status).toBe(
          429,
        );
      } finally {
        await getDb().financeOperationLimit.delete({
          where: {
            tenantId_userId_operation: {
              tenantId: tenant,
              userId: ids.owner,
              operation: "INVOICE_PREVIEW",
            },
          },
        });
      }
      const generated = await api(
        "/invoices/generate-run",
        "POST",
        input,
        tokens.owner,
        "invoice-rate-replay",
      );
      expect(generated.status).toBe(201);
      await getDb().financeOperationLimit.update({
        where: {
          tenantId_userId_operation: {
            tenantId: tenant,
            userId: ids.owner,
            operation: "INVOICE_GENERATE",
          },
        },
        data: { attempts: 30, windowStart: new Date() },
      });
      try {
        expect(
          (
            await api(
              "/invoices/generate-run",
              "POST",
              input,
              tokens.owner,
              "invoice-rate-replay",
            )
          ).body.data,
        ).toEqual(generated.body.data);
        expect(
          (
            await api(
              "/invoices/generate-run",
              "POST",
              runInput(fee.id, feb),
              tokens.owner,
              "invoice-rate-denied",
            )
          ).status,
        ).toBe(429);
      } finally {
        await getDb().financeOperationLimit.delete({
          where: {
            tenantId_userId_operation: {
              tenantId: tenant,
              userId: ids.owner,
              operation: "INVOICE_GENERATE",
            },
          },
        });
      }
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
        ["/invoices/preview-run", "POST", runInput(fee.id, feb), undefined],
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
