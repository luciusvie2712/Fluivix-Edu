CREATE TABLE fee_plans(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,class_id uuid NOT NULL,name varchar(150) NOT NULL,billing_model varchar(10) NOT NULL CHECK(billing_model IN ('MONTHLY','COURSE')),amount_vnd bigint NOT NULL CHECK(amount_vnd>=0),valid_from date NOT NULL,valid_to date CHECK(valid_to>=valid_from),status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id));
CREATE TABLE invoice_runs(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,fee_plan_id uuid NOT NULL,period_key varchar(20) NOT NULL,request_hash char(64) NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,fee_plan_id,period_key),FOREIGN KEY(tenant_id,fee_plan_id) REFERENCES fee_plans(tenant_id,id));
CREATE TABLE invoices(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,student_id uuid NOT NULL,run_id uuid NOT NULL,invoice_no varchar(60) NOT NULL,issued_at timestamptz NOT NULL DEFAULT now(),due_at timestamptz NOT NULL,total_amount_vnd bigint NOT NULL CHECK(total_amount_vnd>=0),billing_state varchar(10) NOT NULL DEFAULT 'ISSUED' CHECK(billing_state IN ('ISSUED','VOID')),void_reason varchar(500),created_by uuid NOT NULL REFERENCES users(id),UNIQUE(tenant_id,id),UNIQUE(tenant_id,id,student_id),UNIQUE(tenant_id,invoice_no),UNIQUE(tenant_id,run_id,student_id),FOREIGN KEY(tenant_id,student_id) REFERENCES student_profiles(tenant_id,id),FOREIGN KEY(tenant_id,run_id) REFERENCES invoice_runs(tenant_id,id),CHECK((billing_state='ISSUED' AND void_reason IS NULL) OR (billing_state='VOID' AND length(void_reason)>=10)));
CREATE INDEX invoice_student_idx ON invoices(tenant_id,student_id,due_at);
CREATE TABLE invoice_items(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,invoice_id uuid NOT NULL,fee_plan_id uuid NOT NULL,description varchar(300) NOT NULL,total_amount_vnd bigint NOT NULL CHECK(total_amount_vnd>=0),FOREIGN KEY(tenant_id,invoice_id) REFERENCES invoices(tenant_id,id),FOREIGN KEY(tenant_id,fee_plan_id) REFERENCES fee_plans(tenant_id,id));
CREATE TABLE payments(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,student_id uuid NOT NULL,receipt_no varchar(60) NOT NULL,method varchar(20) NOT NULL CHECK(method IN ('CASH','BANK_TRANSFER')),received_amount_vnd bigint NOT NULL CHECK(received_amount_vnd>0),received_at timestamptz NOT NULL,external_reference varchar(150),received_by uuid NOT NULL,status varchar(20) NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED','REVERSED')),UNIQUE(tenant_id,id),UNIQUE(tenant_id,id,student_id),UNIQUE(tenant_id,receipt_no),FOREIGN KEY(tenant_id,student_id) REFERENCES student_profiles(tenant_id,id),FOREIGN KEY(tenant_id,received_by) REFERENCES tenant_memberships(tenant_id,user_id));
CREATE INDEX payment_student_idx ON payments(tenant_id,student_id,received_at);
CREATE TABLE payment_allocations(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,student_id uuid NOT NULL,payment_id uuid NOT NULL,invoice_id uuid NOT NULL,amount_vnd bigint NOT NULL CHECK(amount_vnd>0),UNIQUE(tenant_id,payment_id,invoice_id),FOREIGN KEY(tenant_id,payment_id,student_id) REFERENCES payments(tenant_id,id,student_id),FOREIGN KEY(tenant_id,invoice_id,student_id) REFERENCES invoices(tenant_id,id,student_id));
CREATE INDEX allocation_invoice_idx ON payment_allocations(tenant_id,invoice_id);
CREATE TABLE payment_reversals(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,payment_id uuid NOT NULL,reason varchar(500) NOT NULL CHECK(length(reason)>=10),approved_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,payment_id),FOREIGN KEY(tenant_id,payment_id) REFERENCES payments(tenant_id,id));
CREATE TABLE idempotency_keys(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,user_id uuid NOT NULL,operation varchar(40) NOT NULL,key varchar(100) NOT NULL,request_hash char(64) NOT NULL,response jsonb NOT NULL,UNIQUE(tenant_id,user_id,operation,key),FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_memberships(tenant_id,user_id));
CREATE FUNCTION finance_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'financial history cannot be deleted'; END $$;
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION finance_no_delete();
CREATE TRIGGER items_no_delete BEFORE DELETE OR UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION finance_no_delete();
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION finance_no_delete();
CREATE TRIGGER allocations_append_only BEFORE UPDATE OR DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION finance_no_delete();
CREATE TRIGGER reversals_append_only BEFORE UPDATE OR DELETE ON payment_reversals FOR EACH ROW EXECUTE FUNCTION finance_no_delete();
CREATE FUNCTION protect_issued_invoice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.student_id,NEW.run_id,NEW.invoice_no,NEW.issued_at,NEW.due_at,NEW.total_amount_vnd,NEW.created_by) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.student_id,OLD.run_id,OLD.invoice_no,OLD.issued_at,OLD.due_at,OLD.total_amount_vnd,OLD.created_by) THEN RAISE EXCEPTION 'issued invoice immutable'; END IF;
 IF OLD.billing_state='VOID' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'void invoice immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER issued_invoice_immutable BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_issued_invoice();
CREATE FUNCTION protect_payment_amount() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.student_id,NEW.receipt_no,NEW.method,NEW.received_amount_vnd,NEW.received_at,NEW.external_reference,NEW.received_by) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.student_id,OLD.receipt_no,OLD.method,OLD.received_amount_vnd,OLD.received_at,OLD.external_reference,OLD.received_by) OR OLD.status='REVERSED' THEN RAISE EXCEPTION 'recorded payment immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER recorded_payment_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION protect_payment_amount();
CREATE FUNCTION validate_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_total bigint; payment_total bigint; allocated bigint; invoice_state varchar; payment_state varchar;
BEGIN
 SELECT total_amount_vnd,billing_state INTO invoice_total,invoice_state FROM invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.invoice_id FOR UPDATE;
 SELECT received_amount_vnd,status INTO payment_total,payment_state FROM payments WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id FOR UPDATE;
 IF invoice_state<>'ISSUED' OR payment_state<>'CONFIRMED' THEN RAISE EXCEPTION 'allocation requires issued invoice and confirmed payment'; END IF;
 SELECT COALESCE(sum(a.amount_vnd),0) INTO allocated FROM payment_allocations a JOIN payments p ON p.tenant_id=a.tenant_id AND p.id=a.payment_id WHERE a.tenant_id=NEW.tenant_id AND a.invoice_id=NEW.invoice_id AND p.status='CONFIRMED';
 IF allocated+NEW.amount_vnd>invoice_total THEN RAISE EXCEPTION 'invoice over allocation'; END IF;
 SELECT COALESCE(sum(amount_vnd),0) INTO allocated FROM payment_allocations WHERE tenant_id=NEW.tenant_id AND payment_id=NEW.payment_id;
 IF allocated+NEW.amount_vnd>payment_total THEN RAISE EXCEPTION 'payment over allocation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_amount_guard BEFORE INSERT ON payment_allocations FOR EACH ROW EXECUTE FUNCTION validate_allocation();
CREATE FUNCTION invoice_items_total_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_invoice uuid; target_tenant uuid; item_total numeric; invoice_total bigint;
BEGIN
 target_tenant:=NEW.tenant_id;
 IF TG_TABLE_NAME='invoices' THEN target_invoice:=NEW.id; ELSE target_invoice:=NEW.invoice_id; END IF;
 SELECT total_amount_vnd INTO invoice_total FROM invoices WHERE tenant_id=target_tenant AND id=target_invoice;
 SELECT COALESCE(sum(total_amount_vnd),0) INTO item_total FROM invoice_items WHERE tenant_id=target_tenant AND invoice_id=target_invoice;
 IF item_total<>invoice_total THEN RAISE EXCEPTION 'invoice items total mismatch'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_total_consistent AFTER INSERT ON invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_items_total_check();
CREATE CONSTRAINT TRIGGER items_total_consistent AFTER INSERT ON invoice_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_items_total_check();
CREATE FUNCTION used_fee_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.class_id,NEW.billing_model,NEW.amount_vnd,NEW.valid_from,NEW.valid_to) IS DISTINCT FROM ROW(OLD.class_id,OLD.billing_model,OLD.amount_vnd,OLD.valid_from,OLD.valid_to) AND EXISTS(SELECT 1 FROM invoice_runs WHERE tenant_id=OLD.tenant_id AND fee_plan_id=OLD.id) THEN RAISE EXCEPTION 'issued fee terms immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER issued_fee_guard BEFORE UPDATE ON fee_plans FOR EACH ROW EXECUTE FUNCTION used_fee_immutable();
