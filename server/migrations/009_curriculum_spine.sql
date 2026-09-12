-- 009_curriculum_spine.sql
--
-- Programs, curriculum versions, courses, and the entries that place a course
-- inside a version.
--
-- The invariant this schema exists to serve (AD-3, and m2-curriculum-spine.md):
-- a published curriculum version must remain readable exactly as it was, for as
-- long as any student bound to it has a record. Immutability is therefore
-- enforced here, by trigger and by grant, not by application discipline alone.

-- ---------------------------------------------------------------------------
-- Program: the qualification a college awards. Belongs to a department, which
-- M2 already owns, so organisational ownership is not duplicated.
-- ---------------------------------------------------------------------------
CREATE TABLE programs (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  code          text NOT NULL,
  -- The award, as it appears on a certificate. Descriptive, not structural.
  award         text,
  duration_years numeric(3,1) NOT NULL CHECK (duration_years > 0 AND duration_years <= 10),
  term_type     text NOT NULL DEFAULT 'semester' CHECK (term_type IN ('semester','annual')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  archived_at   timestamptz,
  archived_by   uuid REFERENCES persons(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       int NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX programs_active_code_uq
  ON programs (tenant_id, code) WHERE status = 'active';
CREATE INDEX programs_department_idx ON programs (department_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Course: a catalogue entry. Its code is its identity and never changes,
-- because it appears on transcripts and in records outside this system.
--
-- Deliberately carries NO credits and NO semester. Those are version-specific
-- and live on curriculum_entries; putting them here would make a 2024 student's
-- transcript change when the 2026 regulation was written.
-- ---------------------------------------------------------------------------
CREATE TABLE courses (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  code        text NOT NULL,
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     int NOT NULL DEFAULT 1
);

-- Unique across ALL statuses, not just active. A course code is an identity
-- that outlives the catalogue entry, so archiving must never free it for reuse:
-- a transcript naming CS301 must resolve to one course forever.
CREATE UNIQUE INDEX courses_code_uq ON courses (tenant_id, code);

-- ---------------------------------------------------------------------------
-- Curriculum version: what a program required, under one regulation.
--
-- Identity is (program, regulation_year, revision). Not a timestamp: effective
-- period is expressed by which cohorts are bound to it, because two versions
-- are simultaneously in force whenever two cohorts are studying.
-- ---------------------------------------------------------------------------
CREATE TABLE curriculum_versions (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  program_id      uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  regulation_year int NOT NULL CHECK (regulation_year BETWEEN 1900 AND 2200),
  -- Revisions exist for errata: a correction to what was always intended,
  -- distinct from an amendment, which is a new regulation year.
  revision        int NOT NULL DEFAULT 1 CHECK (revision > 0),
  title           text,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','superseded','discarded')),
  total_terms     int NOT NULL CHECK (total_terms > 0 AND total_terms <= 20),
  published_at    timestamptz,
  published_by    uuid REFERENCES persons(id),
  superseded_by   uuid REFERENCES curriculum_versions(id),
  superseded_at   timestamptz,
  discarded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1,

  -- A published version must record when and by whom, because that is the
  -- evidence a registrar produces years later.
  CONSTRAINT published_has_provenance
    CHECK (status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL))
);

CREATE UNIQUE INDEX curriculum_versions_identity_uq
  ON curriculum_versions (program_id, regulation_year, revision)
  WHERE status <> 'discarded';

-- One draft at a time per regulation year: two concurrent drafts of the same
-- thing is an editing conflict, not a feature.
CREATE UNIQUE INDEX curriculum_versions_one_draft_uq
  ON curriculum_versions (program_id, regulation_year)
  WHERE status = 'draft';

CREATE INDEX curriculum_versions_program_idx
  ON curriculum_versions (program_id, regulation_year DESC);

-- ---------------------------------------------------------------------------
-- Curriculum entry: the role a course plays IN THIS VERSION.
--
-- This is the entity that makes history reproducible. Credits and placement
-- belong here because they differ between versions for the same course.
-- ---------------------------------------------------------------------------
CREATE TABLE curriculum_entries (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  curriculum_version_id uuid NOT NULL REFERENCES curriculum_versions(id) ON DELETE RESTRICT,
  course_id      uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  term_number    int NOT NULL CHECK (term_number > 0 AND term_number <= 20),
  credits        numeric(4,1) NOT NULL CHECK (credits >= 0 AND credits <= 30),
  requirement    text NOT NULL DEFAULT 'core'
                   CHECK (requirement IN ('core','elective','audit')),
  -- Electives are chosen from a named group; core courses have none.
  elective_group text,
  sequence       int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT elective_group_only_for_electives
    CHECK (requirement = 'elective' OR elective_group IS NULL)
);

-- A course appears once per version. It may appear in many versions, with
-- different credits and placement each time, which is the normal case.
CREATE UNIQUE INDEX curriculum_entries_unique_course_uq
  ON curriculum_entries (curriculum_version_id, course_id);
CREATE INDEX curriculum_entries_version_idx
  ON curriculum_entries (curriculum_version_id, term_number, sequence);

-- ---------------------------------------------------------------------------
-- Immutability, enforced by the database.
--
-- The application also refuses these operations, but a rule this important
-- should not depend on every future code path remembering it.
-- ---------------------------------------------------------------------------
CREATE FUNCTION curriculum_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('published', 'superseded') THEN
    -- Superseding and the audit-neutral bookkeeping that goes with it are the
    -- only permitted transitions. Everything else is history being rewritten.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'published' AND NEW.status = 'superseded') THEN
      RAISE EXCEPTION
        'Curriculum version % is % and cannot change state. Create a new version instead.',
        OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.program_id IS DISTINCT FROM OLD.program_id
       OR NEW.regulation_year IS DISTINCT FROM OLD.regulation_year
       OR NEW.revision IS DISTINCT FROM OLD.revision
       OR NEW.total_terms IS DISTINCT FROM OLD.total_terms
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by THEN
      RAISE EXCEPTION
        'Curriculum version % is published and its definition cannot be altered.', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER curriculum_version_immutable_trg
  BEFORE UPDATE ON curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION curriculum_version_immutable();

CREATE FUNCTION curriculum_entry_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT status INTO parent_status
    FROM curriculum_versions
   WHERE id = COALESCE(NEW.curriculum_version_id, OLD.curriculum_version_id);

  IF parent_status IN ('published', 'superseded') THEN
    RAISE EXCEPTION
      'This curriculum version is % and its courses cannot be changed. Create a new version instead.',
      parent_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

-- INSERT and UPDATE are both covered: adding a course to a published version is
-- as much a rewrite of history as editing one.
CREATE TRIGGER curriculum_entry_immutable_trg
  BEFORE INSERT OR UPDATE ON curriculum_entries
  FOR EACH ROW EXECUTE FUNCTION curriculum_entry_immutable();

-- ---------------------------------------------------------------------------
-- Tenant isolation and least privilege.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['programs','courses','curriculum_versions','curriculum_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO %I', t, app_role);
  END LOOP;

  -- Drafts are edited by removing and re-adding entries, so this one table
  -- needs DELETE. The trigger above confines it to drafts, which is the only
  -- place deletion is meaningful: published entries are history.
  EXECUTE format('GRANT DELETE ON curriculum_entries TO %I', app_role);
END $$;
