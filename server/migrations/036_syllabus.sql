-- 036_syllabus.sql
--
-- Syllabus module: a course's syllabus as a PDF, one per course per academic
-- year. An administrator uploads the file; a student or teacher in that
-- course sees and downloads it. Media binaries live behind the MediaStorage
-- port (Cloudinary in prod, in-memory in dev/tests); PostgreSQL holds the
-- reference and metadata only, mirroring how college branding stores assets.
--
-- Scope decisions (also in docs/blueprint/modules/m12-syllabus.md):
--   * Per (course, academic year) — one syllabus per course per year. A newer
--     upload for the same pair replaces the older one (upsert in the service).
--   * "Who may see it" is enforced in the repository, never by trusting the
--     client: students get syllabi for courses in their live section's
--     offerings; teaching staff get syllabi for courses they currently teach
--     or administer. There is no per-syllabus row-level grant table yet.
--
-- DELETE is granted to app_role and gated in the route by syllabus.upload, so
-- a syllabus is replaceable content — not append-only like fees.

CREATE TABLE syllabus (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  course_id        uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  media_reference  text NOT NULL,               -- handle from MediaStorage
  file_name        text NOT NULL,               -- original filename, for the download name
  content_type     text NOT NULL,               -- application/pdf
  byte_size        bigint NOT NULL CHECK (byte_size > 0),
  uploaded_by      uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  version          int NOT NULL DEFAULT 1,

  CONSTRAINT syllabus_one_per_course_year UNIQUE (tenant_id, course_id, academic_year_id)
);

CREATE INDEX syllabus_tenant_idx      ON syllabus (tenant_id);
CREATE INDEX syllabus_course_idx      ON syllabus (course_id);
CREATE INDEX syllabus_academic_year_idx ON syllabus (academic_year_id);

-- ---------------------------------------------------------------------------
-- Isolation, privileges: the same tenant_isolation pattern as every other
-- tenant-owned table (031_fee_structures.sql).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['syllabus'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', t, app_role);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Permissions and roles. Same NO FORCE / FORCE pattern as 002, 011 … 031:
-- platform templates carry no tenant.
--
--   syllabus.upload — compose, replace or remove a syllabus (College Admin,
--                     Department Head).
--   syllabus.read   — see and download syllabi (those two, plus Faculty,
--                     scoped in the repository to courses they actually
--                     teach). Students have no role key; they get their own
--                     syllabi through /me/syllabus, not a permission.
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('syllabus.upload', 'M12', 'Upload, replace or remove a course syllabus', 'normal', false, true),
  ('syllabus.read',   'M12', 'View and download course syllabi',            'normal', false, true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE role_definitions NO FORCE ROW LEVEL SECURITY;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['syllabus.upload', 'syllabus.read']
 WHERE key = 'college_admin' AND tenant_id IS NULL;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['syllabus.upload', 'syllabus.read']
 WHERE key = 'department_head' AND tenant_id IS NULL;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['syllabus.read']
 WHERE key = 'faculty' AND tenant_id IS NULL;

ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;