ALTER TABLE teacher_profiles ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);
ALTER TABLE classes ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);
ALTER TABLE enrollments ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);
