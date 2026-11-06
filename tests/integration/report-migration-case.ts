import { it, expect } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
export function reportMigrationCase() {
  it("report upgrade027 preserves valid named calendars and historical money, rejects invalid legacy zones without rewriting them", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw Error("Disposable migration database required");
    const db = new Client({ connectionString });
    await db.connect();
    const sql = readFileSync(
      "infra/prisma/migrations/202611070027_operational_reports/migration.sql",
      "utf8",
    );
    try {
      for (const timezone of ["Asia/Ho_Chi_Minh", "+07:00"]) {
        await db.query("BEGIN");
        const schema = "report_upgrade_" + randomUUID().replaceAll("-", "");
        await db.query(`CREATE SCHEMA "${schema}"`);
        await db.query(`SET LOCAL search_path TO "${schema}"`);
        await db.query(
          "CREATE TABLE tenants(id uuid PRIMARY KEY,timezone text NOT NULL); CREATE TABLE class_sessions(tenant_id uuid,starts_at timestamptz,class_id uuid); CREATE TABLE invoices(id uuid,tenant_id uuid,issued_at timestamptz,total_amount_vnd bigint,due_at timestamptz); CREATE TABLE enrollments(tenant_id uuid,class_id uuid,joined_at date,left_at date)",
        );
        const tenant = randomUUID();
        await db.query("INSERT INTO tenants VALUES($1,$2)", [tenant, timezone]);
        await db.query(
          "INSERT INTO invoices VALUES($1,$2,'2026-10-31T17:00Z',9007199254740993,'2026-11-15T17:00Z')",
          [randomUUID(), tenant],
        );
        const original = (
          await db.query(
            "SELECT id,tenant_id,issued_at,total_amount_vnd::text,due_at FROM invoices",
          )
        ).rows;
        if (timezone.startsWith("+")) {
          await expect(db.query(sql)).rejects.toThrow("explicit IANA review");
          await db.query("ROLLBACK");
          continue;
        }
        await db.query(sql);
        expect(
          (await db.query("SELECT timezone FROM tenants WHERE id=$1", [tenant]))
            .rows[0].timezone,
        ).toBe(timezone);
        expect(
          (
            await db.query(
              "SELECT id,tenant_id,issued_at,total_amount_vnd::text,due_at FROM invoices",
            )
          ).rows,
        ).toEqual(original);
        for (const invalid of ["+07:00", "-05:00", "Not/A_Timezone"]) {
          await db.query("SAVEPOINT invalid_zone");
          await expect(
            db.query("UPDATE tenants SET timezone=$1 WHERE id=$2", [
              invalid,
              tenant,
            ]),
          ).rejects.toThrow("named IANA");
          await db.query("ROLLBACK TO SAVEPOINT invalid_zone");
          await db.query("RELEASE SAVEPOINT invalid_zone");
          expect(
            (
              await db.query("SELECT timezone FROM tenants WHERE id=$1", [
                tenant,
              ])
            ).rows[0].timezone,
          ).toBe(timezone);
        }
        for (const valid of [
          "UTC",
          "Etc/GMT+12",
          "Asia/Saigon",
          "America/New_York",
        ])
          await db.query("INSERT INTO tenants VALUES($1,$2)", [
            randomUUID(),
            valid,
          ]);
        expect(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname=$1 AND indexname LIKE 'report_%'",
              [schema],
            )
          ).rows[0].n,
        ).toBe(3);
        await db.query("ROLLBACK");
      }
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });
}
