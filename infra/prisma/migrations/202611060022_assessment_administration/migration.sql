-- Preserve historical rows and times. Legacy actor names were not snapshotted;
-- leave them NULL rather than present today's name as an historical fact.
ALTER TABLE grade_change_events ADD COLUMN actor_display_name varchar(150), ADD COLUMN trace_id varchar(80);
ALTER TABLE assessments ADD CONSTRAINT assessment_creator_member_fk
 FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT;
ALTER TABLE assessment_results ADD CONSTRAINT assessment_grader_member_fk
 FOREIGN KEY(tenant_id,graded_by) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT;
ALTER TABLE grade_change_events ADD CONSTRAINT grade_history_actor_member_fk
 FOREIGN KEY(tenant_id,actor_id) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT;
-- Conflicting legacy history or missing actor memberships must be reviewed;
-- never silently delete history or fabricate an actor to make upgrade succeed.
CREATE UNIQUE INDEX grade_history_student_version_key ON grade_change_events(tenant_id,assessment_id,student_id,version);
CREATE INDEX grade_history_page_idx ON grade_change_events(tenant_id,assessment_id,created_at,id);
CREATE INDEX audit_resource_history_idx ON audit_logs(tenant_id,resource_id,created_at,id);
