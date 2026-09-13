-- 019_college_lifecycle.sql
--
-- SA-1: suspend, reactivate and close a college, and reissue its
-- administrator's invitation. See docs/blueprint/capabilities/platform-administration.md.
--
-- A college's lifecycle is enforced here, not only in the application:
--   trial  -> active | suspended | closed
--   active -> suspended | closed
--   suspended -> the status it was suspended from | closed
--   closed -> nothing. Closing is final.
-- The reason for every transition is recorded in the audit trail with it.

ALTER TABLE institutions
  ADD COLUMN suspended_from    text CHECK (suspended_from IN ('trial', 'active')),
  ADD COLUMN status_changed_at timestamptz,
  ADD CONSTRAINT institutions_suspended_from_only_when_suspended
    CHECK ((status = 'suspended') = (suspended_from IS NOT NULL));

CREATE OR REPLACE FUNCTION institution_status_transition_valid() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_from text := OLD.status;
  v_to   text := NEW.status;
BEGIN
  IF v_from = v_to THEN
    -- Not a transition. The column still may not be rewritten behind the
    -- lifecycle's back.
    NEW.suspended_from := OLD.suspended_from;
    RETURN NEW;
  END IF;

  IF v_from = 'closed' THEN
    RAISE EXCEPTION 'This college is closed. Closing cannot be undone.'
      USING ERRCODE = '23001';
  END IF;

  IF v_to = 'suspended' THEN
    IF v_from NOT IN ('trial', 'active') THEN
      RAISE EXCEPTION 'Only a college in trial or active can be suspended.' USING ERRCODE = '23001';
    END IF;
    NEW.suspended_from := v_from;
  ELSIF v_from = 'suspended' AND v_to <> 'closed' THEN
    IF v_to IS DISTINCT FROM OLD.suspended_from THEN
      RAISE EXCEPTION 'A suspended college returns to the status it was suspended from (%).', OLD.suspended_from
        USING ERRCODE = '23001';
    END IF;
    NEW.suspended_from := NULL;
  ELSIF v_to = 'closed' THEN
    NEW.suspended_from := NULL;
  ELSIF NOT (v_from = 'trial' AND v_to = 'active') THEN
    RAISE EXCEPTION 'A college cannot move from % to %.', v_from, v_to USING ERRCODE = '23001';
  END IF;

  NEW.status_changed_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER institution_status_transition_valid
  BEFORE UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION institution_status_transition_valid();

-- A reissued invitation revokes the outstanding one. Recorded as revoked, not
-- disguised as consumed, so the history says what happened.
ALTER TABLE invitation_tokens ADD COLUMN revoked_at timestamptz;
