CREATE TABLE guardian_profiles(
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,created_by uuid,recorded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,user_id),
 CONSTRAINT guardian_profile_member_fk FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
 CONSTRAINT guardian_profile_creator_fk FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
INSERT INTO guardian_profiles(tenant_id,user_id)
 SELECT m.tenant_id,m.user_id FROM tenant_memberships m WHERE
 EXISTS(SELECT 1 FROM membership_roles r WHERE r.membership_id=m.id AND r.role='guardian') OR
 EXISTS(SELECT 1 FROM guardian_student_links l WHERE l.tenant_id=m.tenant_id AND l.guardian_user_id=m.user_id);
-- Existing trusted bootstrap/role-assignment callers remain compatible. A contact
-- profile itself grants no role; active staff candidates must accept an invitation.
CREATE FUNCTION ensure_guardian_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role='guardian' THEN
  INSERT INTO guardian_profiles(tenant_id,user_id,created_by)
   SELECT tenant_id,user_id,NULLIF(current_setting('fluivixedu.actor_id',true),'')::uuid FROM tenant_memberships WHERE id=NEW.membership_id
   ON CONFLICT(tenant_id,user_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guardian_role_contact AFTER INSERT ON membership_roles FOR EACH ROW EXECUTE FUNCTION ensure_guardian_profile();
ALTER TABLE guardian_student_links ADD CONSTRAINT guardian_profile_link_fk
 FOREIGN KEY(tenant_id,guardian_user_id) REFERENCES guardian_profiles(tenant_id,user_id) ON DELETE RESTRICT;
ALTER TABLE guardian_student_links ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
-- Fail for conflicting legacy open pairs; never silently revoke/delete customer relationships.
CREATE UNIQUE INDEX guardian_open_pair ON guardian_student_links(tenant_id,student_id,guardian_user_id)
 WHERE status IN ('PENDING','ACTIVE');
ALTER TABLE guardian_student_links ADD CONSTRAINT guardian_verified_member_fk
 FOREIGN KEY(tenant_id,verified_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT;
CREATE TABLE guardian_link_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, link_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), event_type varchar(24) NOT NULL CHECK(event_type IN ('BASELINE','CREATED','APPROVED','REVOKED','UPDATED')),
 before_status varchar(20), after_status varchar(20) NOT NULL, relation_type varchar(20) NOT NULL,
 verification_method varchar(500), verified_at timestamptz, verified_by uuid,
 actor_user_id uuid, actor_display_name varchar(150), reason varchar(500), trace_id varchar(80),
 recorded_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,link_id,version),
 FOREIGN KEY(tenant_id,link_id) REFERENCES guardian_student_links(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT guardian_event_actor_fk FOREIGN KEY(tenant_id,actor_user_id) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
 CONSTRAINT guardian_event_verifier_fk FOREIGN KEY(tenant_id,verified_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX guardian_history_page_idx ON guardian_link_events(tenant_id,link_id,recorded_at);
-- A baseline records migration-time observation, not an invented historical actor/time.
INSERT INTO guardian_link_events(tenant_id,link_id,version,event_type,after_status,relation_type,verification_method,verified_at,verified_by,trace_id)
 SELECT tenant_id,id,version,'BASELINE',status,relation_type,verification_method,verified_at,verified_by,'migration-021'
 FROM guardian_student_links;
CREATE FUNCTION guard_guardian_link_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'guardian relationship history cannot be deleted'; END IF;
 IF NEW.tenant_id<>OLD.tenant_id OR NEW.student_id<>OLD.student_id OR NEW.guardian_user_id<>OLD.guardian_user_id OR NEW.relation_type<>OLD.relation_type THEN
  RAISE EXCEPTION 'guardian relationship identity is immutable' USING ERRCODE='23514';
 END IF;
 IF ROW(NEW.status,NEW.verified_at,NEW.verified_by,NEW.verification_method) IS NOT DISTINCT FROM ROW(OLD.status,OLD.verified_at,OLD.verified_by,OLD.verification_method) THEN
  NEW.version:=OLD.version; RETURN NEW;
 END IF;
 IF NEW.version NOT IN (OLD.version,OLD.version+1) THEN RAISE EXCEPTION 'invalid guardian relationship version' USING ERRCODE='23514'; END IF;
 NEW.version:=OLD.version+1;
 RETURN NEW;
END $$;
CREATE TRIGGER guardian_link_version BEFORE UPDATE OR DELETE ON guardian_student_links
 FOR EACH ROW EXECUTE FUNCTION guard_guardian_link_change();
CREATE FUNCTION record_guardian_link_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_status text; change_type text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.version=OLD.version THEN RETURN NEW; END IF;
 previous_status:=CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END;
 change_type:=CASE WHEN TG_OP='INSERT' THEN 'CREATED' WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status='ACTIVE' THEN 'APPROVED' WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status='REVOKED' THEN 'REVOKED' ELSE 'UPDATED' END;
 INSERT INTO guardian_link_events(tenant_id,link_id,version,event_type,before_status,after_status,relation_type,verification_method,verified_at,verified_by,actor_user_id,actor_display_name,reason,trace_id)
 VALUES(NEW.tenant_id,NEW.id,NEW.version,change_type,previous_status,NEW.status,NEW.relation_type,NEW.verification_method,NEW.verified_at,NEW.verified_by,
  NULLIF(current_setting('fluivixedu.actor_id',true),'')::uuid,NULLIF(current_setting('fluivixedu.actor_name',true),''),
  NULLIF(current_setting('fluivixedu.change_reason',true),''),NULLIF(current_setting('fluivixedu.trace_id',true),''));
 RETURN NEW;
END $$;
CREATE TRIGGER guardian_link_history AFTER INSERT OR UPDATE ON guardian_student_links
 FOR EACH ROW EXECUTE FUNCTION record_guardian_link_change();
CREATE FUNCTION protect_guardian_link_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'guardian relationship history is append only'; END $$;
CREATE TRIGGER guardian_history_immutable BEFORE UPDATE OR DELETE ON guardian_link_events
 FOR EACH ROW EXECUTE FUNCTION protect_guardian_link_history();
