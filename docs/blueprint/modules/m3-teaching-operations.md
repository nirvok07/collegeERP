# M3 — Teaching Operations, slice one: Section

**Design before migration.** AD-36 gave M3 ownership of Section without defining it.

## 1. What a Section is, and what it is not

Three approved artifacts agree, and they matter more than intuition here.

- Blueprint 1's organisational tree places `Section / Batch` under `Term`, annotated "the actual
  teaching group", with `Enrolment` below it as `student × course × term`.
- Blueprint 2's entity list names **both** `Section` and `CourseOffering (course × term × section)`
  as separate things.
- M1's scope contract states that a section target yields `[section, program, department, campus]`.

> **A Section is a cohort of students within a program, for one term.**
> B.Tech Computer Science, year 3, section A.

It is **not** an offering of a course. The course-level object is **CourseOffering**, which is
`course × section × term` and carries the instructor. That is the next slice.

Why the distinction earns its place:

- **Section-scoped authority resolves.** A faculty member scoped to a section can see that group
  of students. If Section were course-shaped, its ancestry could not reach a department, because
  a course has no department, and M1's stated chain would be impossible.
- **One group, many subjects.** A section studies eight courses in a term. Modelling Section as
  course-shaped would create eight sections where a college sees one, and a class teacher's
  authority would have to be granted eight times.
- **Attendance and results attach to the right thing.** Attendance is taken for a course taught
  to a section on a date. That is the offering, and it needs both to exist.

## 2. Academic period belongs to M2, not M3

A section needs a term. A term needs an academic year. Blueprint 2 assigns both to **D2 Academic
Structure**, which is M2.

Neither exists in the schema. So this slice adds them **to M2**, attributed correctly rather than
quietly absorbed into M3. M3 references a term and never defines one.

**Terminology, fixed and not to be re-invented.** An **academic year** is the institution's yearly
cycle, named as the institution names it, such as `2026-27`. A **term** is a division inside it,
numbered, and is a semester or an annual term depending on the program's `term_type`, which
already exists on `programs`. There is no third word: no phase, no session, no period.

Exactly one academic year per institution is current, enforced by a partial unique index, because
"the current year" must be unambiguous for every downstream module that asks.

## 3. Section identity

`(program, academic_year, term_number, label)`.

A program's year 3 section A in 2026-27 is one section. The same label in a different year is a
different section, which is why the academic year is part of the identity rather than a filter.

`term_number` is the term within the program, 1 to `total_terms` on its curriculum, so year 3
semester 1 of a four-year semester program is term 5. This matches how `curriculum_entries`
already places courses, so a section's expected courses are derivable by joining the student's
curriculum version on the same term number. No duplication.

**Deliberately absent from Section:** course, instructor, room, timetable, capacity enrolled.
The first two belong to CourseOffering, the next two to the timetable, and the last to enrolment.

Capacity is present, because it is a property of the group itself and admissions needs it to
allocate seats before any offering exists.

## 4. Lifecycle

```
planned ──open──▶ open ──activate──▶ active ──complete──▶ completed
   │                 │                  │
   └──cancel─────────┴──────cancel──────┘
                                          cancelled
```

Four states, each justified by something a college actually does.

- **planned.** Created for a coming term. Freely editable, no students, not yet visible to
  teaching staff. This is the working state during admissions planning.
- **open.** Accepting students. Admissions may allocate into it; capacity now matters.
- **active.** Teaching has begun. The label and program are frozen, because attendance and
  results will reference this section by identity. Capacity may still rise, since colleges add
  seats mid-term more often than anyone would like.
- **completed.** The term ended. Terminal and read-only. Its records remain, because attendance
  and results for the term point at it forever.
- **cancelled.** Terminal. Permitted only while no student is enrolled, for the same reason AD-27
  refuses archiving a department with authority scoped to it: cancelling out from under enrolled
  students would hide the consequence at the moment of the decision.

No `draft`, because `planned` already covers it. No `archived`, because `completed` is the archive
and a completed section is still the authoritative answer for its term.

**Reversibility.** `open → planned` is allowed while empty, since an administrator opening the
wrong section should be able to take it back. Nothing returns from `active`, because attendance
may already reference it. Nothing returns from `completed` or `cancelled`.

## 5. Ownership

| Fact | Owner | Notes |
|---|---|---|
| Academic year, term | **M2** | Added in this slice, under M2 |
| Section existence, lifecycle, capacity | **M3** | This slice |
| Which program a section belongs to | M2 owns the program; M3 references it | |
| Course taught to a section, instructor | **M3, next slice** as CourseOffering | Not here |
| Which students are in a section | **M5 Student Records** | M3 exposes a count, owns no student |
| Timetable, rooms | **M3, later** | |
| Section ancestry for authorization | M3 supplies, **M1 decides** | One authorization path |

M3 exposes section occupancy through a declared capability, exactly as M1 exposes scope occupancy
to M2 under AD-28. No module reads another's tables.

## 6. Authorization

No new permission system. Two permissions on the existing catalogue:

- `section.read` for viewing, granted to roles that already hold `person.read`
- `section.manage` for creating, opening, activating, completing and cancelling

Section ancestry is added to `OrgTreeReader`, so `scopeContains` resolves
`section → program → department → campus` with no change to `scopeContains` itself. That is the
point at which the Faculty role's long-declared section scope becomes grantable.

## 7. Invariants worth database enforcement

Where violation would damage operational history:

1. **One section per identity.** Unique on program, academic year, term number and label among
   non-cancelled sections. A cancelled label is reusable; a live duplicate is not.
2. **One current academic year** per institution.
3. **A section's program and academic year never change once active**, by trigger. Attendance and
   results will reference the section by identity, and re-pointing it would silently move records
   between cohorts.
4. **Terminal states are terminal**, by trigger.
5. **Term number within range.** A term beyond the program's duration is a data error.

## 8. Mobile

Genuinely mobile from the start, unlike curriculum authoring. A teacher opening the app to see
which groups they teach is a real phone workflow, and it is the reader that makes attendance
possible later.

**This slice defers Flutter**, for one honest reason: a teacher's sections are derived from
instructor assignment, which lives on CourseOffering and does not exist yet. Building a section
list on mobile now would show an administrator's view of every section in the college, which is
not a mobile workflow. Flutter lands with the next slice, when there is a teacher to show it to.
