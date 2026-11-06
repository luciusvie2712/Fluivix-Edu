import { it, expect } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
export function migrationCases() {
  it("backfills guardian relationship history honestly and rejects conflicting legacy open pairs", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw new Error("Disposable database required");
    const client = new Client({ connectionString });
    await client.connect();
    const sql = readFileSync(
      "infra/prisma/migrations/202611060021_guardian_administration/migration.sql",
      "utf8",
    );
    try {
      for (const duplicate of [false, true]) {
        await client.query("BEGIN");
        const schema = "guardian_upgrade_" + randomUUID().replaceAll("-", "");
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        await client.query(
          "CREATE TABLE tenant_memberships(id uuid UNIQUE,tenant_id uuid,user_id uuid,status text,PRIMARY KEY(tenant_id,user_id)); CREATE TABLE membership_roles(membership_id uuid,role text); CREATE TABLE guardian_student_links(id uuid PRIMARY KEY,tenant_id uuid,student_id uuid,guardian_user_id uuid,status text,relation_type text,verification_method text,verified_at timestamptz,verified_by uuid,UNIQUE(tenant_id,id));",
        );
        const tenant = randomUUID(),
          guardian = randomUUID(),
          owner = randomUUID(),
          link = randomUUID(),
          student = randomUUID();
        for (const user of [guardian, owner])
          await client.query(
            "INSERT INTO tenant_memberships VALUES($1,$2,$3,'ACTIVE')",
            [randomUUID(), tenant, user],
          );
        await client.query(
          "INSERT INTO membership_roles SELECT id,'guardian' FROM tenant_memberships WHERE user_id=$1",
          [guardian],
        );
        await client.query(
          "INSERT INTO guardian_student_links VALUES($1,$2,$3,$4,'ACTIVE','parent','Original verified basis','2025-01-01T00:00:00Z',$5)",
          [link, tenant, student, guardian, owner],
        );
        if (duplicate)
          await client.query(
            "INSERT INTO guardian_student_links VALUES($1,$2,$3,$4,'PENDING','parent',NULL,NULL,NULL)",
            [randomUUID(), tenant, student, guardian],
          );
        await client.query("SAVEPOINT upgrade");
        if (duplicate) {
          await expect(client.query(sql)).rejects.toThrow("guardian_open_pair");
          await client.query("ROLLBACK TO SAVEPOINT upgrade");
          expect(
            (
              await client.query(
                "SELECT status FROM guardian_student_links ORDER BY status",
              )
            ).rows,
          ).toEqual([{ status: "ACTIVE" }, { status: "PENDING" }]);
        } else {
          await client.query(sql);
          expect(
            (await client.query("SELECT user_id FROM guardian_profiles")).rows,
          ).toEqual([{ user_id: guardian }]);
          const baseline = (
            await client.query("SELECT * FROM guardian_link_events")
          ).rows[0];
          expect(baseline).toMatchObject({
            link_id: link,
            version: 1,
            event_type: "BASELINE",
            actor_user_id: null,
            actor_display_name: null,
            verification_method: "Original verified basis",
          });
          expect(baseline.verified_at.toISOString()).toBe(
            "2025-01-01T00:00:00.000Z",
          );
          expect(baseline.recorded_at.getTime()).toBeGreaterThan(
            baseline.verified_at.getTime(),
          );
          await client.query(
            "UPDATE guardian_student_links SET status='REVOKED' WHERE id=$1",
            [link],
          );
          expect(
            (
              await client.query(
                "SELECT version,event_type FROM guardian_link_events ORDER BY version",
              )
            ).rows,
          ).toEqual([
            { version: 1, event_type: "BASELINE" },
            { version: 2, event_type: "REVOKED" },
          ]);
          await client.query("SAVEPOINT immutable");
          await expect(
            client.query("DELETE FROM guardian_link_events"),
          ).rejects.toThrow("append only");
          await client.query("ROLLBACK TO SAVEPOINT immutable");
        }
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
  it("upgrades existing memberships and invitations without granting delegation or losing history", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw new Error("Disposable database required");
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      const schema = "staff_upgrade_" + randomUUID().replaceAll("-", "");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(
        "CREATE TABLE tenants(id uuid PRIMARY KEY); CREATE TABLE users(id uuid PRIMARY KEY,status text NOT NULL); CREATE TABLE tenant_memberships(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,user_id uuid NOT NULL,status text NOT NULL); CREATE TABLE membership_roles(membership_id uuid NOT NULL,role text NOT NULL); CREATE TABLE invitation_tokens(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,email text NOT NULL,role text NOT NULL); CREATE TABLE audit_logs(id uuid PRIMARY KEY,reason text);",
      );
      const tenant = randomUUID(),
        member = randomUUID(),
        user = randomUUID(),
        invitation = randomUUID(),
        audit = randomUUID();
      await client.query("INSERT INTO tenants VALUES($1)", [tenant]);
      await client.query("INSERT INTO users VALUES($1,'ACTIVE')", [user]);
      const pendingMember = randomUUID(),
        existingUser = randomUUID();
      await client.query("INSERT INTO users VALUES($1,'ACTIVE')", [
        existingUser,
      ]);
      await client.query(
        "INSERT INTO tenant_memberships VALUES($1,$2,$3,'INVITED')",
        [pendingMember, tenant, existingUser],
      );
      await client.query(
        "INSERT INTO tenant_memberships VALUES($1,$2,$3,'ACTIVE')",
        [member, tenant, user],
      );
      await client.query("INSERT INTO membership_roles VALUES($1,'owner')", [
        member,
      ]);
      await client.query(
        "INSERT INTO invitation_tokens VALUES($1,$2,'synthetic@example.test','teacher')",
        [invitation, tenant],
      );
      await client.query(
        "INSERT INTO audit_logs VALUES($1,'Existing reason preserved')",
        [audit],
      );
      await client.query(
        readFileSync(
          "infra/prisma/migrations/202611060020_staff_administration/migration.sql",
          "utf8",
        ),
      );
      expect(
        (
          await client.query(
            "SELECT id,tenant_id,user_id,status,version,staff_delegated,activation_pending FROM tenant_memberships WHERE id=$1",
            [member],
          )
        ).rows,
      ).toEqual([
        {
          id: member,
          tenant_id: tenant,
          user_id: user,
          status: "ACTIVE",
          version: 1,
          staff_delegated: false,
          activation_pending: false,
        },
      ]);
      expect(
        (
          await client.query(
            "SELECT activation_pending FROM tenant_memberships WHERE id=$1",
            [pendingMember],
          )
        ).rows[0].activation_pending,
      ).toBe(true);
      await client.query("SAVEPOINT activation_guard");
      await expect(
        client.query(
          "UPDATE tenant_memberships SET status='ACTIVE' WHERE id=$1",
          [pendingMember],
        ),
      ).rejects.toThrow("membership_activation_required");
      await client.query("ROLLBACK TO SAVEPOINT activation_guard");
      expect(
        (
          await client.query(
            "SELECT revoked_at FROM invitation_tokens WHERE id=$1",
            [invitation],
          )
        ).rows[0].revoked_at,
      ).toBeNull();
      expect(
        (
          await client.query(
            "SELECT reason,metadata FROM audit_logs WHERE id=$1",
            [audit],
          )
        ).rows[0],
      ).toEqual({ reason: "Existing reason preserved", metadata: null });
      await client.query("SAVEPOINT owner_guard");
      await expect(
        client.query(
          "UPDATE tenant_memberships SET status='REVOKED' WHERE id=$1",
          [member],
        ),
      ).rejects.toThrow("last active owner");
      await client.query("ROLLBACK TO SAVEPOINT owner_guard");
      expect(
        (
          await client.query(
            "SELECT status FROM tenant_memberships WHERE id=$1",
            [member],
          )
        ).rows[0].status,
      ).toBe("ACTIVE");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
  it("backfills legacy student dates in tenant timezone without changing historical profile data", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw new Error("Migration rehearsal requires disposable test database");
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      const schema = "migration_" + randomUUID().replaceAll("-", "");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(
        "CREATE TABLE tenants (id uuid PRIMARY KEY, timezone text NOT NULL); CREATE TABLE student_profiles (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL, student_code text, full_name text, notes_private text, status text); CREATE TABLE audit_logs (id uuid PRIMARY KEY)",
      );
      const tenant = randomUUID(),
        student = randomUUID();
      await client.query("INSERT INTO tenants VALUES ($1, $2)", [
        tenant,
        "Asia/Ho_Chi_Minh",
      ]);
      await client.query(
        "INSERT INTO student_profiles VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          student,
          tenant,
          "2025-01-01T18:30:00Z",
          "LEGACY",
          "Học viên lịch sử",
          "Ghi chú giữ nguyên",
          "PAUSED",
        ],
      );
      // Execute the actual repository migration, scoped exclusively to transactional fixtures.
      await client.query(
        readFileSync(
          "infra/prisma/migrations/202610230006_student_profiles/migration.sql",
          "utf8",
        ),
      );
      const result = await client.query(
        "SELECT id,student_code,full_name,notes_private,status,enrolled_at::text,updated_at,version FROM student_profiles",
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: student,
        student_code: "LEGACY",
        full_name: "Học viên lịch sử",
        notes_private: "Ghi chú giữ nguyên",
        status: "PAUSED",
        enrolled_at: "2025-01-02",
        version: 1,
        updated_at: new Date("2025-01-01T18:30:00Z"),
      });
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
}
