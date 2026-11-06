-- Versioning starts here; no historical edit count or actor is invented.
ALTER TABLE fee_plans ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
CREATE TABLE fee_plan_terms(
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, fee_plan_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>1), effective_from date NOT NULL,
 name varchar(150) NOT NULL CHECK(length(btrim(name))>0),
 amount_vnd bigint NOT NULL CHECK(amount_vnd>=0),
 reason varchar(500) NOT NULL CHECK(length(btrim(reason))>=10),
 created_by uuid NOT NULL, actor_display_name varchar(150) NOT NULL,
 trace_id varchar(80) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,fee_plan_id,version),
 FOREIGN KEY(tenant_id,fee_plan_id) REFERENCES fee_plans(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX fee_terms_effective_idx ON fee_plan_terms(tenant_id,fee_plan_id,effective_from DESC,version DESC);
CREATE TRIGGER fee_terms_immutable BEFORE UPDATE OR DELETE ON fee_plan_terms FOR EACH ROW EXECUTE FUNCTION finance_no_delete();
CREATE TRIGGER fee_plans_no_delete BEFORE DELETE ON fee_plans FOR EACH ROW EXECUTE FUNCTION finance_no_delete();
CREATE FUNCTION validate_future_fee_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan fee_plans;
BEGIN
 SELECT * INTO plan FROM fee_plans WHERE tenant_id=NEW.tenant_id AND id=NEW.fee_plan_id FOR UPDATE;
 IF NOT FOUND OR plan.status<>'ACTIVE' OR NEW.version<>plan.version THEN RAISE EXCEPTION 'fee terms require current active plan version'; END IF;
 IF NEW.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR NEW.effective_from<plan.valid_from OR (plan.valid_to IS NOT NULL AND NEW.effective_from>plan.valid_to)
 THEN RAISE EXCEPTION 'fee terms must take effect in the future valid interval'; END IF;
 IF plan.billing_model='MONTHLY' AND EXTRACT(DAY FROM NEW.effective_from)<>1
 THEN RAISE EXCEPTION 'monthly fee terms begin on a month boundary'; END IF;
 IF plan.billing_model='COURSE' AND (NEW.effective_from<>plan.valid_from OR EXISTS(SELECT 1 FROM invoice_runs WHERE tenant_id=plan.tenant_id AND fee_plan_id=plan.id))
 THEN RAISE EXCEPTION 'course terms must precede issue and apply to the whole course'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fee_terms_future_guard BEFORE INSERT ON fee_plan_terms FOR EACH ROW EXECUTE FUNCTION validate_future_fee_terms();
