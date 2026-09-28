# M15 — Payroll

Blueprint module M15, domain D7. **Status: ❌ not built.** Phase 4 in the blueprint's own ordering,
and correctly late: payroll without an employee record (M13), leave (M14) and attendance is a
spreadsheet with extra steps.

## 1. What this module owns

Salary structure, the payroll cycle, payslips, statutory deductions and returns, and the disbursement
instruction. It is the most consequential module in the system after admissions: it pays people, and
it is audited by the government.

It does **not** own: employment facts (M13), leave (M14), presence (staff-attendance), or the
institution's books (institutional accounts, D6's other half). M15 produces a payroll register; the
accounting system records the expense.

## 2. Three rules that make payroll defensible

**A payroll run is frozen, not recalculated.** Once approved, a run's payslips are immutable. A
later correction is an **arrear or a recovery in the next run**, never an edit to a closed one. This
is AD-23's published-result reasoning applied to money, and it is what makes last March's payslip
still say what it said last March.

**Every figure traces to an input.** A payslip line names where it came from: a salary structure
component, a leave-without-pay deduction with the dates, an attendance shortfall, a statutory rate
with its version. "Net pay ₹61,240" with no derivation is unauditable.

**Nobody releases their own pay run.** Preparation and approval are separate people, enforced by P1
§6. The Payroll Officer prepares; the Principal and Accounts release.

## 3. Permissions

```
payroll.read        sensitive  View structures and runs
payroll.configure   sensitive  Components, rates, statutory setup
payroll.prepare     sensitive  Create and compute a run
payroll.run         critical   Approve and release. MFA required
payslip.read.self   normal     Own payslip only
payroll.export      critical   Bank file and statutory returns. MFA required
```

`payroll.run` and `payroll.export` sit with `role.assign` and `person.export` at `critical` with
MFA, which is the tier this system already reserves for irreversible or high-disclosure actions.

## 4. Entities

```
salary_component    tenant, code, name, kind(earning|deduction|employer_contribution),
                    calculation(fixed|percent_of|slab|formula), basis, taxable, statutory, version
salary_structure    tenant, name, designation|employee, effective_from, components[], version
employee_salary     employee, structure, effective_from, effective_to, ctc, version
statutory_rate      tenant, kind(pf|esi|pt|tds), slab[], effective_from, version
payroll_run         tenant, period_month, state, prepared_by, approved_by, released_at,
                    totals{}, version
payslip             run, employee, frozen{earnings[], deductions[], employer[], gross, net,
                    days_paid, days_lwp}, document_id (P3), version
payroll_input       run, employee, kind(lwp|attendance|arrear|recovery|bonus|overtime),
                    days_or_amount, source_ref, reason
bank_instruction    run, employee, account_ref, amount, state, batch_ref
statutory_return    tenant, kind, period, frozen_payload, filed_at, ack_ref
```

`payslip.frozen` is the whole computed payslip, stored. Per §2 this is a declared exception to AD-7,
alongside AD-23 and M4's merit ranking, and it carries its reason in the schema comment.

## 5. Lifecycle

```
payroll_run:  draft → inputs_locked → computed → under_review → approved
                                                              → released → closed
                    ↘ cancelled (only before approved)

payslip:      computed → published (visible to employee) → superseded (by an arrear, never edited)
```

`inputs_locked` matters: once a run locks, later leave approvals and attendance corrections flow to
the **next** run as arrears. Without that boundary a run never converges, because someone always
approves one more leave.

## 6. Invariants

- A released run is immutable: UPDATE refused on `payroll_run` and `payslip` past `approved`
  (trigger).
- `net = gross − deductions`, checked; a payslip that does not balance is refused, not stored.
- Integer paise, INR only — M11's rule (`m11-student-finance.md` §3), one currency discipline system-wide.
- One run per tenant per month per kind (unique).
- An employee with no `employee_salary` effective in the period is **excluded and listed**, never
  silently paid zero.
- Preparer ≠ approver (P1 §6).
- Statutory rates are versioned; a run names the `statutory_rate` version it used.
- Bank instructions are generated once per run; regeneration supersedes with a new batch reference.
- Tenant RLS with FORCE. `payslip` reads are **sensitive reads and audited** (P6 §3).

## 7. Inputs, and where each comes from

| Input | Source | Rule |
|---|---|---|
| Days in period | P8 work calendar | Tenant timezone (P9 §7) |
| Leave without pay | M14 approved requests | Retrospective LWP → arrear, never a rewrite |
| Attendance shortfall | staff-attendance | Only if policy says so; many institutions do not deduct |
| Arrears and recoveries | Prior runs | Explicit rows, never a silent adjustment |
| Increments and promotions | M13 service record | Effective-dated, may be retrospective |
| Overtime, per-lecture pay | M14 / M3 delivery | Visiting faculty paid per delivered class |
| Statutory rates | P8 settings, versioned | PF, ESI, professional tax, TDS |

Per-lecture pay for visiting faculty reads **delivered** sessions (M6 `taught`), not scheduled ones.
Paying for a cancelled class is the error this distinction prevents.

## 8. Approvals (P1)

Structure changes (Payroll Officer → Principal). A run's release (prepared → Principal → Accounts,
`all` mode). Off-cycle payments. Recoveries above a threshold. Every one audited with a reason.

## 9. Scheduled work (P9)

Run reminder before month-end. Input collection from M14 and staff-attendance. Statutory return
preparation and filing reminders. Increment effective-date application. Contract-end pay stop
(reads M13's `last_working_day` — the same date that revokes access).

`overlap_policy` is `skip` and never `parallel`: two payroll runs for the same month is not a
scenario worth supporting (P9 §4).

## 10. Documents (P3) and certificates (P4)

Payslip PDF per employee, retention class `statutory`, one-time signed URLs (P3 §5) because a
payslip is among the most sensitive documents this system holds. Form 16 / TDS certificates, salary
certificates and bank letters via P4.

## 11. Reports (P5)

Payroll register by run. Department-wise cost. Component-wise summary. Statutory returns: PF ECR,
ESI, professional tax, TDS quarterly. Arrears and recoveries register. Year-to-date per employee.
Variance against the previous month — **the single most useful control**, because an unexplained
jump is usually an input error, caught before release rather than after.

## 12. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Component and structure config | ✅ primary | **exception: web only** |
| Prepare a run, review inputs | ✅ primary | **exception: web only** |
| Variance review before release | ✅ primary | ✅ read |
| **Release approval** | ✅ | ✅ — MFA, approver on a phone is legitimate |
| **My payslip** | ✅ | ✅ **primary** |
| Bank file export | ✅ primary | **exception: web only** |
| Reports and statutory returns | ✅ primary | ✅ read via P5 |

Preparation is web-only and recorded as a parity exception (AD-84 §6.4): reviewing four hundred
employees' computed pay is a large-screen task, and pretending otherwise would produce a screen
nobody uses. **Approval is on both**, because the approver is often not at a desk. Self-service
payslip is phone-primary.

## 13. Edge cases

- Joins mid-month → pro-rata by days, stated on the payslip.
- Exits mid-month → final settlement with leave encashment (M14), recoveries and clearance (M13).
- Retrospective promotion → arrear in the next run with the period it covers named.
- LWP approved after the run closed → arrear or recovery next run (§5).
- Employee has no bank account on file → excluded and listed, never paid to a blank.
- Statutory rate changes mid-year → versioned; prior runs keep their version.
- Employee is also a student → paid as an employee; the two records never interact (M13 §15).
- Death in service → settlement to nominee, a distinct path from resignation.
- Bank file rejected by the bank → a state on `bank_instruction`, re-issued as a new batch, never
  by silently regenerating the old one.
- Two employment periods in one month (promotion mid-month) → two salary lines, one payslip.

## 14. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| PAY-1 | Components, structures, employee salary; effective dating | S, W | M13 |
| PAY-2 | Statutory rates, versioned | S, W | P8 |
| PAY-3 | Input collection from M14, attendance, arrears | S | M14, staff-attendance |
| PAY-4 | Run: draft, lock, compute; balance invariant | S, W | P9 |
| PAY-5 | Variance review | S, W | P5 |
| PAY-6 | Approval and release via P1, MFA | S, W, F | P1 |
| PAY-7 | Payslip freeze, PDF, **self-service** | S, W, F | P3 |
| PAY-8 | Bank instruction export | S, W | P8 |
| PAY-9 | Statutory returns and Form 16 | S, W | P4, P5 |
| PAY-10 | Reports | S, W, F | P5 |

## 15. Cross-module impact

Reads M13 (employment, designation, exit date), M14 (LWP, encashment), staff-attendance (days),
M3/M6 (delivered sessions for per-lecture pay), P8 (statutory rates, work calendar). Produces the
payroll register consumed by institutional accounts. Depends on P1, P2, P3, P4, P5, P6, P9.
