CREATE TABLE teacher_profiles (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
 teacher_code varchar(40) NOT NULL, full_name varchar(150) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,user_id), UNIQUE(tenant_id,teacher_code),
 FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_memberships(tenant_id,user_id)
);
CREATE TABLE classes (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), code varchar(40) NOT NULL, name varchar(150) NOT NULL,
 capacity integer NOT NULL CHECK(capacity>0), start_date date NOT NULL, end_date date NOT NULL CHECK(end_date>=start_date),
 status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('DRAFT','ACTIVE','CLOSED','ARCHIVED')),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE class_teachers (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, class_id uuid NOT NULL, teacher_id uuid NOT NULL,
 effective_from date NOT NULL, effective_to date CHECK(effective_to>=effective_from), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id),
 FOREIGN KEY(tenant_id,teacher_id) REFERENCES teacher_profiles(tenant_id,id),
 EXCLUDE USING gist(tenant_id WITH =,class_id WITH =,teacher_id WITH =,daterange(effective_from,effective_to,'[]') WITH &&)
);
CREATE INDEX class_teachers_scope_idx ON class_teachers(tenant_id,class_id,teacher_id);
CREATE TABLE enrollments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, class_id uuid NOT NULL, student_id uuid NOT NULL,
 joined_at date NOT NULL, left_at date CHECK(left_at>=joined_at), status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','WITHDRAWN','COMPLETED','TRANSFERRED')),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,class_id,student_id),
 FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id), FOREIGN KEY(tenant_id,student_id) REFERENCES student_profiles(tenant_id,id),
 EXCLUDE USING gist(tenant_id WITH =,class_id WITH =,student_id WITH =,daterange(joined_at,left_at,'[]') WITH &&)
);
CREATE UNIQUE INDEX enrollments_active_unique ON enrollments(tenant_id,class_id,student_id) WHERE status='ACTIVE';
CREATE INDEX enrollments_scope_idx ON enrollments(tenant_id,student_id,class_id);
CREATE TABLE class_sessions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, class_id uuid NOT NULL, teacher_id uuid NOT NULL,
 scheduled_date date NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 status varchar(20) NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','REOPENED','CANCELLED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), finalized_at timestamptz, finalized_by uuid REFERENCES users(id),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,class_id),
 FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id), FOREIGN KEY(tenant_id,teacher_id) REFERENCES teacher_profiles(tenant_id,id),
 EXCLUDE USING gist(tenant_id WITH =,teacher_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status<>'CANCELLED'),
 EXCLUDE USING gist(tenant_id WITH =,class_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status<>'CANCELLED')
);
CREATE INDEX class_sessions_scope_idx ON class_sessions(tenant_id,teacher_id,starts_at);
CREATE TABLE session_roster_snapshots (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, session_id uuid NOT NULL, class_id uuid NOT NULL, student_id uuid NOT NULL, enrollment_id uuid NOT NULL,
 display_name_snapshot varchar(150) NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,session_id,student_id),
 FOREIGN KEY(tenant_id,session_id,class_id) REFERENCES class_sessions(tenant_id,id,class_id),
 FOREIGN KEY(tenant_id,enrollment_id,class_id,student_id) REFERENCES enrollments(tenant_id,id,class_id,student_id)
);
CREATE TABLE attendance_records (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, session_id uuid NOT NULL, student_id uuid NOT NULL,
 status varchar(30) NOT NULL DEFAULT 'UNMARKED' CHECK(status IN ('UNMARKED','PRESENT','LATE','ABSENT_EXCUSED','ABSENT_UNEXCUSED')),
 note varchar(500) NOT NULL DEFAULT '', marked_by uuid REFERENCES users(id), marked_at timestamptz,
 UNIQUE(tenant_id,session_id,student_id),
 FOREIGN KEY(tenant_id,session_id,student_id) REFERENCES session_roster_snapshots(tenant_id,session_id,student_id)
);
CREATE TABLE lesson_reports (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, session_id uuid NOT NULL,
 lesson_summary varchar(2000) NOT NULL, homework_text varchar(2000) NOT NULL, teacher_notes_private varchar(2000) NOT NULL,
 updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(tenant_id,session_id), FOREIGN KEY(tenant_id,session_id) REFERENCES class_sessions(tenant_id,id)
);
CREATE FUNCTION protect_roster_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'roster snapshot is immutable'; END $$;
CREATE TRIGGER roster_snapshot_immutable BEFORE UPDATE OR DELETE ON session_roster_snapshots FOR EACH ROW EXECUTE FUNCTION protect_roster_snapshot();
CREATE FUNCTION protect_locked_attendance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM class_sessions WHERE tenant_id=OLD.tenant_id AND id=OLD.session_id AND status IN ('COMPLETED','CANCELLED')) THEN
  RAISE EXCEPTION 'locked attendance requires reopen';
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'attendance history cannot be deleted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER locked_attendance BEFORE UPDATE OR DELETE ON attendance_records FOR EACH ROW EXECUTE FUNCTION protect_locked_attendance();
