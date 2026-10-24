CREATE TABLE student_imports (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, actor_id uuid NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'PREVIEW' CHECK(status IN ('PREVIEW','COMMITTED','EXPIRED')),
 rows_json jsonb, row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 5000),
 error_count integer NOT NULL CHECK(error_count BETWEEN 0 AND row_count),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 committed_at timestamptz,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES tenant_memberships(tenant_id,user_id),
 CHECK((status='PREVIEW' AND rows_json IS NOT NULL AND committed_at IS NULL)
    OR (status='COMMITTED' AND rows_json IS NULL AND committed_at IS NOT NULL)
    OR (status='EXPIRED' AND rows_json IS NULL AND committed_at IS NULL))
);
CREATE INDEX student_imports_scope_idx ON student_imports(tenant_id,actor_id,created_at);
