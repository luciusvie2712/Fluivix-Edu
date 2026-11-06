-- Fail on orphan legacy financial actors; never invent memberships or rewrite history.
ALTER TABLE invoice_runs ADD CONSTRAINT invoice_run_actor_member_fk FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD CONSTRAINT invoice_creator_member_fk FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT;
ALTER TABLE payment_reversals ADD CONSTRAINT payment_reversal_actor_member_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD CONSTRAINT invoice_void_meaningful_reason CHECK(billing_state<>'VOID' OR (void_reason IS NOT NULL AND length(btrim(void_reason))>=10));
ALTER TABLE payment_reversals ADD CONSTRAINT payment_reversal_meaningful_reason CHECK(length(btrim(reason))>=10);
CREATE INDEX invoice_due_page_idx ON invoices(tenant_id,due_at DESC,id);
CREATE INDEX invoice_items_page_idx ON invoice_items(tenant_id,invoice_id,id);
CREATE TABLE finance_operation_limits(
 tenant_id uuid NOT NULL, user_id uuid NOT NULL,
 operation varchar(40) NOT NULL CHECK(operation IN ('INVOICE_PREVIEW','INVOICE_GENERATE')),
 attempts integer NOT NULL CHECK(attempts>0), window_start timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,user_id,operation),
 FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
