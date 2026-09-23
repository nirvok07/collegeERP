-- 038_staff_attendance.sql
--
-- SA-ATT-1: a teacher's (or any staff member's) own daily attendance, by
-- punching in and out — self-service, distinct from M6 (a teacher marking a
-- class's roster). One open row per person per day; punching out closes it.
-- Self-scoped: a person reads and writes only their own rows, derived from
-- the token subject, never from a client-supplied person id.

CREATE TABLE staff_attendance (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  person_id      uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  work_date      date NOT NULL,
  punch_in_at    timestamptz NOT NULL,
  punch_out_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_attendance_out_after_in CHECK (punch_out_at IS NULL OR punch_out_at > punch_in_at)
);

-- One row per person per day: a second punch-in on the same day resumes the
-- day's row rather than starting a new one.
CREATE UNIQUE INDEX staff_attendance_person_day_uq ON staff_attendance (tenant_id, person_id, work_date);
CREATE INDEX staff_attendance_person_idx ON staff_attendance (tenant_id, person_id, work_date DESC);

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
  ALTER TABLE staff_attendance FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON staff_attendance
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  REVOKE ALL ON TABLE staff_attendance FROM PUBLIC;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON staff_attendance TO %I', app_role);
END $$;
