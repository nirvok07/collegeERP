# M8 — Coursework and Feedback

Blueprint module M8, domain D4, phase 3. **Status: ❌ not built.**

## 1. Scope, deliberately narrow

`03-modules.md` §3.2 rejected a learning management system outright: *"Content delivery, video and
quizzing is a different product. M8 covers coursework handover only, and integration is the right
answer if a college wants an LMS."*

That rejection stands, and this document does not reopen it. M8 is **handover**: a teacher sets
work, students submit it, the teacher returns it with a mark that flows to M9. Nothing else.

What M8 is **not**: content hosting, video, discussion forums, quiz engines, proctoring, or a
gradebook separate from M9. Each of those is where an ERP turns into a bad LMS.

## 2. What this module owns

Assignments and their deadlines, submissions, late policy, return with feedback, plagiarism-check
handover, and course feedback surveys.

It does **not** own: the mark (M9 Internal Assessment owns it — M8 produces a mark *proposal* that
M9 records against its assessment plan), the offering (M3), the session (M6), or files (P3).

## 3. The boundary with M9 that keeps this honest

M9 already owns assessment plans, mark sheets, verification and correction
(`m7-internal-assessment.md`). An assignment in M8 **maps to a component of M9's plan** or it does
not count toward anything.

So the flow is: M8 collects and evaluates → emits `coursework.evaluated` → M9 records the mark
against its plan, under its own verification rules (AD-53's discipline: correction is the head of
department's authority, not the teacher's).

If M8 stored its own marks, a student would have two grades for one piece of work and no rule for
which wins. This is the `03-modules.md` §3.3 rule — no module stores another's authoritative fact —
applied to the one place it is most tempting to break.

## 4. Permissions

```
coursework.read       normal     See assignments, own submissions
coursework.submit     normal     Submit work
coursework.manage     normal     Create assignments within an offering (AD-40 reach)
coursework.evaluate   normal     Mark and return
feedback.respond      normal     Answer a course feedback survey
feedback.read         sensitive  Read aggregated feedback
```

`coursework.manage` is bounded by AD-40: a role grants the permission, the instructor assignment
limits which offerings it reaches.

## 5. Entities

```
assignment        offering (M3), plan_component (M9, nullable), title, brief, attachments[] (P3),
                  assigned_on, due_at, max_marks, late_policy, group_work, state, version
submission        assignment, student|team, submitted_at, files[] (P3), text, state,
                  late_by_minutes, version
evaluation        submission, marks, feedback, rubric_scores{}, evaluated_by, at,
                  returned_at, m9_ref
rubric            assignment, criteria[], weights
plagiarism_check  submission, provider_ref, score, report_id (P3), state
course_feedback   offering, term, questions[], opens, closes, anonymous
feedback_response course_feedback, respondent_sealed, answers[], at
```

## 6. Invariants

- Submission after `due_at` is accepted and **marked late**, never silently refused — the late
  policy decides the penalty, and a hard block means a student with a genuine problem has no record.
- One active submission per student per assignment; resubmission supersedes, both kept.
- Marks may not exceed `max_marks`.
- An evaluation with a `plan_component` emits to M9; without one it is formative and carries no weight.
- Group submissions attach to a team; every member's record links to the same submission.
- `feedback_response` identity is **sealed** (AD-63) for anonymous surveys and never unsealed —
  unlike M21's grievance identity, there is no investigative reason that justifies it.
- Files go through P3 with the assignment's own read permission.
- Tenant RLS with FORCE.

## 7. Course feedback, and the rule that makes it usable

Feedback is collected per offering per term, anonymously, and **released to the teacher only after
results are published** (M10). Releasing it earlier means a student evaluating a teacher who has
not yet graded them, which makes both the feedback and the grade suspect.

Aggregates are shown to the teacher and the HoD; individual responses are never attributable. A
minimum response threshold applies before any aggregate is shown, or a class of six makes anonymity
arithmetic rather than a promise.

## 8. Notifications (P2) and scheduled work (P9)

Student: assignment posted, due in 48 hours, due today, returned with feedback, feedback survey open.
Teacher: submissions received, evaluation pending, deadline passed with n non-submissions.
Jobs: due reminders, late-marking at deadline, non-submission report to the teacher, feedback window
transitions, feedback release after result publication.

## 9. Reports (P5)

Submission rate by assignment and offering. Non-submitters — a pastoral signal, and often the first
visible sign of a student in difficulty. Evaluation turnaround by teacher. Mark distribution per
assignment. Plagiarism-score distribution. Course feedback aggregates by offering, teacher and
department.

## 10. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Assignment list and detail | ✅ | ✅ **primary for students** |
| **Submit** (files, camera, text) | ✅ | ✅ **primary** (P3) |
| My submissions and feedback | ✅ | ✅ **primary** |
| Create assignment | ✅ **primary** | ✅ |
| **Evaluate and return** | ✅ **primary** | ✅ — reuses the mark-sheet interaction |
| Non-submitter list | ✅ | ✅ |
| Feedback survey | ✅ | ✅ **primary** |
| Feedback aggregates | ✅ **primary** | ✅ read |

Evaluation on Flutter reuses M9's existing mark-sheet screen and its offline-safe submit (AD-58,
AD-59), because it is the same act against the same plan.

## 11. Edge cases

- Submits, then the deadline is extended → late flag recomputed.
- Group member contributes nothing → per-member mark override on a group submission, recorded.
- File too large or wrong type → P3's declared kind limits apply, checked client-side first.
- Teacher changes mid-term → evaluation reassigns; the instructor assignment (M3) governs reach.
- Plagiarism provider unavailable → submission stands, check queued; never block a submission on
  a third party.
- Student exits mid-term with work submitted → work and marks stand.
- Feedback window closes with three responses → aggregate withheld below the threshold (§7).
- Assignment mapped to an M9 component that is later removed → the mapping is refused while
  evaluations exist (AD-34's freeze-on-use discipline).

## 12. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| CW-1 | Assignments, brief, attachments, due dates | S, W, F | M3, P3 |
| CW-2 | **Submission with files and late marking** | S, W, F | P3 |
| CW-3 | Evaluation, rubrics, return with feedback | S, W, F | — |
| CW-4 | **Mark handover to M9** (§3) | S | M9 |
| CW-5 | Group work and teams | S, W, F | — |
| CW-6 | Non-submitter tracking and reminders | S, W, F | P2, P9 |
| CW-7 | Plagiarism provider integration | S | P8 |
| CW-8 | Course feedback with sealed identity and release rule | S, W, F | AD-63, M10 |
| CW-9 | Reports | S, W, F | P5 |

## 13. Cross-module impact

Reads M3 (offering, instructor assignment per AD-40), M6 (sessions), M5 (enrolment). Hands marks to
M9 (§3). Feedback release gated on M10. Depends on P2, P3, P5, P9, AD-63.
