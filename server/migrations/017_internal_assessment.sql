-- 017_internal_assessment.sql
--
-- M7 Internal Assessment, which is blueprint module M9 (AD-44).
--
-- The part of roadmap Phase 6 that OD-1 does not touch: assumption S4 makes
-- the college the authority for internal assessment whether it is affiliated
-- or autonomous. Publication to students, totals, grades and pass or fail are
-- M10's, and are not here.
--
-- Every PL/pgSQL variable below carries a v_ prefix. Migration 016 exists
-- because a variable named like a column made every attendance write fail at
-- runtime with an ambiguous reference; the prefix makes that impossible.
--
-- See docs/blueprint/modules/m7-internal-assessment.md.

-- ---------------------------------------------------------------------------
-- A component is one measured piece of a course's internal assessment, and it
-- is also the mark sheet: its status is the state of the act of marking.
-- ---------------------------------------------------------------------------
CREATE TABLE assessment_components (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  offering_id      uuid NOT NULL REFERENCES course_offerings(id) ON DELETE RESTRICT,
  name             text NOT NULL CHECK (length(btrim(name)) > 0),
  kind             text NOT NULL DEFAULT 'test'
                     CHECK (kind IN ('test', 'quiz', 'assignment', 'lab', 'project', 'viva', 'other')),
  -- Two decimal places, because half marks are routine.
  max_marks        numeric(6,2) NOT NULL CHECK (max_marks > 0),
  -- A percentage of the internal total. The per-course sum is held to 100 by
  -- trigger; how weights combine into a total is M10's policy.
  weight           numeric(5,2) NOT NULL CHECK (weight > 0 AND weight <= 100),
  -- When it was held. Required before any mark, because the roster is taken
  -- as of this date (AD-50), and frozen once a mark exists.
  held_on          date,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'submitted', 'verified', 'cancelled')),
  submitted_at     timestamptz,
  submitted_by     uuid REFERENCES persons(id),
  verified_at      timestamptz,
  verified_by      uuid REFERENCES persons(id),
  cancelled_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES persons(id),
  -- Optimistic concurrency, as AD-52 does for attendance.
  version          int NOT NULL DEFAULT 1,

  CONSTRAINT component_submitted_is_attributed CHECK (
    status NOT IN ('submitted', 'verified')
    OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
  ),
  CONSTRAINT component_verified_is_attributed CHECK (
    status <> 'verified' OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)
  ),
  CONSTRAINT component_cancelled_has_reason CHECK (
    status <> 'cancelled' OR cancelled_reason IS NOT NULL
  )
);

-- Two components with one name in one course would make "Test 1" ambiguous on
-- every sheet and report. A cancelled one frees the name.
CREATE UNIQUE INDEX assessment_components_name_uq
  ON assessment_components (offering_id, lower(name)) WHERE status <> 'cancelled';
CREATE INDEX assessment_components_offering_idx ON assessment_components (offering_id);
-- The head of department's queue: sheets submitted and awaiting verification.
CREATE INDEX assessment_components_queue_idx
  ON assessment_components (tenant_id) WHERE status = 'submitted';

-- ---------------------------------------------------------------------------
-- A mark is not just a number. Absent is not zero and exempt is not absent:
-- storing a missed test as 0 would already have decided whether it counts
-- against the student, which is examination policy and not this table's call.
-- ---------------------------------------------------------------------------
CREATE TABLE assessment_marks (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  component_id uuid NOT NULL REFERENCES assessment_components(id) ON DELETE RESTRICT,
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  status       text NOT NULL CHECK (status IN ('scored', 'absent', 'exempt')),
  score        numeric(6,2),
  note         text,
  marked_by    uuid NOT NULL REFERENCES persons(id),
  marked_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      int NOT NULL DEFAULT 1,

  -- The upper bound depends on the component, so a trigger enforces it.
  CONSTRAINT mark_score_matches_status CHECK (
    (status = 'scored' AND score IS NOT NULL AND score >= 0)
    OR (status <> 'scored' AND score IS NULL)
  )
);

-- One result per student per component. Two would make "what did she score" a
-- question with two answers.
CREATE UNIQUE INDEX assessment_marks_identity_uq ON assessment_marks (component_id, student_id);
CREATE INDEX assessment_marks_student_idx ON assessment_marks (student_id);

-- Append-only by privilege: the application role gets INSERT and SELECT only.
CREATE TABLE assessment_mark_corrections (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  mark_id      uuid NOT NULL REFERENCES assessment_marks(id) ON DELETE RESTRICT,
  from_status  text NOT NULL,
  from_score   numeric(6,2),
  to_status    text NOT NULL CHECK (to_status IN ('scored', 'absent', 'exempt')),
  to_score     numeric(6,2),
  reason       text NOT NULL CHECK (length(btrim(reason)) > 0),
  corrected_by uuid NOT NULL REFERENCES persons(id),
  corrected_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT correction_score_matches_status CHECK (
    (to_status = 'scored' AND to_score IS NOT NULL AND to_score >= 0)
    OR (to_status <> 'scored' AND to_score IS NULL)
  ),
  CONSTRAINT correction_changes_something CHECK (
    to_status <> from_status OR to_score IS DISTINCT FROM from_score
  )
);

CREATE INDEX assessment_mark_corrections_mark_idx
  ON assessment_mark_corrections (mark_id, corrected_at);

-- ---------------------------------------------------------------------------
-- Invariants.
-- ---------------------------------------------------------------------------

-- A component belongs to one tenant with its course, sits inside its term, and
-- the course's weights never exceed 100.
CREATE FUNCTION assessment_component_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_offering_tenant uuid;
  v_offering_status text;
  v_term_starts     date;
  v_term_ends       date;
  v_weight_total    numeric;
BEGIN
  SELECT o.tenant_id, o.status, t.starts_on, t.ends_on
    INTO v_offering_tenant, v_offering_status, v_term_starts, v_term_ends
    FROM course_offerings o
    JOIN sections s ON s.id = o.section_id
    JOIN terms t ON t.id = s.term_id
   WHERE o.id = NEW.offering_id;

  IF v_offering_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'An assessment and its course must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND v_offering_status = 'cancelled' THEN
    RAISE EXCEPTION 'That course was cancelled, so it takes no assessment.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.held_on IS NOT NULL
     AND (NEW.held_on < v_term_starts OR NEW.held_on > v_term_ends) THEN
    RAISE EXCEPTION 'An assessment held on % falls outside the term, which runs % to %.',
      NEW.held_on, v_term_starts, v_term_ends
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialise plan edits per course, so two components added at once cannot
  -- each see 60 and together make 120. Seed 1 keeps these locks apart from the
  -- room and teacher locks M4 takes with seed 0.
  IF NEW.status <> 'cancelled' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.offering_id::text, 1));

    SELECT coalesce(sum(c.weight), 0) INTO v_weight_total
      FROM assessment_components c
     WHERE c.offering_id = NEW.offering_id
       AND c.status <> 'cancelled'
       AND c.id <> NEW.id;

    IF v_weight_total + NEW.weight > 100 THEN
      RAISE EXCEPTION
        'The weights of this course would total %, and internal assessment cannot exceed 100.',
        v_weight_total + NEW.weight
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER assessment_component_context_valid_trg
  BEFORE INSERT OR UPDATE OF offering_id, weight, held_on, status ON assessment_components
  FOR EACH ROW EXECUTE FUNCTION assessment_component_context_valid();

-- The lifecycle, and what freezes once marking has begun.
CREATE FUNCTION assessment_component_transition_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_marks boolean;
BEGIN
  IF NEW.offering_id IS DISTINCT FROM OLD.offering_id THEN
    RAISE EXCEPTION 'An assessment cannot be moved to a different course.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT EXISTS (SELECT 1 FROM assessment_marks m WHERE m.component_id = OLD.id)
    INTO v_has_marks;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('verified', 'cancelled') THEN
      RAISE EXCEPTION 'This assessment is % and cannot change state.', OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    -- No return to draft. A head of department corrects, with a reason,
    -- rather than unlocking the sheet (AD-51's rule).
    IF NOT (
      (OLD.status = 'draft'     AND NEW.status IN ('submitted', 'cancelled')) OR
      (OLD.status = 'submitted' AND NEW.status = 'verified')
    ) THEN
      RAISE EXCEPTION 'An assessment cannot go from % to %.', OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status = 'cancelled' AND v_has_marks THEN
      RAISE EXCEPTION 'Marks have been entered for this assessment, so it was held and cannot be cancelled.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  -- A 45 out of 50 must not silently become 45 out of 40, and moving the date
  -- would change who was expected to sit it.
  IF v_has_marks AND (
       NEW.max_marks IS DISTINCT FROM OLD.max_marks
       OR NEW.weight IS DISTINCT FROM OLD.weight
       OR NEW.held_on IS DISTINCT FROM OLD.held_on
     ) THEN
    RAISE EXCEPTION
      'Marks have been entered for this assessment, so its maximum marks, weight and date are fixed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER assessment_component_transition_valid_trg
  BEFORE UPDATE ON assessment_components
  FOR EACH ROW EXECUTE FUNCTION assessment_component_transition_valid();

-- A mark is for a student who was enrolled on the day it was held, within the
-- component's maximum, and a submitted mark changes only by correction.
CREATE FUNCTION assessment_mark_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_component_tenant uuid;
  v_component_status text;
  v_max_marks        numeric;
  v_held_on          date;
  v_offering         uuid;
  v_student_tenant   uuid;
  v_enrolled         boolean;
BEGIN
  SELECT c.tenant_id, c.status, c.max_marks, c.held_on, c.offering_id
    INTO v_component_tenant, v_component_status, v_max_marks, v_held_on, v_offering
    FROM assessment_components c
   WHERE c.id = NEW.component_id;

  IF v_component_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A mark and its assessment must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT st.tenant_id INTO v_student_tenant FROM students st WHERE st.id = NEW.student_id;
  IF v_student_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A student and their mark must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'scored' AND NEW.score > v_max_marks THEN
    RAISE EXCEPTION 'A score of % is more than the % this assessment is out of.',
      NEW.score, v_max_marks
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_component_status = 'cancelled' THEN
      RAISE EXCEPTION 'That assessment was cancelled, so it takes no marks.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF v_component_status IN ('submitted', 'verified') THEN
      RAISE EXCEPTION 'This assessment has been submitted. A mark changes only by correction.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF v_held_on IS NULL THEN
      RAISE EXCEPTION 'Record when this assessment was held before entering marks.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- Enrolment on the day it was held, not today (AD-50).
    SELECT EXISTS (
      SELECT 1 FROM offering_enrolments e
       WHERE e.student_id = NEW.student_id
         AND e.offering_id = v_offering
         AND e.valid_from <= v_held_on
         AND (e.valid_to IS NULL OR e.valid_to >= v_held_on)
    ) INTO v_enrolled;

    IF NOT v_enrolled THEN
      RAISE EXCEPTION 'That student was not enrolled in this course on %.', v_held_on
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.component_id IS DISTINCT FROM OLD.component_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'A mark cannot be moved to another student or another assessment.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF v_component_status IN ('submitted', 'verified')
       AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.score IS DISTINCT FROM OLD.score)
       AND coalesce(nullif(current_setting('app.assessment_correction', true), ''), 'off') <> 'on'
    THEN
      RAISE EXCEPTION 'This assessment has been submitted. A mark changes only by correction, which is recorded.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER assessment_mark_valid_trg
  BEFORE INSERT OR UPDATE ON assessment_marks
  FOR EACH ROW EXECUTE FUNCTION assessment_mark_valid();

-- The correction is the mechanism, not a note about one: inserting it is what
-- changes the mark, so the paper trail cannot be skipped.
CREATE FUNCTION apply_assessment_mark_correction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status   text;
  v_current_score    numeric;
  v_mark_tenant      uuid;
  v_component_status text;
  v_max_marks        numeric;
BEGIN
  SELECT m.status, m.score, m.tenant_id, c.status, c.max_marks
    INTO v_current_status, v_current_score, v_mark_tenant, v_component_status, v_max_marks
    FROM assessment_marks m
    JOIN assessment_components c ON c.id = m.component_id
   WHERE m.id = NEW.mark_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'That mark was not found.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_mark_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A correction and its mark must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_component_status NOT IN ('submitted', 'verified') THEN
    RAISE EXCEPTION 'That assessment has not been submitted yet, so the mark can simply be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- The story has to be true: a correction from 12 must have found 12.
  IF NEW.from_status <> v_current_status
     OR NEW.from_score IS DISTINCT FROM v_current_score THEN
    RAISE EXCEPTION 'That mark has changed since it was read. Read it again before correcting it.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF NEW.to_status = 'scored' AND NEW.to_score > v_max_marks THEN
    RAISE EXCEPTION 'A score of % is more than the % this assessment is out of.',
      NEW.to_score, v_max_marks
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.assessment_correction', 'on', true);

  UPDATE assessment_marks
     SET status = NEW.to_status, score = NEW.to_score,
         updated_at = NEW.corrected_at, version = version + 1
   WHERE id = NEW.mark_id;

  PERFORM set_config('app.assessment_correction', 'off', true);

  RETURN NEW;
END $$;

CREATE TRIGGER apply_assessment_mark_correction_trg
  AFTER INSERT ON assessment_mark_corrections
  FOR EACH ROW EXECUTE FUNCTION apply_assessment_mark_correction();

-- ---------------------------------------------------------------------------
-- Isolation, privileges and permissions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH v_table IN ARRAY ARRAY['assessment_components', 'assessment_marks', 'assessment_mark_corrections'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, v_table);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', v_table);
  END LOOP;

  -- Components and marks are amended while a sheet is open; the triggers decide
  -- what an UPDATE may actually do. No DELETE: a component is cancelled.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON assessment_components TO %I', v_app_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON assessment_marks TO %I', v_app_role);
  -- Corrections are append-only, like the audit log and attendance corrections.
  EXECUTE format('GRANT SELECT, INSERT ON assessment_mark_corrections TO %I', v_app_role);
END $$;

INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('assessment.read',    'M7', 'View internal assessment',       'normal',    false, true),
  ('assessment.plan',    'M7', 'Define an assessment plan',      'sensitive', false, true),
  ('assessment.mark',    'M7', 'Enter internal marks',           'normal',    false, true),
  ('assessment.submit',  'M7', 'Submit a mark sheet',            'sensitive', false, true),
  ('assessment.verify',  'M7', 'Verify a submitted mark sheet',  'sensitive', false, false),
  ('assessment.correct', 'M7', 'Correct a submitted mark',       'sensitive', false, false)
ON CONFLICT (key) DO NOTHING;

-- Platform templates carry no tenant, so the tenant policy would reject these
-- updates. Same NO FORCE pattern as every module migration since 002.
ALTER TABLE role_definitions NO FORCE ROW LEVEL SECURITY;

UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY[
     'assessment.read', 'assessment.plan', 'assessment.mark',
     'assessment.submit', 'assessment.verify', 'assessment.correct']
 WHERE key = 'college_admin' AND tenant_id IS NULL;

-- The plan is departmental, and so are verification and correction.
UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY[
     'assessment.read', 'assessment.plan', 'assessment.mark',
     'assessment.submit', 'assessment.verify', 'assessment.correct']
 WHERE key = 'department_head' AND tenant_id IS NULL;

-- Faculty enter and submit the marks of courses they teach. They do not define
-- the plan, verify, or correct a submitted sheet: Blueprint 2 D5 puts those with
-- the department.
UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY[
     'assessment.read', 'assessment.mark', 'assessment.submit']
 WHERE key = 'faculty' AND tenant_id IS NULL;

ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;
