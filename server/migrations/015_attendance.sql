-- 015_attendance.sql
--
-- M6 Attendance: what was recorded about one class session.
--
-- A sheet is one row per class session, and a record is one row per student on
-- it. The sheet is a separate table from class_sessions on purpose: M4 owns the
-- teaching occurrence, M6 owns what was recorded about it, and a column on M4's
-- table would put attendance state inside the teaching-delivery boundary.
--
-- THE STATE MODEL, AND WHAT IS DELIBERATELY ABSENT
--
--   draft ──submit──▶ submitted
--
-- There is no unlock. A submitted sheet stays submitted, and changing a mark
-- afterwards is a CORRECTION: a row recording the old state, the new state, who
-- changed it and why, with the record updated in place by the correction's own
-- trigger. An unlock is an invitation to edit history quietly; a correction is a
-- statement that history was wrong. Only one of those is auditable.
--
-- See docs/blueprint/modules/m5-m6-attendance.md.

CREATE TABLE attendance_sheets (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  session_id   uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  submitted_by uuid REFERENCES persons(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES persons(id),
  -- Optimistic concurrency. Two teachers marking one sheet must not silently
  -- overwrite each other, and a lock held across a classroom would be abandoned
  -- the moment somebody walked out of the room.
  version      int NOT NULL DEFAULT 1,

  CONSTRAINT sheet_submitted_is_attributed
    CHECK (status <> 'submitted' OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL))
);

-- One sheet per class. Two would make "what was recorded" a question with two
-- answers.
CREATE UNIQUE INDEX attendance_sheets_session_uq ON attendance_sheets (session_id);
CREATE INDEX attendance_sheets_open_idx ON attendance_sheets (tenant_id)
  WHERE status = 'draft';

CREATE TABLE attendance_records (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  sheet_id   uuid NOT NULL REFERENCES attendance_sheets(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  -- present and absent are the case. late is recorded because colleges record
  -- it. excused covers sanctioned absence: duty leave for sports, NCC or a
  -- college event, which Blueprint 2 D4 names as a workflow and which would
  -- otherwise be faked as present.
  state      text NOT NULL CHECK (state IN ('present', 'absent', 'late', 'excused')),
  note       text,
  marked_by  uuid NOT NULL REFERENCES persons(id),
  marked_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    int NOT NULL DEFAULT 1
);

-- One state per student per class. Two rows would make "was she present" a
-- question with two answers.
CREATE UNIQUE INDEX attendance_records_identity_uq ON attendance_records (sheet_id, student_id);
CREATE INDEX attendance_records_student_idx ON attendance_records (student_id);

-- Append-only by privilege as well as by design: the application role gets
-- INSERT and SELECT here and nothing else, so a correction cannot be rewritten.
CREATE TABLE attendance_corrections (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  record_id    uuid NOT NULL REFERENCES attendance_records(id) ON DELETE RESTRICT,
  from_state   text NOT NULL,
  to_state     text NOT NULL,
  reason       text NOT NULL CHECK (length(btrim(reason)) > 0),
  corrected_by uuid NOT NULL REFERENCES persons(id),
  corrected_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT correction_changes_something CHECK (to_state <> from_state)
);

CREATE INDEX attendance_corrections_record_idx
  ON attendance_corrections (record_id, corrected_at);

-- ---------------------------------------------------------------------------
-- Invariants. Attendance is historical academic data, so these are the ones
-- whose violation would corrupt it.
-- ---------------------------------------------------------------------------

-- A sheet belongs to a class that can still be marked, in one tenant.
CREATE FUNCTION attendance_sheet_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_tenant uuid;
  session_status text;
BEGIN
  SELECT tenant_id, status INTO session_tenant, session_status
    FROM class_sessions WHERE id = NEW.session_id;

  IF session_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'An attendance sheet and its class must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF session_status = 'cancelled' THEN
    RAISE EXCEPTION 'That class was cancelled, so there is no attendance to record.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER attendance_sheet_context_valid_trg
  BEFORE INSERT OR UPDATE OF session_id ON attendance_sheets
  FOR EACH ROW EXECUTE FUNCTION attendance_sheet_context_valid();

-- Submitted is terminal. There is no unlock, by design.
CREATE FUNCTION attendance_sheet_transition_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'submitted' THEN
      RAISE EXCEPTION
        'This register has been submitted. Change a mark with a correction, which is recorded.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status <> 'submitted' THEN
      RAISE EXCEPTION 'A register goes from draft to submitted, not from % to %.',
        OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'An attendance sheet cannot be moved to a different class.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER attendance_sheet_transition_valid_trg
  BEFORE UPDATE ON attendance_sheets
  FOR EACH ROW EXECUTE FUNCTION attendance_sheet_transition_valid();

-- The two rules that make a mark trustworthy: the student was actually expected
-- in that room on that day, and a submitted mark changes only through a
-- correction.
CREATE FUNCTION attendance_record_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sheet_tenant   uuid;
  sheet_status   text;
  session_date   date;
  offering_id    uuid;
  student_tenant uuid;
  enrolled       boolean;
BEGIN
  SELECT sh.tenant_id, sh.status, cs.session_date, cs.offering_id
    INTO sheet_tenant, sheet_status, session_date, offering_id
    FROM attendance_sheets sh
    JOIN class_sessions cs ON cs.id = sh.session_id
   WHERE sh.id = NEW.sheet_id;

  IF sheet_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A mark and its register must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT tenant_id INTO student_tenant FROM students WHERE id = NEW.student_id;
  IF student_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A student and their register must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF sheet_status = 'submitted' THEN
      RAISE EXCEPTION
        'This register has been submitted. A student missing from it is added by correction.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- Enrolment is checked AS OF THE CLASS DATE, not today. A student who left
    -- in week ten was still expected in week three.
    SELECT EXISTS (
      SELECT 1 FROM offering_enrolments e
       WHERE e.student_id = NEW.student_id
         AND e.offering_id = offering_id
         AND e.valid_from <= session_date
         AND (e.valid_to IS NULL OR e.valid_to >= session_date)
    ) INTO enrolled;

    IF NOT enrolled THEN
      RAISE EXCEPTION 'That student was not enrolled in this course on %.', session_date
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.sheet_id IS DISTINCT FROM OLD.sheet_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'A mark cannot be moved to another student or another class.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- The only way to change a submitted mark is to record a correction, whose
    -- trigger sets this flag for the length of its own transaction.
    IF sheet_status = 'submitted'
       AND NEW.state IS DISTINCT FROM OLD.state
       AND coalesce(nullif(current_setting('app.attendance_correction', true), ''), 'off') <> 'on'
    THEN
      RAISE EXCEPTION
        'This register has been submitted. Change this mark with a correction, which is recorded.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER attendance_record_valid_trg
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION attendance_record_valid();

-- A correction is the mechanism, not a note about one.
--
-- Inserting the correction row IS what changes the mark: the trigger applies it.
-- That makes the audit trail impossible to skip, because skipping it would mean
-- not making the change at all.
CREATE FUNCTION apply_attendance_correction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_state  text;
  sheet_status   text;
  record_tenant  uuid;
BEGIN
  SELECT r.state, sh.status, r.tenant_id
    INTO current_state, sheet_status, record_tenant
    FROM attendance_records r
    JOIN attendance_sheets sh ON sh.id = r.sheet_id
   WHERE r.id = NEW.record_id;

  IF current_state IS NULL THEN
    RAISE EXCEPTION 'That mark was not found.' USING ERRCODE = 'check_violation';
  END IF;
  IF record_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A correction and its mark must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A correction on a draft register is just an edit, and edits need no
  -- paperwork. Recording one would imply a formality that does not exist.
  IF sheet_status <> 'submitted' THEN
    RAISE EXCEPTION 'That register has not been submitted yet, so the mark can simply be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- The narrative has to be true: a correction that says it changed absent to
  -- present must have found absent.
  IF NEW.from_state <> current_state THEN
    RAISE EXCEPTION 'That mark is now %, not %. Read it again before correcting it.',
      current_state, NEW.from_state
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('app.attendance_correction', 'on', true);

  UPDATE attendance_records
     SET state = NEW.to_state, updated_at = NEW.corrected_at, version = version + 1
   WHERE id = NEW.record_id;

  PERFORM set_config('app.attendance_correction', 'off', true);

  RETURN NEW;
END $$;

CREATE TRIGGER apply_attendance_correction_trg
  AFTER INSERT ON attendance_corrections
  FOR EACH ROW EXECUTE FUNCTION apply_attendance_correction();

-- ---------------------------------------------------------------------------
-- Isolation, privileges and permissions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_sheets', 'attendance_records', 'attendance_corrections'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
  END LOOP;

  -- Sheets and marks are amended while a register is open, so both need UPDATE.
  -- The triggers decide what an UPDATE may actually do.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON attendance_sheets TO %I', app_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON attendance_records TO %I', app_role);
  -- Corrections are append-only, like the audit log. No UPDATE and no DELETE,
  -- so the history of a mark cannot be rewritten by any code path at all.
  EXECUTE format('GRANT SELECT, INSERT ON attendance_corrections TO %I', app_role);
END $$;

INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('attendance.read',    'M6', 'View attendance',      'normal',    false, true),
  ('attendance.mark',    'M6', 'Record attendance',    'normal',    false, true),
  ('attendance.submit',  'M6', 'Submit a register',    'sensitive', false, true),
  ('attendance.correct', 'M6', 'Correct a submitted register', 'sensitive', false, false)
ON CONFLICT (key) DO NOTHING;

-- Platform templates carry no tenant, so the tenant policy would reject these
-- updates. Same NO FORCE pattern as 002 and every module migration since.
ALTER TABLE role_definitions NO FORCE ROW LEVEL SECURITY;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['attendance.read', 'attendance.mark', 'attendance.submit', 'attendance.correct']
 WHERE key = 'college_admin' AND tenant_id IS NULL;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['attendance.read', 'attendance.mark', 'attendance.submit', 'attendance.correct']
 WHERE key = 'department_head' AND tenant_id IS NULL;

-- Faculty mark and submit their own registers. They do NOT correct a submitted
-- one: Blueprint 2 D4 puts that authority with the HOD or Class Advisor, and the
-- request-and-approve path that would let a teacher ask for a correction needs
-- the approvals capability, which does not exist yet. Until then a teacher asks.
UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['attendance.read', 'attendance.mark', 'attendance.submit']
 WHERE key = 'faculty' AND tenant_id IS NULL;

ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;
