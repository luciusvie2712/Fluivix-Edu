ALTER TABLE tenant_memberships ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);
ALTER TABLE tenant_memberships ADD COLUMN staff_delegated boolean NOT NULL DEFAULT false;
ALTER TABLE tenant_memberships ADD COLUMN activation_pending boolean NOT NULL DEFAULT false;
UPDATE tenant_memberships m SET activation_pending=true
 WHERE m.status='INVITED' OR (m.status<>'ACTIVE' AND EXISTS(SELECT 1 FROM users u WHERE u.id=m.user_id AND u.status='INVITED'));
ALTER TABLE tenant_memberships ADD CONSTRAINT membership_activation_required CHECK(status<>'ACTIVE' OR NOT activation_pending);
CREATE FUNCTION mark_pending_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='INVITED' THEN NEW.activation_pending:=true; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pending_membership_activation BEFORE INSERT ON tenant_memberships
 FOR EACH ROW EXECUTE FUNCTION mark_pending_membership();
ALTER TABLE invitation_tokens ADD COLUMN revoked_at timestamptz;
ALTER TABLE audit_logs ADD COLUMN metadata jsonb;
CREATE INDEX staff_directory_idx ON tenant_memberships(tenant_id,status,id);
CREATE INDEX invitation_directory_idx ON invitation_tokens(tenant_id,email,role);

-- Serializes owner removal even for SQL callers outside the application service.
-- Creation/activation may build membership then roles in one transaction.
CREATE FUNCTION preserve_active_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_tenant uuid; target_member uuid; removing boolean;
BEGIN
 IF TG_TABLE_NAME = 'tenant_memberships' THEN
  target_tenant := OLD.tenant_id; target_member := OLD.id;
  removing := OLD.status = 'ACTIVE' AND (TG_OP = 'DELETE' OR NEW.status <> 'ACTIVE');
  IF NOT removing OR NOT EXISTS(SELECT 1 FROM membership_roles WHERE membership_id=target_member AND role='owner') THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
 ELSE
  target_member := OLD.membership_id;
  SELECT tenant_id INTO target_tenant FROM tenant_memberships WHERE id=target_member AND status='ACTIVE';
  removing := OLD.role='owner' AND (TG_OP='DELETE' OR NEW.role<>'owner' OR NEW.membership_id<>OLD.membership_id);
  IF NOT removing OR target_tenant IS NULL THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
 END IF;
 -- Counting after the canonical lock needs fresh statement snapshots. Refuse
 -- snapshot-isolated SQL writers instead of allowing stale owner counts.
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'owner removal requires READ COMMITTED isolation' USING ERRCODE='23514';
 END IF;
 PERFORM id FROM tenants WHERE id=target_tenant FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM tenant_memberships m JOIN membership_roles r ON r.membership_id=m.id JOIN users u ON u.id=m.user_id
   WHERE m.tenant_id=target_tenant AND m.id<>target_member AND m.status='ACTIVE' AND u.status='ACTIVE' AND r.role='owner') THEN
  RAISE EXCEPTION 'last active owner cannot be removed' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER membership_owner_preserved BEFORE UPDATE OF status OR DELETE ON tenant_memberships
 FOR EACH ROW EXECUTE FUNCTION preserve_active_owner();
CREATE TRIGGER role_owner_preserved BEFORE UPDATE OR DELETE ON membership_roles
 FOR EACH ROW EXECUTE FUNCTION preserve_active_owner();

CREATE FUNCTION protect_membership_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.tenant_id<>OLD.tenant_id OR NEW.user_id<>OLD.user_id THEN
  RAISE EXCEPTION 'membership identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER membership_identity_immutable BEFORE UPDATE OF tenant_id,user_id ON tenant_memberships
 FOR EACH ROW EXECUTE FUNCTION protect_membership_identity();
