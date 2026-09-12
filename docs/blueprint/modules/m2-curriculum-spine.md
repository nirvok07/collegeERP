# M2 — Curriculum Spine

**Design, before migration.** AD-3 fixed the principle: curriculum is versioned by regulation
year and frozen once published. It did not fix the model. This document does, because the
database model must follow the historical invariant rather than the reverse.

## 1. The invariant everything serves

> A curriculum version that any student has been admitted under must remain readable, exactly as
> it was, for as long as that student's record exists. Recomputing their graduation requirements
> ten years later must produce the same answer it produced on their first day.

Everything below is a consequence of that sentence.

**What this forbids, concretely.** A mutable "current curriculum" row. Editing a published
requirement. Deleting a retired version. Deriving history from `updated_at`. Resolving a
student's requirements through "the program's courses" rather than through their own version.

## 2. Three entities, not one

The most common failure in this domain is collapsing these together. They have different
lifetimes, different owners and different mutability.

| Entity | Question it answers | Lifetime | Mutable after publication |
|---|---|---|---|
| **Program** | What qualification does this college award? | Decades | Yes, its descriptive fields |
| **Curriculum version** | What did that qualification require, under regulation X? | Permanent once published | **No** |
| **Course** | What is this subject, as a catalogue entry? | Decades | Its title, narrowly. Never its identity |
| **Curriculum entry** | What role does that course play *in this version*? | Bound to its version | **No** |

**Course is not the same thing as its placement in a curriculum.** A course is a catalogue
entry: `CS301, Operating Systems`. Its placement is version-specific: in the 2024 regulation it
is a core course worth 4 credits in semester 5; in the 2026 regulation the same course is worth
3 credits and sits in semester 4. Putting credits on the course would make the 2024 student's
transcript change when the 2026 regulation was written. That is precisely the failure AD-3 exists
to prevent, and it is why `curriculum_entries` is a separate entity rather than a join table with
extra columns bolted on.

## 3. Curriculum version identity and lifecycle

**Identity** is `(program, regulation_year, revision)`. Not a timestamp, not a surrogate alone.
The regulation year is what a registrar, a student and a university all say out loud. The
revision exists for the second entity in section 5.

**Effective period** is expressed as the regulation year plus the set of student cohorts bound
to it. Deliberately *not* a date range: two versions can be simultaneously in force, because a
2024 cohort and a 2026 cohort are both studying right now. A date-range model answers "which
curriculum is current" and that is the wrong question. The right one is "which curriculum applies
to this student", and only a binding can answer it.

```
draft ──publish──▶ published ──supersede──▶ superseded
  │                    │                         │
  └──discard──▶ discarded                        └── retained forever
```

- **draft** is freely editable and invisible to students. It may be discarded.
- **published** is immutable. No update path exists in the application, and the database grants
  no update on entries belonging to a published version.
- **superseded** is still readable and still governs its bound cohorts. It is not an archive.
  A superseded version is the live, authoritative answer for every student admitted under it.
- **discarded** applies only to drafts that were never published.

There is no "retired" state that stops a version answering questions, because a version stops
being asked only when its last student's record is deleted, which is never.

## 4. How a student becomes bound

A student is bound to exactly one curriculum version at admission, and the binding is recorded
on the student's own record rather than inferred from their program and admission year.

Inference would break the moment a college publishes a regulation mid-year, admits a late cohort
under the old one, or corrects a batch's binding after an error. The binding is a fact, so it is
stored as one.

**M2 owns curriculum versions. M5 Student Records owns the binding.** M2 has no knowledge of
students, which keeps the dependency pointing one way: student records read curriculum, never
the reverse. A student admitted after a new regulation is published is bound to the new one;
existing students are untouched, because nothing about them is derived.

## 5. Correction after publication

Real colleges discover a typo in a published curriculum. Two mechanisms, and choosing between
them is a human decision the system must force rather than guess.

**Errata, for a mistake in transcription.** A credit recorded as 4 that the approving body always
intended as 3. Modelled as a new revision of the same regulation year: `(CSE, 2024, r2)`
supersedes `(CSE, 2024, r1)`, both are retained, and the binding of every affected student moves
explicitly with a recorded reason. History remains reproducible because r1 is still there and the
audit trail says why the move happened.

**Amendment, for a genuine change of requirements.** A new regulation year. Existing cohorts stay
where they are.

The distinction matters: an erratum rebinds students, an amendment does not. Silently allowing
one to behave like the other is how graduation requirements change under people's feet.

## 6. Course identity and mutability

A course's **code is its identity within the tenant and never changes**, because it appears on
transcripts, in university returns and in records outside this system. The title may be corrected,
which is a display concern and does not alter what was required.

Everything version-specific lives on the curriculum entry: credits, semester, whether it is core
or elective, its elective group, its sequence. The same course therefore appears in many versions
with different values, which is the normal case rather than an exception.

**Historical reads resolve through the entry, never through the course.** A transcript renders
credits from `curriculum_entries`, so correcting a course title in 2030 changes how a 2024
transcript reads its name and changes nothing about what it was worth.

## 7. Program

A program is the qualification: B.Tech Computer Science. It belongs to a **department**, which
M2 already owns, so nothing about organisational ownership is duplicated here.

Its lifecycle is `active` and `archived`, mirroring campuses and departments for consistency.
Archiving is refused while any curriculum version under it is published, for the same reason
archiving a department is refused while authority is scoped to it: the consequence would be
hidden at the moment of the decision.

## 8. Section scope: identified, not built

Section scope is currently declarable and unresolvable. It appears in the `scope_type` constraint
and in the Faculty role's allowed scopes; no table defines a section; the scope resolver returns
empty ancestry for it; and the web client already excludes those roles from grant.

**A section is not a curriculum concept and must not be built here.** A section is a teaching
group: students taught together, in a term, under a timetable. It depends on an academic year, a
term and an intake of students, none of which exist yet.

**Proposed owner: M3 Teaching Operations**, alongside timetable and the session occurrence,
because a section's whole purpose is to be scheduled and taught. Its ancestry would be
`section → program → department → campus`, which the existing resolver already walks once the
rows exist.

This slice deliberately changes nothing about section scope. It records the boundary so the
reference stops being ownerless.

## 9. Ownership

| Fact | Owner | Not owned by |
|---|---|---|
| Program existence, lifecycle | M2 | M4 Admissions, which references it |
| Curriculum version, state, immutability | M2 | Anyone |
| Course catalogue identity | M2 | M3, which schedules offerings of it |
| Version-specific credits and placement | M2, on the entry | The course |
| Which version a student follows | **M5 Student Records** | M2, which has no student knowledge |
| Sections | **M3 Teaching Operations**, not yet built | M2 |
| Who may author curriculum | M1, through `department.manage` | M2 |

## 10. Open decision, needed before the migration

**OD-M2-1. Does a curriculum version belong to a program alone, or to a program within a
campus?**

A multi-campus institution may run B.Tech CSE at two campuses under one regulation, or under
different ones. The first is far more common; the second happens when campuses are separately
affiliated.

*Recommended default:* the version belongs to the program, and a program belongs to one
department, which belongs to one campus. A campus running its own variant therefore has its own
program record. This keeps the model simple and matches how affiliation actually works.

*Cost of being wrong:* if colleges genuinely share one program across campuses with divergent
curricula, this forces duplicate program records. Reversible, but it would mean re-pointing
bindings, which is exactly the operation this design exists to make rare.

Proceeding on the recommended default, recorded as an assumption rather than a silent choice.
