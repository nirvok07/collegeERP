-- 005_refresh_token_families.sql
--
-- Persistent sessions with rotating refresh tokens.
--
-- Access-token lifetime and session lifetime are different concepts. The access
-- token stays short (15 minutes) because it is presented on every request and
-- cannot be revoked mid-life. The SESSION lives as long as the user keeps using
-- the product, because each refresh issues a new token and extends the window.
--
-- Rotation needs reuse detection: if a token that was already exchanged is
-- presented again, either it was replayed by an attacker or it leaked. Both
-- cases revoke the whole family, per docs/05-api-contract.md 5.3.

ALTER TABLE refresh_tokens
  ADD COLUMN family_id   uuid,
  ADD COLUMN consumed_at timestamptz,
  ADD COLUMN replaced_by uuid REFERENCES refresh_tokens(id),
  ADD COLUMN last_used_at timestamptz,
  ADD COLUMN revocation_reason text;

-- Existing rows each become their own family.
UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id) WHERE revoked_at IS NULL;

-- Resolving a presented token is a bootstrap problem: the tenant is not known
-- until the row is found, but row level security needs the tenant to find it.
--
-- This function is the narrow, audited way out. It is SECURITY DEFINER, takes an
-- unguessable 256-bit hash, returns only what the refresh flow needs, and cannot
-- enumerate anything: a wrong hash returns no rows. Every subsequent statement
-- runs under the normal tenant context.
CREATE FUNCTION auth_resolve_refresh_token(p_token_hash text)
RETURNS TABLE (
  id uuid, family_id uuid, tenant_id uuid, account_id uuid,
  platform_account_id uuid, expires_at timestamptz,
  consumed_at timestamptz, revoked_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT rt.id, rt.family_id, rt.tenant_id, rt.account_id,
         rt.platform_account_id, rt.expires_at, rt.consumed_at, rt.revoked_at
    FROM refresh_tokens rt
   WHERE rt.token_hash = p_token_hash
$$;

REVOKE ALL ON FUNCTION auth_resolve_refresh_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_resolve_refresh_token(text) TO erp_app;

-- Revoking a family must also work before tenant context is established, and
-- must work for a family whose tenant is being denied access.
CREATE FUNCTION auth_revoke_token_family(p_family_id uuid, p_reason text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH revoked AS (
    UPDATE refresh_tokens
       SET revoked_at = now(), revocation_reason = p_reason
     WHERE family_id = p_family_id AND revoked_at IS NULL
     RETURNING 1
  )
  SELECT count(*)::int FROM revoked
$$;

REVOKE ALL ON FUNCTION auth_revoke_token_family(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_revoke_token_family(uuid, text) TO erp_app;
