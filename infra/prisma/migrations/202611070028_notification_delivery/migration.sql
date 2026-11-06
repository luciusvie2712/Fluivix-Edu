-- Forward028: preserve every
-- historical audience/delivery/status/attempt/provider reference and UTC time.
ALTER TABLE device_push_tokens ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
CREATE FUNCTION version_push_registration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.version NOT IN (OLD.version,OLD.version+1) THEN
  RAISE EXCEPTION 'invalid push registration version' USING ERRCODE='23514';
 END IF;
 IF ROW(NEW.user_id,NEW.family_id,NEW.token_hash,NEW.token_encrypted,NEW.platform)
     IS DISTINCT FROM ROW(OLD.user_id,OLD.family_id,OLD.token_hash,OLD.token_encrypted,OLD.platform)
     OR (NEW.status='ACTIVE' AND OLD.status<>'ACTIVE') THEN
  NEW.version:=OLD.version+1;
 ELSE NEW.version:=OLD.version;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER push_registration_version BEFORE UPDATE ON device_push_tokens
 FOR EACH ROW EXECUTE FUNCTION version_push_registration();
ALTER TABLE outbox_events ADD CONSTRAINT notification_outbox_tenant_id UNIQUE(tenant_id,id);
ALTER TABLE notifications ADD CONSTRAINT notification_event_tenant_fk
 FOREIGN KEY(tenant_id,event_id) REFERENCES outbox_events(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE notifications ADD CONSTRAINT notification_delivery_scope_key
 UNIQUE(tenant_id,id,event_id,recipient_user_id);
ALTER TABLE notification_deliveries ADD COLUMN event_id uuid;
ALTER TABLE notification_deliveries ADD COLUMN recipient_user_id uuid;
ALTER TABLE notification_deliveries ADD COLUMN canonical boolean NOT NULL DEFAULT true;
-- Legacy send generation is unknown; do not invent one from current device state.
ALTER TABLE notification_deliveries ADD COLUMN device_version integer CHECK(device_version>0);
ALTER TABLE notification_deliveries ADD COLUMN next_attempt_at timestamptz;
ALTER TABLE notification_deliveries ADD COLUMN next_receipt_at timestamptz;
ALTER TABLE notification_deliveries ADD COLUMN receipt_checks integer NOT NULL DEFAULT 0 CHECK(receipt_checks>=0);
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_attempts_nonnegative CHECK(attempts>=0);
UPDATE notification_deliveries SET next_receipt_at=COALESCE(last_attempt_at+interval '15 minutes',now())
 WHERE status='ACCEPTED';
CREATE INDEX notification_pending_attempt_idx ON notification_deliveries(next_attempt_at,id)
 WHERE status='PENDING' AND canonical;
CREATE INDEX notification_receipt_due_idx ON notification_deliveries(next_receipt_at,id)
 WHERE status='ACCEPTED';
UPDATE notification_deliveries d SET event_id=n.event_id,recipient_user_id=n.recipient_user_id
 FROM notifications n WHERE n.tenant_id=d.tenant_id AND n.id=d.notification_id;
ALTER TABLE notification_deliveries ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE notification_deliveries ALTER COLUMN recipient_user_id SET NOT NULL;
-- Attempted or uncertain outcomes take precedence over an unsent duplicate.
-- This flags a canonical row; it never rewrites actual historical outcomes.
WITH ranked AS (
 SELECT id,row_number() OVER (
  PARTITION BY event_id,recipient_user_id,device_id ORDER BY
   CASE WHEN status='SENT' THEN 0 WHEN status='ACCEPTED' THEN 1
        WHEN status IN ('SENDING','UNKNOWN') THEN 2
        WHEN attempts>0 OR status IN ('FAILED','INVALID') THEN 3
        WHEN status='PENDING' THEN 4 ELSE 5 END,
   last_attempt_at NULLS LAST,id
 ) AS position FROM notification_deliveries
)
UPDATE notification_deliveries d SET canonical=(r.position=1) FROM ranked r WHERE d.id=r.id;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_delivery_event_recipient_fk
 FOREIGN KEY(tenant_id,notification_id,event_id,recipient_user_id)
 REFERENCES notifications(tenant_id,id,event_id,recipient_user_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX notification_one_event_recipient_device
 ON notification_deliveries(event_id,recipient_user_id,device_id) WHERE canonical;

CREATE FUNCTION protect_notification_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.tenant_id,NEW.event_id,NEW.recipient_user_id,NEW.recipient_role,
        NEW.subject_student_id,NEW.type,NEW.entity_type,NEW.entity_id,NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id,OLD.tenant_id,OLD.event_id,OLD.recipient_user_id,OLD.recipient_role,
        OLD.subject_student_id,OLD.type,OLD.entity_type,OLD.entity_id,OLD.created_at) THEN
  RAISE EXCEPTION 'notification identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_identity_immutable BEFORE UPDATE ON notifications
 FOR EACH ROW EXECUTE FUNCTION protect_notification_identity();

CREATE FUNCTION bind_notification_delivery_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE audience notifications%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NOT OLD.canonical AND NEW.status='SENDING' AND OLD.status<>'SENDING' THEN
   RAISE EXCEPTION 'legacy duplicate delivery cannot be resent' USING ERRCODE='23514';
  END IF;
  IF NEW.status='SENDING' AND OLD.status<>'SENDING' THEN
   IF OLD.status<>'PENDING' OR OLD.attempts>=5 OR NEW.attempts<>OLD.attempts+1 OR NEW.device_version IS NULL OR
      NOT EXISTS(SELECT 1 FROM device_push_tokens d WHERE d.id=NEW.device_id
        AND d.user_id=NEW.recipient_user_id AND d.version=NEW.device_version AND d.status='ACTIVE') THEN
    RAISE EXCEPTION 'invalid push attempt or registration generation' USING ERRCODE='23514';
   END IF;
  ELSIF NEW.attempts<>OLD.attempts THEN
   RAISE EXCEPTION 'send attempt history cannot be reset' USING ERRCODE='23514';
  END IF;
  IF NEW.status='PENDING' AND OLD.status IN ('UNKNOWN','SENT') THEN
   RAISE EXCEPTION 'uncertain or handed-off delivery cannot be blindly resent' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.notification_id,NEW.device_id,NEW.event_id,NEW.recipient_user_id,NEW.canonical)
      IS DISTINCT FROM
      ROW(OLD.id,OLD.tenant_id,OLD.notification_id,OLD.device_id,OLD.event_id,OLD.recipient_user_id,OLD.canonical) THEN
   RAISE EXCEPTION 'delivery identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO STRICT audience FROM notifications
  WHERE tenant_id=NEW.tenant_id AND id=NEW.notification_id;
 IF NEW.status<>'PENDING' OR NEW.attempts<>0 OR NEW.device_version IS NOT NULL OR NOT NEW.canonical OR
    (NEW.event_id IS NOT NULL AND NEW.event_id<>audience.event_id) OR
    (NEW.recipient_user_id IS NOT NULL AND NEW.recipient_user_id<>audience.recipient_user_id) OR
    NOT EXISTS(SELECT 1 FROM device_push_tokens d WHERE d.id=NEW.device_id AND d.user_id=audience.recipient_user_id) THEN
  RAISE EXCEPTION 'invalid delivery recipient identity' USING ERRCODE='23514';
 END IF;
 NEW.event_id:=audience.event_id;
 NEW.recipient_user_id:=audience.recipient_user_id;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_delivery_identity BEFORE INSERT OR UPDATE ON notification_deliveries
 FOR EACH ROW EXECUTE FUNCTION bind_notification_delivery_identity();
