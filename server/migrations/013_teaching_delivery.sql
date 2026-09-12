-- 013_teaching_delivery.sql
--
-- M4 Teaching Delivery: Room, TimetableSlot and ClassSession.
--
-- M3 answered who teaches what to whom. This answers when, where, and did it
-- happen. It is the last thing that must exist before attendance can point at
-- something stable.
--
-- The slot and the session are deliberately two tables. A slot is a recurring
-- intention and is edited; a session is one occurrence and is a fact. If one row
-- served both, correcting next week's timetable would rewrite the record of last
-- week's class.
--
-- Blueprint 2 D4 calls the occurrence a SessionOccurrence. It is called a CLASS
-- SESSION here and in the code, renamed once, with no third word. See AD-45 and
-- docs/blueprint/modules/m4-teaching-delivery.md.

-- ---------------------------------------------------------------------------
-- M2 addition: days the institution does not teach.
--
-- Attributed to M2 Academic Structure under the same reasoning as AD-39: the
-- institution's calendar is academic structure, and examinations, admissions and
-- payroll will all ask about holidays. Absorbing it into M4 because M4 needed it
-- first would put the holiday list under teaching operations.
--
-- Only non-teaching dates are stored. There is no weekly working pattern,
-- because the weekly pattern is already expressed by which days carry timetable
-- slots: a college closed on Sunday simply has no Sunday slots.
-- ---------------------------------------------------------------------------
CREATE TABLE non_teaching_days (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  on_date    date NOT NULL,
  -- Why, in the institution's own words: 'Diwali', 'University exam', 'Strike'.
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES persons(id)
);

CREATE UNIQUE INDEX non_teaching_days_date_uq ON non_teaching_days (tenant_id, on_date);

-- ---------------------------------------------------------------------------
-- Room: a teaching space on a campus.
--
-- Owned by M4 because teaching delivery is the only thing that needs it, and
-- because the alternative invites capacity planning, maintenance and asset tags
-- into institution setup. Exactly four facts are modelled. If a facilities
-- domain arrives, rooms move there and M4 keeps the reference: M4 owns when a
-- room is used for teaching, never the room's existence or condition. AD-46.
-- ---------------------------------------------------------------------------
CREATE TABLE rooms (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  campus_id  uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
  -- As written on the door. Normalised to upper case at the boundary so that
  -- 'lh-204' and 'LH-204' cannot become two rooms that never collide.
  code       text NOT NULL CHECK (code = upper(code)),
  name       text NOT NULL,
  kind       text NOT NULL DEFAULT 'classroom'
               CHECK (kind IN ('classroom', 'lab', 'seminar', 'auditorium')),
  -- Recorded and compared against section size as a WARNING, never a refusal:
  -- colleges routinely teach sixty-five students in a sixty-seat room, and a
  -- system that refuses that is a system people work around.
  capacity   int CHECK (capacity IS NULL OR (capacity > 0 AND capacity <= 2000)),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    int NOT NULL DEFAULT 1,

  UNIQUE (campus_id, code)
);

CREATE INDEX rooms_campus_idx ON rooms (campus_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- TimetableSlot: the recurring weekly intention for one offering.
--
-- No versioning and no publication workflow. Blueprint 2 D4 lists a
-- TimetableVersion approved by the head of department; attendance does not need
-- it, approvals are a platform capability that does not exist yet, and a
-- draft-versus-published timetable doubles every read path. Slots are live and
-- every change is audited. Deferred deliberately, recorded in AD-45.
-- ---------------------------------------------------------------------------
CREATE TABLE timetable_slots (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  offering_id uuid NOT NULL REFERENCES course_offerings(id) ON DELETE RESTRICT,
  -- ISO-8601 day numbering: 1 is Monday, 7 is Sunday. Matches PostgreSQL's
  -- isodow, so generation needs no translation table.
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  starts_at   time NOT NULL,
  ends_at     time NOT NULL,
  -- Nullable: a coordinator sets the pattern before rooms are allocated.
  room_id     uuid REFERENCES rooms(id) ON DELETE RESTRICT,
  -- Removed rather than deleted, because generated sessions record which slot
  -- produced them and the application role holds no DELETE.
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES persons(id),
  version     int NOT NULL DEFAULT 1,

  CONSTRAINT slot_range_forward CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX timetable_slots_identity_uq
  ON timetable_slots (offering_id, day_of_week, starts_at)
  WHERE status = 'active';

CREATE INDEX timetable_slots_offering_idx ON timetable_slots (offering_id)
  WHERE status = 'active';
CREATE INDEX timetable_slots_room_idx ON timetable_slots (room_id, day_of_week)
  WHERE status = 'active' AND room_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ClassSession: one concrete occurrence of teaching.
--
-- Identity is (offering, date, start time). The offering already binds section,
-- course and component, so none of those is restated. The slot is provenance
-- only: deleting a pattern must never orphan the record of a class that was
-- actually taught, and an ad-hoc make-up class has no slot at all.
-- ---------------------------------------------------------------------------
CREATE TABLE class_sessions (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  offering_id  uuid NOT NULL REFERENCES course_offerings(id) ON DELETE RESTRICT,
  -- Which pattern produced this, or null for an ad-hoc session. Identity does
  -- not depend on it.
  slot_id      uuid REFERENCES timetable_slots(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  starts_at    time NOT NULL,
  ends_at      time NOT NULL,
  room_id      uuid REFERENCES rooms(id) ON DELETE RESTRICT,
  -- Substitution reduced to its data: null means the offering's lead teaches
  -- it. One nullable column, not a workflow.
  instructor_person_id uuid REFERENCES persons(id) ON DELETE RESTRICT,
  status       text NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  -- Where this occurrence originally sat, so 'the Tuesday class happened on
  -- Thursday' stays explicable without reading the audit log.
  rescheduled_from_date      date,
  rescheduled_from_starts_at time,
  cancelled_reason text,
  -- Completion is recorded by whoever taught it, never inferred from the clock:
  -- a class on the timetable is not evidence that a class happened.
  completed_at timestamptz,
  completed_by uuid REFERENCES persons(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES persons(id),
  version      int NOT NULL DEFAULT 1,

  CONSTRAINT session_range_forward CHECK (ends_at > starts_at),
  CONSTRAINT session_cancelled_has_reason
    CHECK (status <> 'cancelled' OR cancelled_reason IS NOT NULL),
  CONSTRAINT session_completed_has_time
    CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

-- One live occurrence per offering, date and start time. A cancelled session
-- frees the hour, because it taught nobody.
CREATE UNIQUE INDEX class_sessions_identity_uq
  ON class_sessions (offering_id, session_date, starts_at)
  WHERE status <> 'cancelled';

-- The coordinator's question: what is happening today.
CREATE INDEX class_sessions_day_idx ON class_sessions (tenant_id, session_date);
-- The teacher's question: what am I teaching, soonest first.
CREATE INDEX class_sessions_teacher_idx
  ON class_sessions (instructor_person_id, session_date)
  WHERE instructor_person_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX class_sessions_offering_idx
  ON class_sessions (offering_id, session_date) WHERE status <> 'cancelled';
CREATE INDEX class_sessions_room_idx
  ON class_sessions (room_id, session_date)
  WHERE room_id IS NOT NULL AND status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Invariants. Enforced here because violating any of them would either corrupt
-- the teaching record or make it contradict itself.
-- ---------------------------------------------------------------------------

-- A session must sit inside the term its cohort is studying, belong to one
-- tenant throughout, and hang off teaching that is still expected to happen.
CREATE FUNCTION session_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  offering_tenant  uuid;
  offering_status  text;
  section_status   text;
  section_label    text;
  term_starts      date;
  term_ends        date;
  room_tenant      uuid;
  person_tenant    uuid;
  person_kind      text;
BEGIN
  SELECT o.tenant_id, o.status, s.status, s.label, t.starts_on, t.ends_on
    INTO offering_tenant, offering_status, section_status, section_label,
         term_starts, term_ends
    FROM course_offerings o
    JOIN sections s ON s.id = o.section_id
    JOIN terms t ON t.id = s.term_id
   WHERE o.id = NEW.offering_id;

  IF offering_tenant IS NULL THEN
    RAISE EXCEPTION 'That course offering was not found.' USING ERRCODE = 'check_violation';
  END IF;
  IF offering_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A class session and its course offering must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Only on the way in, or when the occurrence moves. A session already taught
  -- stays valid even after its offering completes, which is the normal end of
  -- every term.
  IF TG_OP = 'INSERT' THEN
    IF offering_status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'That course is % and takes no more classes.', offering_status
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF section_status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Section % is % and takes no more classes.', section_label, section_status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF NEW.session_date < term_starts OR NEW.session_date > term_ends THEN
    RAISE EXCEPTION
      'A class on % falls outside the term, which runs % to %.',
      NEW.session_date, term_starts, term_ends
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.room_id IS NOT NULL THEN
    SELECT tenant_id INTO room_tenant FROM rooms WHERE id = NEW.room_id;
    IF room_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'A room must belong to the same institution as the class.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- The same rule instructor assignment applies: a student standing in to teach
  -- is a data error that would later grant real access.
  IF NEW.instructor_person_id IS NOT NULL THEN
    SELECT tenant_id, person_type INTO person_tenant, person_kind
      FROM persons WHERE id = NEW.instructor_person_id;
    IF person_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'A stand-in must belong to the same institution.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF person_kind <> 'staff' THEN
      RAISE EXCEPTION 'Only staff can teach a class.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER session_context_valid_trg
  BEFORE INSERT OR UPDATE OF offering_id, session_date, room_id, instructor_person_id
  ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION session_context_valid();

-- A session is editable while scheduled and immutable once completed. Moving a
-- completed session would move whatever attendance later points at it, so the
-- operation is refused rather than accepted and audited.
CREATE FUNCTION session_transition_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'This class is already % and cannot change state.', OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status NOT IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'A class cannot go from % to %.', OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF OLD.status = 'completed' THEN
    IF NEW.session_date IS DISTINCT FROM OLD.session_date
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR NEW.room_id IS DISTINCT FROM OLD.room_id
       OR NEW.instructor_person_id IS DISTINCT FROM OLD.instructor_person_id THEN
      RAISE EXCEPTION
        'This class has been taught. Its record cannot be moved or changed.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  -- The offering never changes, at any point in the lifecycle. A session that
  -- could be re-pointed would move a taught class to another cohort.
  IF NEW.offering_id IS DISTINCT FROM OLD.offering_id THEN
    RAISE EXCEPTION 'A class session cannot be moved to a different course offering.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER session_transition_valid_trg
  BEFORE UPDATE ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION session_transition_valid();

-- One room holds one class at a time, and one person teaches one class at a
-- time.
--
-- An EXCLUDE constraint over a time range is the textbook answer, but comparing
-- the room identity inside it needs btree_gist, and CREATE EXTENSION requires an
-- ownership the least-privilege migration role does not hold on managed
-- PostgreSQL. That is the same constraint that removed citext in 001. Instead
-- the trigger takes an advisory lock on the resource before looking for an
-- overlap, so two concurrent inserts into one room serialise rather than race.
--
-- Overlap is half-open: a class ending at 10:00 does not conflict with one
-- starting at 10:00, because back-to-back periods are how timetables are built.
CREATE FUNCTION session_no_clash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  teacher uuid;
  clash   record;
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.room_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 0));

    SELECT c.code AS course_code, s.label AS section_label, r.code AS room_code
      INTO clash
      FROM class_sessions x
      JOIN course_offerings o ON o.id = x.offering_id
      JOIN courses c ON c.id = o.course_id
      JOIN sections s ON s.id = o.section_id
      JOIN rooms r ON r.id = x.room_id
     WHERE x.id <> NEW.id
       AND x.room_id = NEW.room_id
       AND x.session_date = NEW.session_date
       AND x.status <> 'cancelled'
       AND x.starts_at < NEW.ends_at
       AND x.ends_at > NEW.starts_at
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Room % is already teaching % to section % at that time.',
        clash.room_code, clash.course_code, clash.section_label
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;

  -- Who actually teaches this: the stand-in if there is one, otherwise the
  -- offering's live lead.
  teacher := NEW.instructor_person_id;
  IF teacher IS NULL THEN
    SELECT person_id INTO teacher
      FROM instructor_assignments
     WHERE offering_id = NEW.offering_id AND valid_to IS NULL AND role = 'lead'
     LIMIT 1;
  END IF;

  -- An unstaffed offering cannot double-book anyone.
  IF teacher IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(teacher::text, 0));

  SELECT c.code AS course_code, s.label AS section_label, p.full_name AS teacher_name
    INTO clash
    FROM class_sessions x
    JOIN course_offerings o ON o.id = x.offering_id
    JOIN courses c ON c.id = o.course_id
    JOIN sections s ON s.id = o.section_id
    LEFT JOIN instructor_assignments ia
           ON ia.offering_id = x.offering_id AND ia.valid_to IS NULL AND ia.role = 'lead'
    JOIN persons p ON p.id = teacher
   WHERE x.id <> NEW.id
     AND x.session_date = NEW.session_date
     AND x.status <> 'cancelled'
     AND coalesce(x.instructor_person_id, ia.person_id) = teacher
     AND x.starts_at < NEW.ends_at
     AND x.ends_at > NEW.starts_at
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION '% is already teaching % to section % at that time.',
      clash.teacher_name, clash.course_code, clash.section_label
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER session_no_clash_trg
  BEFORE INSERT OR UPDATE OF session_date, starts_at, ends_at, room_id,
                             instructor_person_id, status
  ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION session_no_clash();

-- A slot belongs to the same tenant as its offering and room, and two slots in
-- one room must not overlap when their offerings run in the same term. Slots in
-- different terms share a room freely, which is the normal case across an
-- academic year.
CREATE FUNCTION slot_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  offering_tenant uuid;
  offering_status text;
  slot_term       uuid;
  room_tenant     uuid;
  clash           record;
BEGIN
  SELECT o.tenant_id, o.status, s.term_id
    INTO offering_tenant, offering_status, slot_term
    FROM course_offerings o
    JOIN sections s ON s.id = o.section_id
   WHERE o.id = NEW.offering_id;

  IF offering_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A timetable slot and its course offering must belong to one institution.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND offering_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'That course is % and takes no timetable.', offering_status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.room_id IS NOT NULL AND NEW.status = 'active' THEN
    SELECT tenant_id INTO room_tenant FROM rooms WHERE id = NEW.room_id;
    IF room_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'A room must belong to the same institution as the slot.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT c.code AS course_code, s.label AS section_label, r.code AS room_code
      INTO clash
      FROM timetable_slots x
      JOIN course_offerings o ON o.id = x.offering_id
      JOIN sections s ON s.id = o.section_id
      JOIN courses c ON c.id = o.course_id
      JOIN rooms r ON r.id = x.room_id
     WHERE x.id <> NEW.id
       AND x.status = 'active'
       AND x.room_id = NEW.room_id
       AND x.day_of_week = NEW.day_of_week
       AND s.term_id = slot_term
       AND x.starts_at < NEW.ends_at
       AND x.ends_at > NEW.starts_at
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Room % already holds % for section % at that hour.',
        clash.room_code, clash.course_code, clash.section_label
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER slot_valid_trg
  BEFORE INSERT OR UPDATE OF offering_id, day_of_week, starts_at, ends_at, room_id, status
  ON timetable_slots
  FOR EACH ROW EXECUTE FUNCTION slot_valid();

-- ---------------------------------------------------------------------------
-- Isolation, privileges and permissions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['non_teaching_days', 'rooms', 'timetable_slots', 'class_sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    -- No DELETE: a room is archived, a slot removed, a class cancelled, because
    -- attendance will reference the class and the rest carries provenance.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO %I', t, app_role);
  END LOOP;

  -- The one exception. A mistyped holiday is a typo, not history: nothing
  -- references a non-teaching day, and generation reads it live.
  EXECUTE format('GRANT DELETE ON non_teaching_days TO %I', app_role);
END $$;

INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('session.read',    'M4', 'View the class timetable',  'normal',    false, true),
  ('session.manage',  'M4', 'Schedule and reschedule',   'sensitive', false, true),
  ('session.deliver', 'M4', 'Record a class as taught',  'normal',    false, true),
  ('room.manage',     'M4', 'Manage teaching rooms',     'sensitive', false, true)
ON CONFLICT (key) DO NOTHING;

-- Platform templates carry no tenant, so the tenant policy would reject these
-- updates. Same NO FORCE pattern as 002, 011 and 012.
ALTER TABLE role_definitions NO FORCE ROW LEVEL SECURITY;

UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['session.read', 'session.manage', 'session.deliver', 'room.manage']
 WHERE key = 'college_admin' AND tenant_id IS NULL;

-- A head of department schedules teaching but does not create rooms: a room is
-- an institution-wide facility on a campus they may not run.
UPDATE role_definitions
   SET permission_keys = permission_keys
        || ARRAY['session.read', 'session.manage', 'session.deliver']
 WHERE key = 'department_head' AND tenant_id IS NULL;

-- Faculty read the timetable and record their own teaching. Which classes that
-- reaches is decided by instructor assignment, not by this permission (AD-40).
UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY['session.read', 'session.deliver']
 WHERE key = 'faculty' AND tenant_id IS NULL;

ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;
