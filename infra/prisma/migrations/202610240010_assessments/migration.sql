CREATE TABLE assessments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, class_id uuid NOT NULL, title varchar(150) NOT NULL,
 held_at date NOT NULL, max_score numeric(6,2) NOT NULL CHECK(max_score>0),
 status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), published_at timestamptz, created_by uuid NOT NULL REFERENCES users(id),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id),
 CHECK((status='DRAFT' AND published_at IS NULL) OR (status='PUBLISHED' AND published_at IS NOT NULL))
);
CREATE TABLE assessment_results (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, assessment_id uuid NOT NULL, student_id uuid NOT NULL,
 score numeric(6,2) CHECK(score>=0), comment varchar(2000) NOT NULL DEFAULT '',
 graded_by uuid NOT NULL REFERENCES users(id), graded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,assessment_id,student_id),
 FOREIGN KEY(tenant_id,assessment_id) REFERENCES assessments(tenant_id,id), FOREIGN KEY(tenant_id,student_id) REFERENCES student_profiles(tenant_id,id)
);
CREATE FUNCTION validate_grade() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE max_value numeric; publication varchar;
BEGIN
 SELECT max_score,status INTO max_value,publication FROM assessments WHERE tenant_id=NEW.tenant_id AND id=NEW.assessment_id FOR SHARE;
 IF publication='PUBLISHED' THEN RAISE EXCEPTION 'published grades require controlled correction'; END IF;
 IF NEW.score>max_value THEN RAISE EXCEPTION 'score exceeds maximum'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_score_guard BEFORE INSERT OR UPDATE ON assessment_results FOR EACH ROW EXECUTE FUNCTION validate_grade();
