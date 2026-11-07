import { it, expect } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export function privacyMigrationCase() {
  it("privacy029 preserves legacy states and unknown evidence, records observed baselines and rejects forged review and immutable history changes", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw Error("Disposable migration database required");
    const db = new Client({ connectionString });
    await db.connect();
    try {
      await db.query("BEGIN");
      const schema = "privacy_upgrade_" + randomUUID().replaceAll("-", "");
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.query(`SET LOCAL search_path TO "${schema}"`);
      await db.query(`
        CREATE TYPE "Role" AS ENUM('owner','manager','academic_staff','accountant','teacher','student','guardian');
        CREATE TABLE users(id uuid PRIMARY KEY,status text);
        CREATE TABLE tenants(id uuid PRIMARY KEY,status text);
        CREATE TABLE tenant_memberships(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid,status text,activation_pending boolean,UNIQUE(tenant_id,user_id));
        CREATE TABLE membership_roles(membership_id uuid,role "Role");
        CREATE TABLE student_profiles(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid,UNIQUE(tenant_id,id));
        CREATE TABLE guardian_student_links(tenant_id uuid,student_id uuid,guardian_user_id uuid,status text,verified_by uuid,verified_at timestamptz);
      `);
      // Use the actual legacy privacy DDL and unchanged shared history guard.
      await db.query(
        readFileSync(
          "infra/prisma/migrations/202610240013_privacy/migration.sql",
          "utf8",
        ),
      );
      const historySource = readFileSync(
        "infra/prisma/migrations/202610240014_relationship_and_history/migration.sql",
        "utf8",
      );
      const start = historySource.indexOf(
          "CREATE FUNCTION history_append_only()",
        ),
        end = historySource.indexOf(
          "CREATE TRIGGER grade_history_append_only",
          start,
        );
      expect(start).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(start);
      await db.query(historySource.slice(start, end));
      const tenant = randomUUID(),
        other = randomUUID(),
        guardian = randomUUID(),
        owner = randomUUID(),
        outsider = randomUUID(),
        child = randomUUID(),
        consent = randomUUID();
      for (const id of [tenant, other])
        await db.query("INSERT INTO tenants VALUES($1,'ACTIVE')", [id]);
      for (const [id, scope, role] of [
        [guardian, tenant, "guardian"],
        [owner, tenant, "owner"],
        [outsider, other, "owner"],
      ]) {
        const membership = randomUUID();
        await db.query("INSERT INTO users VALUES($1,'ACTIVE')", [id]);
        await db.query(
          "INSERT INTO tenant_memberships VALUES($1,$2,$3,'ACTIVE',false)",
          [membership, scope, id],
        );
        await db.query("INSERT INTO membership_roles VALUES($1,$2)", [
          membership,
          role,
        ]);
      }
      await db.query("INSERT INTO student_profiles VALUES($1,$2,NULL)", [
        child,
        tenant,
      ]);
      await db.query(
        "INSERT INTO guardian_student_links VALUES($1,$2,$3,'ACTIVE',$4,now())",
        [tenant, child, guardian, owner],
      );
      await db.query(
        "INSERT INTO privacy_consents VALUES($1,$2,$3,$4,'legacy-policy','NOTIFICATIONS','CONSENT',true,'2026-11-01T01:00Z',NULL)",
        [consent, tenant, child, guardian],
      );
      const requests: string[] = [];
      for (const status of ["RECEIVED", "APPROVED", "COMPLETED"]) {
        const id = randomUUID();
        requests.push(id);
        await db.query(
          "INSERT INTO data_subject_requests VALUES($1,$2,$3,$4,'EXPORT',$5,'2026-11-01T02:00Z')",
          [id, tenant, guardian, child, status],
        );
      }
      const legacyRequests = (
          await db.query("SELECT * FROM data_subject_requests ORDER BY id")
        ).rows,
        legacyConsents = (
          await db.query("SELECT * FROM privacy_consents ORDER BY id")
        ).rows;
      await db.query(
        readFileSync(
          "infra/prisma/migrations/202611070029_privacy_workflow/migration.sql",
          "utf8",
        ),
      );
      expect(
        (
          await db.query(
            "SELECT id,tenant_id,requester_user_id,subject_student_id,type,status,created_at FROM data_subject_requests ORDER BY id",
          )
        ).rows,
      ).toEqual(legacyRequests);
      expect(
        (
          await db.query(
            "SELECT id,tenant_id,subject_student_id,consenting_user_id,policy_version,purpose_code,legal_basis,granted,captured_at,revoked_at FROM privacy_consents ORDER BY id",
          )
        ).rows,
      ).toEqual(legacyConsents);
      expect(
        (
          await db.query(
            "SELECT requester_role,verified_at,verified_by,decided_at,decided_by,completed_at,completed_by FROM data_subject_requests",
          )
        ).rows.every((r) => Object.values(r).every((value) => value === null)),
      ).toBe(true);
      const events = (
        await db.query(
          "SELECT event_type,actor_user_id,trace_id,recorded_at FROM privacy_request_events",
        )
      ).rows;
      expect(events).toHaveLength(3);
      expect(
        events.every(
          (e) =>
            e.event_type === "LEGACY_OBSERVED" &&
            e.actor_user_id === null &&
            e.trace_id === "migration-029" &&
            e.recorded_at.getTime() > new Date("2026-11-01T02:00Z").getTime(),
        ),
      ).toBe(true);
      const reject = async (
        sql: string,
        args: unknown[],
        code = "23514",
        constraint?: string,
      ) => {
        await db.query("SAVEPOINT denied");
        await expect(db.query(sql, args)).rejects.toMatchObject({
          code,
          ...(constraint ? { constraint } : {}),
        });
        await db.query("ROLLBACK TO SAVEPOINT denied");
        await db.query("RELEASE SAVEPOINT denied");
      };
      await reject("UPDATE privacy_consents SET granted=false WHERE id=$1", [
        consent,
      ]);
      await reject("DELETE FROM privacy_consents WHERE id=$1", [consent]);
      await db.query(
        "UPDATE privacy_consents SET revoked_at=now() WHERE id=$1",
        [consent],
      );
      await reject("UPDATE privacy_consents SET revoked_at=NULL WHERE id=$1", [
        consent,
      ]);
      await reject(
        "UPDATE data_subject_requests SET status='APPROVED',decided_at=now(),decided_by=$2,decision_reason='Synthetic skip verification' WHERE id=$1",
        [requests[0], owner],
      );
      await db.query(
        "UPDATE data_subject_requests SET requester_role='guardian',scope_confirmed_at=now() WHERE id=$1",
        [requests[0]],
      );
      await reject(
        "UPDATE data_subject_requests SET status='VERIFIED',verified_at=now(),verified_by=$2,verification_method='REVIEWED_EVIDENCE',verification_evidence_ref='synthetic-reference' WHERE id=$1",
        [requests[0], outsider],
        "23503",
        "privacy_request_verifier_fk",
      );
      await db.query(
        "UPDATE data_subject_requests SET status='VERIFIED',verified_at=now(),verified_by=$2,verification_method='VERIFIED_GUARDIAN',verification_evidence_ref='synthetic-reference' WHERE id=$1",
        [requests[0], owner],
      );
      await db.query(
        "UPDATE data_subject_requests SET status='APPROVED',decided_at=now(),decided_by=$2,decision_reason='Synthetic reviewed export scope' WHERE id=$1",
        [requests[0], owner],
      );
      await reject(
        "UPDATE data_subject_requests SET status='COMPLETED',completed_at=now(),completed_by=$2,fulfillment_summary='{}' WHERE id=$1",
        [requests[0], owner],
      );
      await reject(
        "UPDATE data_subject_requests SET requester_user_id=$2 WHERE id=$1",
        [requests[0], outsider],
      );
      await reject(
        "UPDATE data_subject_requests SET decision_reason='Invented legacy approval' WHERE id=$1",
        [requests[2]],
      );
      await reject(
        "UPDATE privacy_request_events SET event_type='invented' WHERE request_id=$1",
        [requests[0]],
        "P0001",
      );
      await reject(
        "DELETE FROM privacy_request_events WHERE request_id=$1",
        [requests[0]],
        "P0001",
      );
      await db.query("ROLLBACK");
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });
}
