# M7 Internal Assessment

Implementation module M7, which is blueprint module M9 (AD-44). The first half of roadmap
Phase 6. **Design before migration.**

## 1. Why this is the slice, and why it stops where it does

The roadmap puts Phase 6, Exams and results, after Attendance. That phase mixes two modules the
blueprint deliberately keeps apart:

- **M9 Internal Assessment** belongs to the teaching faculty within a course.
- **M10 Examinations and Results** belongs to the Controller of Examinations and, where the
  college is affiliated, partly to the university.

Blueprint 3's ownership table settles the seam: *internal assessment marks* are M9's and are
consumed by M10, while the `marks.published` event, which is what makes a mark visible to a
student, is M10's.

OD-1, affiliating or autonomous, is still open, and it decides almost everything about M10. It
decides nothing about M9: assumption S4 makes the college the authority for internal assessment
in both cases. So internal assessment can be built correctly now, and examinations cannot.

**Not built here, each for a reason:**

| Not built | Why |
|---|---|
| Students seeing their marks, report cards | No student role exists on any client, and publication is M10's event |
| Internal totals, grades, pass or fail | How absent and exempt count is examination policy; the grading scheme it needs does not exist |
| Eligibility from attendance percentage | M10, and it needs attendance counting rules this project has not decided |
| HOD verification as an approval workflow | The approvals capability P1 is unspecified; verification is a permission-gated transition instead, as AD-53 did for corrections |
| End examinations, university result mirror | OD-1 |

## 2. Entities

**AssessmentComponent.** One measured piece of a course's internal assessment: Test 1,
Assignment 2, Lab record. It belongs to one course offering and carries a name, a kind, maximum
marks, a weight, and the date it was held. It is also the mark sheet: its status is the state of
the act of marking. A separate sheet table, as attendance has, is not needed here, because M7
owns the component outright; attendance needed one only because M4 owns the session.

**AssessmentMark.** One student's result on one component. Exactly one per student per
component.

**AssessmentMarkCorrection.** A change to a submitted mark, append-only, applied by the database
when it is inserted. The same mechanism as attendance corrections (AD-51).

## 3. A mark is not just a number

Each mark carries a **status** as well as a score.

| Status | Score | Means |
|---|---|---|
| `scored` | 0 to maximum marks | The student sat the assessment and earned this |
| `absent` | none | The student did not sit it |
| `exempt` | none | The student was excused: medical, duty leave |

Absent is not zero, and exempt is not absent. A register that stores a missed test as 0 has
already made a policy decision, whether the missed test counts against the student, that belongs
to the examination rules. Recording what happened keeps that decision where it belongs and keeps
the record true either way.

Scores allow two decimal places, because half marks are routine. Zero is a valid score, and
distinct from absent.

## 4. Who does what

| Act | Who | Where | Authority |
|---|---|---|---|
| Define the plan: components, maximum marks, weights | Head of department, administrator | Web | `assessment.plan` |
| Record when a component was held | The teacher of the course | Flutter, web | `assessment.mark`, bounded by reach |
| Enter marks | The teacher of the course | Flutter, web | `assessment.mark`, bounded by reach |
| Submit the sheet | The teacher of the course | Flutter, web | `assessment.submit`, bounded by reach |
| Verify a submitted sheet | Head of department | Web | `assessment.verify` |
| Correct a submitted mark | Head of department, administrator | Web | `assessment.correct` |

**The plan is departmental.** In Indian colleges the internal assessment scheme is fixed per
course by regulation or by the department, not invented by each teacher. Blueprint 2 D5 says the
same: "define an assessment plan per course from the grading scheme".

**Marking is the teacher's, on the teacher's client.** Faculty use Flutter (AD-24), so entering
marks and submitting live there, shaped like attendance. The web also accepts entry, for an
administrator transcribing a paper sheet.

**AD-40 holds unchanged.** A permission says a person may do something; the instructor assignment
says which courses it reaches, read by the same `TeachingReachReader` attendance uses. Acting
administratively is decided by scope breadth, as in AD-53: holding the permission
institution-wide is what lets an administrator enter a sheet for a teacher who cannot.

## 5. Lifecycle

```
draft ──submit──▶ submitted ──verify──▶ verified
  └──cancel──▶ cancelled
```

- **draft** — the plan may be edited and marks may be entered.
- **submitted** — the teacher's statement of the results. Marks change only by correction.
- **verified** — the head of department has accepted it. Marks still change only by correction.
- **cancelled** — a component that was planned and never held. Allowed only from draft, only
  while no mark exists, and with a reason.

**There is no return to draft.** A head of department who finds an error corrects it, with a
reason, rather than unlocking the sheet for the teacher. This is AD-51's rule applied again: an
unlock invites quiet edits to history, and a correction states that history was wrong.

## 6. What freezes, and when

| Field | Frozen when | Why |
|---|---|---|
| Maximum marks, weight | The first mark exists | A 45 out of 50 would become 45 out of 40 |
| The date held | The first mark exists | The roster is resolved as of that date, so moving it would change who was expected |
| Any mark | The sheet is submitted | After that, only a correction changes it |
| Everything | The sheet is verified or cancelled | Terminal |

## 7. The roster, and the date it is taken on

The roster of a component is every student whose enrolment in the course was live **on the date
the component was held**, never today. That is AD-50's rule, reused rather than restated. A
student who withdrew in week ten still appears on the week-three test; one who joined in week six
does not.

So a component needs a date before any mark can be entered. A test that has not been given a date
has not happened.

## 8. Weights

Weights are percentages of the internal total. Their sum across one course's components may not
exceed 100, enforced by the database. It need not equal 100 while the plan is being built,
because plans are built one component at a time. Whether a plan must total 100 before it is
used, and how weights combine into a total at all, is results policy and belongs to M10.

## 9. Invariants the database enforces

| Invariant | Mechanism |
|---|---|
| Maximum marks positive, weight between 0 and 100 | Check constraints |
| Weights of one course sum to no more than 100 | Trigger |
| One mark per student per component | Unique index |
| A score lies between 0 and the component's maximum | Trigger |
| A scored mark has a score; absent and exempt have none | Check constraint |
| The student was enrolled in that course on the date held | Trigger |
| No mark before the component has a date, or after it is cancelled | Trigger |
| Maximum marks, weight and date freeze once a mark exists | Trigger |
| A submitted or verified mark changes only through a correction | Trigger |
| Lifecycle transitions valid, terminal states terminal | Trigger |
| A correction states a reason, and applies itself | Check constraint and trigger |
| Everything shares one tenant | Trigger and row-level security |

Concurrency is optimistic, on the component's `version`, exactly as AD-52 does for attendance.
A sheet of sixty marks is one request and one transaction.

## 10. Clients

**Flutter, the teacher.** From My Teaching, a course shows its components. A component opens a
mark sheet: record the date if it has none, then one row per student with a numeric field and a
quick absent or exempt choice. Save sends one batch; submit closes it. Unsaved marks survive a
failed save, as in attendance. No plan editing on the phone.

**Web, the department.** The plan editor lives on the course itself in the teaching workspace,
beside the weekly timetable, because the plan is a property of the course. A verification queue
lists submitted sheets awaiting a head of department. A sheet view shows every mark with who
entered it, and corrections with their reasons.

## 11. Cross-module impact

- **Consumes** M3's course offering and instructor assignment, M5's roster, M1's authority.
- **Provides** internal assessment marks, which M10 will consume when it exists.
- **Owns nothing in any other module**, and writes to none of them.
