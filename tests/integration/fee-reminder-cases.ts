import { createRequire } from "node:module";
import path from "node:path";
import { redisConnection } from "../../apps/worker/src/redis";
import { testRedisUrl } from "../../tooling/test-redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Role } from "@prisma/client";
import { calendarDayRange } from "../../packages/contracts/src/calendar-time";

export function feeReminderCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("fixed tuition reminder P0 against actual API PostgreSQL and worker", () => {
    const policyVersion = "synthetic-fee-reminders-v1",
      saved: Record<string, string | undefined> = {};
    const now = new Date("2030-11-03T14:00:00Z");
    beforeAll(() => {
      for (const key of [
        "PRIVACY_POLICY_VERSION",
        "PRIVACY_NOTICE_URL",
        "PUSH_PROVIDER",
      ])
        saved[key] = process.env[key];
      process.env.PRIVACY_POLICY_VERSION = policyVersion;
      process.env.PRIVACY_NOTICE_URL =
        "https://example.test/synthetic-reminder-policy";
      process.env.PUSH_PROVIDER = "expo";
    });
    afterAll(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    async function api(
      path: string,
      method = "GET",
      body?: unknown,
      token = "",
      key?: string,
    ) {
      const r = await fetch(getBase() + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    }
    async function fixture() {
      const db = getDb(),
        stamp = randomUUID(),
        passwordHash = await hash();
      const tenant = await db.tenant.create({
        data: {
          slug: "reminder-" + stamp,
          name: "Synthetic reminder centre",
          timezone: "America/New_York",
          status: "ACTIVE",
          subscriptionEndsAt: new Date("2040-01-01Z"),
          graceUntil: new Date("2040-02-01Z"),
        },
      });
      const plan = await db.plan.findUniqueOrThrow({
        where: { code: "TEST_PLAN" },
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
          email: "reminder-owner-" + stamp + "@example.test",
          displayName: "Synthetic reminder owner",
          status: "ACTIVE",
          passwordHash,
        },
      });
      const operator = await db.user.create({
        data: {
          email: "reminder-operator-" + stamp + "@example.test",
          displayName: "Synthetic multi-role operator",
          status: "ACTIVE",
          passwordHash,
        },
      });
      const guardian = await db.user.create({
        data: {
          email: "reminder-guardian-" + stamp + "@example.test",
          displayName: "Synthetic reminder guardian",
          status: "ACTIVE",
          passwordHash,
        },
      });
      await db.membership.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          status: "ACTIVE",
          roles: { create: { role: "owner" } },
        },
      });
      const member = await db.membership.create({
        data: {
          tenantId: tenant.id,
          userId: operator.id,
          status: "ACTIVE",
          roles: {
            create: (
              [
                "owner",
                "accountant",
                "manager",
                "academic_staff",
                "teacher",
                "student",
                "guardian",
              ] as const
            ).map((role) => ({ role })),
          },
        },
      });
      const guardianMember = await db.membership.create({
        data: {
          tenantId: tenant.id,
          userId: guardian.id,
          status: "ACTIVE",
          roles: { create: { role: "guardian" } },
        },
      });
      async function token(user = owner, role: Role = "owner") {
        const login = await api("/mobile/auth/login", "POST", {
          email: user.email,
          password,
        });
        expect(login.status).toBe(200);
        const r = await api(
          "/auth/switch-context",
          "POST",
          { tenantId: tenant.id, role },
          login.body.data.accessToken,
        );
        expect(r.status).toBe(200);
        return r.body.data.accessToken as string;
      }
      const ownerToken = await token(),
        guardianToken = await token(guardian, "guardian");
      const student = await db.student.create({
        data: {
          tenantId: tenant.id,
          studentCode: "REM-" + stamp.slice(0, 8),
          fullName: "Synthetic reminder child",
        },
      });
      const link = await db.guardianLink.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          guardianUserId: guardian.id,
          status: "ACTIVE",
          verifiedBy: owner.id,
          verifiedAt: new Date(),
        },
      });
      const cls = await db.educationClass.create({
        data: {
          tenantId: tenant.id,
          code: "R" + stamp.slice(0, 8),
          name: "Synthetic reminder class",
          capacity: 20,
          status: "ACTIVE",
          startDate: new Date("2020-01-01Z"),
          endDate: new Date("2040-01-01Z"),
        },
      });
      async function consent(granted = true) {
        const r = await api(
          "/privacy/consents",
          "POST",
          {
            policyVersion,
            purposeCode: "NOTIFICATIONS",
            granted,
            subjectStudentId: student.id,
          },
          guardianToken,
        );
        expect(r.status).toBe(201);
        return r.body.data;
      }
      await consent();
      async function invoice(
        dueDay = "2030-11-06",
        issuedAt = new Date("2030-11-03T13:00:00Z"),
      ) {
        return db.$transaction(async (tx) => {
          const fee = await tx.feePlan.create({
            data: {
              tenantId: tenant.id,
              classId: cls.id,
              name: "Synthetic reminder fee",
              billingModel: "MONTHLY",
              amountVnd: 100000n,
              validFrom: new Date("2020-01-01Z"),
            },
          });
          const run = await tx.invoiceRun.create({
            data: {
              tenantId: tenant.id,
              feePlanId: fee.id,
              periodKey: "2030-11",
              requestHash: "a".repeat(64),
              createdBy: owner.id,
            },
          });
          const row = await tx.invoice.create({
            data: {
              tenantId: tenant.id,
              studentId: student.id,
              runId: run.id,
              invoiceNo: "REM-" + randomUUID(),
              issuedAt,
              dueAt: new Date(
                calendarDayRange(dueDay, tenant.timezone).end.getTime() - 1,
              ),
              totalAmountVnd: 100000n,
              createdBy: owner.id,
            },
          });
          await tx.invoiceItem.create({
            data: {
              tenantId: tenant.id,
              invoiceId: row.id,
              feePlanId: fee.id,
              description: fee.name,
              totalAmountVnd: 100000n,
            },
          });
          return row;
        });
      }
      async function bulkInvoices(count: number) {
        const rows = Array.from({ length: count }, () => ({
          fee: randomUUID(),
          run: randomUUID(),
          invoice: randomUUID(),
          item: randomUUID(),
        }));
        await db.$transaction(async (tx) => {
          await tx.feePlan.createMany({
            data: rows.map((r) => ({
              id: r.fee,
              tenantId: tenant.id,
              classId: cls.id,
              name: "Synthetic keyset page fee",
              billingModel: "MONTHLY",
              amountVnd: 100000n,
              validFrom: new Date("2020-01-01Z"),
            })),
          });
          await tx.invoiceRun.createMany({
            data: rows.map((r) => ({
              id: r.run,
              tenantId: tenant.id,
              feePlanId: r.fee,
              periodKey: "2030-11",
              requestHash: "a".repeat(64),
              createdBy: owner.id,
            })),
          });
          await tx.invoice.createMany({
            data: rows.map((r) => ({
              id: r.invoice,
              tenantId: tenant.id,
              studentId: student.id,
              runId: r.run,
              invoiceNo: "REM-BULK-" + r.invoice,
              issuedAt: new Date("2030-11-03T13:00:00Z"),
              dueAt: new Date("2030-11-07T04:59:59Z"),
              totalAmountVnd: 100000n,
              createdBy: owner.id,
            })),
          });
          await tx.invoiceItem.createMany({
            data: rows.map((r) => ({
              id: r.item,
              tenantId: tenant.id,
              invoiceId: r.invoice,
              feePlanId: r.fee,
              description: "Synthetic complete child batch",
              totalAmountVnd: 100000n,
            })),
          });
        });
        return rows.map((r) => r.invoice);
      }
      async function enable(enabled = true, version = 0, t = ownerToken) {
        return api(
          "/finance/reminder-policy",
          "PATCH",
          {
            version,
            enabled,
            confirmed: true,
            reason: "Synthetic reviewed fixed reminder policy",
            approvalRef: "SYNTHETIC-OWNER-REVIEW",
          },
          t,
        );
      }
      async function hold(
        invoiceId: string,
        held = true,
        version = 0,
        category = "MANUAL",
        t = ownerToken,
      ) {
        return api(
          `/invoices/${invoiceId}/reminder-hold`,
          "PATCH",
          {
            version,
            held,
            confirmed: true,
            ...(held ? { category } : {}),
            reason: "Synthetic reconciliation reminder hold",
          },
          t,
        );
      }
      const jobs = await import("../../apps/worker/dist/fee-reminder-jobs.js");
      const generate = (time = now) =>
        jobs.generateFeeReminderTenant(db, tenant.id, () => time);
      async function event() {
        return db.outboxEvent.findFirstOrThrow({
          where: { tenantId: tenant.id, eventType: "FEE_REMINDER" },
          orderBy: { createdAt: "desc" },
        });
      }
      async function register() {
        expect(
          (
            await api(
              "/me/notification-preferences",
              "PATCH",
              {
                pushEnabled: true,
                attendance: true,
                grades: true,
                finance: true,
                schedule: true,
              },
              guardianToken,
            )
          ).status,
        ).toBe(200);
        const r = await api(
          "/mobile/devices/push-token",
          "POST",
          {
            token: "ExpoPushToken[reminder-" + randomUUID() + "]",
            platform: "android",
          },
          guardianToken,
        );
        expect(r.status).toBe(201);
      }
      async function pay(invoiceId: string, amount = "100000") {
        return api(
          "/payments",
          "POST",
          {
            studentId: student.id,
            method: "BANK_TRANSFER",
            receivedAmountVnd: amount,
            receivedAt: new Date().toISOString(),
            allocations: [{ invoiceId, amountVnd: amount }],
          },
          ownerToken,
          randomUUID(),
        );
      }
      return {
        db,
        tenant,
        owner,
        operator,
        guardian,
        member,
        guardianMember,
        student,
        link,
        ownerToken,
        guardianToken,
        token,
        invoice,
        bulkInvoices,
        enable,
        hold,
        generate,
        event,
        consent,
        register,
        pay,
      };
    }
    it("starts disabled without GET writes or automatic stages and requires concrete owner confirmation", async () => {
      const f = await fixture();
      await f.invoice();
      const r = await api(
        "/finance/reminder-policy",
        "GET",
        undefined,
        f.ownerToken,
      );
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({
        enabled: false,
        version: 0,
        timezone: "America/New_York",
        preset: {
          localStart: "09:00",
          localEnd: "09:15",
          maxStagesPerInvoice: 3,
          offsets: [-3, 1, 7],
          catchUp: false,
        },
      });
      expect(
        await f.db.feeReminderPolicy.count({
          where: { tenantId: f.tenant.id },
        }),
      ).toBe(0);
      expect(await f.generate()).toEqual({ batches: 0, stages: 0 });
      for (const body of [
        {
          version: 0,
          enabled: true,
          confirmed: false,
          reason: "Reviewed schedule",
          approvalRef: "SYNTHETIC",
        },
        {
          version: 0,
          enabled: true,
          confirmed: true,
          reason: "Reviewed schedule",
        },
      ])
        expect(
          (await api("/finance/reminder-policy", "PATCH", body, f.ownerToken))
            .status,
        ).toBe(422);
      expect((await f.enable()).status).toBe(200);
      const p = await api(
        "/finance/reminder-policy",
        "GET",
        undefined,
        f.ownerToken,
      );
      expect(p.body.data).toMatchObject({
        version: 1,
        enabled: true,
        approvedBy: f.owner.id,
        approvalRef: "SYNTHETIC-OWNER-REVIEW",
      });
      expect(Date.parse(p.body.data.approvedAt)).toBeGreaterThan(
        Date.now() - 30000,
      );
    });
    it("keeps selected accountant read/hold rights separate from separately held owner configuration", async () => {
      const f = await fixture(),
        i = await f.invoice(),
        t = await f.token(f.operator, "accountant");
      expect(
        (await api("/finance/reminder-policy", "GET", undefined, t)).status,
      ).toBe(200);
      expect((await f.enable(true, 0, t)).status).toBe(403);
      expect(
        (await f.hold(i.id, true, 0, "PENDING_RECONCILIATION", t)).status,
      ).toBe(200);
    });
    for (const role of [
      "manager",
      "academic_staff",
      "teacher",
      "student",
      "guardian",
    ] as const)
      it(`denies ${role} reminder policy, hold and history despite other held roles`, async () => {
        const f = await fixture(),
          i = await f.invoice(),
          t = await f.token(f.operator, role);
        for (const path of [
          "/finance/reminder-policy",
          "/finance/reminder-policy/history",
          `/invoices/${i.id}/reminders`,
        ])
          expect((await api(path, "GET", undefined, t)).status).toBe(403);
        expect((await f.enable(true, 0, t)).status).toBe(403);
        expect((await f.hold(i.id, true, 0, "MANUAL", t)).status).toBe(403);
      });
    it("retains versioned policy and hold history, rejects stale edits and keeps invoice bytes immutable", async () => {
      const f = await fixture(),
        i = await f.invoice();
      expect((await f.enable()).status).toBe(200);
      expect((await f.enable(false, 0)).status).toBe(409);
      expect((await f.enable(false, 1)).status).toBe(200);
      expect((await f.hold(i.id)).status).toBe(200);
      expect((await f.hold(i.id, false, 0)).status).toBe(409);
      expect((await f.hold(i.id, false, 1)).status).toBe(200);
      const p = await api(
        "/finance/reminder-policy/history?limit=1&page=1",
        "GET",
        undefined,
        f.ownerToken,
      );
      expect(p.status).toBe(200);
      expect(p.body.page).toMatchObject({ total: 2, totalPages: 2 });
      expect(p.body.data[0]).toMatchObject({
        version: 2,
        enabled: false,
        actorId: f.owner.id,
      });
      const h = await api(
        `/invoices/${i.id}/reminders?limit=1&page=2`,
        "GET",
        undefined,
        f.ownerToken,
      );
      expect(h.status).toBe(200);
      expect(h.body.data).toMatchObject({
        held: false,
        version: 2,
        page: { total: 2 },
      });
      expect(h.body.data.events[0]).toMatchObject({
        version: 1,
        held: true,
        category: "MANUAL",
      });
      expect(
        await f.db.invoice.findUniqueOrThrow({ where: { id: i.id } }),
      ).toEqual(i);
    });
    it("batches multiple eligible invoices and stages into one child/day event and survives racing restarts", async () => {
      const f = await fixture();
      await f.invoice();
      await f.invoice("2030-11-02");
      await f.invoice("2030-10-27");
      expect((await f.enable()).status).toBe(200);
      const results = await Promise.all([f.generate(), f.generate()]);
      expect(results.reduce((sum, r) => sum + r.stages, 0)).toBe(3);
      expect(results.reduce((sum, r) => sum + r.batches, 0)).toBe(1);
      expect(await f.generate()).toEqual({ batches: 0, stages: 0 });
      const rows = await f.db.feeReminderStage.findMany({
        where: { tenantId: f.tenant.id },
      });
      expect(rows.map((r) => r.stage).sort()).toEqual([
        "AFTER_1",
        "AFTER_7",
        "BEFORE_3",
      ]);
      expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
      expect(
        await f.db.outboxEvent.count({
          where: { tenantId: f.tenant.id, eventType: "FEE_REMINDER" },
        }),
      ).toBe(1);
      expect((await f.event()).payload).toEqual({});
    });
    it("bounds every invoice to three durable stages across policy pause/resume and later dates", async () => {
      const f = await fixture(),
        i = await f.invoice();
      expect((await f.enable()).status).toBe(200);
      for (const day of ["2030-11-03", "2030-11-07", "2030-11-13"])
        expect((await f.generate(new Date(day + "T14:00:00Z"))).stages).toBe(1);
      expect((await f.enable(false, 1)).status).toBe(200);
      expect((await f.enable(true, 2)).status).toBe(200);
      expect(await f.generate()).toEqual({ batches: 0, stages: 0 });
      expect((await f.generate(new Date("2030-11-20T14:00:00Z"))).stages).toBe(
        0,
      );
      expect(
        await f.db.feeReminderStage.count({
          where: { tenantId: f.tenant.id, invoiceId: i.id },
        }),
      ).toBe(3);
    });
    it("does not catch up before or after the local window and ignores late-issued invoices", async () => {
      const f = await fixture();
      await f.invoice();
      await f.invoice("2030-11-06", new Date("2030-11-03T14:01:00Z"));
      expect((await f.enable()).status).toBe(200);
      expect(
        (await f.generate(new Date("2030-11-03T13:59:59.999Z"))).stages,
      ).toBe(0);
      expect((await f.generate(new Date("2030-11-03T14:15:00Z"))).stages).toBe(
        0,
      );
      expect((await f.generate()).stages).toBe(1);
    });
    it("skips activation after the day's09:00 window instead of enrolling historical stages", async () => {
      const f = await fixture();
      await f.invoice();
      expect((await f.enable()).status).toBe(200);
      await f.db.feeReminderPolicy.update({
        where: { tenantId: f.tenant.id },
        data: { version: 2, enabledSince: new Date("2030-11-03T14:01:00Z") },
      });
      expect((await f.generate(new Date("2030-11-03T14:02:00Z"))).stages).toBe(
        0,
      );
    });
    it("requires current notification consent, finance preference and an active verified guardian link", async () => {
      const f = await fixture();
      await f.invoice();
      expect((await f.enable()).status).toBe(200);
      await f.consent(false);
      expect((await f.generate()).stages).toBe(0);
      await f.consent();
      await f.db.notificationPreference.upsert({
        where: {
          tenantId_userId: { tenantId: f.tenant.id, userId: f.guardian.id },
        },
        create: {
          tenantId: f.tenant.id,
          userId: f.guardian.id,
          finance: false,
        },
        update: { finance: false },
      });
      expect((await f.generate()).stages).toBe(0);
      await f.db.notificationPreference.update({
        where: {
          tenantId_userId: { tenantId: f.tenant.id, userId: f.guardian.id },
        },
        data: { finance: true },
      });
      await f.db.guardianLink.update({
        where: { id: f.link.id },
        data: { status: "REVOKED" },
      });
      expect((await f.generate()).stages).toBe(0);
    });
    it("skips paid, void and manual/pending-reconciliation holds but includes partial positive debt", async () => {
      const f = await fixture(),
        paid = await f.invoice(),
        voided = await f.invoice(),
        held = await f.invoice(),
        pending = await f.invoice(),
        partial = await f.invoice();
      expect((await f.pay(paid.id)).status).toBe(201);
      expect((await f.pay(partial.id, "40000")).status).toBe(201);
      expect(
        (
          await api(
            `/invoices/${voided.id}/void`,
            "POST",
            { reason: "Synthetic void with retained immutable history" },
            f.ownerToken,
          )
        ).status,
      ).toBe(201);
      expect((await f.hold(held.id)).status).toBe(200);
      expect(
        (await f.hold(pending.id, true, 0, "PENDING_RECONCILIATION")).status,
      ).toBe(200);
      expect((await f.enable()).status).toBe(200);
      expect((await f.generate()).stages).toBe(1);
      expect(
        (
          await f.db.feeReminderStage.findMany({
            where: { tenantId: f.tenant.id },
          })
        ).map((r) => r.invoiceId),
      ).toEqual([partial.id]);
    });
    for (const status of ["READ_ONLY", "SUSPENDED", "TERMINATED"] as const)
      it(`blocks ${status} configuration writes and automated dispatch`, async () => {
        const f = await fixture();
        await f.invoice();
        expect((await f.enable()).status).toBe(200);
        await f.db.tenant.update({
          where: { id: f.tenant.id },
          data: { status },
        });
        expect((await f.enable(false, 1)).status).toBe(403);
        await expect(f.generate()).rejects.toThrow();
        expect(
          await f.db.feeReminderStage.count({
            where: { tenantId: f.tenant.id },
          }),
        ).toBe(0);
      });
    it("rejects another tenant invoice and nested FK, append-only and fourth-stage writes at the database boundary", async () => {
      const f = await fixture(),
        g = await fixture(),
        i = await f.invoice(),
        foreign = await g.invoice();
      expect(
        (
          await api(
            `/invoices/${foreign.id}/reminders`,
            "GET",
            undefined,
            f.ownerToken,
          )
        ).status,
      ).toBe(404);
      expect((await f.hold(foreign.id)).status).toBe(404);
      expect((await f.enable()).status).toBe(200);
      expect((await f.generate()).stages).toBe(1);
      const b = await f.db.feeReminderBatch.findFirstOrThrow({
        where: { tenantId: f.tenant.id },
      });
      await expect(
        f.db
          .$executeRaw`INSERT INTO invoice_reminder_holds(tenant_id,invoice_id,held,category,version,updated_by) VALUES(${f.tenant.id}::uuid,${foreign.id}::uuid,true,'MANUAL',1,${f.owner.id}::uuid)`,
      ).rejects.toMatchObject({ code: "P2010", meta: { code: "23503" } });
      await expect(
        f.db
          .$executeRaw`INSERT INTO fee_reminder_stages(tenant_id,invoice_id,student_id,stage,batch_id) VALUES(${f.tenant.id}::uuid,${i.id}::uuid,${f.student.id}::uuid,'AFTER_14',${b.id}::uuid)`,
      ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
      await expect(
        f.db
          .$executeRaw`DELETE FROM fee_reminder_batches WHERE id=${b.id}::uuid`,
      ).rejects.toMatchObject({ code: "P2010", meta: { code: "P0001" } });
      await expect(
        f.db
          .$executeRaw`UPDATE fee_reminder_policy_events SET reason='rewritten' WHERE tenant_id=${f.tenant.id}::uuid`,
      ).rejects.toMatchObject({ code: "P2010", meta: { code: "P0001" } });
    });
    it("creates a guardian-only generic inbox event with live authorized child finance navigation", async () => {
      const f = await fixture();
      await f.invoice();
      await f.register();
      expect((await f.enable()).status).toBe(200);
      expect((await f.generate()).stages).toBe(1);
      const event = await f.event(),
        w = await import("../../apps/worker/dist/notifications.js");
      let calls = 0;
      await w.deliverDomainEvent(
        f.db,
        event.id,
        async (_url, init) => {
          calls++;
          const body = JSON.parse(String(init?.body));
          expect(JSON.stringify(body)).not.toContain(f.student.fullName);
          expect(JSON.stringify(body)).not.toContain("100000");
          expect(body.data).toEqual({ notificationId: expect.any(String) });
          return new Response(
            JSON.stringify({ data: { status: "ok", id: randomUUID() } }),
            { headers: { "Content-Type": "application/json" } },
          );
        },
        () => now,
      );
      expect(calls).toBe(1);
      const ns = await f.db.notification.findMany({
        where: { tenantId: f.tenant.id, eventId: event.id },
      });
      expect(ns).toHaveLength(1);
      expect(ns[0]).toMatchObject({
        recipientRole: "guardian",
        recipientUserId: f.guardian.id,
        entityType: "reminder",
        entityId: event.aggregateId,
      });
      const read = await api(
        `/notifications/${ns[0]!.id}`,
        "GET",
        undefined,
        f.guardianToken,
      );
      expect(read.status).toBe(200);
      expect(read.body.data.subjectStudentIds).toEqual([f.student.id]);
      await w.deliverDomainEvent(
        f.db,
        event.id,
        async () => {
          throw Error("must not resend accepted event");
        },
        () => now,
      );
      expect(calls).toBe(1);
    });
    for (const change of [
      "paid",
      "held",
      "paused",
      "consent",
      "link",
      "expired",
    ] as const)
      it(`rechecks ${change} after generation before inbox/provider handoff`, async () => {
        const f = await fixture(),
          i = await f.invoice();
        await f.register();
        expect((await f.enable()).status).toBe(200);
        expect((await f.generate()).stages).toBe(1);
        const event = await f.event();
        if (change === "paid") expect((await f.pay(i.id)).status).toBe(201);
        if (change === "held") expect((await f.hold(i.id)).status).toBe(200);
        if (change === "paused")
          expect((await f.enable(false, 1)).status).toBe(200);
        if (change === "consent") await f.consent(false);
        if (change === "link")
          await f.db.guardianLink.update({
            where: { id: f.link.id },
            data: { status: "REVOKED" },
          });
        let calls = 0;
        const w = await import("../../apps/worker/dist/notifications.js");
        await w.deliverDomainEvent(
          f.db,
          event.id,
          async () => {
            calls++;
            throw Error("suppressed reminders must not reach provider");
          },
          () => (change === "expired" ? new Date("2030-11-03T14:15:00Z") : now),
        );
        expect(calls).toBe(0);
        expect(
          await f.db.notification.count({
            where: { tenantId: f.tenant.id, eventId: event.id },
          }),
        ).toBe(0);
        expect(
          await f.db.feeReminderStage.count({
            where: { tenantId: f.tenant.id, invoiceId: i.id },
          }),
        ).toBe(1);
      });

    for (const change of [
      "paid",
      "held",
      "paused",
      "consent",
      "link",
      "expired",
    ] as const)
      it(`suppresses a previously created pending push on ${change} before its next provider claim`, async () => {
        const f = await fixture(),
          i = await f.invoice();
        await f.register();
        expect((await f.enable()).status).toBe(200);
        expect((await f.generate()).stages).toBe(1);
        const e = await f.event(),
          w = await import("../../apps/worker/dist/notifications.js");
        let calls = 0;
        await expect(
          w.deliverDomainEvent(
            f.db,
            e.id,
            async () => {
              calls++;
              return new Response("Synthetic retryable provider rejection", {
                status: 503,
              });
            },
            () => now,
          ),
        ).rejects.toThrow("PUSH_RETRYABLE_REJECTION");
        const d = await f.db.pushDelivery.findFirstOrThrow({
          where: { tenantId: f.tenant.id, eventId: e.id },
        });
        expect(d).toMatchObject({ status: "PENDING", attempts: 1 });
        const n = await f.db.notification.findFirstOrThrow({
          where: { tenantId: f.tenant.id, eventId: e.id },
        });
        if (change === "paid") expect((await f.pay(i.id)).status).toBe(201);
        if (change === "held") expect((await f.hold(i.id)).status).toBe(200);
        if (change === "paused")
          expect((await f.enable(false, 1)).status).toBe(200);
        if (change === "consent") await f.consent(false);
        if (change === "link")
          await f.db.guardianLink.update({
            where: { id: f.link.id },
            data: { status: "REVOKED" },
          });
        await f.db.pushDelivery.update({
          where: { id: d.id },
          data: { nextAttemptAt: new Date(0) },
        });
        await w.deliverDomainEvent(
          f.db,
          e.id,
          async () => {
            calls++;
            throw Error("no provider call after stop condition");
          },
          () => (change === "expired" ? new Date("2030-11-03T14:15:00Z") : now),
        );
        expect(calls).toBe(1);
        expect(
          await f.db.pushDelivery.findUniqueOrThrow({ where: { id: d.id } }),
        ).toMatchObject({ status: "SUPPRESSED", attempts: 1 });
        // A generic past inbox event is historical, never a copied claim of current debt.
        expect(
          await f.db.notification.findUniqueOrThrow({ where: { id: n.id } }),
        ).toEqual(n);
        expect(
          await f.db.feeReminderStage.count({
            where: { tenantId: f.tenant.id, invoiceId: i.id },
          }),
        ).toBe(1);
      });
    it("retains an uncertain provider outcome without an automatic duplicate reminder", async () => {
      const f = await fixture();
      await f.invoice();
      await f.register();
      expect((await f.enable()).status).toBe(200);
      expect((await f.generate()).stages).toBe(1);
      const e = await f.event(),
        w = await import("../../apps/worker/dist/notifications.js");
      let calls = 0;
      const uncertain: typeof fetch = async () => {
        calls++;
        throw Error("Synthetic timeout after possible acceptance");
      };
      await w.deliverDomainEvent(f.db, e.id, uncertain, () => now);
      await w.deliverDomainEvent(f.db, e.id, uncertain, () => now);
      expect(calls).toBe(1);
      expect(
        await f.db.pushDelivery.findFirstOrThrow({
          where: { tenantId: f.tenant.id, eventId: e.id },
        }),
      ).toMatchObject({ status: "UNKNOWN", attempts: 1 });
    });
    it("processes the reminder through actual Redis/BullMQ and production notification job dispatch", async () => {
      const f = await fixture();
      await f.invoice();
      await f.register();
      expect((await f.enable()).status).toBe(200);
      expect((await f.generate()).stages).toBe(1);
      const e = await f.event();
      const require = createRequire(path.resolve("apps/worker/package.json"));
      const { Queue, Worker } =
        require("bullmq") as typeof import("../../apps/worker/node_modules/bullmq");
      const prefix = "fee-reminder-proof-" + randomUUID(),
        connection = redisConnection(testRedisUrl());
      const queue = new Queue<{ eventId: string }>("domain-notifications", {
        prefix,
        connection,
      });
      queue.on("error", () => {});
      let consumer: { close(): Promise<void> } | undefined;
      let calls = 0;
      try {
        await queue.waitUntilReady();
        const jobs = await import(
          "../../apps/worker/dist/notification-jobs.js"
        );
        await jobs.enqueueNotificationPage(f.db, queue);
        await jobs.enqueueNotificationPage(f.db, queue);
        expect(await queue.getJob(e.id)).toBeDefined();
        for (const job of await queue.getJobs(["waiting", "delayed"]))
          if (job.id !== e.id) await job.remove();
        const running = new Worker<{ eventId: string }>(
          "domain-notifications",
          async (job) => {
            expect(job.id).toBe(e.id);
            await jobs.processNotificationJob(
              f.db,
              job.data.eventId,
              async () => {
                calls++;
                return new Response(
                  JSON.stringify({ data: { status: "ok", id: randomUUID() } }),
                  { headers: { "Content-Type": "application/json" } },
                );
              },
              () => now,
            );
          },
          { prefix, connection },
        );
        running.on("error", () => {});
        consumer = running;
        await expect
          .poll(async () => (await queue.getJob(e.id))?.getState(), {
            timeout: 10000,
          })
          .toBe("completed");
        expect(calls).toBe(1);
        expect(
          await f.db.pushDelivery.findFirstOrThrow({
            where: { tenantId: f.tenant.id, eventId: e.id },
          }),
        ).toMatchObject({ status: "ACCEPTED", attempts: 1 });
      } finally {
        await consumer?.close();
        await queue.obliterate({ force: true });
        await queue.close();
      }
    });

    it("finishes a501-invoice child batch across keyset pages without skipping or duplicating a stage", async () => {
      const f = await fixture();
      const ids = await f.bulkInvoices(501);
      expect((await f.enable()).status).toBe(200);
      expect(await f.generate()).toEqual({ batches: 1, stages: 501 });
      expect(
        await f.db.feeReminderStage.count({
          where: {
            tenantId: f.tenant.id,
            invoiceId: { in: ids },
            stage: "BEFORE_3",
          },
        }),
      ).toBe(501);
      expect(
        await f.db.feeReminderBatch.count({ where: { tenantId: f.tenant.id } }),
      ).toBe(1);
      expect(
        await f.db.outboxEvent.count({
          where: { tenantId: f.tenant.id, eventType: "FEE_REMINDER" },
        }),
      ).toBe(1);
      expect(await f.generate()).toEqual({ batches: 0, stages: 0 });
    });

    it("does not begin an HTTP provider send when claim verification crosses the09:15 boundary", async () => {
      const f = await fixture();
      await f.invoice();
      await f.register();
      expect((await f.enable()).status).toBe(200);
      expect((await f.generate()).stages).toBe(1);
      const e = await f.event(),
        w = await import("../../apps/worker/dist/notifications.js");
      let checks = 0,
        calls = 0;
      await w.deliverDomainEvent(
        f.db,
        e.id,
        async () => {
          calls++;
          throw Error("late HTTP call is forbidden");
        },
        () =>
          ++checks <= 2
            ? new Date("2030-11-03T14:14:59.999Z")
            : new Date("2030-11-03T14:15:00Z"),
      );
      expect(calls).toBe(0);
      expect(
        await f.db.pushDelivery.findFirstOrThrow({
          where: { tenantId: f.tenant.id, eventId: e.id },
        }),
      ).toMatchObject({ status: "SUPPRESSED", attempts: 1 });
    });

    for (const change of [
      "paid",
      "held",
      "paused",
      "consent",
      "link",
      "preference",
      "expired",
    ] as const)
      it(`rechecks ${change} committed after durableSENDING before the actual provider handoff`, async () => {
        const f = await fixture(),
          i = await f.invoice();
        await f.register();
        expect((await f.enable()).status).toBe(200);
        expect((await f.generate()).stages).toBe(1);
        const e = await f.event(),
          w = await import("../../apps/worker/dist/notifications.js"),
          claims = await import(
            "../../apps/worker/dist/notification-claims.js"
          );
        await expect(
          w.deliverDomainEvent(
            f.db,
            e.id,
            async () =>
              new Response("Synthetic known rejection", { status: 503 }),
            () => now,
          ),
        ).rejects.toThrow("PUSH_RETRYABLE_REJECTION");
        const d = await f.db.pushDelivery.findFirstOrThrow({
          where: { tenantId: f.tenant.id, eventId: e.id },
        });
        await f.db.pushDelivery.update({
          where: { id: d.id },
          data: { nextAttemptAt: new Date(0) },
        });
        const prepared = await claims.claimPushDelivery(f.db, d, () => now);
        expect(prepared).not.toBeNull();
        if (!prepared) throw Error("Expected real durable reminder claim");
        expect(
          await f.db.pushDelivery.findUniqueOrThrow({ where: { id: d.id } }),
        ).toMatchObject({ status: "SENDING", attempts: 2 });
        if (change === "paid") expect((await f.pay(i.id)).status).toBe(201);
        if (change === "held") expect((await f.hold(i.id)).status).toBe(200);
        if (change === "paused")
          expect((await f.enable(false, 1)).status).toBe(200);
        if (change === "consent") await f.consent(false);
        if (change === "link")
          await f.db.guardianLink.update({
            where: { id: f.link.id },
            data: { status: "REVOKED" },
          });
        if (change === "preference")
          expect(
            (
              await api(
                "/me/notification-preferences",
                "PATCH",
                {
                  pushEnabled: true,
                  attendance: true,
                  grades: true,
                  finance: false,
                  schedule: true,
                },
                f.guardianToken,
              )
            ).status,
          ).toBe(200);
        let calls = 0;
        expect(
          await claims.handoffReminderPush(
            f.db,
            d.id,
            prepared,
            async () => {
              calls++;
              throw Error("No stale reminder HTTP handoff");
            },
            () =>
              change === "expired" ? new Date("2030-11-03T14:15:00Z") : now,
          ),
        ).toBeNull();
        expect(calls).toBe(0);
        expect(
          await f.db.pushDelivery.findUniqueOrThrow({ where: { id: d.id } }),
        ).toMatchObject({ status: "SUPPRESSED", attempts: 2 });
      });
    it("serializes a real payment begun during provider handoff behind the held tenant read lock", async () => {
      const f = await fixture(),
        i = await f.invoice();
      await f.register();
      expect((await f.enable()).status).toBe(200);
      expect((await f.generate()).stages).toBe(1);
      const e = await f.event(),
        w = await import("../../apps/worker/dist/notifications.js");
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>((r) => {
          enter = r;
        }),
        held = new Promise<void>((r) => {
          release = r;
        });
      let committed = false;
      const sending = w.deliverDomainEvent(
        f.db,
        e.id,
        async () => {
          enter();
          await held;
          return new Response(
            JSON.stringify({ data: { status: "ok", id: randomUUID() } }),
            { headers: { "Content-Type": "application/json" } },
          );
        },
        () => now,
      );
      await entered;
      const paying = f.pay(i.id).then((r) => {
        expect(r.status).toBe(201);
        committed = true;
      });
      try {
        await expect
          .poll(async () => {
            const rows = await f.db.$queryRaw<
              { waiting: bigint }[]
            >`SELECT count(*)::bigint AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM tenants%FOR UPDATE%'`;
            return Number(rows[0]?.waiting ?? 0n);
          })
          .toBeGreaterThan(0);
        expect(committed).toBe(false);
      } finally {
        release();
        await sending;
        await paying;
      }
      expect(committed).toBe(true);
      expect(
        await f.db.pushDelivery.findFirstOrThrow({
          where: { tenantId: f.tenant.id, eventId: e.id },
        }),
      ).toMatchObject({ status: "ACCEPTED", attempts: 1 });
    });
  });
}
