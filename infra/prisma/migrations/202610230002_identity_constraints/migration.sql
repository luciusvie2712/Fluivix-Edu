-- SQL-only invariants beyond Prisma's schema expressiveness.
CREATE TABLE auth_rate_limits (
  key char(64) PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  window_start timestamptz NOT NULL
);
ALTER TABLE users ADD CONSTRAINT users_email_canonical CHECK (email = lower(btrim(email)));
ALTER TABLE tenants ADD CONSTRAINT subscription_dates CHECK (grace_until >= subscription_ends_at);
ALTER TABLE student_profiles ADD CONSTRAINT student_status CHECK (status IN ('ACTIVE','PAUSED','GRADUATED','INACTIVE'));
ALTER TABLE student_profiles ADD CONSTRAINT student_account_membership
  FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT;
ALTER TABLE guardian_student_links ADD CONSTRAINT guardian_membership
  FOREIGN KEY (tenant_id, guardian_user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT;
ALTER TABLE guardian_student_links ADD CONSTRAINT guardian_verified_active
  CHECK (status IN ('PENDING','ACTIVE','REVOKED') AND (status <> 'ACTIVE' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)));
CREATE UNIQUE INDEX guardian_active_pair ON guardian_student_links(tenant_id, student_id, guardian_user_id) WHERE status='ACTIVE';
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit logs are append only'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
