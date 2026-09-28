# M13 — HR and Staff

Blueprint module M13, domain D7. **Status: ❌ not built.**

There is a real consequence today: `038_staff_attendance.sql` shipped, and it attaches punches to a
`person_id` because there is no employee record to attach them to. Staff attendance is **orphaned** —
it records that a Person was present without any concept of the employment that makes presence
meaningful. M13 is what un-orphans it.

## 1. What this module owns

The employment relationship: who is employed, under what appointment, with what qualifications,
history, designation and reporting line, and how that relationship ends.

It does **not** own: identity or authority (M1 owns Person and UserAccount per AD-14, and authority
per AD-1 — M13 records that someone is a Lecturer in Physics, it does not grant them permissions),
teaching assignment (M3, AD-40 — an instructor assignment is a reach constraint, not an employment
fact), leave (M14), pay (M15), or attendance (staff-attendance.md).

## 2. Employment is not identity, and neither is a role

Three things are easy to conflate and must not be:

| Concept | Owner | Example |
|---|---|---|
| **Person** | M1 | Sonam exists |
| **Authority** | M1, AD-1 | Sonam may mark attendance in Physics |
| **Employment** | M13 | Sonam is employed as Assistant Professor, Physics, since 2022-07-01 |

A visiting examiner is a Person with authority and no employment. A retired professor is an
employment that ended and a Person who remains. A lab assistant has employment and almost no
authority. Modelling employment as a role, or a role as employment, breaks all three cases —
and AD-1 exists precisely because the project already rejected a role column once.

## 3. Roles

- **HR Officer** — employee records, appointments, service history, qualifications. Institution-scoped.
- **Principal** — approves appointments and exits (existing role, extended).
- **HoD** — reads their department's staff, initiates requisitions (existing role, extended).

## 4. Permissions

```
employee.read            normal     Staff directory
employee.manage          sensitive  Create and edit employee records
employee.export          critical   Export staff personal data (mirrors person.export)
appointment.approve      critical   Confirm an appointment
servicerecord.manage     sensitive  Promotions, confirmations, transfers
workload.read            normal
workload.manage          sensitive  Allocate teaching load
exit.initiate            sensitive
exit.clear               critical   Final clearance and access revocation
```

## 5. Entities

```
employee            tenant, person_id (M1), employee_no, kind(teaching|non_teaching|contract|visiting),
                    joined_on, state, version
employment_period   employee, designation, department (M2), campus (M2), from, to, kind,
                    reporting_to, order_ref, version
designation         tenant, name, cadre, rank, teaching, version
qualification       employee, degree, discipline, institution, year, document_id (P3),
                    verification_state
service_record      employee, kind(confirmation|promotion|transfer|increment|deputation|sanction),
                    effective_date, detail, order_ref, approved_by     -- INSERT only
workload_allocation employee, term (M2), offering (M3), hours_per_week, kind, version
exit_record         employee, kind(resignation|retirement|termination|end_of_contract),
                    notice_date, last_working_day, clearance_state, version
exit_clearance_item exit_record, domain, state, cleared_by, at, note
```

`employee_no` is gapless per tenant (M11's numbering rule). `service_record` is INSERT only: a
service book is a legal document and AD-13's correction-not-edit discipline applies with full force.

## 6. Lifecycle

```
employee:     draft → appointed → active → { on_leave | deputed | suspended } → exiting → exited
                                                                              ↘ rejoined

employment_period: open → closed     (a new period opens on promotion or transfer)

exit:         initiated → clearance_pending → cleared → access_revoked → settled
```

A promotion **closes one employment period and opens another**. It does not edit a designation
field. Ten years later, "what was her designation in 2024" must be answerable, and it is only
answerable if history is rows rather than a mutated column.

## 7. Invariants

- Employment periods for one employee never overlap in time (exclusion constraint).
- `joined_on` ≤ every period's `from`; `last_working_day` ≥ every period's `to`.
- `service_record` and `exit_clearance_item` are INSERT only.
- An employee cannot report to themselves, nor form a reporting cycle (trigger).
- A department cannot be archived while an open employment period is scoped to it — the same rule
  AD-27 already applies to authority scoped to an org unit.
- Exit cannot complete while any clearance item is outstanding.
- **Access revocation is same-day, enforced, not manual.** On `last_working_day`, a P9 job revokes
  sessions, devices and role assignments. D7's automation section names this; it is the invariant
  that stops a departed employee keeping a live session.
- Tenant RLS with FORCE; `employee.export` audited per P6.

## 8. Workload, and the boundary with M3

M13 records **how much** load an employee carries. M3 records **which** offerings they teach
(AD-40). They are different questions and the answer to the second produces the data for the first.

So `workload_allocation` is derived from M3's instructor assignments plus non-teaching duties
(administration, committee, lab supervision), and the policy ceiling check lives here. Warn when
load exceeds the ceiling from P8 settings; do not block, because a real institution genuinely
exceeds it in a bad term and needs to record that rather than be prevented from recording it.

## 9. Approvals (P1)

Appointment (HR Officer → Principal → Management). Confirmation after probation. Promotion.
Transfer between departments or campuses. Exit acceptance. Each clearance item, by its domain owner.

## 10. Notifications (P2)

Employee: appointment confirmed, probation ending, promotion recorded, document expiring,
clearance item pending, **exit checklist**.
HR: probation review due, contract expiring, qualification document expiring, clearance overdue.
HoD: new staff in department, exit initiated, workload above ceiling.

Contract expiry is the one that costs money when missed — a visiting contract that lapses unnoticed
means an unauthorised person teaching a timetabled class.

## 11. Scheduled work (P9)

Probation review reminders, contract expiry warnings at 90/30/7 days, document expiry warnings,
**same-day access revocation on `last_working_day`**, retirement-date notices, clearance escalation.

## 12. Documents (P3) and certificates (P4)

Documents: appointment letter, qualification certificates, experience letters, ID proof,
relieving letter. Kinds with `requires_verification`, retention class `statutory`.

Certificates via P4: experience letter, relieving letter, salary certificate, NOC.

## 13. Reports (P5)

Staff strength by department, designation and cadre. **Student-to-staff ratio** — an accreditation
requirement, and the number an institution is judged on. Workload distribution and outliers.
Qualification profile (another accreditation input). Age and retirement projection. Attrition by
department and reason. Vacancy against sanctioned strength. Probation and contract due lists.

## 14. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Staff directory | ✅ | ✅ — **the most-used screen in this module** |
| Employee record and service book | ✅ primary | ✅ |
| Appointment workflow | ✅ primary | ✅ approve |
| Qualification and documents | ✅ | ✅ upload by camera (P3) |
| Workload allocation | ✅ primary | ✅ read |
| My employment (self-service) | ✅ | ✅ — **phone primary** |
| Exit and clearance | ✅ primary | ✅ clearance actions |
| Reports | ✅ | ✅ via P5 |

Self-service matters: an employee checking their own service record, leave balance and payslip from
a phone removes most of HR's walk-in traffic.

## 15. Edge cases

- Dual role across two departments → two concurrent employment periods, non-overlapping only in
  *kind*; workload splits. The exclusion constraint in §7 applies per (employee, kind).
- Rejoins after resignation → same Person, same `employee`, new employment period, prior exit kept.
- Visiting faculty paid per lecture → employment kind `visiting`, workload without a ceiling, M15
  pays per M14's recorded delivery.
- Leaves mid-term with marks unsubmitted → exit clearance includes an academic item (M9/M10).
- Transfer between campuses → close period, open period, authority re-scoped by M1 (AD-2).
- Suspended pending a case (M21) → state `suspended`; authority suspended, employment continues,
  pay per policy.
- Death in service → exit kind, settlement to nominee, access revoked immediately, handled with
  the dignity of a distinct path rather than `termination`.
- Employee is also a student (a research scholar who teaches) → one Person, one employee record,
  one student record. **AD-14's separation is what makes this representable.**

## 16. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| HR-1 | Employee, employment period, designation; directory | S, W, F | M1, M2 |
| HR-2 | **Retro-fit `038_staff_attendance` onto `employee`** | S | staff-attendance |
| HR-3 | Qualifications and documents | S, W, F | P3 |
| HR-4 | Service record: confirmation, promotion, transfer | S, W, F | P1 |
| HR-5 | Appointment workflow and approval | S, W, F | P1, P2 |
| HR-6 | Workload allocation from M3 + duties; ceiling warning | S, W, F | M3 |
| HR-7 | Self-service "my employment" | S, W, F | — |
| HR-8 | Exit, clearance items, **same-day access revocation** | S, W, F | P1, P9, M1 |
| HR-9 | Certificates: experience, relieving, salary, NOC | S, W, F | P4 |
| HR-10 | Reports incl. student-staff ratio | S, W, F | P5 |

HR-1 and HR-2 are the priority: until staff attendance attaches to an employment record, it cannot
feed payroll and it cannot mean anything.

## 17. Cross-module impact

Reads M1 (Person), M2 (department, campus), M3 (instructor assignments for workload). Feeds M14
(leave entitlement by designation and kind), M15 (payroll inputs), M10 (evaluators, invigilators),
staff-attendance (employment context), M21 (subject of a case). Depends on P1, P2, P3, P4, P5, P9.
