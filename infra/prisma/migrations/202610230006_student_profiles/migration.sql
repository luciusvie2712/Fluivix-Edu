ALTER TABLE student_profiles
  ADD COLUMN date_of_birth date,
  ADD COLUMN contact_email varchar(254),
  ADD COLUMN contact_phone varchar(30),
  ADD COLUMN enrolled_at date,
  ADD COLUMN updated_at timestamptz,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT student_version_positive CHECK (version > 0);
UPDATE student_profiles s SET enrolled_at = (s.created_at AT TIME ZONE t.timezone)::date,
  updated_at = s.created_at FROM tenants t WHERE t.id = s.tenant_id;
ALTER TABLE student_profiles
  ALTER COLUMN enrolled_at SET NOT NULL,
  ALTER COLUMN enrolled_at SET DEFAULT CURRENT_DATE,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE audit_logs ADD COLUMN reason varchar(500);
