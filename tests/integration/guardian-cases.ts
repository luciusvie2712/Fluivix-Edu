import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { openToken } from "../../packages/server-crypto/src/index";
import {
  NativeSession,
  StaleContext,
  unwrap,
} from "../../apps/mobile/lib/session-client";

export function guardianCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("guardian contact, verified relationships and revocation against real PostgreSQL", () => {
    const tenant = randomUUID(),
      otherTenant = randomUUID();
    const ids = {
      owner: randomUUID(),
      other: randomUUID(),
      academic: randomUUID(),
      teacher: randomUUID(),
      accountant: randomUUID(),
      guardian: randomUUID(),
      foreign: randomUUID(),
      global: randomUUID(),
    };
    const child1 = randomUUID(),
      child2 = randomUUID(),
      foreignChild = randomUUID();
    const tokens = {
      owner: "",
      other: "",
      academic: "",
      teacher: "",
      accountant: "",
      guardian: "",
    };
    const basis = "Verified synthetic relationship at the centre";
    async function api(
      route: string,
      method = "GET",
      body?: unknown,
      token = tokens.owner,
    ) {
      const r = await fetch(getBase() + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    }
    async function select(email: string, tenantId: string, role: Role) {
      const a = await api(
        "/mobile/auth/login",
        "POST",
        { email, password },
        "",
      );
      expect(a.status).toBe(200);
      const b = await api(
        "/auth/switch-context",
        "POST",
        { tenantId, role },
        a.body.data.accessToken,
      );
      expect(b.status).toBe(200);
      return b.body.data.accessToken as string;
    }
    async function tokenOf(id: string) {
      const e = await getDb().outboxEvent.findFirstOrThrow({
        where: { aggregateId: id, eventType: "INVITATION_CREATED" },
      });
      return openToken(
        z.object({ encryptedToken: z.string() }).parse(e.payload)
          .encryptedToken,
      );
    }
    async function student() {
      return getDb().student.create({
        data: {
          tenantId: tenant,
          studentCode: "G-" + randomUUID(),
          fullName: "Synthetic guardian workflow child",
          notesPrivate: "PRIVATE GUARDIAN NOTE",
        },
      });
    }
    async function create(studentId: string, userId: string = ids.guardian) {
      const r = await api(`/students/${studentId}/guardians`, "POST", {
        guardianUserId: userId,
        relationType: "PARENT",
      });
      expect(r.status).toBe(201);
      return r.body.data as { id: string; version: number; status: string };
    }
    async function approve(
      studentId: string,
      link: { id: string; version: number },
    ) {
      const r = await api(
        `/students/${studentId}/guardians/${link.id}/approve`,
        "POST",
        { version: link.version, verificationMethod: basis },
      );
      expect(r.status).toBe(201);
      return r;
    }
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash();
      const plan = await db.plan.findUniqueOrThrow({
        where: { code: "TEST_PLAN" },
      });
      for (const id of [tenant, otherTenant]) {
        await db.tenant.create({
          data: {
            id,
            slug: "guardian-" + id,
            name: "Synthetic guardian tenant",
            status: "ACTIVE",
            subscriptionEndsAt: new Date("2028-01-01Z"),
            graceUntil: new Date("2028-02-01Z"),
          },
        });
        await db.subscription.create({
          data: {
            tenantId: id,
            planId: plan.id,
            startsAt: new Date("2020-01-01Z"),
            endsAt: new Date("2028-01-01Z"),
            graceUntil: new Date("2028-02-01Z"),
          },
        });
      }
      for (const [key, tenantId, role] of [
        ["owner", tenant, "owner"],
        ["other", otherTenant, "owner"],
        ["academic", tenant, "academic_staff"],
        ["teacher", tenant, "teacher"],
        ["accountant", tenant, "accountant"],
        ["guardian", tenant, "guardian"],
        ["foreign", otherTenant, "guardian"],
        ["global", otherTenant, "owner"],
      ] as const) {
        await db.user.create({
          data: {
            id: ids[key],
            email: ids[key] + "@example.test",
            displayName:
              key === "global"
                ? "PRIVATE GLOBAL NAME"
                : key === "foreign"
                  ? "OTHER TENANT ONLY"
                  : "Guardian " + key,
            status: "ACTIVE",
            passwordHash,
          },
        });
        await db.membership.create({
          data: {
            tenantId,
            userId: ids[key],
            status: "ACTIVE",
            roles: { create: { role } },
          },
        });
      }
      for (const [id, tenantId, code] of [
        [child1, tenant, "GC1"],
        [child2, tenant, "GC2"],
        [foreignChild, otherTenant, "GCF"],
      ] as const)
        await db.student.create({
          data: {
            id,
            tenantId,
            studentCode: code,
            fullName: "Synthetic " + code,
            notesPrivate: "PRIVATE GUARDIAN NOTE",
          },
        });
      for (const [key, tenantId, role] of [
        ["owner", tenant, "owner"],
        ["other", otherTenant, "owner"],
        ["academic", tenant, "academic_staff"],
        ["teacher", tenant, "teacher"],
        ["accountant", tenant, "accountant"],
        ["guardian", tenant, "guardian"],
      ] as const)
        tokens[key] = await select(ids[key] + "@example.test", tenantId, role);
    });
    it("provisions without mail/access, approves before activation, then uses real invitation proof without recording consent", async () => {
      const email = randomUUID() + "@example.test";
      const p = await api("/guardians", "POST", { email });
      expect(p.status).toBe(201);
      expect(p.body.data).toMatchObject({
        displayName: email,
        membershipStatus: "INVITED",
        activationPending: true,
        accessReady: false,
        activeStudents: 0,
      });
      expect(
        await getDb().invitation.count({ where: { tenantId: tenant, email } }),
      ).toBe(0);
      const userId = p.body.data.userId as string;
      const link = await create(child1, userId);
      expect(link.status).toBe("PENDING");
      expect(link.version).toBe(1);
      const approved = await approve(child1, link);
      expect(approved.body.data).toMatchObject({
        status: "ACTIVE",
        version: 2,
      });
      expect(
        (await api("/mobile/auth/login", "POST", { email, password }, ""))
          .status,
      ).toBe(401);
      const { notificationAuthorized } = await import(
        "../../apps/worker/dist/notifications.js"
      );
      expect(
        await notificationAuthorized(getDb(), {
          tenantId: tenant,
          recipientUserId: userId,
          recipientRole: "guardian",
          subjectStudentId: child1,
        }),
      ).toBe(false);
      const invite = await api(`/guardians/${userId}/invite`, "POST", {});
      expect(invite.status).toBe(201);
      const token = await tokenOf(invite.body.data.invitationId);
      expect(
        (
          await api(
            "/auth/accept-invitation",
            "POST",
            { token, password, displayName: "Verified guardian" },
            "",
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await api(
            "/auth/accept-invitation",
            "POST",
            { token, password, displayName: "Verified guardian" },
            "",
          )
        ).status,
      ).toBe(401);
      const signed = await select(email, tenant, "guardian");
      const visible = await api(
        "/mobile/guardian/students",
        "GET",
        undefined,
        signed,
      );
      expect(visible.body.data.map((s: { id: string }) => s.id)).toEqual([
        child1,
      ]);
      const profile = await api(
        `/mobile/guardian/students/${child1}/profile`,
        "GET",
        undefined,
        signed,
      );
      expect(profile.status).toBe(200);
      expect(JSON.stringify(profile.body)).not.toMatch(
        /PRIVATE GUARDIAN NOTE|notesPrivate/,
      );
      expect((await api(`/guardians/${userId}`)).body.data.accessReady).toBe(
        true,
      );
      const history = await api(
        `/students/${child1}/guardians/${link.id}/history`,
      );
      expect(history.body.page.total).toBe(2);
      expect(history.body.data[0]).toMatchObject({
        eventType: "APPROVED",
        actorDisplayName: "Guardian owner",
        traceId: approved.body.meta.traceId,
        verificationMethod: basis,
      });
      expect(
        await getDb().privacyConsent.count({
          where: {
            tenantId: tenant,
            subjectStudentId: child1,
            consentingUserId: userId,
          },
        }),
      ).toBe(0);
    });
    it("keeps global identities private before acceptance and does not grant a guardian role to active staff at provisioning", async () => {
      const email = ids.global + "@example.test";
      const before = await getDb().user.findUniqueOrThrow({
        where: { id: ids.global },
      });
      const p = await api("/guardians", "POST", { email });
      expect(p.status).toBe(201);
      expect(p.body.data.displayName).toBe(email);
      expect(
        (await api("/guardians?search=PRIVATE%20GLOBAL")).body.data,
      ).toEqual([]);
      const link = await create(child2, ids.global);
      await approve(child2, link);
      const signed = await api(
        "/mobile/auth/login",
        "POST",
        { email, password },
        "",
      );
      expect(signed.status).toBe(200);
      expect(
        (
          await api(
            "/auth/switch-context",
            "POST",
            { tenantId: tenant, role: "guardian" },
            signed.body.data.accessToken,
          )
        ).status,
      ).toBe(403);
      const invite = await api(`/guardians/${ids.global}/invite`, "POST", {});
      expect(invite.status).toBe(201);
      const token = await tokenOf(invite.body.data.invitationId);
      expect(
        (
          await api(
            "/auth/accept-invitation",
            "POST",
            {
              token,
              password: "Wrong-Guardian-Password-2026",
              displayName: "Overwrite",
            },
            "",
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await api(
            "/auth/accept-invitation",
            "POST",
            { token, password, displayName: "Overwrite" },
            "",
          )
        ).status,
      ).toBe(200);
      const after = await getDb().user.findUniqueOrThrow({
        where: { id: ids.global },
      });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.displayName).toBe(before.displayName);
      expect(
        (
          await getDb().membership.findUniqueOrThrow({
            where: {
              tenantId_userId: { tenantId: otherTenant, userId: ids.global },
            },
          })
        ).status,
      ).toBe("ACTIVE");
      const teacher = await api("/guardians", "POST", {
        email: ids.teacher + "@example.test",
      });
      expect(teacher.status).toBe(201);
      expect(teacher.body.data.guardianRoleGranted).toBe(false);
      const membership = await getDb().membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: tenant, userId: ids.teacher } },
      });
      expect(
        await getDb().membershipRole.findUnique({
          where: {
            membershipId_role: {
              membershipId: membership.id,
              role: "guardian",
            },
          },
        }),
      ).toBeNull();
      const own = await api(
        "/guardians",
        "POST",
        { email: ids.academic + "@example.test" },
        tokens.academic,
      );
      expect(own.status).toBe(201);
      expect(own.body.data.guardianRoleGranted).toBe(false);
      expect(
        (
          await api(
            `/guardians/${ids.academic}/invite`,
            "POST",
            {},
            tokens.academic,
          )
        ).status,
      ).toBe(403);
    });
    it("uses versions, meaningful verification and append-only tenant-bound history; repeated revocation does not duplicate audit", async () => {
      const child = await student(),
        link = await create(child.id);
      const path = `/students/${child.id}/guardians/${link.id}`;
      expect(
        (
          await api(path + "/approve", "POST", {
            version: link.version,
            verificationMethod: "          ",
          })
        ).status,
      ).toBe(422);
      const approved = await approve(child.id, link);
      expect(
        (await api(path, "DELETE", { version: link.version, reason: basis }))
          .status,
      ).toBe(409);
      const revoked = await api(path, "DELETE", {
        version: approved.body.data.version,
        reason: "Synthetic guardian access revoked",
      });
      expect(revoked.status).toBe(200);
      expect(revoked.body.data.version).toBe(3);
      expect(
        (await api(path, "DELETE", { reason: "Synthetic duplicate request" }))
          .status,
      ).toBe(200);
      expect(
        (await api(path + "/approve", "POST", { verificationMethod: basis }))
          .status,
      ).toBe(409);
      const history = await api(path + "/history?limit=2");
      expect(history.body.page).toMatchObject({ total: 3, totalPages: 2 });
      expect(
        history.body.data.map((e: { eventType: string }) => e.eventType),
      ).toEqual(["REVOKED", "APPROVED"]);
      const record = await getDb().guardianLinkEvent.findFirstOrThrow({
        where: { tenantId: tenant, linkId: link.id },
      });
      await expect(
        getDb().guardianLinkEvent.update({
          where: { id: record.id },
          data: { reason: "Alter history" },
        }),
      ).rejects.toThrow("append only");
      await expect(
        getDb().guardianLinkEvent.delete({ where: { id: record.id } }),
      ).rejects.toThrow("append only");
      await expect(
        getDb().guardianLink.delete({ where: { id: link.id } }),
      ).rejects.toThrow("cannot be deleted");
      await expect(
        getDb().guardianLink.update({
          where: { id: link.id },
          data: { studentId: child1 },
        }),
      ).rejects.toThrow("identity is immutable");
      expect(
        await getDb().auditLog.count({
          where: {
            tenantId: tenant,
            resourceId: link.id,
            action: "guardian.link.revoked",
          },
        }),
      ).toBe(1);
    });
    it("blocks foreign profiles/nested links/verifiers and unauthorized roles, while READ_ONLY permits only reads", async () => {
      for (const token of [
        tokens.teacher,
        tokens.accountant,
        tokens.guardian,
      ]) {
        expect((await api("/guardians", "GET", undefined, token)).status).toBe(
          403,
        );
        expect(
          (
            await api(
              "/guardians",
              "POST",
              { email: randomUUID() + "@example.test" },
              token,
            )
          ).status,
        ).toBe(403);
      }
      expect((await api(`/guardians/${ids.foreign}`)).status).toBe(404);
      expect(
        (
          await api(
            `/guardians/${ids.guardian}`,
            "GET",
            undefined,
            tokens.other,
          )
        ).status,
      ).toBe(404);
      expect(JSON.stringify((await api("/guardians")).body)).not.toContain(
        "OTHER TENANT ONLY",
      );
      expect((await api("/guardians?limit=101")).status).toBe(422);
      expect(
        (
          await api(`/students/${foreignChild}/guardians`, "POST", {
            guardianUserId: ids.guardian,
            relationType: "PARENT",
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await api(`/students/${child1}/guardians`, "POST", {
            guardianUserId: ids.foreign,
            relationType: "PARENT",
          })
        ).status,
      ).toBe(404);
      const child = await student(),
        link = await create(child.id);
      expect(
        (await api(`/students/${child1}/guardians/${link.id}/history`)).status,
      ).toBe(404);
      const raw = await student();
      await expect(
        getDb().guardianLink.create({
          data: {
            tenantId: tenant,
            studentId: raw.id,
            guardianUserId: ids.guardian,
            status: "ACTIVE",
            verifiedAt: new Date(),
            verifiedBy: ids.other,
          },
        }),
      ).rejects.toThrow();
      await expect(
        getDb().$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('fluivixedu.actor_id',${ids.other},true)`;
          await tx.guardianLink.create({
            data: {
              tenantId: tenant,
              studentId: raw.id,
              guardianUserId: ids.guardian,
            },
          });
        }),
      ).rejects.toThrow();
      expect(
        await getDb().guardianLink.count({
          where: { tenantId: tenant, studentId: raw.id },
        }),
      ).toBe(0);
      await getDb().tenant.update({
        where: { id: tenant },
        data: { status: "READ_ONLY" },
      });
      try {
        expect((await api("/guardians")).status).toBe(200);
        expect(
          (
            await api("/guardians", "POST", {
              email: randomUUID() + "@example.test",
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await api(
              `/students/${child.id}/guardians/${link.id}/approve`,
              "POST",
              { verificationMethod: basis },
            )
          ).status,
        ).toBe(403);
      } finally {
        await getDb().tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("deduplicates concurrent pending links in service and SQL and rechecks a suspended verifier after waiting for the tenant lock", async () => {
      const child = await student();
      const outcomes = await Promise.all([
        api(`/students/${child.id}/guardians`, "POST", {
          guardianUserId: ids.guardian,
          relationType: "PARENT",
        }),
        api(`/students/${child.id}/guardians`, "POST", {
          guardianUserId: ids.guardian,
          relationType: "PARENT",
        }),
      ]);
      expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
      const link = await getDb().guardianLink.findFirstOrThrow({
        where: {
          tenantId: tenant,
          studentId: child.id,
          guardianUserId: ids.guardian,
        },
      });
      await expect(
        getDb().guardianLink.create({
          data: {
            tenantId: tenant,
            studentId: child.id,
            guardianUserId: ids.guardian,
          },
        }),
      ).rejects.toThrow();
      const member = await getDb().membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: tenant, userId: ids.academic } },
      });
      let pending: ReturnType<typeof api> | undefined;
      try {
        await getDb().$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenant}::uuid FOR UPDATE`;
            pending = api(
              `/students/${child.id}/guardians/${link.id}/approve`,
              "POST",
              { version: link.version, verificationMethod: basis },
              tokens.academic,
            );
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
        expect(
          (
            await getDb().guardianLink.findUniqueOrThrow({
              where: { id: link.id },
            })
          ).status,
        ).toBe("PENDING");
      } finally {
        await getDb().membership.update({
          where: { id: member.id },
          data: { status: "ACTIVE", version: { increment: 1 } },
        });
      }
    });
    it("TC005: a real native client clears the child cache and rejects delayed genuine profile bytes after revocation", async () => {
      const a = await create(child1),
        b = await create(child2);
      await approve(child1, a);
      await approve(child2, b);
      let credential: string | null = null,
        cached: unknown,
        invalidations = 0,
        hold = false,
        release!: () => void,
        ready!: () => void;
      const gate = new Promise<void>((r) => {
          release = r;
        }),
        captured = new Promise<void>((r) => {
          ready = r;
        });
      const transport: typeof fetch = async (input, init) => {
        const request = new Request(input, init),
          response = await fetch(request);
        if (
          hold &&
          request.url.endsWith(`/mobile/guardian/students/${child1}/profile`) &&
          response.ok
        ) {
          hold = false;
          const bytes = await response.arrayBuffer();
          ready();
          await gate;
          return new Response(bytes, {
            status: response.status,
            headers: response.headers,
          });
        }
        return response;
      };
      const client = new NativeSession(
        getBase().replace(/\/api\/v1$/, ""),
        {
          get: async () => credential,
          set: async (v) => {
            credential = v;
          },
          remove: async () => {
            credential = null;
          },
        },
        () => {
          invalidations++;
          cached = null;
        },
        () => {},
        transport,
      );
      await client.login(ids.guardian + "@example.test", password);
      await client.switchContext(tenant, "guardian");
      cached = unwrap(
        await client.api.GET("/api/v1/mobile/guardian/students/{id}/profile", {
          params: { path: { id: child1 } },
        }),
      );
      const before = invalidations;
      expect(cached).toBeTruthy();
      hold = true;
      const old = client.api.GET(
        "/api/v1/mobile/guardian/students/{id}/profile",
        { params: { path: { id: child1 } } },
      );
      try {
        await captured;
        expect(
          (
            await api(`/students/${child1}/guardians/${a.id}`, "DELETE", {
              reason: "Revoked while genuine profile response was delayed",
            })
          ).status,
        ).toBe(200);
        const denied = await client.api.GET(
          "/api/v1/mobile/guardian/students/{id}/profile",
          { params: { path: { id: child1 } } },
        );
        expect(denied.response.status).toBe(404);
        expect(cached).toBeNull();
        expect(invalidations).toBeGreaterThan(before);
        const rejected = expect(old).rejects.toBeInstanceOf(StaleContext);
        release();
        await rejected;
        const remaining = unwrap(
          await client.api.GET("/api/v1/mobile/guardian/students"),
        );
        expect(remaining.map((s) => s.id)).toEqual([child2]);
      } finally {
        release();
      }
      await client.logout();
    });
  });
}
