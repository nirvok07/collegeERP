-- 010_academic_period.sql
--
-- Academic years and terms. These belong to M2 Academic Structure, per
-- Blueprint 2 D2, and are added here because M3 sections need a term and no
-- term exists. Attributed to M2 rather than absorbed into M3.
--
-- Terminology, fixed: an ACADEMIC YEAR is the institution's yearly cycle, named
-- as the institution names it. A TERM is a numbered division inside it, and is
-- a semester or an annual term according to the program's existing term_type.
-- There is no third word for either.

CREATE TABLE academic_years (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- As the institution writes it: '2026-27', not a derived integer.
  name        text NOT NULL,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  is_current  boolean NOT NULL DEFAULT false,
  status      text NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','active','closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     int NOT NULL DEFAULT 1,

  CONSTRAINT academic_year_dates CHECK (ends_on > starts_on)
);

CREATE UNIQUE INDEX academic_years_name_uq ON academic_years (tenant_id, name);

-- "The current year" must be unambiguous, because every downstream module asks
-- for it and a second one would make the answer arbitrary.
CREATE UNIQUE INDEX academic_years_one_current_uq
  ON academic_years (tenant_id) WHERE is_current;

CREATE TABLE terms (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  -- Position within the academic year: semester 1 and 2, or the single annual
  -- term. Not the program term number, which is a different counter.
  sequence         int NOT NULL CHECK (sequence > 0 AND sequence <= 6),
  name             text NOT NULL,
  starts_on        date NOT NULL,
  ends_on          date NOT NULL,
  status           text NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','active','closed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          int NOT NULL DEFAULT 1,

  CONSTRAINT term_dates CHECK (ends_on > starts_on)
);

CREATE UNIQUE INDEX terms_sequence_uq ON terms (academic_year_id, sequence);
CREATE INDEX terms_year_idx ON terms (academic_year_id, sequence);

DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years','terms'] LOOP
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
END $$;
