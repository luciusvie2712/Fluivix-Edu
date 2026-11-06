import { it, expect } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
export function migrationCases() {
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
