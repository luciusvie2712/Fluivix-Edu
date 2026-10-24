CREATE TABLE schedule_rules (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, class_id uuid NOT NULL,
 teacher_id uuid NOT NULL, room_id uuid,
 weekday integer NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 local_start varchar(5) NOT NULL CHECK(local_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 local_end varchar(5) NOT NULL CHECK(local_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND local_end > local_start),
 valid_from date NOT NULL, valid_to date NOT NULL CHECK(valid_to >= valid_from),
 timezone varchar(80) NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id,class_id),
 FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id),
 FOREIGN KEY(tenant_id,teacher_id) REFERENCES teacher_profiles(tenant_id,id),
 FOREIGN KEY(tenant_id,room_id) REFERENCES rooms(tenant_id,id)
);
CREATE INDEX schedule_rules_class_idx ON schedule_rules(tenant_id,class_id);
ALTER TABLE class_sessions ADD COLUMN schedule_rule_id uuid;
ALTER TABLE class_sessions ADD COLUMN session_type varchar(20) NOT NULL DEFAULT 'EXTRA'
 CHECK(session_type IN ('REGULAR','EXTRA'));
ALTER TABLE class_sessions ADD CONSTRAINT session_rule_class_fk
 FOREIGN KEY(tenant_id,schedule_rule_id,class_id) REFERENCES schedule_rules(tenant_id,id,class_id);
ALTER TABLE class_sessions ADD CONSTRAINT session_rule_type_check
 CHECK((schedule_rule_id IS NULL AND session_type='EXTRA') OR (schedule_rule_id IS NOT NULL AND session_type='REGULAR'));
CREATE UNIQUE INDEX sessions_rule_day_unique ON class_sessions(tenant_id,schedule_rule_id,scheduled_date)
 WHERE schedule_rule_id IS NOT NULL;
