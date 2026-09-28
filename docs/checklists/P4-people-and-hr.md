# P4 — D7 People and HR

Docs: `hr-and-staff.md`, `staff-attendance.md`, `leave-and-workload.md`, `payroll.md`.

**Order is forced:** M13 employee record → staff attendance retro-fit → M14 leave → M15 payroll.
Payroll without an employee record, leave and attendance is a spreadsheet with extra steps.

🔴 **OD-ACC-1 (P0-7) must be answered before M15 starts** — payroll output needs a destination.

---

# M13 — HR and Staff

**Layout:** `server/src/modules/hr/…`, `clients/web/src/features/hr/`, `lib/features/hr/`.

## HR-1 — Employee, employment period, designation, directory

- [ ] `MIG` `designation`: tenant, name, cadre, rank, teaching, version
- [ ] `MIG` `employee`: tenant, person_id (M1), employee_no, kind(teaching|non_teaching|contract|
      visiting), joined_on, state, version
- [ ] `MIG` `employment_period`: employee, designation, department (M2), campus (M2), from, to,
      kind, reporting_to, order_ref, version
- [ ] `MIG` Gapless `employee_no` per tenant
- [ ] `MIG` 🔴 Exclusion constraint: employment periods for one employee never overlap **per kind**
      (dual-role across departments is legitimate; two concurrent full appointments are not)
- [ ] `MIG` CHECK `joined_on <= from` for every period
- [ ] `MIG` Trigger: no reporting cycle; an employee cannot report to themselves
- [ ] `MIG` Trigger: a department cannot be archived while an open period is scoped to it (AD-27)
- [ ] `MIG` RLS FORCE; GRANTs; invariants test
- [ ] `SVC` 🔴 **Employment is not identity and not authority** (doc §2). M13 records that Sonam is
      an Assistant Professor; M1 grants what she may do. A visiting examiner has authority and no
      employment; a retired professor has employment ended and a Person remaining
- [ ] `API` `/v1/hr/employees`, `/designations`, `/employees/:id/periods`
- [ ] `WEB` `APP` Staff directory — **the most-used screen in this module**; search, filter by
      department, designation, kind
- [ ] `WEB` `APP` Employee record with employment history
- [ ] `TEST` Overlapping periods of the same kind refused
- [ ] `TEST` Reporting cycle refused
- [ ] `TEST` A person with authority and no employment is representable

## HR-2 — 🔴 Retro-fit staff attendance onto `employee`

`038_staff_attendance` attaches punches to `person_id` because no employee record existed. The data
is currently orphaned: it records presence without the employment that makes presence meaningful.

- [ ] `MIG` Add `employee_id` to `staff_attendance`; back-fill from `person_id`
- [ ] `MIG` Back-fill verification query: every row resolves to exactly one employee
- [ ] `MIG` Rows that cannot resolve are reported, not silently dropped
- [ ] `MIG` Make `employee_id` NOT NULL once back-filled; keep `person_id` or drop it deliberately
- [ ] `SVC` Campus resolution for the geo-fence (P0-0) now reads the **employment** campus
- [ ] `TEST` Back-fill is idempotent; a re-run changes nothing
- [ ] `TEST` A punch by a person with no employment record is refused

## HR-3 — Qualifications and documents
- [ ] `MIG` `qualification`: employee, degree, discipline, institution, year, document_id (P3),
      verification_state
- [ ] `S` P3 kinds: qualification certificate, appointment letter, experience letter, ID proof,
      relieving letter — retention class `statutory`
- [ ] `WEB` `APP` Qualification list, upload with **camera capture** (P3), verification state
- [ ] `JOB` Document expiry warnings
- [ ] `TEST` An unverified mandatory qualification is visible as such

## HR-4 — Service record
- [ ] `MIG` `service_record`: employee, kind(confirmation|promotion|transfer|increment|deputation|
      sanction), effective_date, detail, order_ref, approved_by — **INSERT only**
- [ ] `SVC` 🔴 A promotion **closes one employment period and opens another**. It does not edit a
      designation field — "what was her designation in 2024" must stay answerable
- [ ] `SVC` Approvals via P1
- [ ] `WEB` `APP` Service book view, chronological
- [ ] `TEST` UPDATE and DELETE on `service_record` refused at the database
- [ ] `TEST` A promotion produces two periods, not one edited row

## HR-5 — Appointment workflow
- [ ] `SVC` Chain via P1: HR Officer → Principal → Management
- [ ] `SVC` Probation period with a review date
- [ ] `WEB` `APP` Appointment request, approval, confirmation
- [ ] `JOB` Probation review reminders
- [ ] `TEST` An unapproved appointment cannot become an active employment period

## HR-6 — Workload allocation
- [ ] `MIG` `workload_allocation`: employee, term (M2), offering (M3), hours_per_week, kind, version
- [ ] `SVC` 🔴 Derived from M3 instructor assignments (AD-40) plus non-teaching duties. M13 records
      **how much**; M3 records **which** — different questions
- [ ] `SVC` Policy ceiling from P8; **warn, do not block** — a real institution exceeds it in a bad
      term and must be able to record that
- [ ] `WEB` `APP` Workload by employee and by department; outliers highlighted
- [ ] `TEST` Ceiling breach warns and still saves

## HR-7 — Self-service
- [ ] `WEB` `APP` "My employment": periods, designation, service record, documents, workload
- [ ] `APP` **Phone-primary** — removes most of HR's walk-in traffic
- [ ] `TEST` A person sees only their own record without `employee.read`

## HR-8 — 🔴 Exit, clearance, same-day access revocation
- [ ] `MIG` `exit_record`: employee, kind(resignation|retirement|termination|end_of_contract),
      notice_date, last_working_day, clearance_state, version
- [ ] `MIG` `exit_clearance_item`: exit_record, domain, state, cleared_by, at, note — INSERT only
- [ ] `SVC` Clearance domains: M19 assets held, M16 library, M11 dues, M9/M10 academic
      (unsubmitted marks), department handover
- [ ] `SVC` Exit cannot complete while any item is outstanding
- [ ] `JOB` 🔴 **On `last_working_day`, revoke sessions, devices and role assignments.** D7's
      automation names this; it is what stops a departed employee keeping a live session
- [ ] `SVC` Death in service is a distinct path from termination, handled with dignity
- [ ] `WEB` `APP` Exit initiation, clearance checklist, settlement summary
- [ ] `TEST` Access revoked on the day, verified by an attempted request after the job runs
- [ ] `TEST` Exit blocked with an asset held

## HR-9 — Certificates (P4)
- [ ] `S` `W` `F` Experience letter, relieving letter, salary certificate, NOC
- [ ] `S` Experience letter eligibility: employment period closed

## HR-10 — Reports (P5)
- [ ] `S` Staff strength by department, designation, cadre
- [ ] `S` 🔴 **Student-to-staff ratio** — the accreditation number an institution is judged on
- [ ] `S` Workload distribution and outliers; qualification profile (accreditation input)
- [ ] `S` Age and retirement projection; attrition by department and reason
- [ ] `S` Vacancy against sanctioned strength; probation and contract due lists

---

# Staff Attendance — remainder (P0-0 fixed the fence)

## SA-A2 — Register, summary, reports
- [ ] `S` Daily register by campus and department
- [ ] `S` Monthly summary per employee: present, absent, late, half-day, on-leave, hours
- [ ] `WEB` `APP` Register and summary; `WEB` primary for the register
- [ ] `S` 🔴 **Fence-verification rate report** — a low rate names a broken fence or a broken process

## SA-A3 — Work calendar and duty exceptions
- [ ] `MIG` `work_calendar`: tenant, campus, weekday_pattern, exceptions — reads M2
      `non_teaching_days` (AD-39), never a second copy
- [ ] `MIG` `duty_exception`: employee, date, kind(off_site|deputation|field_work), approved_by
- [ ] `SVC` No punch on a non-working day without an approved exception
- [ ] `TEST` Punch on a holiday refused; with an exception, accepted

## SA-A4 — Corrections via P1
- [ ] `MIG` `attendance_correction`: INSERT only, kind(forgot_in|forgot_out|off_site|leave), reason,
      state, approved_by
- [ ] `SVC` 🔴 Forgotten punches are **the normal case** — people forget. Request → HoD approves →
      corrected day stands, with both the original absence and the correction visible
- [ ] `SVC` A correction never deletes a punch
- [ ] `SVC` Requester cannot approve their own (P1 §6)
- [ ] `WEB` `APP` Request and approval; `APP` primary for both
- [ ] `TEST` Correction UPDATE/DELETE refused; self-approval refused

## SA-A5 — Reminders
- [ ] `F` **Local** notifications at shift start and end (AD-83), no server round trip
- [ ] `F` Suppressed on non-working days
- [ ] `S` Server: missing punch-out at end of day, correction pending, correction decided

## SA-A6 — Payroll input register
- [ ] `S` Days present, absent, late per employee per period, for M15
- [ ] `JOB` 🔴 Auto-close forgotten punch-outs at a cut-off, **marked auto-closed**.
      A job must never invent a punch time — writing a plausible 5:30pm is manufacturing evidence
- [ ] `TEST` An auto-closed day is distinguishable from a real punch-out

---

# M14 — Leave and Workload

🔴 **OD-LV-1 resolved in P0-8**: staff leave is M14; student excused absence is M7 (LV-10).

## LV-1 — Types, entitlements, policy
- [ ] `MIG` `leave_type`: tenant, code, name, paid, accrual_rule, max_balance, carry_forward,
      encashable, requires_document_after_days, half_day_allowed, version
- [ ] `MIG` `leave_entitlement`: employee, leave_type, year, opening, accrued, availed, adjusted, closing
- [ ] `SVC` Types configured per tenant — casual, earned, medical, maternity, paternity, duty,
      sabbatical, compensatory, LWP. **Never hard-coded**; every institution's service rules differ
- [ ] `WEB` `APP` Type and entitlement configuration; `WEB` primary

## LV-2 — Ledger, balance, accrual
- [ ] `MIG` `leave_ledger`: employee, leave_type, year, kind(accrual|availed|lapse|encash|adjust),
      days, ref, at, actor, reason — **INSERT only, append-only**
- [ ] `SVC` 🔴 Balance on `leave_entitlement` is a **materialised convenience**, recomputable from
      the ledger. A declared exception to AD-7; the nightly reconciliation job is its price
- [ ] `JOB` Monthly and annual accrual per type
- [ ] `JOB` Nightly reconciliation of balance against ledger; **alert on divergence**
- [ ] `TEST` Ledger UPDATE/DELETE refused; balance always equals the ledger sum

## LV-3 — Apply
- [ ] `MIG` `leave_request`: employee, leave_type, from_date, to_date, day_parts, days, reason,
      document_id (P3), state, approval_request_id (P1), version
- [ ] `MIG` Exclusion constraint: one employee's requests never overlap in date
- [ ] `SVC` 🔴 `days` computed **server-side** excluding weekends and non-teaching days — never
      accepted from a client
- [ ] `SVC` Balance may not go negative for types that forbid it — refused **at apply time**, not
      discovered at payroll time
- [ ] `SVC` Medical beyond `requires_document_after_days` cannot be approved without a verified
      document (P3)
- [ ] `WEB` `APP` Apply; `APP` **primary — applying from home when ill is the real case**
- [ ] `TEST` Overlap refused; negative balance refused; day computation correct across a holiday

## LV-4 — Approval chains
- [ ] `SVC` Chain by duration from P8: ≤2 days → HoD; 3–7 → HoD then Principal; >7 or unpaid →
      Principal then Management
- [ ] `SVC` Retrospective application allowed by policy flag, **flagged in the approval** so the
      approver knows they are deciding about the past
- [ ] `WEB` `APP` Approval via P1 inbox; `APP` primary
- [ ] `TEST` Chain selected by duration; self-approval refused

## LV-5 — 🔴 Substitution resolution

The single most valuable thing this module does day to day.

- [ ] `MIG` `substitution`: leave_request, class_session (M6), substitute_employee, state
- [ ] `SVC` On approval, for each class session in the window:
  - [ ] Propose substitutes: same department, course competence, free in the slot, under ceiling
  - [ ] Substitute accepts or declines — one tap
  - [ ] On acceptance, M6 records the substitute; M7 attendance is marked by them
  - [ ] If nobody accepts, the session is **cancelled with a reason** (students already see
        cancelled classes struck through with the reason on their timetable)
- [ ] `SVC` 🔴 Approval **must** resolve substitutions or explicitly cancel. A teacher on approved
      leave with a class still scheduled and nobody assigned is how students arrive at an empty room
- [ ] `JOB` Substitution chase before the leave window opens
- [ ] `WEB` `APP` Propose, accept, decline; `APP` **primary, one tap**
- [ ] `TEST` Approved teaching leave leaves no session unresolved
- [ ] `TEST` A declined proposal re-proposes; exhausted proposals cancel the class

## LV-6 — Calendars and balances
- [ ] `WEB` `APP` Department leave calendar; my balance and history

## LV-7 — Lapse, carry-forward, encashment
- [ ] `JOB` Year-end lapse and carry-forward per type; encashment eligibility
- [ ] `TEST` Leave spanning a year boundary splits across entitlement years, both ledgered
- [ ] `TEST` Leave surviving an academic-year rollover (AD-11)

## LV-8 — Payroll input
- [ ] `S` LWP days per employee per period, for M15
- [ ] `SVC` 🔴 Retrospective LWP after a run closes → **arrear next run, never a rewrite**

## LV-9 — Reports (P5)
- [ ] `S` Balance by employee and type; availment patterns (clustering around holidays is a real
      management signal); department leave calendar; LWP for payroll; pending by age
- [ ] `S` Substitution load and 🔴 **unresolved substitutions** — the report that prevents empty rooms

## LV-10 — Student excused absence (M7, resolves OD-LV-1's second half)
- [ ] `MIG` Attendance record gains a category: `present | absent | excused | on_duty`
- [ ] `SVC` Approval by class advisor or HoD via P1; document where required (P3)
- [ ] `SVC` 🔴 Affects the attendance percentage M10-3 reads for exam eligibility
- [ ] `SVC` **Draws no balance** — it is an academic record, not an entitlement
- [ ] `WEB` `APP` Student applies; advisor approves
- [ ] `TEST` An excused absence changes the eligibility computation, not a leave balance

---

# M15 — Payroll

🔴 **Blocked until OD-ACC-1 (P0-7) is answered.**

## PAY-1 — Components, structures, employee salary
- [ ] `MIG` `salary_component`: tenant, code, name, kind(earning|deduction|employer_contribution),
      calculation(fixed|percent_of|slab|formula), basis, taxable, statutory, version
- [ ] `MIG` `salary_structure`: tenant, name, designation|employee, effective_from, components, version
- [ ] `MIG` `employee_salary`: employee, structure, effective_from, effective_to, ctc, version
- [ ] `MIG` Integer paise, INR only (M11 §3) — one currency discipline system-wide
- [ ] `WEB` Component and structure config — **web only, exception recorded**

## PAY-2 — Statutory rates
- [ ] `MIG` `statutory_rate`: tenant, kind(pf|esi|pt|tds), slab, effective_from, version
- [ ] `SVC` Versioned; a run records the version it used
- [ ] `TEST` A rate change mid-year does not alter a prior run

## PAY-3 — Input collection
- [ ] `MIG` `payroll_input`: run, employee, kind(lwp|attendance|arrear|recovery|bonus|overtime),
      days_or_amount, source_ref, reason
- [ ] `SVC` From M14 (LWP), staff attendance (days), M13 (increments, promotions), prior runs (arrears)
- [ ] `SVC` 🔴 Per-lecture pay for visiting faculty reads **delivered** sessions (M6 `taught`), not
      scheduled ones. Paying for a cancelled class is the error this prevents
- [ ] `TEST` A cancelled session is not paid

## PAY-4 — Run: draft, lock, compute
- [ ] `MIG` `payroll_run`: tenant, period_month, state, prepared_by, approved_by, released_at,
      totals, version
- [ ] `MIG` Unique: one run per tenant per month per kind
- [ ] `SVC` 🔴 `inputs_locked` state: once locked, later leave approvals and attendance corrections
      flow to the **next** run as arrears. Without this boundary a run never converges
- [ ] `SVC` 🔴 `net = gross − deductions` checked; **a payslip that does not balance is refused,
      not stored**
- [ ] `SVC` An employee with no effective `employee_salary` is **excluded and listed**, never
      silently paid zero
- [ ] `TEST` Unbalanced payslip refused; excluded employees reported

## PAY-5 — Variance review
- [ ] `S` `WEB` 🔴 Variance against the previous month, per employee and per component —
      **the single most useful control**; an unexplained jump is usually an input error, caught
      before release rather than after
- [ ] `TEST` A seeded input error surfaces in the variance view

## PAY-6 — Approval and release
- [ ] `SVC` 🔴 **Preparer ≠ approver**, enforced by P1 §6
- [ ] `SVC` `payroll.run` is `critical` and MFA-gated
- [ ] `SVC` Chain: prepared → Principal → Accounts, mode `all`
- [ ] `MIG` 🔴 Trigger: UPDATE refused on `payroll_run` and `payslip` past `approved`
- [ ] `WEB` `APP` Release approval — **on both**, because the approver is often not at a desk
- [ ] `TEST` The preparer cannot approve; a released run cannot be edited

## PAY-7 — Payslip
- [ ] `MIG` `payslip`: run, employee, **frozen{earnings, deductions, employer, gross, net,
      days_paid, days_lwp}**, document_id (P3), version
- [ ] `SVC` 🔴 Every figure traces to an input — a payslip line names its source. "Net pay ₹61,240"
      with no derivation is unauditable
- [ ] `SVC` PDF via P3, retention `statutory`, **one-time signed URLs** (among the most sensitive
      documents the system holds)
- [ ] `SVC` `payslip.read.self` — the self-service permission shape
- [ ] `WEB` `APP` My payslip — `APP` **primary**
- [ ] `S` Payslip reads are **sensitive reads, audited** (P6)
- [ ] `TEST` A person cannot read another's payslip; every read is logged

## PAY-8 — Bank instruction
- [ ] `MIG` `bank_instruction`: run, employee, account_ref, amount, state, batch_ref
- [ ] `SVC` Generated once per run; regeneration **supersedes with a new batch reference**
- [ ] `SVC` No bank account on file → excluded and listed, never paid to a blank
- [ ] `WEB` Export — **web only, exception recorded**
- [ ] `TEST` A rejected batch is re-issued as a new batch, not silently regenerated

## PAY-9 — Statutory returns
- [ ] `MIG` `statutory_return`: tenant, kind, period, frozen_payload, filed_at, ack_ref
- [ ] `S` PF ECR, ESI, professional tax, TDS quarterly, Form 16 via P4
- [ ] `JOB` Filing reminders

## PAY-10 — Reports (P5)
- [ ] `S` Payroll register by run; department-wise cost; component-wise summary
- [ ] `S` Arrears and recoveries register; year-to-date per employee

## Payroll edge cases
- [ ] `TEST` Joins mid-month → pro-rata, stated on the payslip
- [ ] `TEST` Exits mid-month → settlement with encashment, recoveries, clearance
- [ ] `TEST` Retrospective promotion → arrear naming the period it covers
- [ ] `TEST` Two employment periods in one month → two salary lines, one payslip
- [ ] `TEST` Employee who is also a student → paid as an employee; records never interact

---

## 🚧 P4 EXIT GATE

- [ ] Staff attendance attaches to an employment record and feeds payroll
- [ ] 🔴 Approved teaching leave produces a substitution **or** a cancelled class — never a silent gap
- [ ] 🔴 A payroll run cannot be released by the person who prepared it
- [ ] A released run is provably immutable; a correction is an arrear
- [ ] Access is revoked on an employee's last working day, verified by a real request attempt
- [ ] The geo-fence (P0-0) still holds now that attendance feeds money
