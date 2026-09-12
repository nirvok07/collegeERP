# M5 Student Records (minimum) and M6 Attendance

**Design before migration.** M4 made a class session a stable fact. This makes attendance a
trustworthy record against it, and adds only as much of the student record as a correct roster
needs.

## 1. The dependency that decided the shape of this slice

Attendance answers: *for this class session, which enrolled students were accounted for, and how?*
Every word of that already exists except **enrolled students**. A grep of every migration finds no
student, no enrolment and no section membership. The only trace is `persons.person_type = 'student'`,
and `sections.capacity` is a stated number rather than a count of anybody.

So the roster has to exist first. The blueprint assigns `Student` and `Enrolment (student × course
offering)` to D3, module M5 Student Records. This slice therefore adds the **minimum M5**, under
M5's name, and attendance consumes it. That is the same move as AD-39 (the academic calendar went
to M2 when M3 needed it) and AD-47 (non-teaching days went to M2 when M4 needed them), and it is
recorded as AD-50.

**What M5 gets here, and nothing more:** a student record, cohort membership, and enrolment in a
course offering. **Not built:** enquiries, applications, merit lists, seat allocation, admission
offers, fee linkage, status history beyond the current status, transfers, re-admission, no-dues
clearance, guardians, alumni conversion. Those are M5's real surface and this is not it.

## 2. The chain, with nothing skipped

```
Student → SectionMembership → Section → CourseOffering → OfferingEnrolment → ClassSession → Attendance
                                   ↑                                              ↑
                                M3 owns                                        M4 owns
```

Attendance references the **class session**, never the course, the section or the offering. A mark
belongs to an occurrence of teaching: "absent from Operating Systems" is not a fact, and "absent
from the 9am lecture on 8 June" is.

## 3. Two bindings, because a cohort is not a course list

- **SectionMembership** is which cohort a student belongs to: B.Tech CSE, term 5, section A.
- **OfferingEnrolment** is which courses they actually take in it.

Both exist because an elective splits a cohort. Twenty of sixty students take one elective, and a
roster built from cohort membership alone would show the teacher sixty names and invite forty wrong
absences. That is not a cosmetic gap; it corrupts the academic record, which is the one thing this
slice exists to prevent.

**Enrolment is created in bulk, never typed.** Placing a student in a section enrols them in that
section's live offerings. Adding a course to a cohort later enrols its current members through one
explicit action, not a hidden side effect, so an operator always knows what just happened.

**Both bindings are validity-bounded**, following AD-42: `valid_from`, `valid_to`, and a reason on
the way out. Nothing is deleted, because the record of who was taught what in week three has to
survive a withdrawal in week ten.

### The roster is resolved as of the session's date

This is the rule that makes reopening an old sheet safe:

> The roster of a class session is every student whose enrolment in that offering was live **on the
> session's date**, not today.

A student who withdrew in week ten still appears on week three's sheet, marked as they were marked.
A student who joined in week six does not appear on week three's, because they were not there.
Without this, correcting a historical sheet would silently change who was expected in the room.

## 4. What an attendance record is

**One row per student per class session**, carrying one state. Enforced by a unique index, because
two rows would make "was she present" a question with two answers.

**Four states, each earning its place:**

| State | Means | Why it exists |
|---|---|---|
| `present` | In the room | The default case |
| `absent` | Not in the room | The default case |
| `late` | Arrived after the class began | Colleges record it, and it usually counts as present for percentage while still being worth knowing |
| `excused` | Away with sanction: duty leave for sports, NCC, a college event | Blueprint 2 D4 lists "record a duty leave exemption" as a workflow; without the state it would be faked as `present` and the register would be wrong |

Deliberately **not** states: `medical` (a reason for `excused`, not a different fact), `holiday` (a
property of the day, which M4 already owns), `cancelled` (a property of the session), and
`not marked` (the absence of a row, which is exactly how it is represented).

**No percentage anywhere in this slice.** How `late` and `excused` count toward eligibility is a
rule that belongs with examinations, and computing it now would bake one college's policy into the
schema. The states are stored; the arithmetic comes later.

## 5. The sheet, and the two states that matter

A sheet is one row per class session, owned by M6, holding the state of the act of marking. It is a
separate table from `class_sessions` on purpose: M4 owns the occurrence, M6 owns what was recorded
about it, and a column on M4's table would put attendance state inside the teaching-delivery
boundary.

```
draft  ──submit──▶  submitted
```

- **`draft`** — being marked. Records are freely editable by anyone who may mark, because a teacher
  halfway down a list of sixty has not asserted anything yet.
- **`submitted`** — the teacher's statement of what happened in that room. Records become read-only.

**There is no unlock.** A submitted sheet stays submitted. Changing a mark afterwards is a
**correction**: a new row recording the old state, the new state, who changed it and why, with the
record updated in place. The original is always reconstructable by replaying corrections backwards.
This is stricter than the brief's "who can unlock", and deliberately: an unlock is an invitation to
edit history quietly, and a correction is a statement that history was wrong. Only one of those is
auditable.

**No term-level lock either, yet.** A third state, frozen once results are computed, needs a
locking authority and an examination module to trigger it. Recorded as deferred rather than guessed.

## 6. Who may do what

| Permission | College admin | Head of dept | Faculty | Bounded by |
|---|---|---|---|---|
| `attendance.read` | ✓ | ✓ | ✓ | Scope, and reach for the self view |
| `attendance.mark` | ✓ | ✓ | ✓ | **Instructor assignment on the offering** |
| `attendance.submit` | ✓ | ✓ | ✓ | Same reach as marking |
| `attendance.correct` | ✓ | ✓ | ✗ | Scope only |

**AD-40 is untouched.** `attendance.mark` says a person may record attendance. M3's instructor
assignment says which classes that reaches. Both are required, and the combination is resolved by
the same `TeachingReachReader` that `session.deliver` already uses, in one place.

**Faculty do not hold `attendance.correct`, and that is the blueprint's own rule.** Blueprint 2 D4:
"Every attendance correction after submission by the HOD or Class Advisor, with a reason." The
approval workflow that would let a teacher *request* a correction is a platform capability that
does not exist, so the authority sits where the blueprint puts it and a teacher asks. When
approvals arrive, the request path is added and this permission does not move.

**The scope check uses the session's own cohort.** A faculty member granted over section A cannot
mark section B, whatever their assignments say, because the permission is evaluated against the
section the session belongs to. That is the same resolution `/v1/sessions/:id/complete` uses.

## 7. Concurrency: two teachers, one sheet

Two clients must not silently overwrite each other. The sheet carries a `version`.

- Marking sends the version the client last read. If it no longer matches, the write is refused and
  the response says the sheet changed, so the client re-reads rather than clobbering.
- The whole batch is one transaction and one version bump. Fifty marks either all land or none do.
- Submission takes the version too, so a teacher cannot submit a sheet somebody else has since
  changed under them.

Optimistic, not pessimistic: a lock held across a classroom would be abandoned the moment somebody
walked out of the room.

## 8. Database-enforced invariants

Where violation would corrupt an academic record:

| Invariant | Mechanism |
|---|---|
| One state per student per session | Unique index |
| A mark's student was enrolled in that offering on that date | Trigger, reading membership and enrolment validity |
| A mark's session is not cancelled | Trigger |
| A submitted record changes only through a correction | Trigger |
| A submitted sheet never returns to draft | Trigger |
| A correction states a reason | Check constraint |
| Student, session, sheet and mark share one tenant | Trigger |
| A student record points at a person of type `student` | Trigger |
| One live membership per student per section, one live enrolment per student per offering | Partial unique indexes |
| Validity periods run forwards | Check constraints |

## 9. Clients

**Flutter is the primary surface, and this is the slice where that stops being a claim.** Marking
attendance is a phone task performed standing up in front of sixty people, twice a day, by the
person the record is about. The flow is: today's classes, one session, the roster, mark all present,
tap the exceptions, review, submit. One batch request, never one per student. Nothing about it is a
desktop table made narrow.

**Offline is deliberately not promised.** A marked-but-unsent sheet needs a durable outbox, a
replay policy and a conflict rule against the sheet version, and promising it without those is how
attendance data gets lost. What this slice does instead is fail safely: the sheet is held in local
state until the batch succeeds, an unsent sheet says so plainly, and a failed submission keeps
every mark on screen for a retry. The outbox is the next Flutter slice.

**Web is the administrative and corrective surface.** One session's sheet with who marked it and
when, the correction history with its reasons, and a roster screen for placing students in a cohort.
No percentage dashboards, no defaulter lists, no analytics: those need the counting rules this
slice deliberately does not decide.

## 10. What this slice does not build

- Attendance percentage, eligibility, detention, shortfall warnings, defaulter lists.
- A correction request-and-approve workflow, pending the approvals capability.
- A term-level lock after results.
- Offline capture with an outbox.
- Admissions, and every other part of M5's real surface.
- Anything about examinations.
