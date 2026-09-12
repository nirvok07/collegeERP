# M3 — Teaching Operations, slice two: CourseOffering and Instructor Assignment

**Design before migration.** This slice is the operational bridge from curriculum, through a
cohort, to actual teaching.

## 1. What a CourseOffering is

> **The delivery of one course to one section, as one teaching unit.**
> Operating Systems, taught to B.Tech CSE year 3 section A, as a lecture.

It is not a second Section: a section is the cohort, and it has many offerings. It is not a
curriculum entry: the entry says the course is required and worth four credits under the 2024
regulation, and the offering says who teaches it to whom this term.

| Entity | Owner | Answers |
|---|---|---|
| Course | M2 | What is this subject? |
| Curriculum entry | M2 | What does it count for, under which regulation? |
| Section | M3 | Which cohort? |
| **CourseOffering** | **M3** | **Who teaches this course to that cohort?** |

**An offering never touches curriculum.** Credits, requirement and term placement stay on the
curriculum entry, which is immutable once published. An offering carries no credits at all: a
transcript reads them from the student's own curriculum version, which is what makes a 2024
student's record stable while the 2026 regulation changes.

## 2. Identity

`(section, course, component)`.

- **The term is not in the key**, because a section already carries its term. Restating it would
  allow an offering whose term contradicts its section's, which is a class of bug worth making
  unrepresentable.
- **Component** is `lecture`, `lab` or `tutorial`. Indian engineering colleges routinely staff a
  lab separately from its lecture, with different rooms and different faculty. Without this the
  same course could not be offered twice to one section, and colleges would fake it with
  duplicate course codes. One column buys the correct model.
- **The same course is not offered twice to one section in the same component.** That is a data
  error, enforced by a partial unique index over non-cancelled offerings.

Cross-listing one offering to two sections is deliberately **not** modelled. No current
requirement asks for it, and it would complicate attendance for a case that may never arrive.

## 3. Instructor assignment

**No new identity.** An instructor is a `person` with `person_type = 'staff'`, owned by M1. M3
owns only the relationship.

A separate table, not a column on the offering, for one reason that decides it: **history**. When
a teacher changes mid-term, attendance taken in week three was taken by the previous teacher.
A column would overwrite that; a table with `valid_from` and `valid_to` preserves it.

- **Assignments are never deleted.** Reassignment ends the current one and opens the next, so the
  question "who was teaching on 14 August" always has an answer.
- **One lead at a time.** A `role` of `lead`, `co` or `assistant`, with a partial unique index
  admitting one live `lead` per offering. Co-teaching is real; ambiguity about who owns the class
  is not.
- **A person is assigned once per offering at a time**, in any role, so the same teacher cannot
  be both lead and co.

## 4. Lifecycle, and how it meets Section's

Offerings mirror Section's states so there is no second vocabulary: `planned`, `active`,
`completed`, `cancelled`.

The interaction is asymmetric, and deliberately so.

- **An offering cannot become active while its section is not.** Teaching a cohort that has not
  started is meaningless. Enforced by trigger.
- **Completing a section completes its active offerings**, in the same transaction, each audited.
  The term ending is the natural end of its teaching, so requiring an operator to close fifty
  offerings by hand at term end would be friction with no safety benefit.
- **Cancelling a section is refused while any offering is active**, naming them. Cancellation is
  exceptional and means the teaching should not have happened, which is a different claim from
  "the term ended". That deserves an explicit decision per offering, in the spirit of AD-27.

Cancelling an offering requires a reason. Attendance may already reference it, so the record
stays and is marked, never removed.

## 5. Authorization: one decision point, two questions

The blueprint states that `teaching_assignments` is "the authorization source for every teacher
action". Taken literally that contradicts AD-1, under which role assignments are the sole source
and `can()` is the only decision point. Two sources would be the second permission system this
slice must not create.

**The resolution: they answer different questions.**

- **May this person do it at all?** A role assignment, decided by `can()` in M1. Unchanged.
- **To which offerings does that reach?** An instructor assignment, owned by M3.

A role assignment is a *permission*. An instructor assignment is a *reach constraint on data*.
Recorded as AD-40.

Concretely:

- `GET /v1/me/teaching` needs no new permission. Any authenticated person may read their own
  teaching, and the set is derived from `req.actor.sub`, never from anything the client sends.
- Administrative reads use `offering.read` at institution scope, exactly as sections do.
- Write paths that arrive later, attendance being the first, will require **both**: the role
  permits the action, and an active instructor assignment covers the offering. That is the
  "additionally constrained by assignment" combination, and it lives in one place rather than
  scattered through controllers.

## 6. Database-enforced invariants

Where violation would corrupt teaching history:

1. **Offering identity unique** per section, course and component among non-cancelled offerings.
2. **An offering's section and course never change once active**, by trigger, for the same reason
   Section freezes: attendance will reference the offering by identity.
3. **An offering cannot activate before its section does**, by trigger.
4. **One live lead instructor** per offering, by partial unique index.
5. **One live assignment per person per offering**, by partial unique index.
6. **Assignment periods do not run backwards**, by check.
7. **Terminal states are terminal**, by trigger.

## 7. Clients, as built

**Web — the administrator's workspace.** One screen carries the whole relationship: the cohort,
the courses taught to it, and who teaches each, term by term.

- **Assignment is contextual.** The instructor is shown on the course row and changed from the
  course row. There is no separate screen to navigate to and no lost place in the list.
- **A refusal is explained in words.** An offering that cannot start says why on the row, rather
  than presenting a disabled button whose tooltip a keyboard user would never reach. The server
  states `can_activate`, so the client never reimplements the rule to draw a control.
- **The course picker starts from the curriculum.** It offers what the published regulation
  expects for that cohort's term, with the full catalogue one deliberate click away, so teaching
  something outside the regulation is a visible choice rather than an accident.
- **Filters answer the question of the week.** Term, program, status, free-text over course and
  instructor, and one pill for the only question that matters at the start of a term: what still
  has nobody assigned. Filtering happens on the loaded term, so a keystroke costs no request.
- **Cancellation asks why, in the product's own language.** A shared reason drawer, not a browser
  prompt, and the reason is required because a bare cancellation explains nothing later.

**Flutter — the teacher's own teaching.** `GET /v1/me/teaching` and nothing else.

- **Grouped by the class they walk into**, because a teacher thinks in cohorts, not in offering
  records, and the same cohort recurs across two or three courses.
- **Stated in a teacher's words.** `planned` is shown as "not started". The administrator's
  vocabulary stays in the console.
- **Finished terms are out of the way, never lost**, behind one disclosure with a count.
- **No college-wide section list, and no attendance.** The first is an administrator's surface and
  lives in the web console; the second is M4.
- **The shell became authority-aware** to make this possible without showing a faculty member an
  administrator's screens. It reads the resolved permission set once per session and builds its
  tabs from it, so an unusable surface is absent rather than disabled. Recorded as AD-43.
- **`TeachingRepository` is a domain port**, so the cubit is tested without a server and the
  transport can change without touching presentation.

## 8. What this slice does not build

- **Timetable, rooms and class sessions.** Attendance needs a session, and a session needs a
  timetable. That is the next thing M3 owes M4, and it is not started.
- **Attendance, marks, or anything recorded against an offering.** M4 onward.
- **Cross-listing** one offering to two sections, as explained in §2.
- **Student enrolment into a section.** M5 owns the student, and section capacity is currently a
  stated number rather than an enforced count for exactly that reason.
