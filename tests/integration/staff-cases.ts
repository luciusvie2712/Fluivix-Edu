import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Role } from "@prisma/client";
import { openToken } from "../../packages/server-crypto/src/index";
import { z } from "zod";

export function staffCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("staff administration: real tenant policy, invitation and owner invariants", () => {
    const tenantId = randomUUID(),
      otherTenant = randomUUID();
    const people = {
      owner: randomUUID(),
      second: randomUUID(),
      manager: randomUUID(),
      teacher: randomUUID(),
      guardian: randomUUID(),
      foreign: randomUUID(),
    };
    const members: Record<keyof typeof people, string> = {
      owner: "",
      second: "",
      manager: "",
      teacher: "",
      guardian: "",
      foreign: "",
    };
    const tokens: Record<string, string> = {};
    const reason = "Synthetic verified staff administration";
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    }
    async function login(
      userId: string,
      tenant = tenantId,
      role: Role = "owner",
    ) {
      const a = await api(
        "/mobile/auth/login",
        "POST",
        { email: userId + "@example.test", password },
        "",
      );
      expect(a.status).toBe(200);
      const b = await api(
        "/auth/switch-context",
        "POST",
        { tenantId: tenant, role },
        a.body.data.accessToken,
      );
      expect(b.status).toBe(200);
      return {
        token: b.body.data.accessToken as string,
        refreshToken: a.body.data.refreshToken as string,
      };
    }
    async function invitationToken(id: string) {
      const e = await getDb().outboxEvent.findFirstOrThrow({
        where: { aggregateId: id, eventType: "INVITATION_CREATED" },
      });
      return openToken(
        z.object({ encryptedToken: z.string() }).parse(e.payload)
          .encryptedToken,
      );
    }
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash();
      const plan = await db.plan.findUniqueOrThrow({
        where: { code: "TEST_PLAN" },
      });
      for (const id of [tenantId, otherTenant]) {
        await db.tenant.create({
          data: {
            id,
            slug: "staff-" + id,
            name: "Synthetic Staff",
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
      for (const [key, id] of Object.entries(people)) {
        const role: Role =
          key === "second" || key === "foreign" ? "owner" : (key as Role);
        await db.user.create({
          data: {
            id,
            email: id + "@example.test",
            displayName: "Synthetic " + key,
            status: "ACTIVE",
            passwordHash,
          },
        });
        const m = await db.membership.create({
          data: {
            tenantId: key === "foreign" ? otherTenant : tenantId,
            userId: id,
            status: "ACTIVE",
            roles: { create: { role } },
          },
        });
        members[key as keyof typeof people] = m.id;
      }
      for (const key of [
        "owner",
        "manager",
        "teacher",
        "guardian",
        "foreign",
      ] as const)
        tokens[key] = (
          await login(
            people[key],
            key === "foreign" ? otherTenant : tenantId,
            key === "foreign" ? "owner" : key,
          )
        ).token;
    });
    it("scopes directory, pagination, details and effective permissions; rejects other roles and tenant IDs", async () => {
      const a = await api("/staff?limit=2");
      expect(a.status).toBe(200);
      expect(a.body.data).toHaveLength(2);
      expect(a.body.page.total).toBe(4);
      expect(JSON.stringify(a.body)).not.toMatch(/passwordHash|tokenHash/);
      const b = await api("/staff?search=" + people.teacher);
      expect(b.body.data).toHaveLength(1);
      expect(b.body.data[0].roles[0].permissions).toContain(
        "teaching.read.assigned",
      );
      expect((await api("/staff/" + members.foreign)).status).toBe(404);
      expect(
        (
          await api(
            "/staff/" + members.teacher,
            "PATCH",
            { version: 1, status: "SUSPENDED", reason },
            tokens.foreign,
          )
        ).status,
      ).toBe(404);
      for (const token of [tokens.teacher, tokens.guardian])
        expect((await api("/staff", "GET", undefined, token)).status).toBe(403);
      expect((await api("/staff?limit=101")).status).toBe(422);
      const p = await api("/permissions");
      expect(p.body.data).toHaveLength(7);
      expect(
        (await api("/permissions", "GET", undefined, tokens.manager)).status,
      ).toBe(403);
    });
    it("resends atomically, rejects old/expired/reused invitations and reserves membership without granting access", async () => {
      const email = randomUUID() + "@example.test";
      const a = await api("/staff", "POST", { email, role: "teacher" });
      expect(a.status).toBe(201);
      const old = await invitationToken(a.body.data.invitationId);
      const m = await getDb().membership.findFirstOrThrow({
        where: { tenantId, user: { email } },
      });
      expect(m.status).toBe("INVITED");
      const pending = await api("/staff/" + m.id);
      expect(
        pending.body.data.roles.every(
          (r: { permissions: string[] }) => r.permissions.length === 0,
        ),
      ).toBe(true);
      expect(
        (
          await api("/staff/" + m.id, "PATCH", {
            version: m.version,
            status: "ACTIVE",
            reason,
          })
        ).status,
      ).toBe(409);
      await getDb().invitation.update({
        where: { id: a.body.data.invitationId },
        data: { expiresAt: new Date(0) },
      });
      const redeem = { token: old, password, displayName: "Confirmed staff" };
      expect(
        (await api("/auth/accept-invitation", "POST", redeem, "")).status,
      ).toBe(401);
      const b = await api(
        "/staff/invitations/" + a.body.data.invitationId + "/resend",
        "POST",
        {},
      );
      expect(b.status).toBe(201);
      expect(
        (await api("/auth/accept-invitation", "POST", redeem, "")).status,
      ).toBe(401);
      const token = await invitationToken(b.body.data.invitationId);
      expect(
        (await api("/auth/accept-invitation", "POST", { ...redeem, token }, ""))
          .status,
      ).toBe(200);
      expect(
        (await api("/auth/accept-invitation", "POST", { ...redeem, token }, ""))
          .status,
      ).toBe(401);
      expect(
        (
          await api(
            "/staff/invitations/" + b.body.data.invitationId + "/resend",
            "POST",
            {},
          )
        ).status,
      ).toBe(409);
      expect(
        (await getDb().user.findUniqueOrThrow({ where: { email } })).status,
      ).toBe("ACTIVE");
      expect(
        (
          await api("/staff", "POST", {
            email: people.owner + "@example.test",
            role: "accountant",
          })
        ).status,
      ).toBe(403);
      const list = await api("/staff/invitations?search=" + email);
      expect(
        list.body.data.map((v: { status: string }) => v.status).sort(),
      ).toEqual(["ACCEPTED", "REVOKED"]);
    });
    it("restores pending membership safely, suppresses revoked invitation mail and respects read-only mode", async () => {
      const email = randomUUID() + "@example.test";
      const a = await api("/staff", "POST", { email, role: "teacher" });
      expect(a.status).toBe(201);
      const m = await getDb().membership.findFirstOrThrow({
        where: { tenantId, user: { email } },
      });
      expect(
        (
          await api("/staff/" + m.id, "PATCH", {
            version: m.version,
            status: "REVOKED",
            reason,
          })
        ).status,
      ).toBe(200);
      const event = await getDb().outboxEvent.findFirstOrThrow({
        where: { aggregateId: a.body.data.invitationId },
      });
      const { deliver } = await import("../../apps/worker/dist/delivery.js");
      process.env.MAIL_PROVIDER = "mailpit";
      await deliver(getDb(), event.id, "http://localhost:3000");
      expect(
        (
          await getDb().outboxEvent.findUniqueOrThrow({
            where: { id: event.id },
          })
        ).processedAt,
      ).not.toBeNull();
      expect(
        await getDb().mailDelivery.count({ where: { eventId: event.id } }),
      ).toBe(0);
      const restore = await api("/staff/" + m.id, "PATCH", {
        version: m.version + 1,
        status: "INVITED",
        reason,
      });
      expect(restore.status).toBe(200);
      expect(
        (await api("/staff", "POST", { email, role: "teacher" })).status,
      ).toBe(201);
      await getDb().tenant.update({
        where: { id: tenantId },
        data: { status: "READ_ONLY" },
      });
      try {
        expect((await api("/staff")).status).toBe(200);
        expect(
          (
            await api("/staff", "POST", {
              email: randomUUID() + "@example.test",
              role: "teacher",
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await api("/staff/" + m.id, "PATCH", {
              version: restore.body.data.version,
              status: "REVOKED",
              reason,
            })
          ).status,
        ).toBe(403);
      } finally {
        await getDb().tenant.update({
          where: { id: tenantId },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("supports an existing multi-tenant identity without replacing its password or other memberships", async () => {
      const email = people.foreign + "@example.test";
      const before = await getDb().user.findUniqueOrThrow({
        where: { id: people.foreign },
      });
      const a = await api("/staff", "POST", { email, role: "teacher" });
      expect(a.status).toBe(201);
      let token = await invitationToken(a.body.data.invitationId);
      const waiting = await getDb().membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId, userId: people.foreign } },
      });
      expect((await api("/staff/" + waiting.id)).body.data.displayName).toBe(
        email,
      );
      expect(
        (await api("/staff?status=INVITED&search=Synthetic%20foreign")).body
          .data,
      ).toEqual([]);
      expect(
        (
          await api(
            "/auth/accept-invitation",
            "POST",
            { token, password: "Wrong-Password-2026", displayName: "Changed" },
            "",
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await api("/staff/" + waiting.id, "PATCH", {
            version: waiting.version,
            status: "SUSPENDED",
            reason,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api("/staff/" + waiting.id, "PATCH", {
            version: waiting.version + 1,
            status: "ACTIVE",
            reason,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await api("/staff/" + waiting.id, "PATCH", {
            version: waiting.version + 1,
            status: "ACTIVE",
            activationPending: false,
            reason,
          })
        ).status,
      ).toBe(422);
      expect((await api("/staff/" + waiting.id)).body.data.displayName).toBe(
        email,
      );
      expect(
        (await api("/staff?search=Synthetic%20foreign")).body.data,
      ).toEqual([]);
      await expect(
        getDb().membership.update({
          where: { id: waiting.id },
          data: { status: "ACTIVE" },
        }),
      ).rejects.toThrow("membership_activation_required");
      expect(
        (
          await api(
            "/auth/accept-invitation",
            "POST",
            { token, password, displayName: "Changed" },
            "",
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await api("/staff/" + waiting.id, "PATCH", {
            version: waiting.version + 1,
            status: "INVITED",
            reason,
          })
        ).status,
      ).toBe(200);
      const replacement = await api("/staff", "POST", {
        email,
        role: "teacher",
      });
      expect(replacement.status).toBe(201);
      token = await invitationToken(replacement.body.data.invitationId);
      expect(
        (
          await api(
            "/auth/accept-invitation",
            "POST",
            { token, password, displayName: "Changed" },
            "",
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await getDb().user.findUniqueOrThrow({
            where: { id: people.foreign },
          })
        ).passwordHash,
      ).toBe(before.passwordHash);
      expect(
        (await api("/staff", "GET", undefined, tokens.foreign)).status,
      ).toBe(200);
      expect(
        (
          await getDb().membership.findUniqueOrThrow({
            where: { id: members.foreign },
          })
        ).status,
      ).toBe("ACTIVE");
    });
    it("enforces owner delegation immediately and denies manager escalation, protected targets and role writes", async () => {
      const invite = { email: randomUUID() + "@example.test", role: "teacher" };
      expect((await api("/staff", "POST", invite, tokens.manager)).status).toBe(
        403,
      );
      const manager = await api("/staff/" + members.manager);
      const grant = await api("/staff/" + members.manager, "PATCH", {
        version: manager.body.data.version,
        staffDelegated: true,
        reason,
      });
      expect(grant.status).toBe(200);
      expect((await api("/staff", "POST", invite, tokens.manager)).status).toBe(
        201,
      );
      for (const role of ["owner", "manager", "accountant"])
        expect(
          (
            await api(
              "/staff",
              "POST",
              { email: randomUUID() + "@example.test", role },
              tokens.manager,
            )
          ).status,
        ).toBe(403);
      const financeEmail = randomUUID() + "@example.test";
      expect(
        (
          await api("/staff", "POST", {
            email: financeEmail,
            role: "accountant",
          })
        ).status,
      ).toBe(201);
      const financeMember = await getDb().membership.findFirstOrThrow({
        where: { tenantId, user: { email: financeEmail } },
      });
      expect(
        (
          await api(
            "/staff/" + financeMember.id,
            "PATCH",
            { version: financeMember.version, status: "SUSPENDED", reason },
            tokens.manager,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(
            "/staff/" + members.owner,
            "PATCH",
            { version: 1, status: "SUSPENDED", reason },
            tokens.manager,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(
            "/staff/" + members.manager,
            "PATCH",
            { version: grant.body.data.version, staffDelegated: true, reason },
            tokens.manager,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(
            "/staff/" + members.teacher + "/roles",
            "POST",
            { version: 1, role: "owner", reason },
            tokens.manager,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api("/staff/" + members.manager, "PATCH", {
            version: grant.body.data.version,
            staffDelegated: false,
            reason,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api(
            "/staff",
            "POST",
            { email: randomUUID() + "@example.test", role: "teacher" },
            tokens.manager,
          )
        ).status,
      ).toBe(403);
      const audit = await getDb().auditLog.findFirstOrThrow({
        where: {
          tenantId,
          resourceId: members.manager,
          action: "staff.update",
        },
      });
      expect(audit.reason).toBe(reason);
      expect(audit.metadata).toBeTruthy();
    });
    it("rechecks delegation after waiting for the tenant lock, rather than trusting earlier guard authorization", async () => {
      const m = await getDb().membership.findUniqueOrThrow({
        where: { id: members.manager },
      });
      expect(
        (
          await api("/staff/" + m.id, "PATCH", {
            version: m.version,
            staffDelegated: true,
            reason,
          })
        ).status,
      ).toBe(200);
      let pending: ReturnType<typeof api> | undefined;
      const email = randomUUID() + "@example.test";
      await getDb().$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
          pending = api(
            "/staff",
            "POST",
            { email, role: "teacher" },
            tokens.manager,
          );
          await expect
            .poll(async () => {
              // Observe live locks, not transaction-cached pg_stat_activity.
              const rows = await tx.$queryRaw<
                { waiting: bigint }[]
              >`SELECT count(*) AS waiting FROM pg_locks pending
                JOIN pg_locks held ON held.locktype=pending.locktype
                  AND held.transactionid=pending.transactionid AND held.granted
                WHERE NOT pending.granted AND held.pid=pg_backend_pid()`;
              return Number(rows[0]?.waiting ?? 0n);
            })
            .toBeGreaterThan(0);
          await tx.membership.update({
            where: { id: m.id },
            data: { staffDelegated: false, version: { increment: 1 } },
          });
        },
        { timeout: 10000 },
      );
      expect((await pending!).status).toBe(403);
      expect(
        await getDb().invitation.count({ where: { tenantId, email } }),
      ).toBe(0);
    });
    it("uses optimistic versions, invalidates removed-role invitations and blocks revoked access/refresh privileges", async () => {
      const target = members.teacher;
      const m = (await api("/staff/" + target)).body.data;
      const invitation = await api("/staff", "POST", {
        email: people.teacher + "@example.test",
        role: "accountant",
      });
      expect(invitation.status).toBe(201);
      const inviteToken = await invitationToken(
        invitation.body.data.invitationId,
      );
      const grant = await api("/staff/" + target + "/roles", "POST", {
        version: m.version,
        role: "accountant",
        reason,
      });
      expect(grant.status).toBe(201);
      expect(
        (
          await api("/staff/" + target, "PATCH", {
            version: m.version,
            status: "SUSPENDED",
            reason,
          })
        ).status,
      ).toBe(409);
      const removed = await api(
        "/staff/" + target + "/roles/accountant",
        "DELETE",
        { version: grant.body.data.version, reason },
      );
      expect(removed.status).toBe(200);
      expect(
        (
          await api(
            "/auth/accept-invitation",
            "POST",
            { token: inviteToken, password, displayName: "Teacher" },
            "",
          )
        ).status,
      ).toBe(401);
      const session = await login(people.teacher, tenantId, "teacher");
      expect(
        (
          await api("/staff/" + target, "PATCH", {
            version: removed.body.data.version,
            status: "REVOKED",
            reason,
          })
        ).status,
      ).toBe(200);
      expect(
        (await api("/classes", "GET", undefined, session.token)).status,
      ).toBe(403);
      const revoked = await api("/staff/" + target);
      expect(
        revoked.body.data.roles.every(
          (r: { permissions: string[] }) => r.permissions.length === 0,
        ),
      ).toBe(true);
      const refreshed = await api(
        "/mobile/auth/refresh",
        "POST",
        { refreshToken: session.refreshToken },
        "",
      );
      expect(refreshed.status).toBe(200);
      const me = await api(
        "/me",
        "GET",
        undefined,
        refreshed.body.data.accessToken,
      );
      expect(me.body.data.activeRole).toBeNull();
      expect(me.body.data.activeTenantId).toBeNull();
      expect(
        (
          await api("/staff/" + target, "PATCH", {
            version: removed.body.data.version + 1,
            status: "ACTIVE",
            reason,
          })
        ).status,
      ).toBe(200);
    });
    it("preserves the last active owner in SQL and concurrent API changes, with no lost update", async () => {
      const db = getDb();
      const second = (await api("/staff/" + members.second)).body.data;
      expect(
        (
          await api("/staff/" + members.second, "PATCH", {
            version: second.version,
            status: "SUSPENDED",
            reason,
          })
        ).status,
      ).toBe(200);
      await expect(
        db.membership.update({
          where: { id: members.owner },
          data: { status: "REVOKED" },
        }),
      ).rejects.toThrow("last active owner");
      await expect(
        db.membershipRole.delete({
          where: {
            membershipId_role: { membershipId: members.owner, role: "owner" },
          },
        }),
      ).rejects.toThrow("last active owner");
      expect(
        (
          await api("/staff/" + members.owner, "PATCH", {
            version: 1,
            status: "REVOKED",
            reason,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await api("/staff/" + members.second, "PATCH", {
            version: second.version + 1,
            status: "ACTIVE",
            reason,
          })
        ).status,
      ).toBe(200);
      const other = (await login(people.second)).token;
      await db.user.update({
        where: { id: people.second },
        data: { status: "DISABLED" },
      });
      try {
        const live = (await api("/staff/" + members.owner)).body.data;
        expect(
          (
            await api("/staff/" + members.owner, "PATCH", {
              version: live.version,
              status: "SUSPENDED",
              reason,
            })
          ).status,
        ).toBe(409);
        await expect(
          db.membership.update({
            where: { id: members.owner },
            data: { status: "SUSPENDED" },
          }),
        ).rejects.toThrow("last active owner");
      } finally {
        await db.user.update({
          where: { id: people.second },
          data: { status: "ACTIVE" },
        });
      }
      await expect(
        db.$transaction(
          (tx) =>
            tx.membership.update({
              where: { id: members.second },
              data: { status: "SUSPENDED" },
            }),
          { isolationLevel: "RepeatableRead" },
        ),
      ).rejects.toThrow("READ COMMITTED");
      const a = (await api("/staff/" + members.owner)).body.data,
        b = (await api("/staff/" + members.second)).body.data;
      const outcomes = await Promise.all([
        api("/staff/" + a.id, "PATCH", {
          version: a.version,
          status: "SUSPENDED",
          reason,
        }),
        api(
          "/staff/" + b.id,
          "PATCH",
          { version: b.version, status: "SUSPENDED", reason },
          other,
        ),
      ]);
      expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await db.membership.count({
          where: {
            tenantId,
            status: "ACTIVE",
            roles: { some: { role: "owner" } },
          },
        }),
      ).toBe(1);
    });
  });
}
