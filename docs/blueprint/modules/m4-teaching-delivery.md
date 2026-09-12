# M4 — Teaching Delivery: Room, Timetable Slot and Class Session

**Design before migration.** M3 answered *who teaches what to whom*. M4 answers *when, where, and
did it happen*. It is the last thing that must exist before attendance can be recorded against
anything stable.

## 1. Four entities, not one

The brief's first question is whether these are one thing. They are not, and conflating any two
of them breaks something concrete.

| Concept | Is | Answers | Owner |
|---|---|---|---|
| CourseOffering | A course delivered to a section | Who teaches what to whom | M3 |
| **Room** | A teaching space on a campus | Where | **M4** |
| **TimetableSlot** | A recurring weekly intention | When, every week | **M4** |
| **ClassSession** | One concrete occurrence | When, exactly once | **M4** |

**Why the slot and the session are separate tables.** A slot is edited; a session happened. If one
row served both, correcting next week's timetable would rewrite the record of last week's class,
and attendance taken under the old time would silently describe a lesson that now claims to have
been elsewhere. The slot is the plan, the session is the fact, and facts do not move when plans
change.

**Why the room is not a column on the session.** Two sessions must not occupy one room at one
time, and that check needs an identity to hold the lock against. A free-text room name cannot be
double-booked because it cannot be compared reliably. `Room 204`, `204` and `LH-204` are three
strings and one room.

**Why the session is not derived on the fly from slots.** A derived session has no identity, and
attendance needs something to reference for years. It also cannot be cancelled, moved, or taught
by a substitute, because there is no row to say so.

### Terminology, fixed

Blueprint 2 D4 calls the occurrence a **SessionOccurrence**. This document and the code call it a
**class session**. It is the same concept, renamed once, and there is no third word. Recorded as
part of AD-45.

## 2. Class session identity

`(offering, session_date, starts_at)`, unique among non-cancelled sessions.

- **The offering, not the section and course separately.** The offering already binds section,
  course and component, and restating them would allow a session whose course contradicts its
  own offering.
- **Date and start time, not a slot reference.** A session generated from a slot keeps a
  `slot_id` for provenance, but its identity does not depend on it: deleting a slot must not
  orphan the record of a class that was actually taught. An ad-hoc extra class has no slot at all
  and is identified exactly the same way.
- **Cancelled sessions are excluded from the key**, so a cancelled 9am Tuesday class can be
  replaced by a real one at the same hour without deleting history.

### What freezes, and when

A session is editable while `scheduled` and immutable once `completed`.

| Field | While scheduled | Once completed |
|---|---|---|
| date, start, end | Reschedulable | Frozen by trigger |
| room | Changeable | Frozen by trigger |
| offering | Never changeable | Never changeable |
| instructor override | Changeable | Frozen by trigger |

**Rescheduling moves the row in place** and records where it came from, because no attendance can
exist for a session that has not been taught. Once taught, the same operation is refused outright
rather than accepted and audited: a completed session is historical teaching activity, and moving
it would move whatever attendance later points at it. This is the session-level restatement of
the rule M3 applies to section and offering identity.

`rescheduled_from_date` and `rescheduled_from_starts_at` hold the original placement, so "the
Tuesday class actually happened on Thursday" stays explicable without reading the audit log.

## 3. Timetable model, deliberately minimal

A `timetable_slot` is `(offering, day_of_week, starts_at, ends_at, room)`. That is the whole
model. It is what a coordinator builds once per term and what generation expands.

**What is included, and why each is necessary rather than nice.**

- **Recurrence**, because a fifteen-week term with six offerings is ninety sessions and nobody
  will type them.
- **Generation across a term**, bounded by the term's own dates, skipping non-teaching days.
  Idempotent: running it twice creates nothing the second time, because a coordinator will run it
  twice.
- **Ad-hoc sessions**, because a make-up class on a Saturday is not a timetable change and
  inventing a one-week slot to express it would corrupt the pattern.
- **Cancellation with a reason**, because "why was there no class on 14 August" must have an
  answer.
- **Rescheduling**, per §2.
- **A per-session instructor override**, which is substitution reduced to its data. Null means
  the offering's lead teaches it. It is one nullable column, not a workflow.

**What is deliberately excluded.**

- **No timetable versioning or publication workflow.** Blueprint 2 D4 lists `TimetableVersion`
  with publication approved by the head of department. Attendance does not need it, approvals are
  a platform capability that does not exist yet, and a draft-versus-published timetable doubles
  every read path. Slots are live and every change is audited. Deferred, recorded.
- **No automatic scheduling or clash resolution engine.** The system detects conflicts and
  refuses them. Choosing a different hour is a human decision.
- **No room availability calendar, booking requests, or non-teaching bookings.** A room is a
  resource M4 checks for collisions, not a facility to manage.
- **No workload accounting.** Blueprint M14's concern, and it reads sessions rather than owning
  them.

## 4. Room ownership, and the boundary that keeps it small

A room belongs to a campus, which M2 owns. The room itself is owned by M4 because teaching
delivery is the only thing that needs it today, and because the alternative is worse: putting
rooms in institution setup invites capacity planning, maintenance, asset tags and booking into a
module whose job is org structure.

M4 models exactly four things about a room: which campus it is on, what it is called, how many it
seats, and what kind of space it is (`classroom`, `lab`, `seminar`, `auditorium`). Capacity is
recorded and compared against section capacity as a **warning, never a refusal**, because a
college routinely teaches sixty-five students in a sixty-seat room and a system that refuses to
schedule that is a system people work around.

**If a facilities domain arrives** (blueprint M19, Materials and Assets), rooms move there and M4
keeps only the reference. The boundary is stated now so that move is a migration rather than an
argument: M4 owns *when a room is used for teaching*, never the room's existence, condition or
non-teaching use.

## 5. Non-teaching days belong to M2

Generation must skip holidays. A `calendar_day` is a date an institution does not teach, with a
label. It belongs to **M2**, under the same reasoning as AD-39: the institution's calendar is
academic structure, and admissions, examinations and payroll will all ask about holidays.
Absorbing it into M4 would put the institution's holiday list under teaching operations.

Minimal by intent: explicit non-teaching dates only. There is no weekly working pattern, because
the weekly pattern is already expressed by which days have slots. A college closed on Sunday
simply has no Sunday slots.

**Where the code sits, stated honestly.** The attribution is M2's and the permission is M2's
`term.manage`, but the table, repository and routes live in the delivery module beside their only
consumer. That is exactly how the academic year and term already work: AD-39 attributes them to M2
while `PgTermRepository` sits in the teaching module. Attribution decides who owns the concept and
which permission guards it; it does not require a folder of its own for one table.

## 6. State model

`scheduled` → `completed`, or `scheduled` → `cancelled`. Both ends are terminal.

**`planned` is not a session state.** A generated session is scheduled; there is no earlier
condition for it to be in. Copying M3's five section states here would add a state with no
transition into it.

**`in_progress` is not a session state either, yet.** It is tempting because a teacher will one
day open a session to mark attendance, but a state with no consequence is speculation. The
transition attendance actually needs is scheduled to completed, and adding `in_progress` when
attendance capture exists is one migration and no rearchitecture.

**`completed` means the teaching occurred.** It is recorded by whoever taught it, not inferred
from the clock, because a class on the timetable is not evidence that a class happened. This is
the distinction the blueprint's "unmarked session register" depends on.

**Unmarked is derived, never stored.** A session still `scheduled` whose date has passed is
unmarked. Storing that would create a fourth state that a background job has to maintain and that
would be wrong for exactly as long as the job lagged.

**Cancellation requires a reason** and keeps the row. A cancelled session is the answer to why
there was no class, which a deleted row cannot give.

## 7. Conflict prevention, in the database

Enforced where violation would corrupt the teaching record or make it contradict itself.

| Invariant | Mechanism |
|---|---|
| A session's time range runs forward | `CHECK (ends_at > starts_at)` |
| A session falls inside its term | Trigger, reading offering → section → term |
| A session's offering is not cancelled or completed | Trigger |
| A session's section is not cancelled or completed | Trigger |
| One room holds one class at a time | Trigger with an advisory lock |
| One instructor teaches one class at a time | Trigger with an advisory lock |
| A session's room and offering belong to one tenant | Trigger |
| An instructor override is staff of the same tenant | Trigger |
| Session identity is unique per offering, date and start | Partial unique index |
| A completed session never moves | Trigger |
| Terminal states are terminal | Trigger |
| A slot's day and time do not collide for one room | Trigger |

**Why triggers with advisory locks rather than an exclusion constraint.** `EXCLUDE USING gist`
over a time range is the textbook answer and would be better, but it needs `btree_gist` to
compare the room identity, and `CREATE EXTENSION` requires ownership our least-privilege
migration role does not hold on managed PostgreSQL. This is the same constraint that removed
`citext` in migration 001. The trigger takes `pg_advisory_xact_lock` on the room, and separately
on the instructor, before it looks for an overlap, so two concurrent inserts into one room
serialise instead of racing. The lock costs nothing in the normal case, where a coordinator is
the only writer.

**Overlap is a half-open comparison.** A class ending at 10:00 does not conflict with one
starting at 10:00, because back-to-back periods are how every timetable in the country is built.

## 8. Authorization: AD-40 unchanged

Three permissions, and one guard that combines role with reach.

| Permission | Who | Reaches |
|---|---|---|
| `session.read` | College admin, HOD, faculty | Sessions within the granted scope |
| `session.manage` | College admin, HOD | Build slots, generate, reschedule, cancel |
| `session.deliver` | College admin, HOD, faculty | Mark a session taught |

- **`GET /v1/me/sessions` needs no permission**, exactly as `/v1/me/teaching` needs none. Reading
  your own sessions is self-scoped and the set is derived from the token subject.
- **`session.deliver` is where AD-40 does its work.** The permission says the person may mark
  teaching complete. The instructor assignment says which sessions that reaches. Both are
  required, and the combination lives in one place, `requireTeachingReach`, rather than as an
  identity comparison inside a route. A head of department who holds `session.manage` can mark a
  session taught for a teacher who is unreachable; that is an administrative act and it is
  audited as one.
- **No session-level permission, ever.** There is no `session:{id}` grant and no per-session
  access list. Reach is derived from the offering's live instructor assignment, which is the only
  authoritative statement of who teaches it.

## 9. What attendance will need, and what it will not have to change

```
Student (M5) → Enrolment (M5) → Section (M3) → CourseOffering (M3) → ClassSession (M4) → Attendance
```

- Attendance references `class_sessions.id` and a student. M4 owns neither the student nor the
  roster, and the roster comes from enrolment in the section, not from anything here.
- Marking attendance will require `attendance.mark` plus teaching reach over the session's
  offering, which is the guard this slice builds.
- A session that is `completed` and frozen is what makes an attendance record durable.
- M4 depends on nothing in M5. Sessions exist and are taught whether or not a student record
  system exists yet.

## 10. Clients

**Web.** A delivery workspace for a coordinator, organised by day rather than by entity, because
the operational question is "what is happening today and is anything broken". A week view for
building, a day view for checking, conflict and unmarked indicators on the rows that have them,
and contextual actions. A slot editor lives inside the offering's own context in the M3 teaching
workspace, because a weekly pattern is a property of the offering and navigating elsewhere to set
it would hide the relationship. Rooms get a small list screen, not a management console.

**Flutter.** The teacher's existing My Teaching surface extends downward: today's classes first,
then upcoming, then one session's detail with room, cohort, course and time. Marking a session
taught is the one write. No scheduling grid, because a teacher does not build timetables on a
phone, and no attendance, which is the next module.
