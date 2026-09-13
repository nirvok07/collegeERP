-- 023_seat_limits.sql
--
-- SA-4a (AD-65): one live college account is one seat, enforced here, where
-- every account is created, so no application path can bypass it.
--
-- Live means invited, active, locked or suspended: the same definition as
-- user_accounts_one_live_per_person_uq, so one person holds at most one seat.
-- Roles, assignments and platform accounts never count.
--
-- A row that becomes live (inserted live, or moved into a live status) is
-- refused while the college's live accounts are already at or above its seat
-- limit. Accepting an invitation moves invited to active, both live, so it
-- takes no second seat. Lowering the limit touches no account: the college is
-- simply over its limit until accounts are freed.
--
-- Concurrency: a per-college advisory lock (seed 2; rooms and teachers use 0,
-- offerings 1) serialises the check. Under READ COMMITTED each statement after
-- the lock takes a fresh snapshot, so a competing insert that committed first
-- is counted, and two simultaneous creations cannot both pass.
--
-- SECURITY DEFINER, like auth_resolve_refresh_token (005), so the count and the
-- limit are read the same way whoever the caller is and whatever tenant context
-- it set. SQLSTATE ERS01 is mapped to SEAT_LIMIT_REACHED by the unit of work.

CREATE OR REPLACE FUNCTION college_account_seat_check() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used  int;
  v_limit int;
BEGIN
  IF NEW.status NOT IN ('invited', 'active', 'locked', 'suspended') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('invited', 'active', 'locked', 'suspended') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 2));

  SELECT seat_limit INTO v_limit FROM institutions WHERE id = NEW.tenant_id;
  SELECT count(*) INTO v_used
    FROM user_accounts
   WHERE tenant_id = NEW.tenant_id
     AND id <> NEW.id
     AND status IN ('invited', 'active', 'locked', 'suspended');

  -- A college that cannot be found has no seats: fail closed.
  IF v_used >= coalesce(v_limit, 0) THEN
    RAISE EXCEPTION 'This college is using all % of its seats. Free a seat, or ask the platform to raise the limit.', coalesce(v_limit, 0)
      USING ERRCODE = 'ERS01';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION college_account_seat_check() FROM PUBLIC;

CREATE TRIGGER college_account_seat_check
  BEFORE INSERT OR UPDATE OF status ON user_accounts
  FOR EACH ROW EXECUTE FUNCTION college_account_seat_check();
