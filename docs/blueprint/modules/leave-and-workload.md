# M14 — Leave and Workload

Blueprint module M14, domain D7. **Status: ❌ not built.** `MODULE_REGISTRY.md` carries it as
"Leave management (LV-1) — teachers and students apply (sick, short, half day) with a reason;
approval", with **OD-LV-1 open**.

## 1. Open decision OD-LV-1

The registry entry says *teachers **and students*** apply. That is two different things wearing one
word, and it must be settled before code:

| | Staff leave | Student leave |
|---|---|---|
| Against | A leave **balance**, an entitlement | Attendance, an academic record |
| Consequence | Pay (M15), substitution (M3) | Attendance percentage, exam eligibility (M10) |
| Approved by | HoD, escalating by duration | Class advisor / HoD |
| Owned by | M14, this module | **M7 Attendance** |

**Recommendation: they are different features.** Staff leave is M14. Student leave is an *excused
absence* in M7 — a category of attendance record, not a balance draw. Building student leave here
would put an academic record in an HR module and give M7 two sources of truth for whether a student
was present.

This document specifies staff leave. Student excused absence is recorded as a build item against
M7 (`m5-m6-attendance.md`) and named in §14.

## 2. What this module owns

Leave types and policy, entitlement and balance, applications and their approval, the leave
calendar, and the substitution that an approved teaching leave forces.

It does **not** own: presence (staff-attendance.md), pay (M15 reads approved leave), the timetable
(M6 — M14 *requests* a substitution, M6 records it), or employment (M13).

## 3. Permissions

```
leave.apply         normal     Apply for own leave
leave.read          normal     See a team's leave
leave.approve       normal     Decide on leave within scope
leave.configure     sensitive  Types, entitlements, policy
leave.adjust        sensitive  Manual balance adjustment, with a reason
```

## 4. Entities

```
leave_type          tenant, code, name, paid, accrual_rule, max_balance, carry_forward,
                    encashable, requires_document_after_days, half_day_allowed, version
leave_entitlement   employee, leave_type, year, opening, accrued, availed, adjusted, closing
leave_request       employee, leave_type, from_date, to_date, day_parts, days, reason,
                    document_id (P3), state, approval_request_id (P1), version
leave_ledger        employee, leave_type, year, kind(accrual|availed|lapse|encash|adjust),
                    days, ref, at, actor, reason     -- INSERT only, append-only
substitution        leave_request, class_session (M6), substitute_employee, state
holiday_calendar    reads M2 non_teaching_days (AD-39) — never a second copy
```

`leave_ledger` is **append-only**, exactly like M11's fee ledger (`m11-student-finance.md` §3), and
for exactly the same reason: a balance that can be edited is a balance nobody can defend. The
balance on `leave_entitlement` is a materialised convenience, recomputable from the ledger, and a
P9 job reconciles them nightly and alerts on divergence.

This is a deliberate, declared exception to AD-7. The reason is performance on a hot read, and the
reconciliation job is the price paid for it.

## 5. Leave types (typical Indian college)

Casual, Earned/Privilege, Medical, Maternity, Paternity, Duty (conference, exam duty), Sabbatical,
Compensatory off, Leave Without Pay. Configured per tenant, not hard-coded: every institution's
service rules differ, and a hard-coded type list guarantees a customisation request in week one.

## 6. Lifecycle

```
leave_request:  draft → applied → { approved | rejected | cancelled }
                        approved → { availed | withdrawn_before_start | recalled }

substitution:   proposed → accepted → { delivered | not_delivered }
                         ↘ declined → reproposed
```

## 7. Invariants

- Balance may not go negative for a type that forbids it (trigger). An over-application is refused
  at apply time, not discovered at payroll time.
- Requests for one employee may not overlap in date (exclusion constraint).
- `leave_ledger` is INSERT only.
- `days` excludes non-teaching days and weekends per the work calendar — computed server-side, never
  accepted from a client.
- An employee cannot approve their own leave (P1 §6).
- Medical leave beyond `requires_document_after_days` cannot reach `approved` without a verified
  document (P3).
- Approval for a teaching employee **must** resolve substitutions before the leave starts, or record
  explicitly that classes are cancelled. A teacher on approved leave with a class still scheduled and
  nobody assigned is how students arrive at an empty room.
- Tenant RLS with FORCE.

## 8. Approvals (P1)

Chain by duration, from P8 settings: ≤ 2 days → HoD; 3–7 → HoD then Principal; > 7 or unpaid →
Principal then Management. Medical beyond the document threshold adds HR verification.

Retrospective application (illness) is allowed by policy flag and flagged in the approval so the
approver knows they are deciding about the past.

## 9. Substitution — the integration that makes leave real

On approval, for each class session (M6) in the leave window:

1. Propose substitutes: same department, same course competence, free in that slot, under the
   workload ceiling (M13 §8).
2. The proposed substitute accepts or declines (notification, one tap).
3. On acceptance, M6 records the substitute for that session; attendance (M7) is marked by them.
4. If nobody accepts, the session is **cancelled with a reason** — the mechanism already exists and
   students already see it (the student timetable shows cancelled classes struck through with a reason).

`02-domains.md` names "substitution arising from approved leave" as D7 automation. This is it, and
it is the single most valuable thing this module does day to day.

## 10. Scheduled work (P9)

Monthly and annual accrual. Year-end lapse and carry-forward per type. Encashment eligibility.
Balance reconciliation against the ledger (§4). Reminders for pending approvals. Auto-mark `availed`
as leave days pass. Substitution chase before the leave window opens.

## 11. Notifications (P2)

Employee: applied, approved, rejected with a reason, balance low, leave starting tomorrow, lapse
warning before year-end.
Approver: request waiting, overdue (P1 SLA).
Substitute: proposed, confirmed, reminder on the day.
HoD: department leave calendar for the week, unresolved substitutions.

## 12. Reports (P5)

Balance by employee and type. Availment patterns — clustering before and after holidays is a real
management signal. Department leave calendar. Leave without pay for M15. Pending approvals by age.
Substitution load, and **unresolved substitutions**, which is the one that prevents cancelled classes.
Statutory maternity and medical leave returns.

## 13. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Apply for leave | ✅ | ✅ **primary — applying from home when ill is the real case** |
| My balance and history | ✅ | ✅ |
| Approval inbox | ✅ | ✅ **primary — a HoD approving from a corridor** (P1 §12) |
| Department leave calendar | ✅ primary | ✅ |
| Substitution accept/decline | ✅ | ✅ **primary — one tap** |
| Type and entitlement config | ✅ primary | ✅ read |
| Reports | ✅ | ✅ via P5 |

This module is the clearest case in the system for AD-84's parity mandate. Almost every interaction
is a short, urgent, mobile one.

## 14. Student excused absence — not built here

Recorded as an M7 build item: an attendance record gains a category (`present | absent | excused |
on_duty`), with an approval by the class advisor and a document where required. It affects the
attendance percentage that M10 §7 reads for exam eligibility. **It does not draw on a balance and it
has no place in M14.** Resolves OD-LV-1's second half.

## 15. Edge cases

- Leave spanning a year boundary → split across entitlement years at the boundary, both ledgered.
- Leave spanning an academic-year rollover (AD-11) → survives rollover; the rehearsal must cover it.
- Approved after the absence was already marked → attendance reconciles, the day is re-classified,
  both facts kept.
- Cancelled after approval but before starting → balance returns via a ledger entry, never an edit.
- Recalled mid-leave → availed days are what was taken; the remainder returns.
- Leave without pay → M15 reads it; retrospective LWP affects an already-run payroll, which M15
  handles as an arrear, never as a rewrite.
- Half-day on a day with two classes → `day_parts` resolves which sessions need substitution.
- Employee exits with balance → encashment or lapse per policy, settled in the exit (M13 §6).
- Maternity leave crossing a promotion → entitlement follows the type, not the designation.

## 16. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| LV-1 | Types, entitlements, policy config | S, W, F | M13, P8 |
| LV-2 | Ledger, balance, accrual job | S, W, F | P9 |
| LV-3 | Apply, day computation, document | S, W, F | P3, M2 |
| LV-4 | Approval chains by duration | S, W, F | P1 |
| LV-5 | **Substitution resolution** (§9) | S, W, F | M6, M3, M7 |
| LV-6 | Department calendar, my balance | S, W, F | — |
| LV-7 | Lapse, carry-forward, encashment | S | P9 |
| LV-8 | Payroll input for M15 | S | M15 |
| LV-9 | Reports | S, W, F | P5 |
| LV-10 | **Student excused absence in M7** (§14) | S, W, F | M7, P1 |

## 17. Cross-module impact

Reads M13 (employee, designation, kind), M2 (calendar, AD-39). Requests substitution into M6, which
affects M7 attendance marking. Feeds M15 (paid and unpaid days). Depends on P1, P2, P3, P5, P9.
