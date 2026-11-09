-- Fixed P0 reminder preset. Issued invoices and their ledger are never changed.
CREATE TABLE fee_reminder_policies (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL CHECK(version>0),
 enabled_since timestamptz,
 approved_by uuid,
 approved_at timestamptz,
 approval_ref varchar(200),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,approved_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
 CHECK(NOT enabled OR (enabled_since IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_ref IS NOT NULL AND length(trim(approval_ref))>0)),
 CHECK(enabled OR enabled_since IS NULL)
);
CREATE TABLE fee_reminder_policy_events (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES fee_reminder_policies(tenant_id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0),
 enabled boolean NOT NULL,
 reason varchar(500) NOT NULL CHECK(length(trim(reason))>0),
 approval_ref varchar(200),
 actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,version),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE TRIGGER fee_reminder_policy_events_immutable BEFORE UPDATE OR DELETE ON fee_reminder_policy_events FOR EACH ROW EXECUTE FUNCTION history_append_only();
CREATE TABLE invoice_reminder_holds (
 tenant_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 held boolean NOT NULL,
 category varchar(30),
 version integer NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,invoice_id),
 FOREIGN KEY(tenant_id,invoice_id) REFERENCES invoices(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,updated_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
 CHECK((held AND category IS NOT NULL AND category IN ('MANUAL','PENDING_RECONCILIATION')) OR (NOT held AND category IS NULL))
);
CREATE TABLE invoice_reminder_hold_events (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 held boolean NOT NULL,
 category varchar(30),
 version integer NOT NULL CHECK(version>0),
 reason varchar(500) NOT NULL CHECK(length(trim(reason))>0),
 actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,invoice_id,version),
 FOREIGN KEY(tenant_id,invoice_id) REFERENCES invoice_reminder_holds(tenant_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
 CHECK((held AND category IS NOT NULL AND category IN ('MANUAL','PENDING_RECONCILIATION')) OR (NOT held AND category IS NULL))
);
CREATE TRIGGER invoice_reminder_hold_events_immutable BEFORE UPDATE OR DELETE ON invoice_reminder_hold_events FOR EACH ROW EXECUTE FUNCTION history_append_only();
CREATE TABLE fee_reminder_batches (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 student_id uuid NOT NULL,
 local_day date NOT NULL,
 timezone varchar(80) NOT NULL,
 policy_version integer NOT NULL,
 window_starts_at timestamptz NOT NULL,
 window_ends_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id,student_id),
 UNIQUE(tenant_id,student_id,local_day),
 FOREIGN KEY(tenant_id,student_id) REFERENCES student_profiles(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,policy_version) REFERENCES fee_reminder_policy_events(tenant_id,version) ON DELETE RESTRICT,
 CHECK(window_starts_at<window_ends_at AND window_ends_at-window_starts_at<=interval '15 minutes')
);
CREATE TRIGGER fee_reminder_batches_immutable BEFORE UPDATE OR DELETE ON fee_reminder_batches FOR EACH ROW EXECUTE FUNCTION history_append_only();
CREATE TABLE fee_reminder_stages (
 tenant_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 student_id uuid NOT NULL,
 stage varchar(20) NOT NULL CHECK(stage IN ('BEFORE_3','AFTER_1','AFTER_7')),
 batch_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,invoice_id,stage),
 FOREIGN KEY(tenant_id,invoice_id,student_id) REFERENCES invoices(tenant_id,id,student_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,batch_id,student_id) REFERENCES fee_reminder_batches(tenant_id,id,student_id) ON DELETE RESTRICT
);
CREATE INDEX fee_reminder_stages_batch_idx ON fee_reminder_stages(tenant_id,batch_id);
CREATE TRIGGER fee_reminder_stages_immutable BEFORE UPDATE OR DELETE ON fee_reminder_stages FOR EACH ROW EXECUTE FUNCTION history_append_only();
CREATE FUNCTION guard_fee_reminder_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reminder configuration cannot be deleted'; END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'Initial reminder version must be1'; END IF;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR NEW.tenant_id<>OLD.tenant_id) THEN RAISE EXCEPTION 'Reminder version must advance once'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='invoice_reminder_holds' THEN
  IF NEW.invoice_id<>OLD.invoice_id THEN RAISE EXCEPTION 'Reminder invoice identity is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fee_reminder_policy_version BEFORE INSERT OR UPDATE OR DELETE ON fee_reminder_policies FOR EACH ROW EXECUTE FUNCTION guard_fee_reminder_version();
CREATE TRIGGER invoice_reminder_hold_version BEFORE INSERT OR UPDATE OR DELETE ON invoice_reminder_holds FOR EACH ROW EXECUTE FUNCTION guard_fee_reminder_version();
