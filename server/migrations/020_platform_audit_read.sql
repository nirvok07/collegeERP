-- 020_platform_audit_read.sql
--
-- SA-2: the platform's read of its own audit events (AD-61).
--
-- audit_events is tenant-isolated by row-level security, and platform events
-- are spread across every college (provisioning, lifecycle, invitations) plus
-- rows with no college at all (platform sign-in and sign-out). One query under
-- the normal tenant context cannot see them together.
--
-- This function is the narrow way through, following auth_resolve_refresh_token
-- (migration 005): SECURITY DEFINER, read-only, and it returns only events a
-- platform account caused. Events a college's own users caused are never
-- returned. ip_hash is not returned. Pagination is keyset, newest first.

CREATE FUNCTION platform_audit_events(
  p_tenant    uuid,
  p_action    text,
  p_from      timestamptz,
  p_to        timestamptz,
  p_before_at timestamptz,
  p_before_id uuid,
  p_limit     int
)
RETURNS TABLE (
  id uuid, at timestamptz, cursor_at text, correlation_id uuid,
  tenant_id uuid, college_code text, college_name text,
  actor_id uuid, actor_name text, actor_email text,
  action text, subject_type text, subject_id uuid,
  before_state jsonb, after_state jsonb, reason text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT e.id, e.at, e.at::text, e.correlation_id,
         e.tenant_id, i.code, i.name,
         e.actor_id, pa.full_name, pa.email,
         e.action, e.subject_type, e.subject_id,
         e.before_state, e.after_state, e.reason
    FROM audit_events e
    LEFT JOIN institutions i ON i.id = e.tenant_id
    LEFT JOIN platform_accounts pa ON pa.id = e.actor_id
   WHERE e.actor_type = 'platform'
     AND (p_tenant IS NULL OR e.tenant_id = p_tenant)
     AND (p_action IS NULL OR e.action = p_action)
     AND (p_from IS NULL OR e.at >= p_from)
     AND (p_to IS NULL OR e.at < p_to)
     AND (p_before_at IS NULL OR (e.at, e.id) < (p_before_at, p_before_id))
   ORDER BY e.at DESC, e.id DESC
   -- The caller asks for one more than a page to learn whether another exists.
   LIMIT least(greatest(coalesce(p_limit, 51), 1), 101)
$$;

REVOKE ALL ON FUNCTION platform_audit_events(uuid, text, timestamptz, timestamptz, timestamptz, uuid, int) FROM PUBLIC;

-- Platform events are a small fraction of the table and are always read newest
-- first; a partial index serves exactly that and nothing else.
CREATE INDEX audit_events_platform_at_idx
  ON audit_events (at DESC, id DESC)
  WHERE actor_type = 'platform';

DO $$
DECLARE
  v_app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION platform_audit_events(uuid, text, timestamptz, timestamptz, timestamptz, uuid, int) TO %I',
    v_app_role);
END $$;
