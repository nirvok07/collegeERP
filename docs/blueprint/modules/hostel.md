# M17 — Hostel

Blueprint module M17, domain D8. **Status: ❌ not built.** Reuses M16's allocation primitive: a
finite resource held by a person for a period, charged through M11.

## 1. What this module owns

Hostel blocks, rooms and beds; allocation and vacating; the mess register; gate passes and
in/out movement; hostel discipline as it touches residence.

It does **not** own money (M11), discipline cases (M21 — a hostel incident is a case), the student
record (M5), or staff quarters unless the tenant configures a block for staff.

## 2. Bed, not room, is the unit

A room has four beds. Three are occupied. Allocating "room 214" is meaningless; allocating "room
214, bed C" is the operation. Every real hostel question — occupancy, vacancy, who is next to whom,
which bed is free from Monday — is a bed question.

Occupancy percentages computed from rooms are the classic source of a hostel that reports space it
does not have.

## 3. Permissions

```
hostel.read        normal     Blocks, rooms, own allocation
hostel.allocate    normal     Allocate, transfer, vacate. The warden's daily operation
hostel.manage      sensitive  Blocks, rooms, beds, fee linkage, policy
mess.manage        normal     Mess register, menu, attendance
gatepass.issue     normal     Issue and close a gate pass
gatepass.approve   normal     Approve an overnight or long absence
```

## 4. Entities

```
hostel_block      tenant, campus, name, gender(male|female|mixed), warden (M13), capacity, version
hostel_room       block, floor, number, kind(single|double|triple|dormitory), capacity, condition
hostel_bed        room, label, state(available|allocated|blocked|maintenance), version
hostel_application student, academic_year, preferences{}, state, priority_score
allocation        bed, student, from_date, to_date, state, allotted_by, invoice_ref (M11), version
room_transfer     allocation, to_bed, reason, approved_by, effective_date   -- INSERT only
mess_registration student, plan, from_date, to_date, state, invoice_ref (M11)
mess_attendance   student, meal_date, meal(breakfast|lunch|snacks|dinner), present
gate_pass         student, kind(day|overnight|vacation), out_at, expected_in, actual_in,
                  reason, destination, guardian_informed, approved_by, state
hostel_incident   student, kind, description, case_ref (M21), at
inventory_item    room, item, quantity, condition   -- furniture, fittings
```

## 5. Lifecycle

```
application:  submitted → { shortlisted → allotted | waitlisted | rejected }

allocation:   allotted → occupied → { transferred | vacated }
                                  ↘ terminated (discipline)

gate_pass:    requested → approved → out → returned
                       ↘ rejected  ↘ overdue → escalated
```

## 6. Invariants

- A bed holds at most one active allocation at a time (unique partial index). **The invariant this
  module exists to protect** — double allocation is the failure a warden discovers at 11pm.
- A student holds at most one active allocation.
- Gender of a block is enforced against the student record where the block is not `mixed`.
- A room's active allocations never exceed its capacity (trigger, belt and braces over the bed index).
- Allocation dates fall within the academic year; `to_date` ≥ `from_date`.
- A bed in `maintenance` cannot be allocated.
- `room_transfer` is INSERT only; a transfer closes one allocation and opens another.
- A gate pass cannot be approved by the student themselves, and an overnight pass for a minor
  requires a recorded guardian approval.
- Charges are M11's (AD-6); M17 holds no balance.
- Tenant RLS with FORCE.

## 7. Allocation policy

Applications carry a `priority_score` computed from declared, auditable criteria — distance from
home, year of study, category, merit, sibling, special need — each weighted per tenant policy in P8.

The score is **computed and shown with its components**, never a bare number. A warden explaining
why one student got a room and another did not needs the derivation, and so does the institution
when the parent calls.

Allocation itself is a deliberate action, not an automatic one: the system ranks, a human allots.

## 8. Money boundary (M11)

Hostel fee on allocation, mess charges per the plan or per attendance, security deposit on
allocation and its refund on vacating, damage recovery from the deposit. All M11 invoices and
credits raised by domain events.

The deposit refund is the one that gets contested. It runs through M11 with a stated deduction and
reason, and the room inventory (§4) is the evidence.

## 9. Approvals (P1)

Allocation (Warden, above policy → Principal). Room transfer. Early vacating with refund. Overnight
and vacation gate passes. Deposit deduction. Termination on disciplinary grounds (→ M21 case first).

## 10. Notifications (P2)

Student: application status, **allocation with room and bed**, fee due, vacating reminder before
term end, gate pass approved, gate pass overdue.
Guardian: allocation confirmed, **overnight pass approved**, pass overdue, incident. Guardian
notification is not optional for a residential minor, and it is the single most valued feature by
parents.
Warden: applications pending, vacancy on vacating, **gate passes overdue**, mess attendance
anomalies, incidents.

## 11. Scheduled work (P9)

Mess charge computation (nightly or monthly per plan). Gate pass overdue escalation — a pass whose
`expected_in` has passed and `actual_in` is null escalates to the warden and the guardian.
Vacating reminders. Allocation expiry at year end. Occupancy snapshot for reporting. Deposit refund
eligibility on vacate + clearance.

Gate pass overdue escalation is a **safety** feature, not an administrative one, and it is why P9 is
a hard dependency rather than a nicety.

## 12. Reports (P5)

Occupancy and vacancy by block, room kind and gender. Allocation register. Waitlist with scores.
Mess attendance and cost per student. Gate pass register, and overdue history by student.
Incident log. Dues for exit clearance. Deposit liability outstanding — a real balance-sheet number.

## 13. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Blocks, rooms, beds setup | ✅ primary | ✅ read |
| Application | ✅ | ✅ **primary for students** |
| Allocation board (visual bed map) | ✅ **primary** | ✅ read |
| My allocation and dues | ✅ | ✅ **primary** |
| **Gate pass request and approval** | ✅ | ✅ **primary — both sides on a phone** |
| Gate in/out marking | ✅ | ✅ **primary — at the gate, on a phone** |
| Mess attendance | ✅ | ✅ **primary — at the mess door** |
| Room inventory and condition | ✅ | ✅ camera evidence (P3) |
| Reports | ✅ | ✅ via P5 |

The allocation board is the one genuinely web-first screen: a visual map of blocks, rooms and beds
with drag-to-allot is a large-screen interaction. Everything else in this module happens while
standing up, which is why it is the strongest case in D8 for AD-84 parity.

## 14. Edge cases

- Vacates mid-term → pro-rata refund through M11 per policy; bed returns to the pool from the
  effective date, not immediately, so the cleaning window is not double-booked.
- Room reallocated while the occupant is on long leave → refused; leave is not vacating. Named
  explicitly in `02-domains.md`'s D8 edge cases.
- Student suspended (M21) → allocation state reflects it; whether the bed is held is a policy
  setting, not an improvisation.
- Damage beyond the deposit → M11 charge for the balance.
- Gate pass not closed because the student returned through another gate → closed manually with a
  recorded actor; never auto-closed silently.
- Guardian contact missing for a minor → overnight pass cannot be approved. A hard stop.
- Block converted between genders between years → allocations are per academic year; conversion
  applies to the next year's allocation round.
- Two students swap rooms informally → a transfer must be recorded, or the register and reality
  diverge and the fire roll is wrong.
- Vacation period: some students stay → `vacation` pass kind plus a vacation-stay register.

## 15. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| HOS-1 | Blocks, rooms, beds; capacity invariants | S, W, F | M2 |
| HOS-2 | Applications, priority scoring with derivation | S, W, F | P8 |
| HOS-3 | **Allocation, transfer, vacate** | S, W, F | P1, M11 |
| HOS-4 | Allocation board | W | — |
| HOS-5 | Fees, deposit, refund via M11 | S | M11, P9 |
| HOS-6 | Mess registration, attendance, charges | S, W, F | P9 |
| HOS-7 | **Gate passes with guardian notification and overdue escalation** | S, W, F | P2, P9 |
| HOS-8 | Room inventory and damage assessment | S, W, F | P3 |
| HOS-9 | Incidents linked to M21 | S, W, F | M21 |
| HOS-10 | Clearance answer for M4 §11 | S | AD-28 |
| HOS-11 | Reports | S, W, F | P5 |

## 16. Cross-module impact

Reads M5 (student, gender, year), M2 (campus, calendar), M13 (warden). Charges M11. Raises cases
into M21. Answers M4's clearance capability. Notifies guardians (needs M4's ADM-A14 guardian
accounts for the full experience; falls back to a stored contact until then). Depends on P1, P2,
P3, P5, P9.
