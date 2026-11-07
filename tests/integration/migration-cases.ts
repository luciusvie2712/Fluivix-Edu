import { it, expect } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { reportMigrationCase } from "./report-migration-case";
import { notificationMigrationCase } from "./notification-migration-case";
import { privacyMigrationCase } from "./privacy-migration-case";
export function migrationCases() {
  reportMigrationCase();
  notificationMigrationCase();
  privacyMigrationCase();
  it("upgrades invoice actors and meaningful reasons without rewriting legacy financial rows or accepting orphan actors", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw new Error("Disposable database required");
    const client = new Client({ connectionString });
    await client.connect();
    try {
      for (const mode of ["valid", "orphan", "blank-reason"]) {
        await client.query("BEGIN");
        const schema = "invoice_upgrade_" + randomUUID().replaceAll("-", "");
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        await client.query(
          "CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,PRIMARY KEY(tenant_id,user_id)); CREATE TABLE invoice_runs(id uuid PRIMARY KEY,tenant_id uuid,created_by uuid); CREATE TABLE invoices(id uuid PRIMARY KEY,tenant_id uuid,created_by uuid,billing_state text,void_reason text,due_at timestamptz,total_amount_vnd bigint); CREATE TABLE payment_reversals(id uuid PRIMARY KEY,tenant_id uuid,approved_by uuid,reason text); CREATE TABLE invoice_items(id uuid PRIMARY KEY,tenant_id uuid,invoice_id uuid);",
        );
        const tenant = randomUUID(),
          actor = randomUUID(),
          outsider = randomUUID(),
          run = randomUUID(),
          invoice = randomUUID(),
          reversal = randomUUID();
        await client.query("INSERT INTO tenant_memberships VALUES($1,$2)", [
          tenant,
          actor,
        ]);
        await client.query("INSERT INTO invoice_runs VALUES($1,$2,$3)", [
          run,
          tenant,
          mode === "orphan" ? outsider : actor,
        ]);
        await client.query(
          "INSERT INTO invoices VALUES($1,$2,$3,'VOID',$4,'2026-10-31T17:00:00Z',9007199254740993)",
          [
            invoice,
            tenant,
            actor,
            mode === "blank-reason"
              ? "           "
              : "Legacy checked invoice cancellation",
          ],
        );
        await client.query(
          "INSERT INTO payment_reversals VALUES($1,$2,$3,'Legacy checked reversal reason')",
          [reversal, tenant, actor],
        );
        const sql = readFileSync(
          "infra/prisma/migrations/202611060024_invoice_administration/migration.sql",
          "utf8",
        );
        if (mode !== "valid") {
          await expect(client.query(sql)).rejects.toThrow();
          await client.query("ROLLBACK");
          continue;
        }
        await client.query(sql);
        expect(
          (
            await client.query(
              "SELECT total_amount_vnd::text,void_reason,due_at FROM invoices WHERE id=$1",
              [invoice],
            )
          ).rows,
        ).toEqual([
          {
            total_amount_vnd: "9007199254740993",
            void_reason: "Legacy checked invoice cancellation",
            due_at: new Date("2026-10-31T17:00:00Z"),
          },
        ]);
        const reject = async (statement: string, values: unknown[]) => {
          await client.query("SAVEPOINT invalid_actor");
          await expect(client.query(statement, values)).rejects.toThrow();
          await client.query("ROLLBACK TO SAVEPOINT invalid_actor");
          await client.query("RELEASE SAVEPOINT invalid_actor");
        };
        await reject("UPDATE invoice_runs SET created_by=$1 WHERE id=$2", [
          outsider,
          run,
        ]);
        await reject("UPDATE invoices SET created_by=$1 WHERE id=$2", [
          outsider,
          invoice,
        ]);
        await reject(
          "UPDATE invoices SET void_reason='           ' WHERE id=$1",
          [invoice],
        );
        await reject(
          "UPDATE payment_reversals SET approved_by=$1 WHERE id=$2",
          [outsider, reversal],
        );
        await reject(
          "UPDATE payment_reversals SET reason='           ' WHERE id=$1",
          [reversal],
        );
        await reject(
          "INSERT INTO finance_operation_limits VALUES($1,$2,'INVOICE_GENERATE',1,now())",
          [tenant, outsider],
        );
        expect(
          (
            await client.query(
              "SELECT count(*)::int AS n FROM finance_operation_limits",
            )
          ).rows[0].n,
        ).toBe(0);
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
  it("upgrades legacy fee plans through tenant-zone guard026 without rewriting immutable issued prices or append-only terms", async () => {
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
      const schema = "fee_upgrade_" + randomUUID().replaceAll("-", "");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(
        "CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,PRIMARY KEY(tenant_id,user_id)); CREATE TABLE fee_plans(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,class_id uuid NOT NULL,name varchar(150) NOT NULL,billing_model varchar(10) NOT NULL,amount_vnd bigint NOT NULL,valid_from date NOT NULL,valid_to date,status varchar(20) NOT NULL DEFAULT 'ACTIVE',UNIQUE(tenant_id,id)); CREATE TABLE invoice_runs(id uuid PRIMARY KEY,tenant_id uuid,fee_plan_id uuid);",
      );
      const old = readFileSync(
        "infra/prisma/migrations/202610240011_finance/migration.sql",
        "utf8",
      );
      // Use the actual existing no-delete and used-price trigger definitions.
      const noDelete = old.match(
        /CREATE FUNCTION finance_no_delete\(\)[\s\S]*?END \$\$;/,
      )?.[0];
      const used = old.slice(
        old.indexOf("CREATE FUNCTION used_fee_immutable()"),
      );
      if (!noDelete || !used.startsWith("CREATE FUNCTION used_fee_immutable()"))
        throw new Error("Legacy finance trigger fixture drift");
      await client.query(noDelete);
      await client.query(used);
      const tenant = randomUUID(),
        actor = randomUUID(),
        outsider = randomUUID(),
        fee = randomUUID(),
        classId = randomUUID(),
        year = new Date().getUTCFullYear() + 1;
      await client.query("INSERT INTO tenant_memberships VALUES($1,$2)", [
        tenant,
        actor,
      ]);
      await client.query(
        "INSERT INTO fee_plans(id,tenant_id,class_id,name,billing_model,amount_vnd,valid_from,valid_to) VALUES($1,$2,$3,'Legacy issued fee','MONTHLY',9007199254740993,$4,$5)",
        [fee, tenant, classId, `${year}-01-01`, `${year}-12-31`],
      );
      await client.query("INSERT INTO invoice_runs VALUES($1,$2,$3)", [
        randomUUID(),
        tenant,
        fee,
      ]);
      await client.query(
        readFileSync(
          "infra/prisma/migrations/202611060023_fee_plan_terms/migration.sql",
          "utf8",
        ),
      );
      const original = await client.query(
        "SELECT name,amount_vnd::text,valid_from::text,version FROM fee_plans WHERE id=$1",
        [fee],
      );
      expect(original.rows).toEqual([
        {
          name: "Legacy issued fee",
          amount_vnd: "9007199254740993",
          valid_from: `${year}-01-01`,
          version: 1,
        },
      ]);
      expect(
        (await client.query("SELECT count(*)::int AS n FROM fee_plan_terms"))
          .rows[0].n,
      ).toBe(0);
      const reject = async (sql: string, values: unknown[]) => {
        await client.query("SAVEPOINT invalid_fee");
        await expect(client.query(sql, values)).rejects.toThrow();
        await client.query("ROLLBACK TO SAVEPOINT invalid_fee");
        await client.query("RELEASE SAVEPOINT invalid_fee");
      };
      await reject("UPDATE fee_plans SET amount_vnd=1 WHERE id=$1", [fee]);
      await reject("DELETE FROM fee_plans WHERE id=$1", [fee]);
      await client.query("UPDATE fee_plans SET version=2 WHERE id=$1", [fee]);
      const term = randomUUID();
      const insert =
        "INSERT INTO fee_plan_terms(id,tenant_id,fee_plan_id,version,effective_from,name,amount_vnd,reason,created_by,actor_display_name,trace_id) VALUES($1,$2,$3,$4,$5,'Verified future fee',9007199254740994,'Verified future fee change',$6,'Actual verified actor','fee-upgrade-test')";
      await client.query(insert, [
        term,
        tenant,
        fee,
        2,
        `${year}-02-01`,
        actor,
      ]);
      const beforeTimezoneUpgrade = (
        await client.query("SELECT * FROM fee_plan_terms ORDER BY id")
      ).rows;
      await client.query(
        "CREATE TABLE tenants(id uuid PRIMARY KEY,timezone text NOT NULL)",
      );
      await client.query(
        "INSERT INTO tenants VALUES($1,'Pacific/Kiritimati')",
        [tenant],
      );
      await client.query(
        readFileSync(
          "infra/prisma/migrations/202611070026_financial_timezone/migration.sql",
          "utf8",
        ),
      );
      expect(
        (await client.query("SELECT * FROM fee_plan_terms ORDER BY id")).rows,
      ).toEqual(beforeTimezoneUpgrade);
      expect(
        (
          await client.query(
            "SELECT name,amount_vnd::text,valid_from::text FROM fee_plans WHERE id=$1",
            [fee],
          )
        ).rows,
      ).toEqual([
        {
          name: "Legacy issued fee",
          amount_vnd: "9007199254740993",
          valid_from: `${year}-01-01`,
        },
      ]);
      expect(
        (
          await client.query(
            "SELECT amount_vnd::text FROM fee_plan_terms WHERE id=$1",
            [term],
          )
        ).rows[0].amount_vnd,
      ).toBe("9007199254740994");
      await reject("UPDATE fee_plan_terms SET amount_vnd=1 WHERE id=$1", [
        term,
      ]);
      await reject("DELETE FROM fee_plan_terms WHERE id=$1", [term]);
      await reject(insert, [
        randomUUID(),
        tenant,
        fee,
        2,
        `${year}-02-01`,
        actor,
      ]);
      await client.query("UPDATE fee_plans SET version=3 WHERE id=$1", [fee]);
      await reject(insert, [
        randomUUID(),
        tenant,
        fee,
        3,
        `${year}-03-01`,
        outsider,
      ]);
      await reject(insert, [
        randomUUID(),
        tenant,
        fee,
        3,
        `${year}-03-02`,
        actor,
      ]);
      await reject(insert, [randomUUID(), tenant, fee, 3, "2000-01-01", actor]);
      await client.query("UPDATE fee_plans SET status='ARCHIVED' WHERE id=$1", [
        fee,
      ]);
      await reject(insert, [
        randomUUID(),
        tenant,
        fee,
        3,
        `${year}-03-01`,
        actor,
      ]);
      expect(
        (
          await client.query(
            "SELECT amount_vnd::text FROM fee_plans WHERE id=$1",
            [fee],
          )
        ).rows[0].amount_vnd,
      ).toBe("9007199254740993");
      expect(
        (await client.query("SELECT count(*)::int AS n FROM fee_plan_terms"))
          .rows[0].n,
      ).toBe(1);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
  it("upgrades assessment actor boundaries without fabricating legacy names and rejects orphan or duplicate history", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw new Error("Disposable database required");
    const client = new Client({ connectionString });
    await client.connect();
    const sql = readFileSync(
      "infra/prisma/migrations/202611060022_assessment_administration/migration.sql",
      "utf8",
    );
    try {
      for (const mode of ["valid", "orphan", "duplicate"] as const) {
        await client.query("BEGIN");
        const schema = "assessment_upgrade_" + randomUUID().replaceAll("-", "");
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        await client.query(
          "CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,PRIMARY KEY(tenant_id,user_id)); CREATE TABLE assessments(id uuid PRIMARY KEY,tenant_id uuid,created_by uuid); CREATE TABLE assessment_results(id uuid PRIMARY KEY,tenant_id uuid,graded_by uuid); CREATE TABLE grade_change_events(id uuid PRIMARY KEY,tenant_id uuid,assessment_id uuid,student_id uuid,version integer,before_value jsonb NOT NULL,after_value jsonb NOT NULL,actor_id uuid,created_at timestamptz); CREATE TABLE audit_logs(id uuid PRIMARY KEY,tenant_id uuid,resource_id text,created_at timestamptz);",
        );
        const tenant = randomUUID(),
          foreign = randomUUID(),
          owner = randomUUID(),
          outsider = randomUUID(),
          assessment = randomUUID(),
          student = randomUUID(),
          event = randomUUID();
        await client.query(
          "INSERT INTO tenant_memberships VALUES($1,$2),($3,$4)",
          [tenant, owner, foreign, outsider],
        );
        await client.query("INSERT INTO assessments VALUES($1,$2,$3)", [
          assessment,
          tenant,
          mode === "orphan" ? outsider : owner,
        ]);
        await client.query("INSERT INTO assessment_results VALUES($1,$2,$3)", [
          randomUUID(),
          tenant,
          owner,
        ]);
        const addHistory = (id: string, version = 1, actor = owner) =>
          client.query(
            'INSERT INTO grade_change_events VALUES($1,$2,$3,$4,$5,\'null\'::jsonb,\'{"score":"8.00","comment":"Original grade"}\'::jsonb,$6,\'2025-01-01T00:00:00Z\')',
            [id, tenant, assessment, student, version, actor],
          );
        await addHistory(event);
        if (mode === "duplicate") await addHistory(randomUUID());
        await client.query("SAVEPOINT upgrade");
        if (mode !== "valid") {
          await expect(client.query(sql)).rejects.toThrow(
            mode === "orphan"
              ? "assessment_creator_member_fk"
              : "grade_history_student_version_key",
          );
          await client.query("ROLLBACK TO SAVEPOINT upgrade");
          expect(
            (
              await client.query(
                "SELECT count(*)::integer AS count FROM grade_change_events",
              )
            ).rows[0].count,
          ).toBe(mode === "duplicate" ? 2 : 1);
          expect(
            (
              await client.query(
                "SELECT count(*)::integer AS count FROM tenant_memberships WHERE tenant_id=$1",
                [tenant],
              )
            ).rows[0].count,
          ).toBe(1);
        } else {
          await client.query(sql);
          const row = (
            await client.query(
              "SELECT * FROM grade_change_events WHERE id=$1",
              [event],
            )
          ).rows[0];
          expect(row).toMatchObject({
            id: event,
            actor_id: owner,
            version: 1,
            actor_display_name: null,
            trace_id: null,
            before_value: null,
            after_value: { score: "8.00", comment: "Original grade" },
          });
          expect(row.created_at.toISOString()).toBe("2025-01-01T00:00:00.000Z");
          for (const [query, args, constraint] of [
            [
              "UPDATE assessments SET created_by=$1 WHERE id=$2",
              [outsider, assessment],
              "assessment_creator_member_fk",
            ],
            [
              "UPDATE assessment_results SET graded_by=$1",
              [outsider],
              "assessment_grader_member_fk",
            ],
            [
              'INSERT INTO grade_change_events(id,tenant_id,assessment_id,student_id,version,before_value,after_value,actor_id,created_at) VALUES($1,$2,$3,$4,2,\'null\'::jsonb,\'{"score":"1.00","comment":"Rejected"}\'::jsonb,$5,now())',
              [randomUUID(), tenant, assessment, student, outsider],
              "grade_history_actor_member_fk",
            ],
            [
              'INSERT INTO grade_change_events(id,tenant_id,assessment_id,student_id,version,before_value,after_value,actor_id,created_at) VALUES($1,$2,$3,$4,1,\'null\'::jsonb,\'{"score":"1.00","comment":"Rejected"}\'::jsonb,$5,now())',
              [randomUUID(), tenant, assessment, student, owner],
              "grade_history_student_version_key",
            ],
          ] as const) {
            await client.query("SAVEPOINT invariant");
            await expect(client.query(query, [...args])).rejects.toThrow(
              constraint,
            );
            await client.query("ROLLBACK TO SAVEPOINT invariant");
          }
        }
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
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
