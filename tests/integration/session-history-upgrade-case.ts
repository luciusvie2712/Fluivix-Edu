import { expect, it } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function sessionHistoryUpgradeCase() {
  it("031-to-032 history upgrade preserves legacy facts and immutability using all real migration SQL", async () => {
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (
      !url ||
      !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
      !new URL(url).pathname.endsWith("_test")
    )
      throw Error("Disposable local integration database required");
    const pg = new Client({ connectionString: url });
    const schema = "history_upgrade_" + randomUUID().replaceAll("-", "");
    if (!/^history_upgrade_[a-f0-9]{32}$/.test(schema))
      throw Error("Unexpected synthetic schema");
    const root = path.resolve("infra/prisma/migrations");
    const folders = readdirSync(root)
      .filter((name) => /^\d{12}_/.test(name))
      .sort();
    const current = "202611090032_session_history",
      before = folders.filter((name) => name < current);
    expect(before).toHaveLength(31);
    expect(folders).toContain(current);
    await pg.connect();
    try {
      // A transaction-local schema isolates the actual full migration replay.
      // Rollback removes only this synthetic schema; no existing table is changed.
      await pg.query("BEGIN");
      await pg.query(`CREATE SCHEMA "${schema}"`);
      await pg.query(`SET LOCAL search_path TO "${schema}",public`);
      for (const name of before)
        await pg.query(
          readFileSync(path.join(root, name, "migration.sql"), "utf8"),
        );
      const tenant = randomUUID(),
        foreign = randomUUID(),
        actor = randomUUID(),
        foreignActor = randomUUID(),
        member = randomUUID(),
        foreignMember = randomUUID(),
        teacher = randomUUID(),
        cls = randomUUID(),
        session = randomUUID();
      await pg.query(
        "INSERT INTO tenants(id,slug,name,status,subscription_ends_at,grace_until) VALUES($1,'upgrade-a','Synthetic upgrade A','ACTIVE','2040-01-01','2040-02-01'),($2,'upgrade-b','Synthetic upgrade B','ACTIVE','2040-01-01','2040-02-01')",
        [tenant, foreign],
      );
      await pg.query(
        "INSERT INTO users(id,email,display_name,status) VALUES($1,'upgrade-a@example.test','Synthetic upgrade actor','ACTIVE'),($2,'upgrade-b@example.test','Synthetic foreign actor','ACTIVE')",
        [actor, foreignActor],
      );
      await pg.query(
        "INSERT INTO tenant_memberships(id,tenant_id,user_id,status) VALUES($1,$2,$3,'ACTIVE'),($4,$5,$6,'ACTIVE')",
        [member, tenant, actor, foreignMember, foreign, foreignActor],
      );
      await pg.query(
        "INSERT INTO membership_roles(membership_id,role) VALUES($1,'owner'),($1,'teacher'),($2,'owner')",
        [member, foreignMember],
      );
      await pg.query(
        "INSERT INTO teacher_profiles(id,tenant_id,user_id,teacher_code,full_name) VALUES($1,$2,$3,'UPGRADE','Synthetic upgrade teacher')",
        [teacher, tenant, actor],
      );
      await pg.query(
        "INSERT INTO classes(id,tenant_id,code,name,capacity,start_date,end_date) VALUES($1,$2,'UPGRADE','Synthetic upgrade class',10,'2030-01-01','2031-01-01')",
        [cls, tenant],
      );
      await pg.query(
        "INSERT INTO class_sessions(id,tenant_id,class_id,teacher_id,scheduled_date,starts_at,ends_at,status,version,change_count) VALUES($1,$2,$3,$4,'2030-06-05','2030-06-05T13:00Z','2030-06-05T14:00Z','CANCELLED',3,2)",
        [session, tenant, cls, teacher],
      );
      const first = {
        startsAt: "2030-06-03T13:00:00.000Z",
        endsAt: "2030-06-03T14:00:00.000Z",
        scheduledDate: "2030-06-03",
        teacherId: teacher,
        roomId: null,
        status: "SCHEDULED",
        version: 1,
      };
      const second = {
        ...first,
        startsAt: "2030-06-05T13:00:00.000Z",
        endsAt: "2030-06-05T14:00:00.000Z",
        scheduledDate: "2030-06-05",
        version: 2,
      };
      const cancelled = { ...second, status: "CANCELLED", version: 3 };
      const movedId = randomUUID(),
        cancelledId = randomUUID();
      await pg.query(
        "INSERT INTO session_changes(id,tenant_id,session_id,old_snapshot,new_snapshot,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          movedId,
          tenant,
          session,
          first,
          second,
          "Synthetic legacy reschedule",
          actor,
        ],
      );
      await pg.query(
        "INSERT INTO session_changes(id,tenant_id,session_id,old_snapshot,new_snapshot,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          cancelledId,
          tenant,
          session,
          second,
          cancelled,
          "Synthetic legacy cancellation",
          actor,
        ],
      );
      const legacy = async () =>
        (
          await pg.query(
            "SELECT id,tenant_id,session_id,old_snapshot,new_snapshot,reason,actor_id,created_at FROM session_changes ORDER BY id",
          )
        ).rows;
      const original = await legacy();
      await pg.query(
        readFileSync(path.join(root, current, "migration.sql"), "utf8"),
      );
      expect(await legacy()).toEqual(original);
      expect(
        (
          await pg.query(
            "SELECT change_type FROM session_changes ORDER BY change_type",
          )
        ).rows,
      ).toEqual([{ change_type: "CANCELLED" }, { change_type: "RESCHEDULED" }]);
      expect(
        (
          await pg.query(
            "SELECT tgenabled FROM pg_trigger WHERE tgname='session_change_append_only' AND tgrelid='session_changes'::regclass",
          )
        ).rows,
      ).toEqual([{ tgenabled: "O" }]);
      expect(
        (
          await pg.query(
            "SELECT indisvalid FROM pg_index WHERE indexrelid='session_changes_history_idx'::regclass",
          )
        ).rows,
      ).toEqual([{ indisvalid: true }]);
      async function rejected(sql: string, args: unknown[], code: string) {
        await pg.query("SAVEPOINT expected_rejection");
        try {
          await expect(pg.query(sql, args)).rejects.toMatchObject({ code });
        } finally {
          await pg.query("ROLLBACK TO SAVEPOINT expected_rejection");
          await pg.query("RELEASE SAVEPOINT expected_rejection");
        }
      }
      await rejected(
        "UPDATE session_changes SET reason=$1 WHERE id=$2",
        ["Synthetic forbidden rewrite", movedId],
        "P0001",
      );
      await rejected(
        "DELETE FROM session_changes WHERE id=$1",
        [cancelledId],
        "P0001",
      );
      await rejected(
        "INSERT INTO session_changes(id,tenant_id,session_id,old_snapshot,new_snapshot,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          randomUUID(),
          tenant,
          session,
          first,
          second,
          "Synthetic foreign actor",
          foreignActor,
        ],
        "23503",
      );
      await rejected(
        "INSERT INTO session_changes(id,tenant_id,session_id,old_snapshot,new_snapshot,reason,actor_id,change_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          randomUUID(),
          tenant,
          session,
          first,
          second,
          "Synthetic spoofed type",
          actor,
          "CANCELLED",
        ],
        "428C9",
      );
      expect(await legacy()).toEqual(original);
    } finally {
      await pg.query("ROLLBACK").catch(() => {});
      await pg.end();
    }
  });
}
