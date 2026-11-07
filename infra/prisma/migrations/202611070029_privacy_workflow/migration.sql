-- Additive029: existing consent/request identity, outcomes and times are retained.
-- Unknown historical method, role, verifier and approval remain NULL.
ALTER TABLE privacy_consents ADD COLUMN capture_method varchar(40),ADD COLUMN captured_role "Role",ADD COLUMN evidence_ref varchar(150);
CREATE FUNCTION privacy_subject_is_authorized(scope_tenant uuid,person uuid,subject uuid,scope_role "Role",allow_read_only boolean DEFAULT false)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
  SELECT 1 FROM tenant_memberships m JOIN users u ON u.id=m.user_id
  JOIN membership_roles mr ON mr.membership_id=m.id AND mr.role=scope_role
  JOIN tenants t ON t.id=m.tenant_id
  WHERE m.tenant_id=scope_tenant AND m.user_id=person AND m.status='ACTIVE' AND NOT m.activation_pending AND u.status='ACTIVE'
   AND (t.status IN ('ACTIVE','PAST_DUE_GRACE') OR (allow_read_only AND t.status='READ_ONLY'))
   AND (subject IS NULL OR EXISTS(
    SELECT 1 FROM student_profiles s WHERE s.tenant_id=scope_tenant AND s.id=subject AND
     ((scope_role='student' AND s.user_id=person) OR (scope_role='guardian' AND EXISTS(
       SELECT 1 FROM guardian_student_links l WHERE l.tenant_id=scope_tenant AND l.student_id=s.id
        AND l.guardian_user_id=person AND l.status='ACTIVE' AND l.verified_by IS NOT NULL AND l.verified_at IS NOT NULL
     )))
   ))
 )
$$;
CREATE FUNCTION bind_privacy_consent_capture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.captured_role IS NOT NULL AND (
   NEW.capture_method IS DISTINCT FROM 'AUTHENTICATED_SELF_SERVICE' OR length(trim(COALESCE(NEW.evidence_ref,'')))<3 OR
   NOT privacy_subject_is_authorized(NEW.tenant_id,NEW.consenting_user_id,NEW.subject_student_id,NEW.captured_role) OR
   (NEW.captured_role IN ('guardian','student') AND NEW.subject_student_id IS NULL)
 ) THEN RAISE EXCEPTION 'current consent subject authorization and capture evidence are required' USING ERRCODE='23514'; END IF;
 IF NEW.captured_role IS NULL AND (NEW.capture_method IS NOT NULL OR NEW.evidence_ref IS NOT NULL) THEN
  RAISE EXCEPTION 'unknown historical consent capture cannot be partially fabricated' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_consent_capture BEFORE INSERT ON privacy_consents FOR EACH ROW EXECUTE FUNCTION bind_privacy_consent_capture();
CREATE FUNCTION protect_privacy_consent_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'consent history is append only' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.id,NEW.tenant_id,NEW.subject_student_id,NEW.consenting_user_id,NEW.policy_version,
        NEW.purpose_code,NEW.legal_basis,NEW.granted,NEW.captured_at,NEW.capture_method,NEW.captured_role,NEW.evidence_ref)
    IS DISTINCT FROM
    ROW(OLD.id,OLD.tenant_id,OLD.subject_student_id,OLD.consenting_user_id,OLD.policy_version,
        OLD.purpose_code,OLD.legal_basis,OLD.granted,OLD.captured_at,OLD.capture_method,OLD.captured_role,OLD.evidence_ref)
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
  RAISE EXCEPTION 'consent identity and captured evidence are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_consent_history BEFORE UPDATE OR DELETE ON privacy_consents FOR EACH ROW EXECUTE FUNCTION protect_privacy_consent_history();
ALTER TABLE data_subject_requests
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN requester_role "Role",ADD COLUMN scope_confirmed_at timestamptz,
 ADD COLUMN verified_at timestamptz,ADD COLUMN verified_by uuid,
 ADD COLUMN verification_method varchar(40),ADD COLUMN verification_evidence_ref varchar(150),
 ADD COLUMN decided_at timestamptz,ADD COLUMN decided_by uuid,ADD COLUMN decision_reason varchar(500),
 ADD COLUMN completed_at timestamptz,ADD COLUMN completed_by uuid,ADD COLUMN fulfillment_summary jsonb,
 ADD CONSTRAINT privacy_request_verifier_fk FOREIGN KEY(tenant_id,verified_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
 ADD CONSTRAINT privacy_request_decider_fk FOREIGN KEY(tenant_id,decided_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
 ADD CONSTRAINT privacy_request_completer_fk FOREIGN KEY(tenant_id,completed_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT;
CREATE INDEX privacy_request_admin_page_idx ON data_subject_requests(tenant_id,status,created_at DESC,id);
CREATE INDEX privacy_request_self_page_idx ON data_subject_requests(tenant_id,requester_user_id,created_at DESC,id);
CREATE TABLE privacy_request_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,request_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),event_type varchar(30) NOT NULL,
 before_status varchar(20),after_status varchar(20) NOT NULL,actor_user_id uuid,
 reason varchar(500),evidence_ref varchar(150),trace_id varchar(80),recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,request_id,version),
 FOREIGN KEY(tenant_id,request_id) REFERENCES data_subject_requests(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
-- This is an observation made NOW, not a fabricated earlier review or decision.
INSERT INTO privacy_request_events(tenant_id,request_id,version,event_type,after_status,trace_id)
 SELECT tenant_id,id,version,'LEGACY_OBSERVED',status,'migration-029' FROM data_subject_requests;
CREATE TRIGGER privacy_request_events_immutable BEFORE UPDATE OR DELETE ON privacy_request_events FOR EACH ROW EXECUTE FUNCTION history_append_only();
CREATE TABLE privacy_export_artifacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,request_id uuid NOT NULL,
 key_id varchar(80) NOT NULL,ciphertext text,sha256 char(64) NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'),
 byte_count integer NOT NULL CHECK(byte_count>0 AND byte_count<=2097152),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,purged_at timestamptz,erased_by_request_id uuid,
 UNIQUE(tenant_id,request_id),CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours'),
 CHECK((ciphertext IS NOT NULL AND purged_at IS NULL) OR (ciphertext IS NULL AND purged_at IS NOT NULL)),
 FOREIGN KEY(tenant_id,request_id) REFERENCES data_subject_requests(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,erased_by_request_id) REFERENCES data_subject_requests(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX privacy_export_expiry_idx ON privacy_export_artifacts(expires_at);
CREATE FUNCTION protect_privacy_export_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE approved_erasure boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'export metadata is retained' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.id,NEW.tenant_id,NEW.request_id,NEW.key_id,NEW.sha256,NEW.byte_count,NEW.created_at,NEW.expires_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.request_id,OLD.key_id,OLD.sha256,OLD.byte_count,OLD.created_at,OLD.expires_at)
   OR OLD.ciphertext IS NULL OR NEW.ciphertext IS NOT NULL OR NEW.purged_at IS NULL THEN
  RAISE EXCEPTION 'export content may only be cleared once; metadata is immutable' USING ERRCODE='23514';
 END IF;
 approved_erasure:=NEW.erased_by_request_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM data_subject_requests er JOIN data_subject_requests source ON source.tenant_id=er.tenant_id AND source.id=OLD.request_id
   JOIN tenant_memberships m ON m.tenant_id=er.tenant_id AND m.user_id=NULLIF(current_setting('fluivixedu.actor_id',true),'')::uuid
   JOIN membership_roles mr ON mr.membership_id=m.id AND mr.role='owner'
   WHERE er.tenant_id=OLD.tenant_id AND er.id=NEW.erased_by_request_id AND er.type='ERASE' AND er.status='APPROVED'
     AND er.subject_student_id IS NOT NULL AND er.subject_student_id=source.subject_student_id
     AND m.status='ACTIVE' AND NOT m.activation_pending
 );
 IF (NEW.erased_by_request_id IS NOT NULL AND NOT approved_erasure) OR (OLD.expires_at>now() AND NOT approved_erasure) THEN
  RAISE EXCEPTION 'unexpired export needs an actual approved same-subject erasure' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_export_artifact_history BEFORE UPDATE OR DELETE ON privacy_export_artifacts FOR EACH ROW EXECUTE FUNCTION protect_privacy_export_artifact();
CREATE FUNCTION guard_privacy_request_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'privacy request history is retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'RECEIVED' OR NEW.version<>1 OR NEW.requester_role IS NULL OR NEW.scope_confirmed_at IS NULL
     OR NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.decided_by IS NOT NULL
     OR NEW.verification_method IS NOT NULL OR NEW.verification_evidence_ref IS NOT NULL OR NEW.decision_reason IS NOT NULL
     OR NEW.completed_at IS NOT NULL OR NEW.completed_by IS NOT NULL OR NEW.fulfillment_summary IS NOT NULL
     OR NOT privacy_subject_is_authorized(NEW.tenant_id,NEW.requester_user_id,NEW.subject_student_id,NEW.requester_role) THEN
   RAISE EXCEPTION 'new privacy request must start with actual requester scope' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.tenant_id,NEW.requester_user_id,NEW.subject_student_id,NEW.type,NEW.created_at)
  IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.requester_user_id,OLD.subject_student_id,OLD.type,OLD.created_at)
  OR NEW.version NOT IN (OLD.version,OLD.version+1) OR OLD.status IN ('REJECTED','COMPLETED') THEN
  RAISE EXCEPTION 'privacy request identity or terminal history is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.requester_role IS NOT NULL AND ROW(NEW.requester_role,NEW.scope_confirmed_at) IS DISTINCT FROM ROW(OLD.requester_role,OLD.scope_confirmed_at) THEN
  RAISE EXCEPTION 'confirmed requester scope is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status=OLD.status THEN
  IF OLD.status<>'RECEIVED' OR OLD.requester_role IS NOT NULL OR NEW.requester_role IS NULL OR NEW.scope_confirmed_at IS NULL THEN
   RAISE EXCEPTION 'only unknown legacy scope can be explicitly confirmed' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.verified_at,NEW.verified_by,NEW.verification_method,NEW.verification_evidence_ref,
         NEW.decided_at,NEW.decided_by,NEW.decision_reason,NEW.completed_at,NEW.completed_by,NEW.fulfillment_summary)
     IS DISTINCT FROM ROW(OLD.verified_at,OLD.verified_by,OLD.verification_method,OLD.verification_evidence_ref,
         OLD.decided_at,OLD.decided_by,OLD.decision_reason,OLD.completed_at,OLD.completed_by,OLD.fulfillment_summary) THEN
   RAISE EXCEPTION 'scope confirmation cannot fabricate review or fulfillment' USING ERRCODE='23514';
  END IF;
 ELSIF NOT ((OLD.status='RECEIVED' AND NEW.status IN ('VERIFIED','REJECTED')) OR
            (OLD.status='VERIFIED' AND NEW.status IN ('APPROVED','REJECTED')) OR
            (OLD.status='APPROVED' AND NEW.status IN ('COMPLETED','REJECTED'))) THEN
  RAISE EXCEPTION 'invalid privacy request transition' USING ERRCODE='23514';
 END IF;
 IF NEW.status='VERIFIED' AND ROW(NEW.decided_at,NEW.decided_by,NEW.decision_reason,NEW.completed_at,NEW.completed_by,NEW.fulfillment_summary)
    IS DISTINCT FROM ROW(OLD.decided_at,OLD.decided_by,OLD.decision_reason,OLD.completed_at,OLD.completed_by,OLD.fulfillment_summary) THEN
  RAISE EXCEPTION 'verification cannot fabricate a decision or fulfillment' USING ERRCODE='23514';
 END IF;
 IF NEW.status<>'COMPLETED' AND ROW(NEW.completed_at,NEW.completed_by,NEW.fulfillment_summary)
    IS DISTINCT FROM ROW(OLD.completed_at,OLD.completed_by,OLD.fulfillment_summary) THEN
  RAISE EXCEPTION 'completion evidence requires the completion transition' USING ERRCODE='23514';
 END IF;
 IF NEW.status IN ('VERIFIED','APPROVED','COMPLETED') AND
   (NEW.requester_role IS NULL OR NEW.scope_confirmed_at IS NULL OR NEW.verified_at IS NULL OR NEW.verified_by IS NULL OR
    length(trim(COALESCE(NEW.verification_method,'')))<3 OR length(trim(COALESCE(NEW.verification_evidence_ref,'')))<3) THEN
  RAISE EXCEPTION 'verified current requester evidence is required' USING ERRCODE='23514';
 END IF;
 IF NEW.status<>'REJECTED' AND NOT privacy_subject_is_authorized(NEW.tenant_id,NEW.requester_user_id,NEW.subject_student_id,NEW.requester_role) THEN
  RAISE EXCEPTION 'privacy requester scope is no longer authorized' USING ERRCODE='23514';
 END IF;
 IF NEW.status IN ('APPROVED','REJECTED','COMPLETED') AND
   (NEW.decided_at IS NULL OR NEW.decided_by IS NULL OR length(trim(COALESCE(NEW.decision_reason,'')))<10) THEN
  RAISE EXCEPTION 'privacy decision actor time and reason are required' USING ERRCODE='23514';
 END IF;
 IF OLD.verified_at IS NOT NULL AND ROW(NEW.verified_at,NEW.verified_by,NEW.verification_method,NEW.verification_evidence_ref)
    IS DISTINCT FROM ROW(OLD.verified_at,OLD.verified_by,OLD.verification_method,OLD.verification_evidence_ref) THEN
  RAISE EXCEPTION 'verification evidence is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status='COMPLETED' AND (NEW.completed_at IS NULL OR NEW.completed_by IS NULL OR jsonb_typeof(NEW.fulfillment_summary) IS DISTINCT FROM 'object') THEN
  RAISE EXCEPTION 'actual fulfillment evidence is required' USING ERRCODE='23514';
 END IF;
 IF NEW.status='COMPLETED' AND NEW.type IN ('ACCESS','EXPORT') AND NOT EXISTS(
   SELECT 1 FROM privacy_export_artifacts a WHERE a.tenant_id=NEW.tenant_id AND a.request_id=NEW.id
     AND a.ciphertext IS NOT NULL AND a.purged_at IS NULL AND a.expires_at>now()
 ) THEN RAISE EXCEPTION 'access/export completion requires actual current encrypted content' USING ERRCODE='23514'; END IF;
 NEW.version:=OLD.version+1;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_request_transition BEFORE INSERT OR UPDATE OR DELETE ON data_subject_requests FOR EACH ROW EXECUTE FUNCTION guard_privacy_request_transition();
CREATE FUNCTION record_privacy_request_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO privacy_request_events(tenant_id,request_id,version,event_type,before_status,after_status,actor_user_id,reason,evidence_ref,trace_id)
 VALUES(NEW.tenant_id,NEW.id,NEW.version,CASE WHEN TG_OP='INSERT' THEN 'RECEIVED' WHEN NEW.status=OLD.status THEN 'SCOPE_CONFIRMED' ELSE NEW.status END,
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,NEW.status,
  NULLIF(current_setting('fluivixedu.actor_id',true),'')::uuid,NULLIF(current_setting('fluivixedu.change_reason',true),''),
  NEW.verification_evidence_ref,NULLIF(current_setting('fluivixedu.trace_id',true),''));
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_request_history AFTER INSERT OR UPDATE ON data_subject_requests FOR EACH ROW EXECUTE FUNCTION record_privacy_request_transition();
