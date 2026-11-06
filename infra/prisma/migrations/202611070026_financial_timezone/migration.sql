-- Forward-only replacement: applied023 and historical ledger rows remain untouched.
-- Resolve the calendar from the same tenant as the fee plan, never a client zone.
CREATE OR REPLACE FUNCTION validate_future_fee_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan fee_plans; tenant_timezone text;
BEGIN
 SELECT * INTO plan FROM fee_plans WHERE tenant_id=NEW.tenant_id AND id=NEW.fee_plan_id FOR UPDATE;
 IF NOT FOUND OR plan.status<>'ACTIVE' OR NEW.version<>plan.version THEN RAISE EXCEPTION 'fee terms require current active plan version'; END IF;
 SELECT timezone INTO STRICT tenant_timezone FROM tenants WHERE id=NEW.tenant_id;
 IF NEW.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE tenant_timezone)::date
    OR NEW.effective_from<plan.valid_from OR (plan.valid_to IS NOT NULL AND NEW.effective_from>plan.valid_to)
 THEN RAISE EXCEPTION 'fee terms must take effect in the future valid interval'; END IF;
 IF plan.billing_model='MONTHLY' AND EXTRACT(DAY FROM NEW.effective_from)<>1
 THEN RAISE EXCEPTION 'monthly fee terms begin on a month boundary'; END IF;
 IF plan.billing_model='COURSE' AND (NEW.effective_from<>plan.valid_from OR EXISTS(SELECT 1 FROM invoice_runs WHERE tenant_id=plan.tenant_id AND fee_plan_id=plan.id))
 THEN RAISE EXCEPTION 'course terms must precede issue and apply to the whole course'; END IF;
 RETURN NEW;
END $$;
