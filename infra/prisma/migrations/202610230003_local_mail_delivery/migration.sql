CREATE TABLE mail_deliveries (
  event_id uuid PRIMARY KEY REFERENCES outbox_events(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','UNKNOWN')),
  sent_at timestamptz
);
