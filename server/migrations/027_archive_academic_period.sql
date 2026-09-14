-- 027_archive_academic_period.sql
--
-- FB-2: academic years and terms can be corrected and removed.
--
-- Removed means archived, as for programs, departments and rooms: the
-- application role holds no DELETE on any table (bootstrap 001), and a year or
-- term that anything was ever recorded against must stay readable. The
-- application archives only one nothing uses; the foreign keys from sections
-- (ON DELETE RESTRICT) stay the backstop.
--
-- An archived year or term no longer holds its name or its sequence, so
-- "Semester 3" can be added again after a mistaken one is removed.

ALTER TABLE academic_years DROP CONSTRAINT academic_years_status_check;
ALTER TABLE academic_years ADD CONSTRAINT academic_years_status_check
  CHECK (status IN ('planned','active','closed','archived'));
ALTER TABLE academic_years ADD COLUMN archived_at timestamptz;
ALTER TABLE academic_years ADD COLUMN archived_by uuid REFERENCES persons(id);
-- The current year is the one every module asks for; it is never archived.
ALTER TABLE academic_years ADD CONSTRAINT academic_years_current_not_archived
  CHECK (NOT (is_current AND status = 'archived'));

ALTER TABLE terms DROP CONSTRAINT terms_status_check;
ALTER TABLE terms ADD CONSTRAINT terms_status_check
  CHECK (status IN ('planned','active','closed','archived'));
ALTER TABLE terms ADD COLUMN archived_at timestamptz;
ALTER TABLE terms ADD COLUMN archived_by uuid REFERENCES persons(id);

DROP INDEX academic_years_name_uq;
CREATE UNIQUE INDEX academic_years_name_uq
  ON academic_years (tenant_id, name) WHERE status <> 'archived';

DROP INDEX terms_sequence_uq;
CREATE UNIQUE INDEX terms_sequence_uq
  ON terms (academic_year_id, sequence) WHERE status <> 'archived';
