-- Derive the type from existing immutable facts without updating historical rows
-- or disabling the append-only trigger. Unknown transitions fail closed.
ALTER TABLE session_changes ADD COLUMN change_type varchar(20)
GENERATED ALWAYS AS (CASE
 WHEN old_snapshot->>'status' IN ('SCHEDULED','IN_PROGRESS')
  AND new_snapshot->>'status'='CANCELLED' THEN 'CANCELLED'
 WHEN old_snapshot->>'status'='SCHEDULED'
  AND new_snapshot->>'status'='SCHEDULED' THEN 'RESCHEDULED'
 END) STORED NOT NULL;

ALTER TABLE session_changes ADD CONSTRAINT session_change_actor_tenant_fk
 FOREIGN KEY(tenant_id,actor_id) REFERENCES tenant_memberships(tenant_id,user_id)
 ON DELETE RESTRICT;

CREATE INDEX session_changes_history_idx
 ON session_changes(tenant_id,session_id,created_at DESC,id DESC);
