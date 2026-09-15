-- 030_calendar_events.sql
--
-- CAL-2: events on the academic calendar: a farewell (all day), Teachers' Day
-- 11:00 to 14:00. Unlike a non-teaching day, an event does not stop classes;
-- it is only announced. Kept by whoever holds term.manage; read by everyone
-- in the college.
--
-- Removed means marked removed, not deleted: the application role holds no
-- DELETE here, and the audit trail keeps pointing at a real row.

CREATE TABLE calendar_events (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  title       text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  on_date     date NOT NULL,
  -- Both or neither: neither is a full-day event.
  starts_at   time,
  ends_at     time,
  note        text CHECK (note IS NULL OR length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES persons(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz,
  removed_by  uuid REFERENCES persons(id),
  CONSTRAINT calendar_events_times CHECK (
    (starts_at IS NULL AND ends_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  )
);

CREATE INDEX calendar_events_date_idx ON calendar_events (tenant_id, on_date) WHERE removed_at IS NULL;

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_events FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON calendar_events
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  REVOKE ALL ON TABLE calendar_events FROM PUBLIC;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON calendar_events TO %I', app_role);
END $$;
