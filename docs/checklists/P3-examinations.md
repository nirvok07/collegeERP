# P3 — M10 Examinations and Results

Doc: `docs/blueprint/modules/examinations-and-results.md`.
🚫 **Gated on AD-91 (P0-5).** Do not start until the owner answers OD-1.

**Module layout:** `server/src/modules/examination/…`, `clients/web/src/features/examination/`,
`lib/features/examination/`.

**Mode tags:** `both` · `affil` affiliating only · `auto` autonomous only.

---

## M10-1 — Confirm AD-91 and flag the modes

- [ ] `DOC` AD-91 confirmed by the owner and written into `adr.md`
- [ ] `S` P8 capability flag `examination.autonomous_engine`, per tenant, evaluated server-side
- [ ] `S` Flag gates M10-10…M10-12 only; everything else serves both modes
- [ ] `TEST` A tenant without the flag cannot reach engine endpoints

## M10-2 — Sessions, schedule, halls, seating, invigilation `both`

- [ ] `MIG` `exam_session`: tenant, academic_year, term, kind(regular|supplementary|revaluation), state
- [ ] `MIG` `exam_schedule`: session, offering, date, start, duration, max_marks
- [ ] `MIG` `hall`: tenant, campus, room (M6), capacity
- [ ] `MIG` `seating`: schedule, student, hall, seat_no
- [ ] `MIG` `invigilation`: schedule, hall, invigilator (M13), state
- [ ] `MIG` Unique: a student is seated once per slot, in one hall
- [ ] `MIG` Trigger: seating per hall may not exceed capacity
- [ ] `MIG` RLS FORCE; GRANTs; invariants test
- [ ] `SVC` Schedule conflict detection: a student with two papers in one slot
- [ ] `SVC` Seating allocation strategy (sequential, or mixed-program anti-copying)
- [ ] `SVC` Rooms are requested from M6, which owns them (AD-46) — never booked directly
- [ ] `API` `/v1/exam/sessions`, `/schedules`, `/halls`, `/seating`, `/invigilation`
- [ ] `WEB` Session setup, schedule grid, seating plan — **web primary**
- [ ] `APP` Schedule and seating read; 🔴 **invigilation duty on the phone is the real use**
- [ ] `TEST` Double-seating refused; over-capacity refused; clash detected

## M10-3 — Registration, eligibility, fee, hall ticket `both`

- [ ] `MIG` `exam_registration`: session, student, offering, state, fee_invoice, hall_ticket_no
- [ ] `MIG` Gapless `hall_ticket_no` per session
- [ ] `SVC` 🔴 Eligibility rule lives here, **data stays with its owner** (AD-28):
  - [ ] Enrolled in the offering (M5, AD-4)
  - [ ] Attendance ≥ threshold — **asked of M7 as of the cut-off date, never stored** (AD-7)
  - [ ] Exam fee paid (M11)
  - [ ] No disciplinary bar (M21; returns clear until M21 exists)
- [ ] `SVC` Threshold from P8 settings, not hard-coded
- [ ] `SVC` Shortage condonation as a P1 approval: HoD → Principal, reason required, audited.
      One of the most contested actions in a college — it must trace to a person
- [ ] `SVC` Exam fee invoice via M11 (AD-6)
- [ ] `API` `/v1/exam/registrations`, `/eligibility`, `/hall-ticket`
- [ ] `WEB` `APP` Registration; eligibility shown **with the failing criterion named**
- [ ] `APP` 🔴 **Hall ticket phone-primary**, PDF via P3/P4
- [ ] `TEST` Ineligible student refused, with the reason
- [ ] `TEST` Condonation without approval refused

## M10-4 — Grading scale `both`

- [ ] `MIG` `grading_scale`: tenant, curriculum_version, bands, pass_rule, version
- [ ] `SVC` Versioned and **frozen on use** (AD-34 discipline)
- [ ] `SVC` A result records the `rule_version` that produced it
- [ ] `WEB` Scale editor with a preview of band boundaries
- [ ] `TEST` A scale in use cannot be edited; a new version is required

## M10-5 — Mark aggregation `both`

- [ ] `MIG` `mark_component`: session, student, offering, kind(internal|external|practical|viva), marks
- [ ] `MIG` CHECK marks ≤ `max_marks`
- [ ] `SVC` Reads internal marks from M9; **never copies them** into a second source of truth
- [ ] `SVC` Weights from the curriculum (M3); computed, not stored, until publication
- [ ] `TEST` A corrected internal mark (M9) changes the computed total before publication

## M10-6 — External mirror and import adapters `affil` (AD-8)

- [ ] `MIG` `external_mark`: session, student, offering, marks, source, imported_at, batch
- [ ] `MIG` 🔴 **No UPDATE grant on `external_mark` for `erp_app`** — the mirror is read-only,
      enforced by grant, not by discipline
- [ ] `SVC` One adapter per university format, behind an interface, fixture-driven (P8 §5)
- [ ] `SVC` Import via CAP-8's pipeline: dry-run preview, per-row errors, partial commit
- [ ] `SVC` Re-import **supersedes**, recording both; a wrong mark is the university's to correct
- [ ] `SVC` `source` and `imported_at` carried so nobody mistakes the mirror for our own record
- [ ] `WEB` Import screen with preview — **web only, exception recorded**
- [ ] `TEST` An UPDATE against `external_mark` fails at the database
- [ ] `TEST` Re-import supersedes and keeps history

## M10-7 — 🔴 Result freeze and publication `both` (AD-23)

- [ ] `MIG` `result`: session, student, offering, **frozen{components, total, grade, credits,
      status}**, rule_version, published_at, published_by, version
- [ ] `MIG` `result_revision`: INSERT only
- [ ] `MIG` 🔴 Trigger: a published result is immutable
- [ ] `SVC` Publication freezes components, weights, total, grade and pass/fail with the rule version
- [ ] `SVC` **This is AD-23's single permitted stored derived value.** Schema comment carries the reason
- [ ] `SVC` Publication approval via P1: Controller → Principal — the highest-consequence approval
      after payroll release
- [ ] `SVC` A post-publication change is a `result_revision` plus a new frozen result, both
      discoverable — never an edit
- [ ] `API` `POST /v1/exam/sessions/:id/publish`
- [ ] `WEB` `APP` Publication review and approval
- [ ] `TEST` 🔴 UPDATE on a published result fails at the database
- [ ] `TEST` A revision creates a new row and keeps the old one
- [ ] `TEST` Recomputation after publication does not change the published values

## M10-8 — 🔴 Student result view `both`

**Closes the gap blocked since 2026-09-24.** Migration 017's header reserves "publication to
students, totals, grades and pass or fail" for M10 — this is where that reservation is honoured.

- [ ] `API` `GET /v1/me/results` — self-scoped, reusing the `whoAmI` pattern from `/v1/me/timetable`
- [ ] `SVC` Returns **published results only**; unpublished is invisible, not empty
- [ ] `WEB` `APP` Result view: per term, per offering, grade, credits, status
- [ ] `APP` Phone-primary; grade card PDF via the `FeeDocument` share pattern
- [ ] `TEST` A student sees only their own results
- [ ] `TEST` An unpublished result is not visible by any route
- [ ] `DOC` Remove the blocked note from `PROJECT_STATE.md`

## M10-9 — Transcript and grade card `both`

- [ ] `MIG` `transcript`: student, generated_at, frozen_payload, document_id (P3)
- [ ] `S` Generated through P4 with a gapless serial and a verification code
- [ ] `S` Eligibility: results published for every enrolled term
- [ ] `WEB` `APP` Request, issue queue, register
- [ ] `TEST` A transcript regenerated later reproduces the frozen payload, not live data

## M10-10 — Mark entry, script anonymity, double evaluation `auto`

- [ ] `MIG` `answer_script`: schedule, student, script_no, state, evaluator, document_id (P3)
- [ ] `SVC` 🔴 **Script anonymity**: an evaluator sees `script_no`, never the student. The mapping
      resolves only at result computation, through a narrow SECURITY DEFINER function (AD-61 pattern)
- [ ] `SVC` Double evaluation with a tolerance band; a third evaluation when exceeded
- [ ] `SVC` Declared evaluator conflicts (relative, own section) checked and refused
- [ ] `WEB` Mark entry grid — **web only, exception recorded** (bulk numeric entry)
- [ ] `TEST` An evaluator query cannot resolve a student identity
- [ ] `TEST` Out-of-tolerance triggers a third evaluation

## M10-11 — Moderation and grace marks `auto`
- [ ] `SVC` Committee moderation with a recorded rule and a P1 approval
- [ ] `SVC` Grace-mark application, reasoned and audited
- [ ] `WEB` Moderation workspace; `APP` read
- [ ] `TEST` Moderation without approval cannot reach publication

## M10-12 — Revaluation `auto`
- [ ] `MIG` `revaluation`: result, requested_by, fee_invoice, state, outcome
- [ ] `SVC` Fee via M11; assignment to a different evaluator
- [ ] `SVC` 🔴 Whether a revaluation may **lower** a mark is a P8 policy setting, chosen in advance
      by the tenant, not decided per case
- [ ] `SVC` Outcome that changes marks → `result_revision` (M10-7)
- [ ] `WEB` `APP` Request, track, outcome
- [ ] `TEST` A revaluation cannot silently edit the published result

## M10-13 — Supplementary sessions `both`
- [ ] `SVC` Eligibility from backlog register
- [ ] `SVC` 🔴 A supplementary result publishes **against the original term**, not the current one
- [ ] `WEB` `APP` Registration and results
- [ ] `TEST` Term attribution correct

## M10-14 — Reports (via P5) `both`
- [ ] `S` Pass percentage by program, department, term
- [ ] `S` Subject-wise analysis with difficulty indication
- [ ] `S` Toppers and classification distribution
- [ ] `S` Backlog register by student
- [ ] `S` Revaluation outcome analysis — **a high overturn rate names an evaluation problem**
- [ ] `S` Attendance-shortage list before the cut-off
- [ ] `S` Statutory academic returns

## M10-15 — Notifications (via P2) `both`
- [ ] `S` Student: registration open, fee due, hall ticket available, schedule changed,
      **result published**, revaluation outcome, supplementary eligibility
- [ ] `S` Staff: invigilation duty, evaluation deadline, moderation pending, publication approval
- [ ] `S` 🔴 **Result publication is the highest-volume notification event in the system** — an
      entire cohort at once. Size P2's queue for it; treat it as P2's load test

## M10-16 — Scheduled work (via P9) `both`
- [ ] `JOB` Registration window transitions; hall ticket generation
- [ ] `JOB` Fee-deadline reminders; evaluation-deadline escalation
- [ ] `JOB` Publication-day dispatch; supplementary window opening

---

## Edge cases to cover with tests

- [ ] `TEST` Internal mark corrected after publication → revision, never an edit
- [ ] `TEST` University re-publishes a changed result → supersede, both kept
- [ ] `TEST` **Absent is not zero** — a recorded status, distinct from a mark of 0
- [ ] `TEST` Malpractice → result withheld pending an M21 case; withheld is a state, not a missing row
- [ ] `TEST` Curriculum erratum changes credits after publication (AD-35) → results keep frozen credits
- [ ] `TEST` Student exits mid-term with marks entered but unsubmitted → marks stand, eligibility fails
- [ ] `TEST` Two students, same name, same program → resolved by enrolment number, never by name

---

## 🚧 P3 EXIT GATE

- [ ] An affiliating college can mirror, publish, and show results to students (M10-6…M10-9)
- [ ] 🔴 A published result is **provably immutable** — the UPDATE fails at the database
- [ ] A student sees their own published results and nobody else's
- [ ] The 2026-09-24 blocked item is closed in `PROJECT_STATE.md`
- [ ] Engine slices (M10-10…M10-12) are behind the flag and unreachable without it
