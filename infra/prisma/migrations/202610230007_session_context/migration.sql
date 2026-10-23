ALTER TABLE auth_sessions
  ADD COLUMN selected_tenant_id uuid,
  ADD COLUMN selected_role "Role",
  ADD CONSTRAINT auth_session_context_pair CHECK ((selected_tenant_id IS NULL) = (selected_role IS NULL)),
  ADD CONSTRAINT auth_session_membership_fk FOREIGN KEY (selected_tenant_id, user_id)
    REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT;
