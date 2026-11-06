import { it, expect } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export function notificationMigrationCase() {
  it("notification upgrade028 preserves legacy outcomes and unknown generations, prevents duplicate sends and rejects cross-tenant legacy bindings", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw Error("Disposable migration database required");
    const db = new Client({ connectionString });
    await db.connect();
    const sql = readFileSync(
      "infra/prisma/migrations/202611070028_notification_delivery/migration.sql",
      "utf8",
    );
    try {
      for (const invalid of [false, true]) {
        await db.query("BEGIN");
        const schema =
          "notification_upgrade_" + randomUUID().replaceAll("-", "");
        await db.query(`CREATE SCHEMA "${schema}"`);
        await db.query(`SET LOCAL search_path TO "${schema}"`);
        // Bounded legacy columns consumed by028, including the old per-audience uniqueness.
        await db.query(`
          CREATE TABLE device_push_tokens(id uuid PRIMARY KEY,user_id uuid,family_id uuid,token_hash text,token_encrypted text,platform text,status text);
          CREATE TABLE outbox_events(id uuid PRIMARY KEY,tenant_id uuid);
          CREATE TABLE notifications(id uuid PRIMARY KEY,tenant_id uuid,event_id uuid,recipient_user_id uuid,recipient_role text,subject_student_id uuid,type text,entity_type text,entity_id uuid,created_at timestamptz,read_at timestamptz);
          CREATE TABLE notification_deliveries(id uuid PRIMARY KEY,tenant_id uuid,notification_id uuid,device_id uuid,status text NOT NULL DEFAULT 'PENDING',attempts integer NOT NULL DEFAULT 0,provider_ref text,last_attempt_at timestamptz,UNIQUE(notification_id,device_id));
        `);
        const tenant = randomUUID(),
          user = randomUUID(),
          device = randomUUID(),
          audiences: string[] = [];
        await db.query(
          "INSERT INTO device_push_tokens VALUES($1,$2,$3,'synthetic-hash','synthetic-ciphertext','android','ACTIVE')",
          [device, user, randomUUID()],
        );
        const outcomes = [
          ["SENT", "FAILED", "PENDING"],
          ["ACCEPTED", "FAILED", "PENDING"],
          ["UNKNOWN", "SENDING", "PENDING"],
        ];
        for (const statuses of outcomes) {
          const event = randomUUID();
          await db.query("INSERT INTO outbox_events VALUES($1,$2)", [
            event,
            tenant,
          ]);
          for (const status of statuses) {
            const note = randomUUID();
            audiences.push(note);
            await db.query(
              "INSERT INTO notifications VALUES($1,$2,$3,$4,'guardian',$5,'CLASS_SCHEDULE_CHANGED','session',$6,'2026-11-01T01:00Z',NULL)",
              [
                note,
                invalid ? randomUUID() : tenant,
                event,
                user,
                randomUUID(),
                randomUUID(),
              ],
            );
            await db.query(
              "INSERT INTO notification_deliveries VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
              [
                randomUUID(),
                invalid
                  ? (
                      await db.query(
                        "SELECT tenant_id FROM notifications WHERE id=$1",
                        [note],
                      )
                    ).rows[0].tenant_id
                  : tenant,
                note,
                device,
                status,
                status === "PENDING" ? 0 : 2,
                status === "ACCEPTED" || status === "SENT"
                  ? "synthetic-provider-" + note
                  : null,
                status === "PENDING"
                  ? null
                  : new Date(
                      status === "UNKNOWN"
                        ? "2026-11-01T01:59Z"
                        : "2026-11-01T02:00Z",
                    ),
              ],
            );
          }
        }
        const legacySql =
          "SELECT id,tenant_id,notification_id,device_id,status,attempts,provider_ref,last_attempt_at FROM notification_deliveries ORDER BY id";
        const before = (await db.query(legacySql)).rows;
        expect(before).toHaveLength(9);
        if (invalid) {
          await expect(db.query(sql)).rejects.toMatchObject({
            code: "23503",
            constraint: "notification_event_tenant_fk",
          });
          await db.query("ROLLBACK");
          continue;
        }
        await db.query(sql);
        expect((await db.query(legacySql)).rows).toEqual(before);
        expect(
          (
            await db.query("SELECT device_version FROM notification_deliveries")
          ).rows.every((r) => r.device_version === null),
        ).toBe(true);
        expect(
          (await db.query("SELECT version FROM device_push_tokens")).rows[0]
            .version,
        ).toBe(1);
        const canonical = (
          await db.query(
            "SELECT * FROM notification_deliveries WHERE canonical ORDER BY status",
          )
        ).rows;
        expect(canonical.map((r) => r.status)).toEqual([
          "ACCEPTED",
          "SENT",
          "UNKNOWN",
        ]);
        const reject = async (
          statement: string,
          values: unknown[],
          code: string,
          constraint?: string,
        ) => {
          await db.query("SAVEPOINT rejected_write");
          await expect(db.query(statement, values)).rejects.toMatchObject({
            code,
            ...(constraint ? { constraint } : {}),
          });
          await db.query("ROLLBACK TO SAVEPOINT rejected_write");
          await db.query("RELEASE SAVEPOINT rejected_write");
        };
        const fresh = randomUUID();
        await db.query(
          "INSERT INTO notifications SELECT $1,tenant_id,event_id,recipient_user_id,recipient_role,$2,type,entity_type,entity_id,created_at,NULL FROM notifications WHERE id=$3",
          [fresh, randomUUID(), audiences[0]],
        );
        await reject(
          "INSERT INTO notification_deliveries(id,tenant_id,notification_id,device_id) VALUES($1,$2,$3,$4)",
          [randomUUID(), tenant, fresh, device],
          "23505",
          "notification_one_event_recipient_device",
        );
        const uncertain = canonical.find((r) => r.status === "UNKNOWN")!;
        await reject(
          "UPDATE notification_deliveries SET status='PENDING' WHERE id=$1",
          [uncertain.id],
          "23514",
        );
        await reject(
          "UPDATE notification_deliveries SET attempts=0 WHERE id=$1",
          [uncertain.id],
          "23514",
        );
        await reject(
          "UPDATE notification_deliveries SET canonical=false WHERE id=$1",
          [uncertain.id],
          "23514",
        );
        const oldPending = (
          await db.query(
            "SELECT id FROM notification_deliveries WHERE NOT canonical AND status='PENDING' LIMIT 1",
          )
        ).rows[0];
        await reject(
          "UPDATE notification_deliveries SET status='SENDING',attempts=attempts+1,device_version=1 WHERE id=$1",
          [oldPending.id],
          "23514",
        );
        await reject(
          "UPDATE notifications SET subject_student_id=$1 WHERE id=$2",
          [randomUUID(), audiences[0]],
          "23514",
        );
        await db.query(
          "UPDATE notification_deliveries SET status='SENT' WHERE status='ACCEPTED'",
        );
        expect(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM notification_deliveries",
            )
          ).rows[0].n,
        ).toBe(9);
        await db.query(
          "UPDATE device_push_tokens SET token_encrypted='synthetic-new-registration' WHERE id=$1",
          [device],
        );
        expect(
          (
            await db.query(
              "SELECT version FROM device_push_tokens WHERE id=$1",
              [device],
            )
          ).rows[0].version,
        ).toBe(2);
        await db.query("ROLLBACK");
      }
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });
}
