import { it, expect } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
export function migrationCases() {
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
