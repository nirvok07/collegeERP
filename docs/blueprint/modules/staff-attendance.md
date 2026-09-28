# Staff Attendance — AD-83

Domain D7, delivered as slices SA-A1…SA-A5 and SA-ATT-1. Part of M14's territory but documented
separately because it is **the one module in this system with a specified control that does not
control**.

## 1. Status, stated precisely

| Piece | State |
|---|---|
| `029_campus_fence.sql` — fence columns on `campuses` | ✅ shipped |
| Admin configures a fence (institution module reads/writes it) | ✅ shipped |
| `038_staff_attendance.sql` — punch records | ✅ shipped |
| `SA-ATT-1` punch in/out endpoints and app screen | ✅ shipped |
| Web `PunchCard.tsx` (415 lines) | ✅ shipped |
| **Geo-fence enforcement** | ❌ **does not exist** |
| Reports, correction requests, reminders (SA-A2…A5) | ❌ not built |
| Attachment to an employment record | ❌ orphaned (see `hr-and-staff.md`) |

## 2. The defect, in full

AD-83 says: *geo-fenced punch in/out per campus, online only, coordinates checked then discarded.*
`029_campus_fence.sql`'s own header says: *"Staff punch in and out only [within the fence]. A campus
without a fence cannot be punched at."*

The schema is there. The admin UI is there. The check is not.

`server/src/modules/attendance/application/self-attendance.ts` — `punchIn()` takes
`(deps, actor)` and nothing else. Its repository port is
`punchIn(tx, { id, tenantId, personId, workDate, at })`. **There is nowhere for a coordinate to go.**
Both clients post an empty body:

```
api.post('/v1/me/staff-attendance/punch-in', {})      // clients/web/.../PunchCard.tsx:372
```

No code anywhere reads `fence_latitude` for the purpose of validating a punch. The only readers are
in `institution/infrastructure/repositories.ts`, which configure and display it.

**Any staff member can punch in from anywhere.** It is harmless today only because nothing consumes
the data. The moment M15 payroll reads it (P4 phase), it becomes attendance fraud with a money
consequence.

## 3. Why this matters beyond the bug

An ADR was approved, its schema was migrated, its admin UI was built, and the one line that made it
a control was never written — and the test suite did not notice.

It would not have been caught by "test unauthorised access" (`CLAUDE.md` §19) either, because the
caller **is** authorised. The missing check is a *business invariant*, and business invariants need
tests that assert the **negative case**: a punch outside the radius is refused.

That is the general lesson, and `docs/EXECUTION-CHECKLIST.md` P0-0 carries an item to sweep every
other AD-approved invariant for the same failure mode.

## 4. The decision required

Two honest options. **Do not leave a control that does not control.**

**(a) Enforce it.** Coordinates join the request contract; the server resolves the person's campus,
loads its fence, and refuses a punch outside the radius or at a fenceless campus. Coordinates are
discarded after the check per AD-83.

**(b) Amend AD-83 to drop the fence.** Punch becomes an honour-system record with supervisor
correction. Legitimate for a small institution, and it must then be written down, because the
schema and the ADR currently promise otherwise.

Recommended: **(a)**, with the web punch withdrawn (§6).

## 5. Enforcement design, if (a)

```
POST /v1/me/staff-attendance/punch-in   { latitude, longitude, accuracy_m }
```

Server:

1. Resolve the person's campus from their employment period (M13) — not from client input.
2. Load the campus fence. **No fence → refuse**, per 029's header.
3. Haversine distance ≤ `fence_radius_m + min(accuracy_m, 50)`. The accuracy allowance is bounded:
   an unbounded one lets a client claim 10 km accuracy and punch from anywhere.
4. Refuse with a message naming the campus and the distance, so an honest person who is genuinely
   at the gate understands why.
5. **Discard the coordinates.** Store `fence_verified boolean` and `accuracy_m`, never the point.
   AD-83 says checked then discarded, and storing staff location history is a surveillance decision
   this project has not taken.

Permission denied on the device is a **refusal**, not a silent pass. A punch that could not be
verified is not a verified punch.

## 6. The web punch

`PunchCard.tsx` cannot satisfy a fence: a desktop has no reliable location, and browser geolocation
on a LAN resolves to the ISP. Options:

- **Withdraw the punch action from web**, keep the card as a read-only "today" display. Recorded as
  a parity exception (AD-84 §6.4) with the reason — geo-fencing is a physical-presence check and the
  phone is the instrument.
- Or allow it and mark those punches `fence_verified = false`, visibly, so a supervisor sees which
  punches were unverified.

Recommended: withdraw, and keep the read-only display.

## 7. Entities (extending 038)

```
staff_attendance          tenant, person_id → employee_id (HR-2), work_date, punch_in_at,
                          punch_out_at, campus, fence_verified, accuracy_m, source(app|web|biometric)
attendance_correction     staff_attendance | (employee, work_date), kind(forgot_in|forgot_out|
                          off_site|leave), reason, state, approved_by   -- INSERT only, AD-13
work_calendar             tenant, campus, weekday_pattern, exceptions   -- reads M2 non_teaching_days
duty_exception            employee, date, kind(off_site|deputation|field_work), approved_by
```

## 8. Invariants

- One open punch per employee per work day; a second punch-in is a conflict, not a new row
  (**already correctly implemented** in `self-attendance.ts`).
- `punch_out_at` > `punch_in_at`; no punch-out without a punch-in.
- `work_date` is the **college's** calendar day, not UTC's (already correct: `workDateOf()` uses
  `Asia/Kolkata`; this hard-code moves to P8's tenant timezone setting).
- `attendance_correction` is INSERT only.
- A correction cannot be approved by its requester (P1 §6).
- **A punch outside the fence is refused** — the invariant this document exists for.
- No punch on a non-working day without an approved `duty_exception`.
- Tenant RLS with FORCE.

## 9. Corrections (SA-A4) via P1

Forgotten punches are the normal case, not the exception — people forget. The flow: employee
requests a correction with a reason → HoD approves → the corrected day stands, with both the
original absence and the correction visible.

A correction never deletes a punch. The record shows what the device recorded and what the
supervisor decided, which is the only version an audit accepts.

## 10. Notifications (P2) and scheduled work (P9)

**Local reminders** (AD-83) on the phone: punch-in at shift start, punch-out at shift end — local
notifications, no server round trip, suppressed on non-working days.
Server: missing punch-out at end of day, correction request pending, correction decided, monthly
summary available.
Jobs: close forgotten punch-outs at a cut-off (marked as such, never fabricated as a real time),
monthly summary generation, correction escalation.

**A job must never invent a punch time.** An auto-closed day is marked auto-closed. Writing a
plausible 5:30pm is manufacturing evidence.

## 11. Reports (P5)

Daily register by campus and department. Monthly summary per employee: present, absent, late,
half-day, on-leave (M14), hours. Late-arrival and early-departure patterns. Fence-verification
rate — **a low rate names a broken fence or a broken process**. Correction frequency by employee and
approver. Payroll input register (M15).

## 12. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Punch in/out | **withdrawn** (§6) | ✅ **primary, with fence** |
| Today's status | ✅ read-only | ✅ |
| My monthly summary | ✅ | ✅ |
| Correction request | ✅ | ✅ |
| Correction approval | ✅ | ✅ — HoD on a phone |
| Register and reports | ✅ primary | ✅ via P5 |
| Fence configuration | ✅ primary | ✅ |

## 13. Edge cases

- Two campuses within each other's radius → resolve by employment campus first, nearest second.
- Phone GPS unavailable indoors → the fence radius must be generous enough (25–2000 m per 029's
  CHECK) and refusal messages must be honest about why.
- Punch-in one day, punch-out after midnight → belongs to the **shift's** work date, not the
  calendar date of the punch-out.
- Employee on approved leave (M14) punches in → recorded, flagged; leave and presence disagreeing is
  a supervisor's question, not the system's to silently resolve.
- Deputation or field work → `duty_exception`, approved in advance.
- Device clock wrong → server time is authoritative; the client's `at` is never trusted (already
  correct: `deps.clock.now()`).
- Biometric device later (X-5) → `source = 'biometric'`, fence not applicable, same table.

## 14. Build slices

| Slice | Scope | Surfaces | Priority |
|---|---|---|---|
| **SA-FIX** | **Enforce or withdraw the fence (§4, §5, §6)** | S, W, F | **P0-0, highest** |
| HR-2 | Attach to `employee` (see `hr-and-staff.md`) | S | P4 |
| SA-A2 | Register and monthly summary, reports | S, W, F | P4 |
| SA-A3 | Work calendar and duty exceptions | S, W, F | P4 |
| SA-A4 | Correction requests via P1 | S, W, F | P4 |
| SA-A5 | Local reminders, server notifications | S, F | P4 |
| SA-A6 | Payroll input register for M15 | S | P4 |

SA-FIX is ahead of the schema drift in the P0 ordering because a control that does not control is
worse than a missing feature: it is a promise the system is not keeping.

## 15. Cross-module impact

Attaches to M13 (employee). Reads M2 (campus, non-teaching days), P8 (timezone). Feeds M14 (leave
reconciliation) and M15 (payroll days). Depends on P1 (corrections), P2, P9, P6 (audit of
corrections and fence overrides).
