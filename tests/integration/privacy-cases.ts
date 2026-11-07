import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Client } from "pg";
import type { PrismaClient, Role, Student, GuardianLink } from "@prisma/client";

export function privacyCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("privacy workflow against actual PostgreSQL and API", () => {
    const saved: Record<string, string | undefined> = {};
    beforeAll(() => {
      for (const key of [
        "PRIVACY_POLICY_VERSION",
        "PRIVACY_NOTICE_URL",
        "PRIVACY_EXPORT_KEY",
        "PRIVACY_EXPORT_KEY_ID",
        "PRIVACY_EXPORT_TTL_MINUTES",
        "PRIVACY_ERASURE_POLICY_VERSION",
        "PRIVACY_ERASURE_APPROVAL_REF",
        "PRIVACY_ERASURE_FIELDS",
      ])
        saved[key] = process.env[key];
      process.env.PRIVACY_POLICY_VERSION = "synthetic-privacy-integration-v1";
      process.env.PRIVACY_NOTICE_URL =
        "https://example.test/privacy-integration";
      process.env.PRIVACY_EXPORT_KEY = randomBytes(32).toString("hex");
      process.env.PRIVACY_EXPORT_KEY_ID = "synthetic-privacy-key-v1";
      process.env.PRIVACY_EXPORT_TTL_MINUTES = "30";
      delete process.env.PRIVACY_ERASURE_POLICY_VERSION;
      delete process.env.PRIVACY_ERASURE_APPROVAL_REF;
      delete process.env.PRIVACY_ERASURE_FIELDS;
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
      const response = await fetch(getBase() + path, {
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
    async function context(user: string, tenantId: string, role: Role) {
      const signed = await api("/mobile/auth/login", "POST", {
        email: user + "@example.test",
        password,
      });
      expect(signed.status).toBe(200);
      const selected = await api(
        "/auth/switch-context",
        "POST",
        { tenantId, role },
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
        studentUser = randomUUID(),
        manager = randomUUID(),
        privateMarker = "PRIVATE_PRIVACY_" + randomUUID();
      const plan = await db.plan.findUniqueOrThrow({
          where: { code: "TEST_PLAN" },
        }),
        passwordHash = await hash();
      for (const id of [tenant, foreign]) {
        await db.tenant.create({
          data: {
            id,
            slug: "privacy-" + id,
            name: "Synthetic privacy centre",
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
      for (const id of [owner, actor, studentUser, manager])
        await db.user.create({
          data: {
            id,
            email: id + "@example.test",
            displayName: "Synthetic privacy actor",
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
      const guardianMembership = await member(tenant, actor, [
        "guardian",
        "teacher",
      ]);
      await member(tenant, studentUser, ["student"]);
      await member(tenant, manager, ["manager"]);
      await member(foreign, owner, ["owner"]);
      await member(foreign, actor, ["guardian"]);
      await db.teacher.create({
        data: {
          tenantId: tenant,
          userId: actor,
          teacherCode: "PRIVACY",
          fullName: "Synthetic privacy teacher",
        },
      });
      const children: Student[] = [],
        links: GuardianLink[] = [];
      for (let i = 0; i < 3; i++) {
        const child = await db.student.create({
          data: {
            tenantId: tenant,
            studentCode: "PRIVACY-" + i,
            fullName: "Synthetic privacy child " + i,
            notesPrivate: privateMarker,
            ...(i === 0 ? { userId: studentUser } : {}),
          },
        });
        children.push(child);
        if (i < 2)
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
      }
      const tokens = {
        owner: await context(owner, tenant, "owner"),
        guardian: await context(actor, tenant, "guardian"),
        teacher: await context(actor, tenant, "teacher"),
        student: await context(studentUser, tenant, "student"),
        manager: await context(manager, tenant, "manager"),
      };
      const create = async (
        type = "EXPORT",
        child = children[0]!.id,
        key?: string,
      ) => {
        const result = await api(
          "/privacy/requests",
          "POST",
          { type, subjectStudentId: child },
          tokens.guardian,
          key,
        );
        expect(result.status).toBe(201);
        return result.body.data as {
          id: string;
          version: number;
          status: string;
        };
      };
      const verify = async (r: { id: string; version: number }) => {
        const result = await api(
          `/privacy/admin/requests/${r.id}/verify`,
          "POST",
          {
            version: r.version,
            method: "VERIFIED_GUARDIAN",
            evidenceRef: "synthetic-verified-reference",
            reason: "Synthetic verification of current requester relation",
          },
          tokens.owner,
        );
        expect(result.status).toBe(200);
        return result.body.data as {
          id: string;
          version: number;
          status: string;
        };
      };
      const approve = async (r: { id: string; version: number }) => {
        const checked = await verify(r);
        const result = await api(
          `/privacy/admin/requests/${r.id}/decision`,
          "POST",
          {
            version: checked.version,
            decision: "APPROVE",
            reason: "Synthetic approved current authorized data scope",
          },
          tokens.owner,
        );
        expect(result.status).toBe(200);
        return result.body.data as {
          id: string;
          version: number;
          status: string;
        };
      };
      const fulfill = (r: { id: string; version: number }) =>
        api(
          `/privacy/admin/requests/${r.id}/fulfill`,
          "POST",
          {
            version: r.version,
            reason: "Synthetic fulfillment of reviewed request scope",
          },
          tokens.owner,
        );
      const revoke = async (i: number) => {
        const result = await api(
          `/students/${children[i]!.id}/guardians/${links[i]!.id}`,
          "DELETE",
          {
            version: links[i]!.version,
            reason: "Synthetic privacy relation revocation",
          },
          tokens.owner,
        );
        expect(result.status).toBe(200);
      };
      return {
        db,
        tenant,
        foreign,
        owner,
        actor,
        studentUser,
        manager,
        privateMarker,
        guardianMembership,
        children,
        links,
        tokens,
        create,
        verify,
        approve,
        fulfill,
        revoke,
      };
    }
    it("serializes consent with the actual guardian revocation and rejects a grant queued behind the revocation", async () => {
      const f = await fixture(),
        locker = new Client({ connectionString: process.env.DATABASE_URL });
      await locker.connect();
      const pending: Promise<{ status: number; body: unknown }>[] = [];
      async function blockedBy(blocker: number) {
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          const rows = await f.db.$queryRaw<
            { pid: number }[]
          >`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND ${blocker}::integer=ANY(pg_blocking_pids(pid)) ORDER BY pid`;
          if (rows[0]) return rows[0].pid;
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        throw Error(
          "Expected actual API transaction to wait on the controlled database lock",
        );
      }
      const grant = (i: number) =>
        api(
          "/privacy/consents",
          "POST",
          {
            subjectStudentId: f.children[i]!.id,
            policyVersion: process.env.PRIVACY_POLICY_VERSION,
            purposeCode: "NOTIFICATIONS",
            granted: true,
          },
          f.tokens.guardian,
        );
      const revoke = (i: number) =>
        api(
          `/students/${f.children[i]!.id}/guardians/${f.links[i]!.id}`,
          "DELETE",
          {
            version: f.links[i]!.version,
            reason: "Synthetic controlled privacy revoke ordering",
          },
          f.tokens.owner,
        );
      try {
        await locker.query("BEGIN");
        const pid = (await locker.query("SELECT pg_backend_pid() AS id"))
          .rows[0].id as number;
        await locker.query(
          "SELECT id FROM tenant_memberships WHERE id=$1 FOR UPDATE",
          [f.guardianMembership.id],
        );
        const granting = grant(0);
        pending.push(granting);
        const grantingPid = await blockedBy(pid);
        const revoking = revoke(0);
        pending.push(revoking);
        await blockedBy(grantingPid);
        await locker.query("COMMIT");
        expect((await granting).status).toBe(201);
        expect((await revoking).status).toBe(200);
        expect(
          (
            await f.db.guardianLink.findUniqueOrThrow({
              where: { id: f.links[0]!.id },
            })
          ).status,
        ).toBe("REVOKED");
        await locker.query("BEGIN");
        await locker.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
          f.tenant,
        ]);
        const firstRevoke = revoke(1);
        pending.push(firstRevoke);
        const revokingPid = await blockedBy(pid);
        const lateGrant = grant(1);
        pending.push(lateGrant);
        await blockedBy(revokingPid);
        await locker.query("COMMIT");
        expect((await firstRevoke).status).toBe(200);
        expect((await lateGrant).status).toBe(404);
        expect(
          await f.db.privacyConsent.count({
            where: {
              tenantId: f.tenant,
              subjectStudentId: f.children[1]!.id,
              consentingUserId: f.actor,
            },
          }),
        ).toBe(0);
      } finally {
        await locker.query("ROLLBACK");
        await Promise.allSettled(pending);
        await locker.end();
      }
    });
    it("verifies then approves then actually encrypts and exports only the requester scope, with create idempotency and version races", async () => {
      const f = await fixture(),
        key = randomUUID(),
        r = await f.create("EXPORT", f.children[0]!.id, key);
      expect(await f.create("EXPORT", f.children[0]!.id, key)).toMatchObject({
        id: r.id,
        version: 1,
      });
      expect(
        (
          await api(
            "/privacy/requests",
            "POST",
            { type: "EXPORT", subjectStudentId: f.children[1]!.id },
            f.tokens.guardian,
            key,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await api(
            "/privacy/admin/requests",
            "GET",
            undefined,
            f.tokens.manager,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(
            `/privacy/admin/requests/${r.id}/decision`,
            "POST",
            {
              version: 1,
              decision: "APPROVE",
              reason: "Synthetic attempt before verification",
            },
            f.tokens.owner,
          )
        ).status,
      ).toBe(409);
      const checked = await f.verify(r);
      const decisions = await Promise.all(
        [1, 2].map(() =>
          api(
            `/privacy/admin/requests/${r.id}/decision`,
            "POST",
            {
              version: checked.version,
              decision: "APPROVE",
              reason: "Synthetic reviewed authorized data scope",
            },
            f.tokens.owner,
          ),
        ),
      );
      expect(decisions.map((x) => x.status).sort()).toEqual([200, 409]);
      const approved = decisions.find((x) => x.status === 200)!.body.data;
      const completed = await f.fulfill(approved);
      expect(completed.status).toBe(200);
      expect(completed.body.data).toMatchObject({
        status: "COMPLETED",
        version: 4,
        fulfillmentKind: "EXPORT",
        exportAvailable: true,
      });
      const download = await api(
        `/privacy/requests/${r.id}/export`,
        "GET",
        undefined,
        f.tokens.guardian,
      );
      expect(download.status).toBe(200);
      const json = download.body.data.json as string,
        data = JSON.parse(json);
      expect(data.student.id).toBe(f.children[0]!.id);
      expect(data.student.fullName).toBe(f.children[0]!.fullName);
      expect(json).not.toContain(f.privateMarker);
      expect(json).not.toContain(f.children[1]!.id);
      expect(json).not.toContain("passwordHash");
      expect(json).not.toContain("tokenHash");
      expect(createHash("sha256").update(json).digest("hex")).toBe(
        download.body.data.sha256,
      );
      const artifact = await f.db.privacyExportArtifact.findUniqueOrThrow({
        where: { tenantId_requestId: { tenantId: f.tenant, requestId: r.id } },
      });
      expect(artifact.ciphertext).not.toContain(f.children[0]!.fullName);
      expect(artifact.byteCount).toBe(Buffer.byteLength(json));
      const history = await api(
        `/privacy/requests/${r.id}/history`,
        "GET",
        undefined,
        f.tokens.guardian,
      );
      expect(history.status).toBe(200);
      expect(
        history.body.data.map((x: { afterStatus: string }) => x.afterStatus),
      ).toEqual(["COMPLETED", "APPROVED", "VERIFIED", "RECEIVED"]);
      expect(
        (await api("/privacy/requests", "GET", undefined, f.tokens.guardian))
          .body.page.total,
      ).toBe(1);
      const foreignToken = await context(f.owner, f.foreign, "owner");
      expect(
        (
          await api(
            `/privacy/admin/requests/${r.id}`,
            "GET",
            undefined,
            foreignToken,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            `/privacy/requests/${r.id}/export`,
            "GET",
            undefined,
            f.tokens.student,
          )
        ).status,
      ).toBe(404);
    });
    it("rechecks a revoked requester subject before fulfillment and before downloading already prepared content", async () => {
      const f = await fixture(),
        pending = await f.approve(await f.create());
      await f.revoke(0);
      expect((await f.fulfill(pending)).status).toBe(404);
      expect(
        (
          await f.db.dataSubjectRequest.findUniqueOrThrow({
            where: { id: pending.id },
          })
        ).status,
      ).toBe("APPROVED");
      expect(
        await f.db.privacyExportArtifact.count({
          where: { requestId: pending.id },
        }),
      ).toBe(0);
      const ready = await f.approve(
        await f.create("EXPORT", f.children[1]!.id),
      );
      expect((await f.fulfill(ready)).status).toBe(200);
      await f.revoke(1);
      const denied = await api(
        `/privacy/requests/${ready.id}/export`,
        "GET",
        undefined,
        f.tokens.guardian,
      );
      expect(denied.status).toBe(404);
      expect(JSON.stringify(denied.body)).not.toContain(
        f.children[1]!.fullName,
      );
      const tracked = await api(
        `/privacy/requests/${ready.id}`,
        "GET",
        undefined,
        f.tokens.guardian,
      );
      expect(tracked.status).toBe(200);
      expect(tracked.body.data).toMatchObject({
        status: "COMPLETED",
        scopeAvailable: false,
        exportAvailable: false,
      });
    });
    it("corrects only reviewed local profile fields atomically and retains the request after a real student version conflict", async () => {
      const f = await fixture(),
        approved = await f.approve(await f.create("CORRECT"));
      const changed = await api(
        `/students/${f.children[0]!.id}`,
        "PATCH",
        { version: f.children[0]!.version, contactPhone: "+84901234567" },
        f.tokens.owner,
      );
      expect(changed.status).toBe(200);
      const path = `/privacy/admin/requests/${approved.id}/fulfill`;
      expect(
        (
          await api(
            path,
            "POST",
            {
              version: approved.version,
              reason: "Synthetic correction after reviewed evidence",
              studentVersion: f.children[0]!.version,
              correction: { fullName: "Synthetic corrected child" },
            },
            f.tokens.owner,
          )
        ).status,
      ).toBe(409);
      const current = await f.db.student.findUniqueOrThrow({
        where: { id: f.children[0]!.id },
      });
      expect(
        (
          await api(
            path,
            "POST",
            {
              version: approved.version,
              reason: "Synthetic invalid future birth date review",
              studentVersion: current.version,
              correction: { dateOfBirth: "2099-01-01" },
            },
            f.tokens.owner,
          )
        ).status,
      ).toBe(422);
      expect(
        (
          await api(
            path,
            "POST",
            {
              version: approved.version,
              reason: "Synthetic forbidden private notes correction",
              studentVersion: current.version,
              correction: { notesPrivate: "must not be accepted" },
            },
            f.tokens.owner,
          )
        ).status,
      ).toBe(422);
      expect(
        (
          await f.db.dataSubjectRequest.findUniqueOrThrow({
            where: { id: approved.id },
          })
        ).status,
      ).toBe("APPROVED");
      const completed = await api(
        path,
        "POST",
        {
          version: approved.version,
          reason: "Synthetic reviewed correction applied atomically",
          studentVersion: current.version,
          correction: {
            fullName: "Synthetic corrected child",
            dateOfBirth: "2001-01-01",
            contactEmail: "Corrected@Example.Test",
          },
        },
        f.tokens.owner,
      );
      expect(completed.status).toBe(200);
      expect(completed.body.data).toMatchObject({
        status: "COMPLETED",
        fulfillmentKind: "CORRECT",
        resultStudentVersion: current.version + 1,
      });
      expect([...completed.body.data.resultFields].sort()).toEqual([
        "contactEmail",
        "dateOfBirth",
        "fullName",
      ]);
      const corrected = await f.db.student.findUniqueOrThrow({
        where: { id: current.id },
      });
      expect(corrected).toMatchObject({
        fullName: "Synthetic corrected child",
        contactEmail: "corrected@example.test",
        contactPhone: current.contactPhone,
        notesPrivate: f.privateMarker,
        studentCode: current.studentCode,
        version: current.version + 1,
      });
      expect(corrected.dateOfBirth?.toISOString().slice(0, 10)).toBe(
        "2001-01-01",
      );
      const audit = await f.db.auditLog.findFirstOrThrow({
        where: {
          tenantId: f.tenant,
          resourceId: approved.id,
          action: "privacy.request.completed",
        },
      });
      expect(JSON.stringify(audit.metadata)).not.toContain(
        "corrected@example.test",
      );
      expect(JSON.stringify(audit.metadata)).not.toContain(f.privateMarker);
    });

    it("withdraws an owned historical consent after relation revocation without rewriting the original grant, and fulfills scoped withdrawal", async () => {
      const f = await fixture();
      const input = {
        subjectStudentId: f.children[0]!.id,
        policyVersion: process.env.PRIVACY_POLICY_VERSION,
        purposeCode: "NOTIFICATIONS",
        granted: true,
      };
      const grant = await api(
        "/privacy/consents",
        "POST",
        input,
        f.tokens.guardian,
      );
      expect(grant.status).toBe(201);
      expect(grant.body.data).toMatchObject({
        captureMethod: "AUTHENTICATED_SELF_SERVICE",
        capturedRole: "guardian",
      });
      expect(
        (await api("/privacy/consents", "POST", input, f.tokens.owner)).status,
      ).toBe(404);
      await f.revoke(0);
      const path = `/privacy/consents/${grant.body.data.id}/withdraw`;
      expect((await api(path, "POST", {}, f.tokens.student)).status).toBe(404);
      const withdrawn = await api(path, "POST", {}, f.tokens.guardian);
      expect(withdrawn.status).toBe(200);
      expect(withdrawn.body.data.granted).toBe(true);
      expect(withdrawn.body.data.capturedAt).toBe(grant.body.data.capturedAt);
      expect(withdrawn.body.data.revokedAt).toEqual(expect.any(String));
      expect(
        (await api(path, "POST", {}, f.tokens.guardian)).body.data.revokedAt,
      ).toBe(withdrawn.body.data.revokedAt);
      expect(
        await f.db.auditLog.count({
          where: {
            tenantId: f.tenant,
            resourceId: grant.body.data.id,
            action: "privacy.consent.withdrawn",
          },
        }),
      ).toBe(1);
      const other = await api(
        "/privacy/consents",
        "POST",
        { ...input, subjectStudentId: f.children[1]!.id },
        f.tokens.guardian,
      );
      expect(other.status).toBe(201);
      const request = await f.approve(
        await f.create("WITHDRAW", f.children[1]!.id),
      );
      expect((await f.fulfill(request)).status).toBe(200);
      expect(
        (
          await f.db.privacyConsent.findUniqueOrThrow({
            where: { id: other.body.data.id },
          })
        ).revokedAt,
      ).not.toBeNull();
      expect(
        (
          await f.db.dataSubjectRequest.findUniqueOrThrow({
            where: { id: request.id },
          })
        ).fulfillmentSummary,
      ).toMatchObject({
        kind: "WITHDRAW",
        purposeCode: "NOTIFICATIONS",
        revokedConsentCount: 1,
      });
      await f.db.tenant.update({
        where: { id: f.tenant },
        data: { status: "READ_ONLY" },
      });
      expect(
        (await api("/privacy/consents", "GET", undefined, f.tokens.guardian))
          .status,
      ).toBe(200);
      expect((await api(path, "POST", {}, f.tokens.guardian)).status).toBe(403);
    });

    it("blocks erasure without policy and active operational review, then redacts the permitted profile and old exports while retaining financial and audit rows", async () => {
      const f = await fixture(),
        db = f.db;
      const invoice = await db.$transaction(async (tx) => {
        const cls = await tx.educationClass.create({
          data: {
            tenantId: f.tenant,
            code: "PRIVACY-FEE",
            name: "Synthetic privacy finance class",
            capacity: 10,
            startDate: new Date("2020-01-01Z"),
            endDate: new Date("2020-12-31Z"),
          },
        });
        const fee = await tx.feePlan.create({
          data: {
            tenantId: f.tenant,
            classId: cls.id,
            name: "Synthetic retained fee",
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
            requestHash: "b".repeat(64),
            createdBy: f.owner,
          },
        });
        const row = await tx.invoice.create({
          data: {
            tenantId: f.tenant,
            studentId: f.children[0]!.id,
            runId: run.id,
            invoiceNo: "PRIVACY-" + randomUUID(),
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
      const paid = await api(
        "/payments",
        "POST",
        {
          studentId: f.children[0]!.id,
          method: "BANK_TRANSFER",
          receivedAmountVnd: "100000",
          receivedAt: new Date().toISOString(),
          allocations: [{ invoiceId: invoice.id, amountVnd: "100000" }],
        },
        f.tokens.owner,
        randomUUID(),
      );
      expect(paid.status).toBe(201);
      const payment = await db.payment.findUniqueOrThrow({
          where: { id: paid.body.data.id },
        }),
        allocations = await db.paymentAllocation.findMany({
          where: { paymentId: payment.id },
        }),
        audit = await db.auditLog.findFirstOrThrow({
          where: {
            tenantId: f.tenant,
            resourceId: payment.id,
            action: "payment.recorded",
          },
        });
      const exportRequest = await f.approve(await f.create());
      expect((await f.fulfill(exportRequest)).status).toBe(200);
      const artifact = await db.privacyExportArtifact.findUniqueOrThrow({
        where: {
          tenantId_requestId: {
            tenantId: f.tenant,
            requestId: exportRequest.id,
          },
        },
      });
      const erase = await f.approve(await f.create("ERASE"));
      const body = {
          version: erase.version,
          studentVersion: f.children[0]!.version,
          confirmRetainedRecords: true,
          reason: "Synthetic configured tenant profile redaction request",
        },
        path = `/privacy/admin/requests/${erase.id}/fulfill`;
      expect((await api(path, "POST", body, f.tokens.owner)).status).toBe(409);
      process.env.PRIVACY_ERASURE_POLICY_VERSION =
        "synthetic-retention-reviewed-v1";
      process.env.PRIVACY_ERASURE_APPROVAL_REF = "synthetic-policy-reference";
      process.env.PRIVACY_ERASURE_FIELDS =
        "fullName,dateOfBirth,contactEmail,contactPhone,notesPrivate";
      try {
        expect((await api(path, "POST", body, f.tokens.owner)).status).toBe(
          409,
        );
        expect(
          (
            await api(
              `/students/${f.children[0]!.id}/deactivate`,
              "POST",
              {
                version: f.children[0]!.version,
                reason: "Synthetic inactive profile prerequisite for redaction",
              },
              f.tokens.owner,
            )
          ).status,
        ).toBe(201);
        const inactive = await db.student.findUniqueOrThrow({
          where: { id: f.children[0]!.id },
        });
        const completed = await api(
          path,
          "POST",
          { ...body, studentVersion: inactive.version },
          f.tokens.owner,
        );
        expect(completed.status).toBe(200);
        expect(completed.body.data.fulfillmentKind).toBe("ERASE_PROFILE");
        const redacted = await db.student.findUniqueOrThrow({
          where: { id: inactive.id },
        });
        expect(redacted).toMatchObject({
          fullName: "Học viên đã che thông tin",
          dateOfBirth: null,
          contactEmail: null,
          contactPhone: null,
          notesPrivate: null,
          studentCode: inactive.studentCode,
          userId: inactive.userId,
        });
        expect(
          await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
        ).toEqual(invoice);
        expect(
          await db.payment.findUniqueOrThrow({ where: { id: payment.id } }),
        ).toEqual(payment);
        expect(
          await db.paymentAllocation.findMany({
            where: { paymentId: payment.id },
          }),
        ).toEqual(allocations);
        expect(
          await db.auditLog.findUniqueOrThrow({ where: { id: audit.id } }),
        ).toEqual(audit);
        expect(
          await db.privacyExportArtifact.findUniqueOrThrow({
            where: { id: artifact.id },
          }),
        ).toMatchObject({
          ciphertext: null,
          sha256: artifact.sha256,
          byteCount: artifact.byteCount,
          erasedByRequestId: erase.id,
        });
        expect(
          (
            await api(
              `/privacy/requests/${exportRequest.id}/export`,
              "GET",
              undefined,
              f.tokens.guardian,
            )
          ).status,
        ).toBe(410);
      } finally {
        delete process.env.PRIVACY_ERASURE_POLICY_VERSION;
        delete process.env.PRIVACY_ERASURE_APPROVAL_REF;
        delete process.env.PRIVACY_ERASURE_FIELDS;
      }
    });

    it("exports only the student's own current scope and rejects forged payloads and another child's identity", async () => {
      const f = await fixture();
      const cls = await f.db.educationClass.create({
        data: {
          tenantId: f.tenant,
          code: "PRIVACY-PUBLICATION",
          name: "Synthetic privacy publication",
          capacity: 3,
          status: "ACTIVE",
          startDate: new Date("2020-01-01Z"),
          endDate: new Date("2040-01-01Z"),
        },
      });
      for (const child of f.children.slice(0, 2))
        await f.db.enrollment.create({
          data: {
            tenantId: f.tenant,
            classId: cls.id,
            studentId: child.id,
            joinedAt: new Date("2020-01-01Z"),
          },
        });
      const assessmentIds: string[] = [];
      for (const published of [false, true]) {
        const assessment = await api(
          `/classes/${cls.id}/assessments`,
          "POST",
          {
            title: published
              ? "Synthetic published export score"
              : "SYNTHETIC-PRIVATE-DRAFT-GRADE",
            heldAt: "2030-06-01",
            maxScore: "10.00",
          },
          f.tokens.owner,
        );
        expect(assessment.status).toBe(201);
        const assessmentId = assessment.body.data.id as string;
        assessmentIds.push(assessmentId);
        const saved = await api(
          `/assessments/${assessmentId}/results`,
          "PUT",
          {
            version: 1,
            records: f.children.slice(0, 2).map((child, index) => ({
              studentId: child.id,
              score: index === 0 ? "0.00" : "10.00",
              comment:
                index === 0
                  ? "Synthetic own published comment"
                  : "SYNTHETIC-OTHER-CHILD-RESULT",
            })),
          },
          f.tokens.owner,
        );
        expect(saved.status).toBe(200);
        if (published)
          expect(
            (
              await api(
                `/assessments/${assessmentId}/publish`,
                "POST",
                { version: 2 },
                f.tokens.owner,
              )
            ).status,
          ).toBe(201);
      }
      for (const token of [
        f.tokens.student,
        f.tokens.owner,
        f.tokens.teacher,
      ]) {
        const denied = await api(
          "/privacy/requests",
          "POST",
          { type: "EXPORT", subjectStudentId: f.children[2]!.id },
          token,
        );
        expect(denied.status).toBe(404);
      }
      expect(
        (
          await api(
            "/privacy/requests",
            "POST",
            { type: "EXPORT", status: "COMPLETED" },
            f.tokens.student,
          )
        ).status,
      ).toBe(422);
      const created = await api(
        "/privacy/requests",
        "POST",
        { type: "ACCESS" },
        f.tokens.student,
      );
      expect(created.status).toBe(201);
      expect(created.body.data.subjectStudentId).toBe(f.children[0]!.id);
      const id = created.body.data.id as string;
      expect(
        (
          await api(
            `/privacy/admin/requests/${id}/verify`,
            "POST",
            {
              version: 1,
              method: "VERIFIED_GUARDIAN",
              evidenceRef: "synthetic-student-evidence",
              reason: "Synthetic invalid guardian verification method",
            },
            f.tokens.owner,
          )
        ).status,
      ).toBe(422);
      const verified = await api(
        `/privacy/admin/requests/${id}/verify`,
        "POST",
        {
          version: 1,
          method: "ACCOUNT_CONFIRMATION",
          evidenceRef: "synthetic-student-evidence",
          reason: "Synthetic student account confirmation",
        },
        f.tokens.owner,
      );
      expect(verified.status).toBe(200);
      const approved = await api(
        `/privacy/admin/requests/${id}/decision`,
        "POST",
        {
          version: 2,
          decision: "APPROVE",
          reason: "Synthetic student's current authorized access",
        },
        f.tokens.owner,
      );
      expect(approved.status).toBe(200);
      expect((await f.fulfill(approved.body.data)).status).toBe(200);
      const downloaded = await api(
        `/privacy/requests/${id}/export`,
        "GET",
        undefined,
        f.tokens.student,
      );
      expect(downloaded.status).toBe(200);
      const payload = JSON.parse(downloaded.body.data.json);
      expect(payload.student.id).toBe(f.children[0]!.id);
      expect(payload.account.id).toBe(f.studentUser);
      expect(payload.requesterRole).toBe("student");
      expect(payload.invoices).toEqual([]);
      expect(payload.payments).toEqual([]);
      expect(payload.publishedGrades).toHaveLength(1);
      expect(payload.publishedGrades[0]).toMatchObject({
        assessmentId: assessmentIds[1],
        score: "0.00",
        title: "Synthetic published export score",
      });
      expect(downloaded.body.data.json).not.toContain(
        "SYNTHETIC-PRIVATE-DRAFT-GRADE",
      );
      expect(downloaded.body.data.json).not.toContain(
        "SYNTHETIC-OTHER-CHILD-RESULT",
      );
      for (const forbidden of [
        f.privateMarker,
        f.children[1]!.id,
        f.children[2]!.id,
        "passwordHash",
        "refreshToken",
      ])
        expect(downloaded.body.data.json).not.toContain(forbidden);
    });

    it("stops future privacy reads and writes after actual session context, membership or tenant changes", async () => {
      const f = await fixture(),
        pending = await f.create();
      const switched = await api(
        "/auth/switch-context",
        "POST",
        { tenantId: f.tenant, role: "teacher" },
        f.tokens.guardian,
      );
      expect(switched.status).toBe(200);
      expect(
        (
          await api(
            `/privacy/requests/${pending.id}`,
            "GET",
            undefined,
            f.tokens.guardian,
          )
        ).status,
      ).toBe(401);
      const teacherView = await api(
        `/privacy/requests/${pending.id}`,
        "GET",
        undefined,
        switched.body.data.accessToken,
      );
      expect(teacherView.status).toBe(200);
      expect(teacherView.body.data.scopeAvailable).toBe(false);
      await f.db.membership.update({
        where: { id: f.guardianMembership.id },
        data: { status: "SUSPENDED" },
      });
      expect(
        (
          await api(
            "/privacy/requests",
            "GET",
            undefined,
            switched.body.data.accessToken,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(
            "/privacy/requests",
            "POST",
            { type: "ACCESS" },
            switched.body.data.accessToken,
          )
        ).status,
      ).toBe(403);
      await f.db.tenant.update({
        where: { id: f.tenant },
        data: { status: "SUSPENDED" },
      });
      expect(
        (await api("/privacy/admin/requests", "GET", undefined, f.tokens.owner))
          .status,
      ).toBe(403);
    });

    it("purges only expired transient ciphertext through the actual worker and retains immutable request, digest and metadata", async () => {
      const f = await fixture(),
        request = await f.approve(await f.create());
      const { sealPrivacyExport } = await import(
          "../../apps/api/dist/privacy-export-crypto.js"
        ),
        sealed = sealPrivacyExport(
          f.tenant,
          request.id,
          JSON.stringify({ synthetic: "expired content only" }),
        );
      const artifact = await f.db.privacyExportArtifact.create({
        data: {
          tenantId: f.tenant,
          requestId: request.id,
          ...sealed,
          createdAt: new Date(Date.now() - 7200000),
          expiresAt: new Date(Date.now() - 3600000),
        },
      });
      const { purgeExpiredPrivacyExports } = await import(
        "../../apps/worker/dist/privacy-retention.js"
      );
      expect(await purgeExpiredPrivacyExports(f.db)).toBe(1);
      expect(await purgeExpiredPrivacyExports(f.db)).toBe(0);
      expect(
        await f.db.privacyExportArtifact.findUniqueOrThrow({
          where: { id: artifact.id },
        }),
      ).toMatchObject({
        ciphertext: null,
        sha256: artifact.sha256,
        byteCount: artifact.byteCount,
        expiresAt: artifact.expiresAt,
        purgedAt: expect.any(Date),
      });
      expect(
        (
          await f.db.dataSubjectRequest.findUniqueOrThrow({
            where: { id: request.id },
          })
        ).status,
      ).toBe("APPROVED");
      expect(
        await f.db.auditLog.count({
          where: {
            tenantId: f.tenant,
            action: "privacy.export.content_purged",
            resourceId: artifact.id,
          },
        }),
      ).toBe(1);
      await expect(
        f.db.privacyExportArtifact.delete({ where: { id: artifact.id } }),
      ).rejects.toThrow();
    });
  });
}
