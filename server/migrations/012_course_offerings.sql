-- 012_course_offerings.sql
--
-- M3 Teaching Operations, slice two: the delivery of one course to one section.
--
-- A CourseOffering is the operational bridge from curriculum, through a cohort,
-- to actual teaching. It carries NO credits and NO requirement: those live on
-- the curriculum entry and are immutable once published, which is what keeps a
-- 2024 student's transcript stable while the 2026 regulation changes.
--
-- See docs/blueprint/modules/m3-course-offering.md.

CREATE TABLE course_offerings (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- The section carries the term, so the term is NOT restated here. Restating
  -- it would permit an offering whose term contradicts its section's.
  section_id  uuid NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  -- A lab is staffed separately from its lecture in most colleges. Without
  -- this, the same course could not be offered twice to one section and
  -- colleges would fake it with duplicate course codes.
  component   text NOT NULL DEFAULT 'lecture'
                CHECK (component IN ('lecture', 'lab', 'tutorial')),
  status      text NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  activated_at     timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  cancelled_reason text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     int NOT NULL DEFAULT 1,

  CONSTRAINT offering_cancelled_has_reason
    CHECK (status <> 'cancelled' OR cancelled_reason IS NOT NULL)
);

-- One live offering per section, course and component. A cancelled one frees
-- the slot, because it taught nobody.
CREATE UNIQUE INDEX course_offerings_identity_uq
  ON course_offerings (section_id, course_id, component)
  WHERE status <> 'cancelled';

CREATE INDEX course_offerings_section_idx ON course_offerings (section_id)
  WHERE status <> 'cancelled';
CREATE INDEX course_offerings_course_idx ON course_offerings (course_id)
  WHERE status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Instructor assignment.
--
-- A table rather than a column on the offering, for one reason that decides it:
-- history. When a teacher changes mid-term, attendance taken in week three was
-- taken by the previous teacher. A column would overwrite that.
--
-- No new identity: an instructor is a person with person_type = 'staff', owned
-- by M1. M3 owns only the relationship.
-- ---------------------------------------------------------------------------
CREATE TABLE instructor_assignments (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  offering_id uuid NOT NULL REFERENCES course_offerings(id) ON DELETE RESTRICT,
  person_id   uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  role        text NOT NULL DEFAULT 'lead'
                CHECK (role IN ('lead', 'co', 'assistant')),
  valid_from  timestamptz NOT NULL DEFAULT now(),
  -- Null means current. Reassignment sets this rather than deleting the row, so
  -- "who was teaching on 14 August" always has an answer.
  valid_to    timestamptz,
  assigned_by uuid REFERENCES persons(id),
  ended_by    uuid REFERENCES persons(id),
  end_reason  text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assignment_period_forward CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Exactly one live lead per offering. Co-teaching is real; ambiguity about who
-- owns the class is not.
CREATE UNIQUE INDEX instructor_assignments_one_lead_uq
  ON instructor_assignments (offering_id)
  WHERE valid_to IS NULL AND role = 'lead';

-- One live assignment per person per offering, so the same teacher cannot be
-- both lead and co.
CREATE UNIQUE INDEX instructor_assignments_one_per_person_uq
  ON instructor_assignments (offering_id, person_id)
  WHERE valid_to IS NULL;

-- The teacher-facing query: which offerings am I teaching now.
CREATE INDEX instructor_assignments_person_idx
  ON instructor_assignments (person_id) WHERE valid_to IS NULL;

-- ---------------------------------------------------------------------------
-- Invariants that would corrupt teaching history.
-- ---------------------------------------------------------------------------
CREATE FUNCTION offering_transition_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  section_status text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'This offering is % and cannot change state.', OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NOT (
      (OLD.status = 'planned' AND NEW.status IN ('active', 'cancelled')) OR
      (OLD.status = 'active'  AND NEW.status IN ('completed', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'An offering cannot go from % to %.', OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- Teaching a cohort that has not started is meaningless.
    IF NEW.status = 'active' THEN
      SELECT status INTO section_status FROM sections WHERE id = NEW.section_id;
      IF section_status <> 'active' THEN
        RAISE EXCEPTION
          'This section is % and is not yet teaching, so its courses cannot start.', section_status
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
  END IF;

  -- Identity freezes once teaching has begun, for the same reason Section's
  -- does: attendance will reference this offering by identity.
  IF OLD.status IN ('active', 'completed') THEN
    IF NEW.section_id IS DISTINCT FROM OLD.section_id
       OR NEW.course_id IS DISTINCT FROM OLD.course_id
       OR NEW.component IS DISTINCT FROM OLD.component THEN
      RAISE EXCEPTION
        'This offering has started and its identity cannot change. Records already reference it.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER offering_transition_valid_trg
  BEFORE UPDATE ON course_offerings
  FOR EACH ROW EXECUTE FUNCTION offering_transition_valid();

-- An offering belongs to the same tenant as its section and course. The tenant
-- policy protects each row individually; this catches a mismatch between them.
CREATE FUNCTION offering_tenant_consistent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  section_tenant uuid;
  course_tenant uuid;
BEGIN
  SELECT tenant_id INTO section_tenant FROM sections WHERE id = NEW.section_id;
  SELECT tenant_id INTO course_tenant FROM courses WHERE id = NEW.course_id;

  IF section_tenant IS DISTINCT FROM NEW.tenant_id
     OR course_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'An offering, its section and its course must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER offering_tenant_consistent_trg
  BEFORE INSERT OR UPDATE OF section_id, course_id ON course_offerings
  FOR EACH ROW EXECUTE FUNCTION offering_tenant_consistent();

-- An instructor must be staff of the same institution. A student assigned to
-- teach is a data error that would grant real access.
CREATE FUNCTION instructor_must_be_staff()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  person_tenant uuid;
  person_kind text;
BEGIN
  SELECT tenant_id, person_type INTO person_tenant, person_kind
    FROM persons WHERE id = NEW.person_id;

  IF person_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'An instructor must belong to the same institution.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF person_kind <> 'staff' THEN
    RAISE EXCEPTION 'Only staff can be assigned to teach.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER instructor_must_be_staff_trg
  BEFORE INSERT ON instructor_assignments
  FOR EACH ROW EXECUTE FUNCTION instructor_must_be_staff();

-- ---------------------------------------------------------------------------
-- Isolation, privileges and permissions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['course_offerings', 'instructor_assignments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    -- No DELETE: an offering is cancelled and an assignment is ended, because
    -- attendance and results will reference both.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO %I', t, app_role);
  END LOOP;
END $$;

INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('offering.read',     'M3', 'View course offerings',    'normal',    false, true),
  ('offering.manage',   'M3', 'Create and run offerings', 'sensitive', false, true),
  ('instructor.assign', 'M3', 'Assign instructors',       'sensitive', false, true)
ON CONFLICT (key) DO NOTHING;

-- Platform templates carry no tenant, so the tenant policy would reject these
-- updates. The owner lifts FORCE for this transaction rather than the migration
-- role needing BYPASSRLS, which requires superuser and is unavailable on
-- managed PostgreSQL. Same pattern as 002 and 011.
ALTER TABLE role_definitions NO FORCE ROW LEVEL SECURITY;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['offering.read', 'offering.manage', 'instructor.assign']
 WHERE key = 'college_admin' AND tenant_id IS NULL;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['offering.read', 'offering.manage', 'instructor.assign']
 WHERE key = 'department_head' AND tenant_id IS NULL;

-- Faculty read offerings; they do not staff them.
UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY['offering.read']
 WHERE key = 'faculty' AND tenant_id IS NULL;

ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;
