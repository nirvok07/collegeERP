-- 011_sections.sql
--
-- M3 Teaching Operations, slice one.
--
-- A SECTION is a cohort of students within a program, for one term. B.Tech
-- Computer Science, year 3, section A. It is deliberately NOT an offering of a
-- course: that is CourseOffering, which is course x section x term and carries
-- the instructor, and it arrives in the next slice.
--
-- This shape is what makes section-scoped authority resolve. M1's scope
-- contract states a section yields [section, program, department, campus]; a
-- course-shaped section could not produce that chain, because a course has no
-- department.

CREATE TABLE sections (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- The program is what gives a section its place in the organisation, and
  -- therefore its ancestry for authorization.
  program_id       uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  term_id          uuid NOT NULL REFERENCES terms(id) ON DELETE RESTRICT,
  -- Term within the PROGRAM, 1..total_terms: year 3 semester 1 of a four-year
  -- semester program is 5. Matches how curriculum_entries places courses, so a
  -- section's expected courses are derivable rather than duplicated.
  term_number      int NOT NULL CHECK (term_number > 0 AND term_number <= 20),
  label            text NOT NULL,
  capacity         int CHECK (capacity IS NULL OR capacity > 0),
  status           text NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','open','active','completed','cancelled')),
  opened_at        timestamptz,
  activated_at     timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  cancelled_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          int NOT NULL DEFAULT 1,

  CONSTRAINT cancelled_has_reason
    CHECK (status <> 'cancelled' OR cancelled_reason IS NOT NULL)
);

-- One live section per identity. A cancelled label is reusable, because the
-- section never taught anyone; a live duplicate is a data error.
CREATE UNIQUE INDEX sections_identity_uq
  ON sections (program_id, academic_year_id, term_number, label)
  WHERE status <> 'cancelled';

-- The authorization path: given a section, find its program.
CREATE INDEX sections_program_idx ON sections (program_id) WHERE status <> 'cancelled';
CREATE INDEX sections_term_idx ON sections (term_id, term_number);

-- ---------------------------------------------------------------------------
-- Invariants that would damage operational history if violated.
-- ---------------------------------------------------------------------------
CREATE FUNCTION section_transition_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Terminal means terminal. Attendance and results will reference a
    -- completed section by identity for as long as the records exist.
    IF OLD.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Section % is % and cannot change state.', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NOT (
      (OLD.status = 'planned'   AND NEW.status IN ('open', 'cancelled')) OR
      (OLD.status = 'open'      AND NEW.status IN ('planned', 'active', 'cancelled')) OR
      (OLD.status = 'active'    AND NEW.status IN ('completed', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'A section cannot go from % to %.', OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  -- Identity is frozen once teaching has begun. Re-pointing a section would
  -- silently move attendance and results between cohorts.
  IF OLD.status IN ('active', 'completed') THEN
    IF NEW.program_id IS DISTINCT FROM OLD.program_id
       OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
       OR NEW.term_number IS DISTINCT FROM OLD.term_number
       OR NEW.label IS DISTINCT FROM OLD.label THEN
      RAISE EXCEPTION
        'Section % has started and its identity cannot change. Records already reference it.',
        OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER section_transition_valid_trg
  BEFORE UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION section_transition_valid();

-- A term beyond the program's duration is a data error, and the program already
-- knows its own length.
CREATE FUNCTION section_term_within_program()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  max_terms int;
  program_term_type text;
  program_years numeric;
BEGIN
  SELECT term_type, duration_years INTO program_term_type, program_years
    FROM programs WHERE id = NEW.program_id;

  max_terms := CASE
    WHEN program_term_type = 'semester' THEN ceil(program_years * 2)
    ELSE ceil(program_years)
  END;

  IF NEW.term_number > max_terms THEN
    RAISE EXCEPTION
      'Term % is beyond this program, which runs % terms.', NEW.term_number, max_terms
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER section_term_within_program_trg
  BEFORE INSERT OR UPDATE OF term_number, program_id ON sections
  FOR EACH ROW EXECUTE FUNCTION section_term_within_program();

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sections
  USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
REVOKE ALL ON TABLE sections FROM PUBLIC;

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON sections TO %I', app_role);
END $$;

-- Permissions for the existing catalogue. No parallel permission system.
INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('section.read',   'M3', 'View sections',            'normal',    false, true),
  ('section.manage', 'M3', 'Create and run sections',  'sensitive', false, true),
  ('term.manage',    'M2', 'Manage academic calendar', 'sensitive', false, true)
ON CONFLICT (key) DO NOTHING;

-- Existing system roles gain the new permissions, so a college administrator
-- can run sections without anyone re-granting their role.
--
-- Platform templates carry no tenant, so the tenant policy on role_definitions
-- would reject these updates. The table owner lifts FORCE for this transaction
-- rather than the migration role needing BYPASSRLS, which requires superuser
-- and is therefore unavailable on managed PostgreSQL. Same pattern as 002.
ALTER TABLE role_definitions NO FORCE ROW LEVEL SECURITY;

UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY['section.read','section.manage','term.manage']
 WHERE key = 'college_admin' AND tenant_id IS NULL;

UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY['section.read','section.manage']
 WHERE key = 'department_head' AND tenant_id IS NULL;

-- Faculty already declares section scope; now it can actually read one.
UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY['section.read']
 WHERE key = 'faculty' AND tenant_id IS NULL;

ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;
