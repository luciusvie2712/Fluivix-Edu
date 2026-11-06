-- Forward-only pagination index; existing immutable receipt/actor/ledger constraints remain.
CREATE INDEX payment_received_page_idx ON payments(tenant_id,received_at DESC,id);
