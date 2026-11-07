import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { PrismaClient, Role } from "@prisma/client";

export function tenantSettingsCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  async function api(
    path: string,
    method: string,
    token: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(getBase() + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function context(id: string, tenantId: string, role: Role) {
    const login = await api("/mobile/auth/login", "POST", "", {
      email: id + "@example.test",
      password,
    });
    expect(login.status).toBe(200);
    const scope = await api(
      "/auth/switch-context",
      "POST",
      login.body.data.accessToken,
      { tenantId, role },
    );
    expect(scope.status).toBe(200);
    return scope.body.data.accessToken as string;
  }
  async function fixture() {
    const db = getDb(),
      tenantId = randomUUID(),
      foreignId = randomUUID(),
      owner = randomUUID(),
      actor = randomUUID(),
      passwordHash = await hash();
    const plan = await db.plan.findUniqueOrThrow({
      where: { code: "TEST_PLAN" },
    });
    for (const id of [tenantId, foreignId]) {
      await db.tenant.create({
        data: {
          id,
          slug: "settings-" + id,
          name:
            id === tenantId
              ? "Synthetic settings centre"
              : "FOREIGN_SETTINGS_MARKER",
          contactEmail: "centre@example.test",
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
    for (const id of [owner, actor])
      await db.user.create({
        data: {
          id,
          email: id + "@example.test",
          displayName: "Synthetic settings operator",
          passwordHash,
          status: "ACTIVE",
        },
      });
    await db.membership.create({
      data: {
        tenantId,
        userId: owner,
        status: "ACTIVE",
        roles: { create: [{ role: "owner" }] },
      },
    });
    const member = await db.membership.create({
      data: {
        tenantId,
        userId: actor,
        status: "ACTIVE",
        roles: {
          create: [{ role: "owner" }, { role: "manager" }, { role: "teacher" }],
        },
      },
    });
    return {
      db,
      tenantId,
      foreignId,
      owner,
      actor,
      member,
      ownerToken: await context(owner, tenantId, "owner"),
      managerToken: await context(actor, tenantId, "manager"),
      input: {
        version: 1,
        name: "Updated synthetic centre",
        contactEmail: null,
        timezone: "Asia/Ho_Chi_Minh",
        reason: "Synthetic verified configuration change",
      },
    };
  }
  it("tenant settings and usage read only the selected centre; manager reads, teacher and forged tenant context fail closed", async () => {
    const f = await fixture();
    const own = await api("/tenant/settings", "GET", f.managerToken);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({
      id: f.tenantId,
      name: "Synthetic settings centre",
      version: 1,
      timezoneChangeAllowed: true,
    });
    expect(JSON.stringify(own.body)).not.toContain("FOREIGN_SETTINGS_MARKER");
    expect((await api("/tenant/usage", "GET", f.managerToken)).status).toBe(
      200,
    );
    expect(
      (
        await api("/tenant/settings", "GET", f.ownerToken, undefined, {
          "x-tenant-id": f.foreignId,
        })
      ).status,
    ).toBe(403);
    const teacher = await context(f.actor, f.tenantId, "teacher");
    expect((await api("/tenant/settings", "GET", teacher)).status).toBe(403);
    expect((await api("/tenant/usage", "GET", teacher)).status).toBe(403);
  });
  it("tenant owner replaces validated settings, clears contact email and commits one audited version; invalid, no-op and overposted commands do not mutate", async () => {
    const f = await fixture();
    for (const body of [
      { ...f.input, name: "   " },
      { ...f.input, contactEmail: "bad" },
      { ...f.input, timezone: "+07:00" },
      { ...f.input, timezone: "Not/A_Zone" },
      { ...f.input, status: "SUSPENDED" },
      { ...f.input, contactEmail: undefined },
      { ...f.input, reason: "          " },
    ]) {
      expect([400, 422]).toContain(
        (await api("/tenant/settings", "PATCH", f.ownerToken, body)).status,
      );
    }
    expect(
      (await f.db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } }))
        .settingsVersion,
    ).toBe(1);
    expect(
      (await api("/tenant/settings", "PATCH", f.managerToken, f.input)).status,
    ).toBe(403);
    const saved = await api("/tenant/settings", "PATCH", f.ownerToken, f.input);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      name: f.input.name,
      contactEmail: null,
      version: 2,
    });
    const log = await f.db.auditLog.findMany({
      where: { tenantId: f.tenantId, action: "tenant.settings.updated" },
    });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorUserId: f.owner,
      reason: f.input.reason,
      metadata: {
        before: { contactEmail: "centre@example.test", version: 1 },
        after: { contactEmail: null, version: 2 },
      },
    });
    expect(
      (
        await api("/tenant/settings", "PATCH", f.ownerToken, {
          ...f.input,
          version: 2,
        })
      ).status,
    ).toBe(409);
    expect(
      await f.db.auditLog.count({
        where: { tenantId: f.tenantId, action: "tenant.settings.updated" },
      }),
    ).toBe(1);
  });
  it("tenant parallel owner edits commit once; database versioning observes platform-style profile edits without fabricating a user", async () => {
    const f = await fixture();
    const results = await Promise.all([
      api("/tenant/settings", "PATCH", f.ownerToken, f.input),
      api("/tenant/settings", "PATCH", f.ownerToken, {
        ...f.input,
        name: "Competing synthetic centre",
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await f.db.tenant.update({
      where: { id: f.tenantId },
      data: { contactEmail: "platform-change@example.test" },
    });
    const latest = await api("/tenant/settings", "GET", f.ownerToken);
    expect(latest.body.data.version).toBe(3);
    expect(
      (
        await api("/tenant/settings", "PATCH", f.ownerToken, {
          ...f.input,
          version: 2,
        })
      ).status,
    ).toBe(409);
    expect(
      (await f.db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } }))
        .contactEmail,
    ).toBe("platform-change@example.test");
    expect(
      await f.db.auditLog.count({
        where: { tenantId: f.tenantId, action: "tenant.settings.updated" },
      }),
    ).toBe(1);
  });
  it("tenant timezone changes only before operational history; later profile edits keep calendar timezone and class history intact", async () => {
    const f = await fixture();
    const changed = await api("/tenant/settings", "PATCH", f.ownerToken, {
      ...f.input,
      timezone: "America/New_York",
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data.timezone).toBe("America/New_York");
    const cls = await f.db.educationClass.create({
      data: {
        tenantId: f.tenantId,
        code: "SETTINGS-CLASS",
        name: "Synthetic retained class",
        capacity: 5,
        startDate: new Date("2030-01-01Z"),
        endDate: new Date("2030-12-31Z"),
        status: "DRAFT",
      },
    });
    expect(
      (await api("/tenant/settings", "GET", f.ownerToken)).body.data
        .timezoneChangeAllowed,
    ).toBe(false);
    expect(
      (
        await api("/tenant/settings", "PATCH", f.ownerToken, {
          ...f.input,
          version: 2,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await api("/tenant/settings", "PATCH", f.ownerToken, {
          ...f.input,
          version: 2,
          timezone: "America/New_York",
          name: "Safe profile change",
        })
      ).status,
    ).toBe(200);
    expect(
      await f.db.educationClass.findUniqueOrThrow({ where: { id: cls.id } }),
    ).toEqual(cls);
    expect(
      (await f.db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } }))
        .timezone,
    ).toBe("America/New_York");
  });
  it("tenant read-only settings and quotas remain readable while writes fail; revoked membership stops future settings access", async () => {
    const f = await fixture();
    await f.db.tenant.update({
      where: { id: f.tenantId },
      data: { status: "READ_ONLY" },
    });
    expect((await api("/tenant/settings", "GET", f.ownerToken)).status).toBe(
      200,
    );
    expect((await api("/tenant/usage", "GET", f.managerToken)).status).toBe(
      200,
    );
    expect(
      (await api("/tenant/settings", "PATCH", f.ownerToken, f.input)).status,
    ).toBe(403);
    await f.db.membership.update({
      where: { id: f.member.id },
      data: { status: "SUSPENDED" },
    });
    expect((await api("/tenant/settings", "GET", f.managerToken)).status).toBe(
      403,
    );
    expect((await api("/tenant/usage", "GET", f.managerToken)).status).toBe(
      403,
    );
  });
  it.each(["settings-read", "usage-read", "settings-write"] as const)(
    "tenant post-lock %s rejects an actor suspended by the actual owner API while the request waits",
    async (kind) => {
      const f = await fixture(),
        token = await context(f.actor, f.tenantId, "owner");
      const before = await f.db.tenant.findUniqueOrThrow({
        where: { id: f.tenantId },
      });
      const locker = new Client({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      const pending: Promise<unknown>[] = [];
      await locker.connect();
      try {
        await locker.query("BEGIN");
        await locker.query(
          "SELECT id FROM tenants WHERE id=$1::uuid FOR UPDATE",
          [f.tenantId],
        );
        const pid = (
          await locker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
        ).rows[0]!.pid;
        async function blockedAtLeast(n: number) {
          await expect
            .poll(
              async () => {
                const rows = await f.db.$queryRaw<
                  { n: number }[]
                >`WITH RECURSIVE blocked AS (SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND ${pid}::integer=ANY(pg_blocking_pids(pid)) UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.datname=current_database()) SELECT count(DISTINCT pid)::integer AS n FROM blocked`;
                return rows[0]!.n;
              },
              { timeout: 5000, interval: 20 },
            )
            .toBeGreaterThanOrEqual(n);
        }
        const revoke = api(`/staff/${f.member.id}`, "PATCH", f.ownerToken, {
          version: f.member.version,
          status: "SUSPENDED",
          reason: "Synthetic settings actor revocation while queued",
        });
        pending.push(revoke);
        await blockedAtLeast(1);
        const operation = (actorToken: string) =>
          kind === "settings-write"
            ? api("/tenant/settings", "PATCH", actorToken, f.input)
            : api(
                kind === "settings-read" ? "/tenant/settings" : "/tenant/usage",
                "GET",
                actorToken,
              );
        const attempted = operation(token);
        pending.push(attempted);
        await blockedAtLeast(2);
        await locker.query("COMMIT");
        expect((await revoke).status).toBe(200);
        expect((await attempted).status).toBe(403);
        expect(
          await f.db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } }),
        ).toEqual(before);
        expect(
          await f.db.auditLog.count({
            where: { tenantId: f.tenantId, action: "tenant.settings.updated" },
          }),
        ).toBe(0);
        expect((await operation(f.ownerToken)).status).toBe(200);
      } finally {
        await locker.query("ROLLBACK").catch(() => {});
        await Promise.allSettled(pending);
        await locker.end();
      }
    },
  );
  it("tenant usage counts actual scoped active students, reserved users and active/draft classes with exact storage strings", async () => {
    const f = await fixture();
    for (const status of ["ACTIVE", "INACTIVE"] as const)
      await f.db.student.create({
        data: {
          tenantId: f.tenantId,
          studentCode: status,
          fullName: "Synthetic usage learner",
          status,
        },
      });
    await f.db.student.create({
      data: {
        tenantId: f.foreignId,
        studentCode: "FOREIGN",
        fullName: "FOREIGN_USAGE_MARKER",
      },
    });
    for (const status of ["ACTIVE", "DRAFT", "CLOSED"])
      await f.db.educationClass.create({
        data: {
          tenantId: f.tenantId,
          code: status,
          name: "Synthetic usage class",
          status,
          capacity: 1,
          startDate: new Date("2030-01-01Z"),
          endDate: new Date("2030-12-31Z"),
        },
      });
    const usage = await api("/tenant/usage", "GET", f.ownerToken);
    expect(usage.status).toBe(200);
    expect(usage.body.data).toMatchObject({
      activeStudents: 1,
      reservedUsers: 2,
      activeOrDraftClasses: 2,
      managedExportBytes: "0",
      limits: { maxStorageBytes: "1073741824" },
    });
    expect(JSON.stringify(usage.body)).not.toContain("FOREIGN_USAGE_MARKER");
  });
}
