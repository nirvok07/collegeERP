-- 014_student_records.sql
--
-- M5 Student Records, the minimum an attendance roster needs.
--
-- Attendance answers: for this class session, which enrolled students were
-- accounted for? Every word of that already existed except "enrolled students".
-- There was no student, no enrolment and no cohort membership anywhere: only
-- persons.person_type = 'student', and sections.capacity as a stated number.
--
-- So this adds the roster, attributed to M5, which Blueprint 2 D3 makes the
-- owner of Student and Enrolment. Same move as AD-39 (the calendar went to M2
-- when M3 needed it) and AD-47 (non-teaching days went to M2 when M4 needed
-- them). Recorded as AD-50.
--
-- NOT built here, and deliberately: enquiries, applications, merit lists, seat
-- allocation, admission offers, fee linkage, status history, transfers,
-- re-admission, no-dues clearance, guardians, alumni. That is M5's real surface
-- and this is not it.
--
-- See docs/blueprint/modules/m5-m6-attendance.md.

CREATE TABLE students (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- The person is owned by M1. A student record is what the college keys
  -- academic history against; it never duplicates identity.
  person_id      uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  -- What the college calls them on every document it issues.
  enrolment_number text NOT NULL,
  program_id     uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  admitted_on    date NOT NULL,
  status         text NOT NULL DEFAULT 'enrolled'
                   CHECK (status IN ('enrolled', 'on_leave', 'withdrawn', 'graduated')),
  status_reason  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        int NOT NULL DEFAULT 1
);

-- One student record per person. Two would make "which is their attendance"
-- a question with two answers.
CREATE UNIQUE INDEX students_person_uq ON students (person_id);
CREATE UNIQUE INDEX students_number_uq ON students (tenant_id, enrolment_number);
CREATE INDEX students_program_idx ON students (program_id) WHERE status = 'enrolled';

-- ---------------------------------------------------------------------------
-- Cohort membership: which section a student belongs to.
--
-- Validity-bounded, following AD-42, for the reason that decides every history
-- question in this system: the record of who was taught what in week three has
-- to survive a withdrawal in week ten.
--
-- Dates, not timestamps, because the roster of a class session is resolved as of
-- the session's DATE. Comparing a date to a date is exact and carries no
-- timezone, which is the rule AD-49 fixed.
-- ---------------------------------------------------------------------------
CREATE TABLE section_memberships (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  section_id  uuid NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  valid_from  date NOT NULL,
  -- Null means current. Ending a membership never deletes the row.
  valid_to    date,
  placed_by   uuid REFERENCES persons(id),
  ended_by    uuid REFERENCES persons(id),
  end_reason  text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT membership_period_forward CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX section_memberships_live_uq
  ON section_memberships (student_id, section_id) WHERE valid_to IS NULL;
CREATE INDEX section_memberships_section_idx
  ON section_memberships (section_id) WHERE valid_to IS NULL;
-- The roster query: every membership covering a given date.
CREATE INDEX section_memberships_window_idx
  ON section_memberships (section_id, valid_from, valid_to);

-- ---------------------------------------------------------------------------
-- Enrolment in a course offering: which courses the student actually takes.
--
-- Separate from cohort membership because an elective splits a cohort. Twenty
-- of sixty students take one elective, and a roster built from membership alone
-- would show the teacher sixty names and invite forty wrong absences. That is
-- not a cosmetic gap; it corrupts the academic record.
-- ---------------------------------------------------------------------------
CREATE TABLE offering_enrolments (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  offering_id  uuid NOT NULL REFERENCES course_offerings(id) ON DELETE RESTRICT,
  valid_from   date NOT NULL,
  valid_to     date,
  enrolled_by  uuid REFERENCES persons(id),
  ended_by     uuid REFERENCES persons(id),
  end_reason   text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enrolment_period_forward CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX offering_enrolments_live_uq
  ON offering_enrolments (student_id, offering_id) WHERE valid_to IS NULL;
CREATE INDEX offering_enrolments_offering_idx
  ON offering_enrolments (offering_id) WHERE valid_to IS NULL;
-- The roster-as-of-a-date query, which is the one attendance runs.
CREATE INDEX offering_enrolments_window_idx
  ON offering_enrolments (offering_id, valid_from, valid_to);
CREATE INDEX offering_enrolments_student_idx ON offering_enrolments (student_id);

-- ---------------------------------------------------------------------------
-- Invariants.
-- ---------------------------------------------------------------------------

-- A student record points at a person of type student, in the same institution,
-- studying a program of that institution. A staff member with a student record
-- would appear on rosters and collect attendance.
CREATE FUNCTION student_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  person_tenant  uuid;
  person_kind    text;
  program_tenant uuid;
BEGIN
  SELECT tenant_id, person_type INTO person_tenant, person_kind
    FROM persons WHERE id = NEW.person_id;

  IF person_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A student must belong to the same institution.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF person_kind <> 'student' THEN
    RAISE EXCEPTION 'Only a person recorded as a student can have a student record.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT tenant_id INTO program_tenant FROM programs WHERE id = NEW.program_id;
  IF program_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A student and their program must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER student_context_valid_trg
  BEFORE INSERT OR UPDATE OF person_id, program_id ON students
  FOR EACH ROW EXECUTE FUNCTION student_context_valid();

-- A student sits in one cohort per term. Two live memberships in one term would
-- put them on two rosters, and neither would be wrong on its own.
CREATE FUNCTION membership_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  student_tenant uuid;
  section_tenant uuid;
  section_term   uuid;
  section_status text;
  clash          record;
BEGIN
  SELECT tenant_id INTO student_tenant FROM students WHERE id = NEW.student_id;
  SELECT tenant_id, term_id, status INTO section_tenant, section_term, section_status
    FROM sections WHERE id = NEW.section_id;

  IF student_tenant IS DISTINCT FROM NEW.tenant_id
     OR section_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A student and their section must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND section_status = 'cancelled' THEN
    RAISE EXCEPTION 'That section was cancelled, so nobody can be placed in it.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.valid_to IS NULL THEN
    SELECT s.label AS label
      INTO clash
      FROM section_memberships m
      JOIN sections s ON s.id = m.section_id
     WHERE m.id <> NEW.id
       AND m.student_id = NEW.student_id
       AND m.valid_to IS NULL
       AND s.term_id = section_term
       AND m.section_id <> NEW.section_id
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'This student is already in section % for that term. End that placement first.',
        clash.label
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER membership_context_valid_trg
  BEFORE INSERT OR UPDATE OF student_id, section_id, valid_to ON section_memberships
  FOR EACH ROW EXECUTE FUNCTION membership_context_valid();

-- A student enrolled in a course must belong to the cohort it is taught to.
-- Cross-section enrolment is not modelled; if it ever is, that is an
-- architecture decision rather than a row that slipped through.
CREATE FUNCTION enrolment_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  student_tenant   uuid;
  offering_tenant  uuid;
  offering_status  text;
  offering_section uuid;
  is_member        boolean;
BEGIN
  SELECT tenant_id INTO student_tenant FROM students WHERE id = NEW.student_id;
  SELECT tenant_id, status, section_id
    INTO offering_tenant, offering_status, offering_section
    FROM course_offerings WHERE id = NEW.offering_id;

  IF student_tenant IS DISTINCT FROM NEW.tenant_id
     OR offering_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A student and their course must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF offering_status = 'cancelled' THEN
      RAISE EXCEPTION 'That course was cancelled, so nobody can be enrolled in it.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM section_memberships m
       WHERE m.student_id = NEW.student_id
         AND m.section_id = offering_section
         AND m.valid_to IS NULL
    ) INTO is_member;

    IF NOT is_member THEN
      RAISE EXCEPTION
        'This student is not in the cohort that course is taught to. Place them in the section first.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER enrolment_context_valid_trg
  BEFORE INSERT OR UPDATE OF student_id, offering_id ON offering_enrolments
  FOR EACH ROW EXECUTE FUNCTION enrolment_context_valid();

-- ---------------------------------------------------------------------------
-- Isolation, privileges and permissions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'section_memberships', 'offering_enrolments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    -- No DELETE: a placement is ended and a student is withdrawn, because
    -- attendance and results reference both by identity.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO %I', t, app_role);
  END LOOP;
END $$;

INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('student.read',      'M5', 'View students',            'normal',    false, true),
  ('student.manage',    'M5', 'Admit and withdraw',       'sensitive', false, true),
  ('enrolment.manage',  'M5', 'Place and enrol students', 'sensitive', false, true)
ON CONFLICT (key) DO NOTHING;

-- Platform templates carry no tenant, so the tenant policy would reject these
-- updates. Same NO FORCE pattern as 002, 011, 012 and 013.
ALTER TABLE role_definitions NO FORCE ROW LEVEL SECURITY;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['student.read', 'student.manage', 'enrolment.manage']
 WHERE key = 'college_admin' AND tenant_id IS NULL;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['student.read', 'student.manage', 'enrolment.manage']
 WHERE key = 'department_head' AND tenant_id IS NULL;

-- A teacher reads their roster and marks attendance against it. They do not
-- admit students or move them between cohorts.
UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY['student.read']
 WHERE key = 'faculty' AND tenant_id IS NULL;

ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;
