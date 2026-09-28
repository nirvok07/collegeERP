# M10 — Examinations and Results

Blueprint module M10, domain D5. **Status: 🚫 blocked on OD-1 since 2026-09-12.** AD-55 states the
position plainly: internal assessment is built now; examinations wait for OD-1.

`docs/MASTER-PLAN.md` proposes **AD-91** to unblock it, and that proposal is this document's
premise. AD-91 needs the owner's confirmation before any code.

## 1. The decision that blocks everything

**OD-1 — is the institution affiliating or autonomous?**

| | Affiliating | Autonomous |
|---|---|---|
| Who sets the paper | University | The college |
| Who evaluates | University | The college |
| Who owns the result | University | The college |
| The ERP's job | **Mirror**, read-only (AD-8) | **Own** the full engine |
| Degree issued by | University | The college |

`MASTER-CHECKLIST.md` §1.5 puts it at "roughly triples one module". It is a question about the
customer, not about engineering, and no amount of building answers it.

## 2. AD-91 — support both, and stop waiting

The recommended default, already recorded in `MASTER-CHECKLIST.md` §3 and unadopted for two weeks:

> Support both. Mirror external results read-only. Build the autonomous engine behind a capability flag.

This is not fence-sitting. It is the only answer that lets the product serve both kinds of
institution, which a multi-tenant SaaS (AD-22, AD-65) must eventually do anyway. The flag is P8 §3's
mechanism, per tenant.

Cost honestly stated: the mirror is small, the engine is large. AD-91 does not make the engine
cheaper — it makes the *mirror* shippable now and defers the engine's cost to a tenant that needs it.

## 3. What this module owns

Examination scheduling and conduct, mark aggregation across internal and external components,
moderation and revaluation, grading, pass/fail determination, result publication, and the academic
transcript.

It does **not** own: internal assessment marks (M9 owns them and M10 reads them), attendance
eligibility rules (M7 supplies the data, M10 applies the rule), fees (M11 — exam fees are invoices),
or certificates (P4).

## 4. The one permitted stored derived value

AD-7 forbids storing derived academic values. AD-23 declares the single exception: **a published
result**.

The reason is the same as M4's frozen merit ranking. A published result is a statement the
institution made on a date. Recomputing it later from live data — after a revaluation, a curriculum
erratum, a corrected internal mark — would silently change history. So publication freezes:
component marks, weights, total, grade, and pass/fail, with the rule version that produced them.

Everything before publication is computed on read. Everything after is read from the frozen row.

## 5. Entities

```
exam_session       tenant, academic_year, term, kind(regular|supplementary|revaluation), state
exam_schedule      session, offering, date, start, duration, max_marks
hall               tenant, campus, room (M6), capacity
seating            schedule, student, hall, seat_no
invigilation       schedule, hall, invigilator (M13), state
exam_registration  session, student, offering, state, fee_invoice (M11), hall_ticket_no
answer_script      schedule, student, script_no, state, evaluator, document_id (P3)
external_mark      session, student, offering, marks, source, imported_at, batch  -- AD-8 mirror
mark_component     session, student, offering, kind(internal|external|practical|viva), marks
grading_scale      tenant, curriculum_version, bands[], pass_rule, version
result             session, student, offering, frozen{components, total, grade, credits, status},
                   rule_version, published_at, published_by, version   -- AD-23
result_revision    result, reason, previous, revised_by, at            -- INSERT only
transcript         student, generated_at, frozen_payload, document_id (P3)
revaluation        result, requested_by, fee_invoice, state, outcome
```

## 6. Lifecycle

```
exam_session:  planned → registration_open → registration_closed → conducted
                       → evaluation → moderation → results_ready → published → closed

result:        computed → moderated → published → { revised }

revaluation:   requested → fee_paid → assigned → evaluated → decided
                        ↘ rejected
```

`published` is a one-way door per §4. A revision after publication is a `result_revision` row plus a
new frozen result, both discoverable — never an edit.

## 7. Eligibility, and where its rules live

A student may sit an exam only if: enrolled in the offering (M5, AD-4), attendance meets the
threshold (M7 data, threshold from P8 settings), exam fee paid (M11), and no disciplinary bar (M21).

The **rule** lives here; the **data** stays with its owner (AD-28). M10 never stores an attendance
percentage — AD-7 — it asks M7 as of the cut-off date and applies the threshold.

Shortage condonation is an approval (P1): HoD → Principal, with a reason, audited. It is one of the
most contested actions in a college and must be traceable to a person.

## 8. Invariants

- A published result is immutable (trigger, as AD-34 does for curriculum).
- `result_revision` is INSERT only.
- `grading_scale` is versioned and frozen on use; a result names its `rule_version`.
- Marks cannot exceed `max_marks` (check constraint).
- A student cannot be seated twice in one slot, nor in two halls (unique).
- A hall's seating cannot exceed capacity (trigger).
- An evaluator cannot be assigned their own relative — declared conflicts recorded, checked.
- External marks are **INSERT and SELECT only** (AD-8: the mirror is read-only). No UPDATE grant on
  `external_mark` for `erp_app` at all — enforced by grant, not by discipline.
- Hall ticket numbers gapless per session (M11's rule).
- Tenant RLS with FORCE throughout.

## 9. The mirror (affiliating mode, AD-8)

Universities publish results in a format each decides, and they change it. So:

- One **adapter per university format**, behind an interface, fixture-driven (P8 §5).
- Import is a batch with a dry-run preview and per-row errors (P8 §4).
- Imported marks are never editable in this system. A wrong mark is the university's to correct;
  re-import supersedes, recording both.
- The mirror carries `source` and `imported_at` so nobody mistakes it for the college's own record.

## 10. The engine (autonomous mode, behind AD-91's flag)

Paper setting and moderation, double evaluation with a tolerance band and a third evaluation when
exceeded, mark entry by evaluator with script anonymity, moderation by committee, grade computation
from the versioned scale, credit and GPA computation, pass/fail and classification, supplementary
eligibility, revaluation with its own fee and outcome.

Script anonymity is a real requirement: an evaluator sees `script_no`, never the student. The
mapping is resolved only at result computation, by a narrow definer function — the same pattern as
AD-61's platform event read.

## 11. Approvals (P1)

Attendance condonation, moderation decisions, result publication (Controller → Principal),
revaluation outcome where marks change, grace-mark application, result revision after publication.

Result publication is the highest-consequence approval in the system after payroll release.

## 12. Money boundary (M11)

Exam registration fee, supplementary fee, revaluation fee, transcript fee — all M11 invoices raised
by domain events. M10 holds no money. AD-6.

## 13. Notifications (P2)

Student: registration open, fee due, hall ticket available, schedule changed, **result published**,
revaluation outcome, supplementary eligibility.
Staff: invigilation duty assigned, evaluation deadline, moderation pending, publication approval waiting.

Result publication is the highest-volume notification event in the system — an entire cohort at
once. P2's queue and rate limiting must be sized for it, and it is the natural load test for P2.

## 14. Scheduled work (P9)

Registration window transitions, hall ticket generation, fee-deadline reminders, evaluation-deadline
escalation, publication-day dispatch, supplementary window opening.

## 15. Reports (P5)

Pass percentage by programme, department, term. Subject-wise analysis with difficulty indication.
Toppers and classification distribution. Backlog register by student. Revaluation outcome analysis —
a high overturn rate names an evaluation problem. Attendance-shortage list before the cut-off.
Statutory academic returns.

## 16. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Session setup, scheduling | ✅ primary | ✅ |
| Seating and hall allocation | ✅ primary | ✅ read |
| Invigilation roster | ✅ | ✅ — **duty on the phone is the real use** |
| Registration and fee | ✅ | ✅ student self-service |
| Hall ticket | ✅ | ✅ — **phone is primary**; PDF via P3/P4 pattern |
| Mark entry (engine mode) | ✅ primary | **exception: web only** — bulk numeric entry |
| External mark import | ✅ | **exception: web only** (P8 §4) |
| Moderation | ✅ primary | ✅ read |
| Publication approval | ✅ | ✅ |
| **Student result view** | ✅ | ✅ |
| Transcript | ✅ | ✅ |

**The student result view closes the gap recorded on 2026-09-24**: student marks self-scoped read is
🚫 not built, because migration 017's header reserves "publication to students, totals, grades and
pass or fail" for M10. That reservation is correct and this module is where it is honoured.

## 17. Edge cases

- Internal mark corrected after publication → `result_revision`, never an edit (§6).
- University re-publishes a changed result → re-import supersedes, both kept (§9).
- Student absent → a recorded status, not a zero. Zero and absent are different facts.
- Malpractice → result withheld pending M21's case; withheld is a state, not a missing row.
- Curriculum erratum changes credits after publication (AD-35) → results keep their frozen credits.
- Revaluation lowers the mark → institution policy from P8 settings; the system supports both, and
  the tenant chooses in advance rather than per case.
- Student exits mid-term with marks entered but unsubmitted → marks stand; eligibility fails.
- Two students, same name, same programme → `script_no` and enrolment number, never names.
- Supplementary result for a prior term → published against the original term, not the current one.

## 18. Build slices

| Slice | Scope | Surfaces | Mode |
|---|---|---|---|
| M10-1 | **Confirm AD-91; write it into `adr.md`** | D | — |
| M10-2 | Session, schedule, hall, seating, invigilation | S, W, F | both |
| M10-3 | Registration, eligibility, exam fee, hall ticket | S, W, F | both |
| M10-4 | Grading scale, versioned and frozen | S, W | both |
| M10-5 | Mark aggregation from M9 + external; computed | S | both |
| M10-6 | **External mirror + import adapters** (AD-8) | S, W | affiliating |
| M10-7 | **Result freeze and publication** (AD-23), approval | S, W, F | both |
| M10-8 | **Student result view** — closes the 2026-09-24 gap | S, W, F | both |
| M10-9 | Transcript and grade card via P4 | S, W, F | both |
| M10-10 | Mark entry, script anonymity, double evaluation | S, W | autonomous |
| M10-11 | Moderation and grace marks | S, W | autonomous |
| M10-12 | Revaluation with fee and outcome | S, W, F | autonomous |
| M10-13 | Supplementary sessions | S, W, F | both |
| M10-14 | Reports | S, W, F | both |

**M10-6 through M10-9 deliver an affiliating college a complete product.** M10-10 onward is the
engine, behind AD-91's flag, built when a tenant needs it. This ordering is what makes AD-91 worth
adopting rather than waiting.

## 19. Cross-module impact

Reads M9 (internal marks), M7 (attendance eligibility), M5 (enrolment, AD-4), M3 (curriculum,
credits), M13 (evaluators, invigilators), M21 (disciplinary bar). Causes M11 invoices. Feeds P4
(transcript, migration certificate), M23 (placement eligibility). Depends on P1, P2, P3, P5, P8, P9.
