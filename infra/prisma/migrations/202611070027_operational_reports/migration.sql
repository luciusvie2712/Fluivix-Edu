-- No implicit timezone rewrite: reject unsupported existing settings for review.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM tenants t WHERE t.timezone !~ '^[A-Za-z][A-Za-z0-9_+./-]*$'
   OR NOT EXISTS(SELECT 1 FROM pg_timezone_names z WHERE lower(z.name)=lower(t.timezone) AND z.name NOT LIKE 'posix/%' AND z.name NOT LIKE 'right/%'))
 THEN RAISE EXCEPTION 'Existing tenant timezone requires explicit IANA review before report upgrade'; END IF;
END $$;
CREATE FUNCTION validate_tenant_iana_timezone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.timezone !~ '^[A-Za-z][A-Za-z0-9_+./-]*$'
   OR NOT EXISTS(SELECT 1 FROM pg_timezone_names z WHERE lower(z.name)=lower(NEW.timezone) AND z.name NOT LIKE 'posix/%' AND z.name NOT LIKE 'right/%')
 THEN RAISE EXCEPTION 'Tenant timezone must be a named IANA timezone'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_iana_timezone_guard BEFORE INSERT OR UPDATE OF timezone ON tenants
 FOR EACH ROW EXECUTE FUNCTION validate_tenant_iana_timezone();
-- Existing session index starts with teacher_id after tenant; reports span all teachers.
CREATE INDEX report_session_range_idx ON class_sessions(tenant_id,starts_at,class_id);
CREATE INDEX report_invoice_issue_idx ON invoices(tenant_id,issued_at,id);
CREATE INDEX report_enrollment_period_idx ON enrollments(tenant_id,class_id,joined_at,left_at);
