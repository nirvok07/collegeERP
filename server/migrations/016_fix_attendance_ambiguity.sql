-- 016_fix_attendance_ambiguity.sql
--
-- Corrective, forward-only.
--
-- `attendance_record_valid` declared a variable named `offering_id`, which is
-- also a column of `offering_enrolments`. PL/pgSQL then refuses the reference
-- inside the enrolment check as ambiguous, at runtime rather than at creation:
--
--   ERROR: column reference "offering_id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
-- Every write to attendance_records therefore failed. Migration 015 is left as
-- applied rather than edited, and this replaces the function body: the two
-- routes to the end state are identical, and a forward fix cannot diverge
-- between a database that has 015 and one that has both.
--
-- The variables are renamed with a v_ prefix, which is the conventional guard
-- against exactly this collision.

CREATE OR REPLACE FUNCTION attendance_record_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sheet_tenant   uuid;
  v_sheet_status   text;
  v_session_date   date;
  v_offering       uuid;
  v_student_tenant uuid;
  v_enrolled       boolean;
BEGIN
  SELECT sh.tenant_id, sh.status, cs.session_date, cs.offering_id
    INTO v_sheet_tenant, v_sheet_status, v_session_date, v_offering
    FROM attendance_sheets sh
    JOIN class_sessions cs ON cs.id = sh.session_id
   WHERE sh.id = NEW.sheet_id;

  IF v_sheet_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A mark and its register must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT tenant_id INTO v_student_tenant FROM students WHERE id = NEW.student_id;
  IF v_student_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A student and their register must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_sheet_status = 'submitted' THEN
      RAISE EXCEPTION
        'This register has been submitted. A student missing from it is added by correction.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- Enrolment is checked AS OF THE CLASS DATE, not today. A student who left
    -- in week ten was still expected in week three.
    SELECT EXISTS (
      SELECT 1 FROM offering_enrolments e
       WHERE e.student_id = NEW.student_id
         AND e.offering_id = v_offering
         AND e.valid_from <= v_session_date
         AND (e.valid_to IS NULL OR e.valid_to >= v_session_date)
    ) INTO v_enrolled;

    IF NOT v_enrolled THEN
      RAISE EXCEPTION 'That student was not enrolled in this course on %.', v_session_date
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
    IF v_sheet_status = 'submitted'
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
