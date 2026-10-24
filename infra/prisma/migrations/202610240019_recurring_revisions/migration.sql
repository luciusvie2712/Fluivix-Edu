ALTER TABLE schedule_rules ADD COLUMN lineage_id uuid;
ALTER TABLE schedule_rules ADD CONSTRAINT schedule_rules_tenant_id_unique UNIQUE(tenant_id,id);
UPDATE schedule_rules SET lineage_id=id;
ALTER TABLE schedule_rules ALTER COLUMN lineage_id SET NOT NULL;
ALTER TABLE schedule_rules ADD CONSTRAINT schedule_lineage_class_fk
 FOREIGN KEY(tenant_id,lineage_id,class_id) REFERENCES schedule_rules(tenant_id,id,class_id);
CREATE INDEX schedule_rule_lineage_idx ON schedule_rules(tenant_id,lineage_id);

ALTER TABLE class_sessions ADD COLUMN rule_occurrence_date date;
ALTER TABLE class_sessions ADD COLUMN manual_override boolean NOT NULL DEFAULT false;
UPDATE class_sessions SET rule_occurrence_date=COALESCE(
 (SELECT (old_snapshot->>'scheduledDate')::date FROM session_changes c
  WHERE c.tenant_id=class_sessions.tenant_id AND c.session_id=class_sessions.id
  ORDER BY (c.old_snapshot->>'version')::integer,c.created_at,c.id LIMIT 1),scheduled_date)
 WHERE schedule_rule_id IS NOT NULL;
UPDATE class_sessions SET manual_override=true WHERE change_count>0;
-- Keep the spec's actual-day uniqueness AND bind retry to the immutable origin.
CREATE UNIQUE INDEX sessions_rule_occurrence_unique
 ON class_sessions(tenant_id,schedule_rule_id,rule_occurrence_date) WHERE schedule_rule_id IS NOT NULL;
ALTER TABLE class_sessions ADD CONSTRAINT session_occurrence_type_check
 CHECK((schedule_rule_id IS NULL AND rule_occurrence_date IS NULL) OR
       (schedule_rule_id IS NOT NULL AND rule_occurrence_date IS NOT NULL));
CREATE FUNCTION protect_session_rule_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.schedule_rule_id IS DISTINCT FROM OLD.schedule_rule_id OR
    NEW.rule_occurrence_date IS DISTINCT FROM OLD.rule_occurrence_date THEN
  RAISE EXCEPTION 'session rule occurrence is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_rule_origin_immutable BEFORE UPDATE ON class_sessions
 FOR EACH ROW EXECUTE FUNCTION protect_session_rule_origin();

CREATE TABLE schedule_rule_revisions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, class_id uuid NOT NULL, rule_id uuid NOT NULL,
 replacement_id uuid NOT NULL, old_snapshot jsonb NOT NULL, new_snapshot jsonb NOT NULL,
 effective_from date NOT NULL, reason varchar(500) NOT NULL CHECK(length(reason)>=10),
 actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,rule_id,class_id) REFERENCES schedule_rules(tenant_id,id,class_id),
 FOREIGN KEY(tenant_id,replacement_id,class_id) REFERENCES schedule_rules(tenant_id,id,class_id)
);
CREATE FUNCTION protect_schedule_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'schedule revision is append-only'; END $$;
CREATE TRIGGER schedule_revision_immutable BEFORE UPDATE OR DELETE ON schedule_rule_revisions
 FOR EACH ROW EXECUTE FUNCTION protect_schedule_revision();
