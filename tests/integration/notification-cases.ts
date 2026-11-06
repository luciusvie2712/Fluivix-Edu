import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import type { PrismaClient, Role } from "@prisma/client";
import { redisConnection } from "../../apps/worker/src/redis";
import { testRedisUrl } from "../../tooling/test-redis";

export function notificationCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("notification lifecycle against actual PostgreSQL, API and worker", () => {
    const policy = "synthetic-notifications-integration-v1";
    const saved: Record<string, string | undefined> = {};
    beforeAll(() => {
      for (const key of [
        "PUSH_PROVIDER",
        "PRIVACY_POLICY_VERSION",
        "PRIVACY_NOTICE_URL",
      ])
        saved[key] = process.env[key];
      process.env.PUSH_PROVIDER = "expo";
      process.env.PRIVACY_POLICY_VERSION = policy;
      process.env.PRIVACY_NOTICE_URL =
        "https://example.test/notifications-test-policy";
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
    async function context(user: string, tenant: string, role: Role) {
      const signed = await api("/mobile/auth/login", "POST", {
        email: user + "@example.test",
        password,
      });
      expect(signed.status).toBe(200);
      const selected = await api(
        "/auth/switch-context",
        "POST",
        { tenantId: tenant, role },
        signed.body.data.accessToken,
      );
      expect(selected.status).toBe(200);
      return selected.body.data.accessToken as string;
    }
    async function fixture() {
      const db = getDb(),
        tenant = randomUUID(),
        foreign = randomUUID(),
        owner = randomUUID(),
        actor = randomUUID(),
        other = randomUUID(),
        studentUser = randomUUID();
      const passwordHash = await hash();
      const plan = await db.plan.findUniqueOrThrow({
        where: { code: "TEST_PLAN" },
      });
      for (const id of [tenant, foreign]) {
        await db.tenant.create({
          data: {
            id,
            slug: "notify-" + id,
            name: "Synthetic notification centre",
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
      for (const id of [owner, actor, other, studentUser])
        await db.user.create({
          data: {
            id,
            email: id + "@example.test",
            displayName: "Synthetic notification actor",
            passwordHash,
            status: "ACTIVE",
          },
        });
      const member = async (tenantId: string, userId: string, roles: Role[]) =>
        db.membership.create({
          data: {
            tenantId,
            userId,
            status: "ACTIVE",
            roles: { create: roles.map((role) => ({ role })) },
          },
        });
      await member(tenant, owner, ["owner"]);
      await member(tenant, actor, ["teacher", "guardian"]);
      await member(tenant, other, ["teacher"]);
      await member(tenant, studentUser, ["student"]);
      await member(foreign, owner, ["owner"]);
      await member(foreign, actor, ["guardian"]);
      const teachers = [];
      for (const userId of [actor, other])
        teachers.push(
          await db.teacher.create({
            data: {
              tenantId: tenant,
              userId,
              teacherCode: userId,
              fullName: "Synthetic notification teacher",
            },
          }),
        );
      const cls = await db.educationClass.create({
        data: {
          tenantId: tenant,
          code: "NOTIFY",
          name: "Synthetic notification class",
          capacity: 30,
          startDate: new Date("2030-01-01Z"),
          endDate: new Date("2030-12-31Z"),
        },
      });
      for (const teacher of teachers)
        await db.classTeacher.create({
          data: {
            tenantId: tenant,
            classId: cls.id,
            teacherId: teacher.id,
            effectiveFrom: new Date("2030-01-01Z"),
            effectiveTo: new Date("2030-12-31Z"),
          },
        });
      const children = [],
        links = [],
        enrollments = [];
      for (let i = 0; i < 3; i++) {
        const child = await db.student.create({
          data: {
            tenantId: tenant,
            studentCode: "NOTIFY-" + i,
            fullName: "Synthetic notification child " + i,
            ...(i === 0 ? { userId: studentUser } : {}),
          },
        });
        children.push(child);
        links.push(
          await db.guardianLink.create({
            data: {
              tenantId: tenant,
              studentId: child.id,
              guardianUserId: actor,
              status: "ACTIVE",
              verifiedBy: owner,
              verifiedAt: new Date(),
            },
          }),
        );
        if (i < 2)
          enrollments.push(
            await db.enrollment.create({
              data: {
                tenantId: tenant,
                classId: cls.id,
                studentId: child.id,
                joinedAt: new Date("2030-01-01Z"),
              },
            }),
          );
      }
      const session = await db.classSession.create({
        data: {
          tenantId: tenant,
          classId: cls.id,
          teacherId: teachers[0]!.id,
          scheduledDate: new Date("2030-06-10Z"),
          startsAt: new Date("2030-06-10T01:00Z"),
          endsAt: new Date("2030-06-10T02:00Z"),
        },
      });
      const tokens = {
        owner: await context(owner, tenant, "owner"),
        teacher: await context(actor, tenant, "teacher"),
        guardian: await context(actor, tenant, "guardian"),
        other: await context(other, tenant, "teacher"),
        student: await context(studentUser, tenant, "student"),
      };
      const prefs = {
        pushEnabled: true,
        attendance: true,
        grades: true,
        finance: true,
        schedule: true,
      };
      expect(
        (
          await api(
            "/me/notification-preferences",
            "PATCH",
            prefs,
            tokens.teacher,
          )
        ).status,
      ).toBe(200);
      const consent = async (
        token: string,
        subjectStudentId?: string,
        granted = true,
      ) => {
        const r = await api(
          "/privacy/consents",
          "POST",
          {
            policyVersion: policy,
            purposeCode: "NOTIFICATIONS",
            granted,
            ...(subjectStudentId ? { subjectStudentId } : {}),
          },
          token,
        );
        expect(r.status).toBe(201);
        return r.body.data;
      };
      await consent(tokens.teacher);
      for (const child of children) await consent(tokens.guardian, child.id);
      await consent(tokens.student);
      const pushToken = "ExpoPushToken[notification-test-" + randomUUID() + "]";
      const register = async (token = tokens.teacher, value = pushToken) =>
        api(
          "/mobile/devices/push-token",
          "POST",
          { token: value, platform: "android" },
          token,
        );
      expect((await register()).status).toBe(201);
      const device = await db.devicePushToken.findUniqueOrThrow({
        where: {
          tokenHash: createHash("sha256").update(pushToken).digest("hex"),
        },
      });
      const event = (
        processed = false,
        type = "CLASS_SCHEDULE_CHANGED",
        aggregateId = session.id,
        version = session.version,
      ) =>
        db.outboxEvent.create({
          data: {
            tenantId: tenant,
            eventType: type,
            aggregateId,
            eventVersion: version,
            payload: {},
            ...(processed ? { processedAt: new Date() } : {}),
          },
        });
      const reschedule = async () => {
        const current = await db.classSession.findUniqueOrThrow({
          where: { id: session.id },
        });
        const changed = await api(
          `/sessions/${session.id}/reschedule`,
          "POST",
          {
            sessionVersion: current.version,
            teacherId: current.teacherId,
            startsAt: new Date(
              current.startsAt.getTime() + 60000,
            ).toISOString(),
            endsAt: new Date(current.endsAt.getTime() + 60000).toISOString(),
            reason: "Synthetic notification retry lifecycle schedule change",
          },
          tokens.owner,
        );
        expect(changed.status).toBe(201);
        return db.outboxEvent.findFirstOrThrow({
          where: {
            tenantId: tenant,
            aggregateId: session.id,
            eventType: "CLASS_SCHEDULE_CHANGED",
            eventVersion: current.version + 1,
          },
        });
      };
      return {
        db,
        tenant,
        foreign,
        owner,
        actor,
        other,
        studentUser,
        teachers,
        cls,
        children,
        links,
        enrollments,
        session,
        tokens,
        prefs,
        consent,
        pushToken,
        register,
        device,
        event,
        reschedule,
      };
    }
    const worker = () => import("../../apps/worker/dist/notifications.js");
    const accepted = () =>
      new Response(
        JSON.stringify({ data: { status: "ok", id: randomUUID() } }),
        { headers: { "Content-Type": "application/json" } },
      );

    it("keeps a new user's device registration active when an old in-flight send rejects the previous generation", async () => {
      const f = await fixture(),
        event = await f.event(),
        w = await worker();
      let calls = 0;
      await w.deliverDomainEvent(f.db, event.id, async () => {
        calls++;
        expect((await f.register(f.tokens.other)).status).toBe(201);
        return new Response(
          JSON.stringify({
            data: {
              status: "error",
              details: { error: "DeviceNotRegistered" },
            },
          }),
        );
      });
      expect(calls).toBe(1);
      const current = await f.db.devicePushToken.findUniqueOrThrow({
        where: { id: f.device.id },
      });
      expect(current.userId).toBe(f.other);
      expect(current.status).toBe("ACTIVE");
      expect(current.version).toBeGreaterThan(f.device.version);
      const delivery = await f.db.pushDelivery.findFirstOrThrow({
        where: { eventId: event.id, recipientUserId: f.actor },
      });
      expect(delivery.status).toBe("INVALID");
      expect(delivery.deviceVersion).toBe(f.device.version);
      expect(
        (
          await api(
            "/notifications/" + delivery.notificationId,
            "GET",
            undefined,
            f.tokens.other,
          )
        ).status,
      ).toBe(404);
      await w.deliverDomainEvent(f.db, event.id, async () => {
        throw Error("Invalidated old delivery must not resend");
      });
    });

    it("does not invalidate a new registration from an old ticket receipt and records provider handoff separately from acceptance", async () => {
      const f = await fixture(),
        event = await f.event(),
        w = await worker();
      await w.deliverDomainEvent(f.db, event.id, async () => accepted());
      const delivery = await f.db.pushDelivery.findFirstOrThrow({
        where: { eventId: event.id, recipientUserId: f.actor },
      });
      expect(delivery.status).toBe("ACCEPTED");
      expect(delivery.nextReceiptAt!.getTime()).toBeGreaterThan(Date.now());
      expect((await f.register(f.tokens.other)).status).toBe(201);
      const current = await f.db.devicePushToken.findUniqueOrThrow({
        where: { id: f.device.id },
      });
      let queried = false;
      await w.checkPushReceipts(
        f.db,
        async (_url, init) => {
          const ids = JSON.parse(String(init?.body)).ids as string[];
          queried = ids.includes(delivery.providerRef!);
          return new Response(
            JSON.stringify({
              data: Object.fromEntries(
                ids.map((id) => [
                  id,
                  id === delivery.providerRef
                    ? {
                        status: "error",
                        details: { error: "DeviceNotRegistered" },
                      }
                    : { status: "ok" },
                ]),
              ),
            }),
          );
        },
        new Date(Date.now() + 16 * 60000),
      );
      expect(queried).toBe(true);
      expect(
        (
          await f.db.pushDelivery.findUniqueOrThrow({
            where: { id: delivery.id },
          })
        ).status,
      ).toBe("INVALID");
      expect(
        await f.db.devicePushToken.findUniqueOrThrow({
          where: { id: f.device.id },
        }),
      ).toMatchObject({
        userId: f.other,
        status: "ACTIVE",
        version: current.version,
      });
      expect((await f.register()).status).toBe(201);
      const next = await f.reschedule();
      await w.deliverDomainEvent(f.db, next.id, async () => accepted());
      const handedOff = await f.db.pushDelivery.findFirstOrThrow({
        where: { eventId: next.id, recipientUserId: f.actor },
      });
      expect(handedOff.status).toBe("ACCEPTED");
      await w.checkPushReceipts(
        f.db,
        async (_url, init) => {
          const ids = JSON.parse(String(init?.body)).ids as string[];
          return new Response(
            JSON.stringify({
              data: Object.fromEntries(ids.map((id) => [id, { status: "ok" }])),
            }),
          );
        },
        new Date(Date.now() + 16 * 60000),
      );
      expect(
        (
          await f.db.pushDelivery.findUniqueOrThrow({
            where: { id: handedOff.id },
          })
        ).status,
      ).toBe("SENT");
      // SENT records provider handoff only; this injected receipt proves no phone display.
    });

    it("serializes concurrent OS-token replacements within the actual mobile session family and preserves revoked history", async () => {
      const f = await fixture();
      const values = [0, 1].map(
        () => "ExpoPushToken[replacement-" + randomUUID() + "]",
      );
      const results = await Promise.all(
        values.map((value) => f.register(f.tokens.teacher, value)),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      const rows = await f.db.devicePushToken.findMany({
        where: {
          userId: f.actor,
          familyId: f.device.familyId,
          platform: "android",
        },
      });
      expect(rows).toHaveLength(3);
      const active = rows.filter((r) => r.status === "ACTIVE");
      expect(active).toHaveLength(1);
      expect(rows.filter((r) => r.status === "REVOKED")).toHaveLength(2);
      const value = values.find(
        (v) =>
          createHash("sha256").update(v).digest("hex") === active[0]!.tokenHash,
      )!;
      expect((await f.register(f.tokens.teacher, value)).status).toBe(201);
      expect(
        (
          await f.db.devicePushToken.findUniqueOrThrow({
            where: { id: active[0]!.id },
          })
        ).version,
      ).toBeGreaterThan(active[0]!.version);
      expect(
        (
          await api(
            "/mobile/devices/push-token",
            "DELETE",
            {},
            f.tokens.teacher,
          )
        ).status,
      ).toBe(200);
      expect(
        await f.db.devicePushToken.count({
          where: {
            userId: f.actor,
            familyId: f.device.familyId,
            status: "ACTIVE",
          },
        }),
      ).toBe(0);
    });

    it("persists bounded rejected-send retries, honors due time and never blindly resends uncertain acceptance", async () => {
      const f = await fixture(),
        event = await f.event(),
        w = await worker();
      let calls = 0;
      const rejected: typeof fetch = async () => {
        calls++;
        return new Response("", {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      };
      await expect(
        w.deliverDomainEvent(f.db, event.id, rejected),
      ).rejects.toThrow("PUSH_RETRYABLE_REJECTION");
      const delivery = await f.db.pushDelivery.findFirstOrThrow({
        where: { eventId: event.id, recipientUserId: f.actor },
      });
      expect(delivery).toMatchObject({ status: "PENDING", attempts: 1 });
      expect(delivery.nextAttemptAt!.getTime()).toBeGreaterThan(
        Date.now() + 50000,
      );
      await w.deliverDomainEvent(f.db, event.id, rejected);
      expect(calls).toBe(1);
      for (let attempt = 2; attempt <= 5; attempt++) {
        await f.db.pushDelivery.update({
          where: { id: delivery.id },
          data: { nextAttemptAt: new Date(Date.now() - 1000) },
        });
        await expect(
          w.deliverDomainEvent(f.db, event.id, rejected),
        ).rejects.toThrow(
          attempt === 5 ? "PUSH_RETRY_EXHAUSTED" : "PUSH_RETRYABLE_REJECTION",
        );
      }
      expect(calls).toBe(5);
      expect(
        await f.db.pushDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        }),
      ).toMatchObject({ status: "FAILED", attempts: 5, nextAttemptAt: null });
      await w.deliverDomainEvent(f.db, event.id, rejected);
      expect(calls).toBe(5);
      const uncertainEvent = await f.reschedule();
      let uncertainCalls = 0;
      await w.deliverDomainEvent(f.db, uncertainEvent.id, async () => {
        uncertainCalls++;
        throw new Error("Synthetic ambiguous network acceptance");
      });
      const uncertain = await f.db.pushDelivery.findFirstOrThrow({
        where: { eventId: uncertainEvent.id, recipientUserId: f.actor },
      });
      expect(uncertain).toMatchObject({ status: "UNKNOWN", attempts: 1 });
      await w.deliverDomainEvent(f.db, uncertainEvent.id, async () => {
        uncertainCalls++;
        return accepted();
      });
      expect(uncertainCalls).toBe(1);
      await expect(
        f.db.pushDelivery.update({
          where: { id: uncertain.id },
          data: { status: "PENDING" },
        }),
      ).rejects.toThrow();
      expect(
        (
          await f.db.pushDelivery.findUniqueOrThrow({
            where: { id: uncertain.id },
          })
        ).status,
      ).toBe("UNKNOWN");
    });

    it("materializes one recipient event across role audiences, sends once under concurrent replay and shares the actual user read state", async () => {
      const f = await fixture(),
        event = await f.event(),
        w = await worker();
      const payloads: {
        title: string;
        body: string;
        data: Record<string, string>;
      }[] = [];
      const provider: typeof fetch = async (_url, init) => {
        const sent = JSON.parse(String(init?.body));
        payloads.push({ title: sent.title, body: sent.body, data: sent.data });
        return accepted();
      };
      await Promise.all([
        w.deliverDomainEvent(f.db, event.id, provider),
        w.deliverDomainEvent(f.db, event.id, provider),
      ]);
      await w.deliverDomainEvent(f.db, event.id, provider);
      expect(payloads).toHaveLength(1);
      expect(Object.keys(payloads[0]!.data)).toEqual(["notificationId"]);
      expect(payloads[0]!.body).toBe("Bạn có thông báo mới.");
      const notes = await f.db.notification.findMany({
        where: { eventId: event.id, recipientUserId: f.actor },
      });
      expect(notes.map((n) => n.recipientRole).sort()).toEqual([
        "guardian",
        "teacher",
      ]);
      expect(
        await f.db.pushDelivery.count({
          where: {
            eventId: event.id,
            recipientUserId: f.actor,
            canonical: true,
          },
        }),
      ).toBe(1);
      const teacher = await api(
        "/notifications",
        "GET",
        undefined,
        f.tokens.teacher,
      );
      const guardian = await api(
        "/notifications",
        "GET",
        undefined,
        f.tokens.guardian,
      );
      expect(teacher.status).toBe(200);
      expect(guardian.status).toBe(200);
      expect(teacher.body.page.total).toBe(1);
      expect(guardian.body.page.total).toBe(1);
      expect(teacher.body.data[0].deliveryStatuses).toEqual([
        { status: "ACCEPTED", count: 1 },
      ]);
      expect(guardian.body.data[0].deliveryStatuses).toEqual([
        { status: "ACCEPTED", count: 1 },
      ]);
      expect(JSON.stringify(teacher.body.data)).not.toContain(
        f.device.tokenHash,
      );
      expect(JSON.stringify(teacher.body.data)).not.toContain(f.pushToken);
      expect(teacher.body.data[0].subjectStudentIds).toEqual([]);
      expect(guardian.body.data[0].subjectStudentIds).toEqual(
        f.children
          .slice(0, 2)
          .map((c) => c.id)
          .sort(),
      );
      expect(guardian.body.data[0].subjectStudentIds).not.toContain(
        f.children[2]!.id,
      );
      const teacherNote = notes.find((n) => n.recipientRole === "teacher")!;
      expect(
        (
          await api(
            "/notifications/" + teacherNote.id,
            "GET",
            undefined,
            f.tokens.guardian,
          )
        ).status,
      ).toBe(200);
      const marked = await api(
        "/notifications/" + teacherNote.id + "/read",
        "PATCH",
        undefined,
        f.tokens.teacher,
      );
      expect(marked.status).toBe(200);
      expect(marked.body.data.readAt).toEqual(expect.any(String));
      expect(
        (await api("/notifications", "GET", undefined, f.tokens.guardian)).body
          .data[0].readAt,
      ).toBe(marked.body.data.readAt);
      expect(
        await f.db.notification.count({
          where: { eventId: event.id, recipientUserId: f.actor, readAt: null },
        }),
      ).toBe(0);
    });

    it("honors current purpose consent, category preferences, revoked sessions and suspended tenants before sending", async () => {
      const f = await fixture(),
        w = await worker();
      const pendingEvent = await f.event();
      await expect(
        w.deliverDomainEvent(
          f.db,
          pendingEvent.id,
          async () => new Response("", { status: 503 }),
        ),
      ).rejects.toThrow("PUSH_RETRYABLE_REJECTION");
      const pending = await f.db.pushDelivery.findFirstOrThrow({
        where: { eventId: pendingEvent.id, recipientUserId: f.actor },
      });
      await f.consent(f.tokens.teacher, undefined, false);
      for (const child of f.children.slice(0, 2))
        await f.consent(f.tokens.guardian, child.id, false);
      await f.db.pushDelivery.update({
        where: { id: pending.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await w.deliverDomainEvent(f.db, pendingEvent.id, async () => {
        throw Error("Withdrawn consent must prevent retries");
      });
      expect(
        (
          await f.db.pushDelivery.findUniqueOrThrow({
            where: { id: pending.id },
          })
        ).status,
      ).toBe("SUPPRESSED");
      const noConsent = await f.reschedule();
      await w.deliverDomainEvent(f.db, noConsent.id, async () => {
        throw Error("No consent must prevent materialization");
      });
      expect(
        await f.db.notification.count({
          where: { eventId: noConsent.id, recipientUserId: f.actor },
        }),
      ).toBe(0);
      await f.consent(f.tokens.teacher);
      for (const child of f.children.slice(0, 2))
        await f.consent(f.tokens.guardian, child.id);
      expect(
        (
          await api(
            "/me/notification-preferences",
            "PATCH",
            { ...f.prefs, schedule: false },
            f.tokens.teacher,
          )
        ).status,
      ).toBe(200);
      const disabled = await f.reschedule();
      await w.deliverDomainEvent(f.db, disabled.id, async () => {
        throw Error("Disabled category must prevent materialization");
      });
      expect(
        await f.db.notification.count({
          where: { eventId: disabled.id, recipientUserId: f.actor },
        }),
      ).toBe(0);
      expect(
        (
          await api(
            "/me/notification-preferences",
            "PATCH",
            f.prefs,
            f.tokens.teacher,
          )
        ).status,
      ).toBe(200);
      const revoked = await f.reschedule();
      await expect(
        w.deliverDomainEvent(
          f.db,
          revoked.id,
          async () => new Response("", { status: 503 }),
        ),
      ).rejects.toThrow("PUSH_RETRYABLE_REJECTION");
      const revokedDelivery = await f.db.pushDelivery.findFirstOrThrow({
        where: { eventId: revoked.id, recipientUserId: f.actor },
      });
      await f.db.authSession.updateMany({
        where: { userId: f.actor, familyId: f.device.familyId },
        data: { revokedAt: new Date() },
      });
      await f.db.pushDelivery.update({
        where: { id: revokedDelivery.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await w.deliverDomainEvent(f.db, revoked.id, async () => {
        throw Error("Revoked device session must prevent retries");
      });
      expect(
        (
          await f.db.pushDelivery.findUniqueOrThrow({
            where: { id: revokedDelivery.id },
          })
        ).status,
      ).toBe("SUPPRESSED");
      const suspended = await f.reschedule();
      await f.db.tenant.update({
        where: { id: f.tenant },
        data: { status: "SUSPENDED" },
      });
      await w.deliverDomainEvent(f.db, suspended.id, async () => {
        throw Error("Suspended tenant must not send");
      });
      expect(
        await f.db.notification.count({ where: { eventId: suspended.id } }),
      ).toBe(0);
      expect(
        (await api("/notifications", "GET", undefined, f.tokens.guardian))
          .status,
      ).toBe(403);
    });

    it("recovers a committed pending delivery after Redis transport loss and a lost queued job using a fresh real worker", async () => {
      const f = await fixture(),
        event = await f.event(),
        w = await worker();
      const jobs = await import("../../apps/worker/dist/notification-jobs.js");
      await expect(
        w.deliverDomainEvent(
          f.db,
          event.id,
          async () => new Response("", { status: 503 }),
        ),
      ).rejects.toThrow("PUSH_RETRYABLE_REJECTION");
      const delivery = await f.db.pushDelivery.findFirstOrThrow({
        where: { eventId: event.id, recipientUserId: f.actor },
      });
      await f.db.pushDelivery.update({
        where: { id: delivery.id },
        data: { nextAttemptAt: new Date(0) },
      });
      const require = createRequire(path.resolve("apps/worker/package.json"));
      const { Queue, Worker } =
        require("bullmq") as typeof import("../../apps/worker/node_modules/bullmq");
      const prefix = "notification-recovery-" + randomUUID();
      const connection = {
        ...redisConnection(testRedisUrl()),
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      };
      const initial = new Queue<{ eventId: string }>("deliveries", {
        prefix,
        connection,
      });
      initial.on("error", () => {});
      const recovered = new Queue<{ eventId: string }>("deliveries", {
        prefix,
        connection,
      });
      recovered.on("error", () => {});
      let consumer: { close(): Promise<void> } | undefined;
      const jobId = `${event.id}-${delivery.id}-2`;
      try {
        await initial.waitUntilReady();
        await jobs.enqueueNotificationPage(f.db, initial);
        expect(await initial.getJob(jobId)).toBeDefined();
        await (await initial.getJob(jobId))!.remove();
        // Terminate this test client's actual Redis transport; the shared Redis service stays up.
        await initial.disconnect();
        await expect(
          jobs.enqueueNotificationPage(f.db, initial),
        ).rejects.toThrow();
        expect(
          await f.db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
        ).toMatchObject({ processedAt: expect.any(Date) });
        expect(
          await f.db.pushDelivery.findUniqueOrThrow({
            where: { id: delivery.id },
          }),
        ).toMatchObject({ status: "PENDING", attempts: 1 });
        await recovered.waitUntilReady();
        await jobs.enqueueNotificationPage(f.db, recovered);
        await jobs.enqueueNotificationPage(f.db, recovered);
        expect(await recovered.getJob(jobId)).toBeDefined();
        // Other disposable fixtures can have due rows; consume only this case's job.
        for (const job of await recovered.getJobs(["waiting", "delayed"]))
          if (job.id !== jobId) await job.remove();
        let calls = 0;
        const running = new Worker<{ eventId: string }>(
          "deliveries",
          async (job) => {
            expect(job.id).toBe(jobId);
            await jobs.processNotificationJob(
              f.db,
              job.data.eventId,
              async () => {
                calls++;
                return accepted();
              },
            );
          },
          {
            prefix,
            connection: {
              ...redisConnection(testRedisUrl()),
              maxRetriesPerRequest: null,
            },
          },
        );
        running.on("error", () => {});
        consumer = running;
        await expect
          .poll(async () => (await recovered.getJob(jobId))?.getState(), {
            timeout: 10000,
          })
          .toBe("completed");
        expect(calls).toBe(1);
        expect(
          await f.db.pushDelivery.findUniqueOrThrow({
            where: { id: delivery.id },
          }),
        ).toMatchObject({ status: "ACCEPTED", attempts: 2 });
        expect(
          await f.db.pushDelivery.count({
            where: {
              eventId: event.id,
              recipientUserId: f.actor,
              deviceId: f.device.id,
            },
          }),
        ).toBe(1);
      } finally {
        await consumer?.close();
        await initial.close();
        await recovered.obliterate({ force: true });
        await recovered.close();
      }
    });

    it("keeps a confirmed payment, allocation and audit committed when provider acceptance is uncertain, including idempotent API replay", async () => {
      const f = await fixture(),
        w = await worker();
      expect((await f.register(f.tokens.guardian)).status).toBe(201);
      const invoice = await f.db.$transaction(async (tx) => {
        const fee = await tx.feePlan.create({
          data: {
            tenantId: f.tenant,
            classId: f.cls.id,
            name: "Synthetic notification payment fee",
            billingModel: "MONTHLY",
            amountVnd: 100000n,
            validFrom: new Date("2020-01-01Z"),
          },
        });
        const run = await tx.invoiceRun.create({
          data: {
            tenantId: f.tenant,
            feePlanId: fee.id,
            periodKey: "2026-11",
            requestHash: "a".repeat(64),
            createdBy: f.owner,
          },
        });
        const row = await tx.invoice.create({
          data: {
            tenantId: f.tenant,
            studentId: f.children[0]!.id,
            runId: run.id,
            invoiceNo: "NOTIFY-" + randomUUID(),
            dueAt: new Date("2030-11-15Z"),
            totalAmountVnd: 100000n,
            createdBy: f.owner,
          },
        });
        await tx.invoiceItem.create({
          data: {
            tenantId: f.tenant,
            invoiceId: row.id,
            feePlanId: fee.id,
            description: fee.name,
            totalAmountVnd: 100000n,
          },
        });
        return row;
      });
      const body = {
          studentId: f.children[0]!.id,
          method: "BANK_TRANSFER",
          receivedAmountVnd: "100000",
          receivedAt: new Date().toISOString(),
          allocations: [{ invoiceId: invoice.id, amountVnd: "100000" }],
        },
        key = randomUUID();
      const paid = await api("/payments", "POST", body, f.tokens.owner, key);
      expect(paid.status).toBe(201);
      const event = await f.db.outboxEvent.findFirstOrThrow({
        where: {
          tenantId: f.tenant,
          eventType: "PAYMENT_RECORDED",
          aggregateId: paid.body.data.id,
        },
      });
      const before = await f.db.payment.findUniqueOrThrow({
        where: { id: paid.body.data.id },
      });
      const audit = await f.db.auditLog.findFirstOrThrow({
        where: {
          tenantId: f.tenant,
          action: "payment.recorded",
          resourceId: paid.body.data.id,
        },
      });
      let calls = 0;
      await w.deliverDomainEvent(f.db, event.id, async () => {
        calls++;
        throw Error("Synthetic provider timeout after possible acceptance");
      });
      expect(calls).toBe(1);
      expect(
        await f.db.payment.findUniqueOrThrow({ where: { id: before.id } }),
      ).toEqual(before);
      expect(before.status).toBe("CONFIRMED");
      expect(
        await f.db.paymentAllocation.findMany({
          where: { tenantId: f.tenant, paymentId: before.id },
          select: { invoiceId: true, amountVnd: true },
        }),
      ).toEqual([{ invoiceId: invoice.id, amountVnd: 100000n }]);
      expect(
        await f.db.auditLog.findUniqueOrThrow({ where: { id: audit.id } }),
      ).toEqual(audit);
      const replayed = await api(
        "/payments",
        "POST",
        body,
        f.tokens.owner,
        key,
      );
      expect(replayed.status).toBe(201);
      expect(replayed.body.data).toEqual(paid.body.data);
      await w.deliverDomainEvent(f.db, event.id, async () => {
        calls++;
        return accepted();
      });
      expect(calls).toBe(1);
      expect(
        await f.db.pushDelivery.findFirstOrThrow({
          where: { eventId: event.id, recipientUserId: f.actor },
        }),
      ).toMatchObject({ status: "UNKNOWN", attempts: 1 });
      expect(await f.db.payment.count({ where: { tenantId: f.tenant } })).toBe(
        1,
      );
      expect(
        (await api("/invoices/" + invoice.id, "GET", undefined, f.tokens.owner))
          .body.data.balanceVnd,
      ).toBe("0");
    });

    it("keeps a legacy event for its remaining eligible sibling, preserves the recorded hint and rejects foreign context and final-link revocation", async () => {
      const f = await fixture(),
        event = await f.event(true),
        w = await worker();
      const note = await f.db.notification.create({
        data: {
          tenantId: f.tenant,
          recipientUserId: f.actor,
          recipientRole: "guardian",
          subjectStudentId: f.children[0]!.id,
          eventId: event.id,
          type: event.eventType,
          entityType: "session",
          entityId: f.session.id,
        },
      });
      const revoke = async (i: number) => {
        const r = await api(
          `/students/${f.children[i]!.id}/guardians/${f.links[i]!.id}`,
          "DELETE",
          {
            version: f.links[i]!.version,
            reason: "Synthetic notification relation revocation",
          },
          f.tokens.owner,
        );
        expect(r.status).toBe(200);
      };
      await revoke(0);
      const remaining = await api(
        "/notifications/" + note.id,
        "GET",
        undefined,
        f.tokens.guardian,
      );
      expect(remaining.status).toBe(200);
      expect(remaining.body.data.subjectStudentIds).toEqual([
        f.children[1]!.id,
      ]);
      expect(remaining.body.data.subjectStudentId).toBe(f.children[1]!.id);
      expect(
        (await f.db.notification.findUniqueOrThrow({ where: { id: note.id } }))
          .subjectStudentId,
      ).toBe(f.children[0]!.id);
      const switched = await api(
        "/auth/switch-context",
        "POST",
        { tenantId: f.foreign, role: "guardian" },
        f.tokens.guardian,
      );
      expect(switched.status).toBe(200);
      expect(
        (
          await api(
            "/notifications/" + note.id,
            "GET",
            undefined,
            switched.body.data.accessToken,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            "/notifications/" + note.id,
            "GET",
            undefined,
            f.tokens.guardian,
          )
        ).status,
      ).toBe(401);
      const current = await context(f.actor, f.tenant, "guardian");
      await revoke(1);
      expect(
        (await api("/notifications/" + note.id, "GET", undefined, current))
          .status,
      ).toBe(404);
      expect(
        (await api("/notifications", "GET", undefined, current)).body.page
          .total,
      ).toBe(0);
      const delivery = await f.db.pushDelivery.create({
        data: {
          tenantId: f.tenant,
          notificationId: note.id,
          deviceId: f.device.id,
        },
      });
      let calls = 0;
      await w.deliverDomainEvent(f.db, event.id, async () => {
        calls++;
        return accepted();
      });
      expect(calls).toBe(0);
      expect(
        (
          await f.db.pushDelivery.findUniqueOrThrow({
            where: { id: delivery.id },
          })
        ).status,
      ).toBe("SUPPRESSED");
    });

    it("rechecks the actual assigned teacher and never exposes legacy unfinalized attendance or draft grades", async () => {
      const f = await fixture(),
        event = await f.event(),
        w = await worker();
      await w.deliverDomainEvent(f.db, event.id, async () => accepted());
      const note = await f.db.notification.findFirstOrThrow({
        where: {
          eventId: event.id,
          recipientUserId: f.actor,
          recipientRole: "teacher",
        },
      });
      const changed = await api(
        `/sessions/${f.session.id}/reschedule`,
        "POST",
        {
          sessionVersion: 1,
          teacherId: f.teachers[1]!.id,
          startsAt: f.session.startsAt.toISOString(),
          endsAt: f.session.endsAt.toISOString(),
          reason: "Synthetic teacher replacement notification scope",
        },
        f.tokens.owner,
      );
      expect(changed.status).toBe(201);
      expect(
        (
          await api(
            "/notifications/" + note.id,
            "GET",
            undefined,
            f.tokens.teacher,
          )
        ).status,
      ).toBe(404);
      expect(await w.notificationAuthorized(f.db, note)).toBe(false);
      const legacy = await f.db.classSession.create({
        data: {
          tenantId: f.tenant,
          classId: f.cls.id,
          teacherId: f.teachers[0]!.id,
          scheduledDate: new Date("2030-06-11Z"),
          startsAt: new Date("2030-06-11T01:00Z"),
          endsAt: new Date("2030-06-11T02:00Z"),
          status: "COMPLETED",
        },
      });
      await f.db.rosterRow.create({
        data: {
          tenantId: f.tenant,
          classId: f.cls.id,
          sessionId: legacy.id,
          studentId: f.children[0]!.id,
          enrollmentId: f.enrollments[0]!.id,
          displayName: f.children[0]!.fullName,
        },
      });
      await f.db.attendanceRecord.create({
        data: {
          tenantId: f.tenant,
          sessionId: legacy.id,
          studentId: f.children[0]!.id,
          status: "ABSENT_UNEXCUSED",
        },
      });
      const absence = await f.event(
        false,
        "ATTENDANCE_FINALIZED_ABSENT",
        legacy.id,
        1,
      );
      await w.deliverDomainEvent(f.db, absence.id, async () => {
        throw Error("Unpublished absence must not reach provider");
      });
      expect(
        await f.db.notification.count({ where: { eventId: absence.id } }),
      ).toBe(0);
      const draft = await f.db.assessment.create({
        data: {
          tenantId: f.tenant,
          classId: f.cls.id,
          title: "Synthetic unpublished assessment",
          heldAt: new Date("2030-06-10Z"),
          maxScore: "10.00",
          createdBy: f.owner,
        },
      });
      await f.db.assessmentResult.create({
        data: {
          tenantId: f.tenant,
          assessmentId: draft.id,
          studentId: f.children[0]!.id,
          score: "8.00",
          comment: "PRIVATE_UNPUBLISHED_NOTE",
          gradedBy: f.owner,
        },
      });
      const grade = await f.event(false, "GRADE_PUBLISHED", draft.id, 1);
      await w.deliverDomainEvent(f.db, grade.id, async () => {
        throw Error("Draft grade must not reach provider");
      });
      expect(
        await f.db.notification.count({ where: { eventId: grade.id } }),
      ).toBe(0);
      for (const [e, entityType] of [
        [absence, "session"],
        [grade, "assessment"],
      ] as const) {
        const legacyNote = await f.db.notification.create({
          data: {
            tenantId: f.tenant,
            recipientUserId: f.actor,
            recipientRole: "guardian",
            subjectStudentId: f.children[0]!.id,
            eventId: e.id,
            type: e.eventType,
            entityType,
            entityId: e.aggregateId,
          },
        });
        expect(
          (
            await api(
              "/notifications/" + legacyNote.id,
              "GET",
              undefined,
              f.tokens.guardian,
            )
          ).status,
        ).toBe(404);
      }
    });
  });
}
