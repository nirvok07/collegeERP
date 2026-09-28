# M22 — Events and Activities

Blueprint module M22, domain D9, phase 4. **Status: ⚠️ fragment.** CAL-2 shipped
`030_calendar_events.sql` — a title, a date, optional times, a note, drawn on the academic calendar
(`MODULE_REGISTRY.md`). That is an *announcement of a date*, not event management: no registration,
no participation, no credit, no resources.

M22 extends what exists rather than replacing it. **`calendar_events` stays the one source of truth
for "what is on the calendar"**; M22 adds the machinery around events that need it.

## 1. What this module owns

Event planning, registration, participation records, activity credit, and the resources an event
consumes.

It does **not** own: the calendar display (CAL-1/CAL-2, already built and shared), notices (M20 —
an event announcement is a notice targeted at the event's audience), rooms (M6 owns them, AD-46),
money (M11 — a participation fee is an invoice), or certificates (P4).

## 2. Not every event needs a module

Most calendar entries — a holiday, a guest lecture, "college closed" — need nothing more than
CAL-2 already provides. Building registration machinery for all of them would make adding a date to
the calendar a five-field chore.

So: an event is **promoted** to a managed event when it needs registration, capacity, fees,
attendance or credit. `calendar_event.managed_event_id` is nullable, and the simple path stays
simple. This is the smallest change that adds the capability without taxing the common case.

## 3. Permissions

```
event.read        normal     See events, own registrations
event.register    normal     Register for an event
event.manage      sensitive  Create and run managed events within scope
event.attendance  normal     Mark participation
credit.award      sensitive  Award activity credit
```

## 4. Entities

```
managed_event      tenant, calendar_event (CAL-2), kind(academic|cultural|sports|workshop|
                   seminar|placement|outreach), organiser, scope, capacity, fee_paise,
                   registration_opens, registration_closes, requires_approval, state, version
event_session      managed_event, title, from_at, to_at, room (M6), speaker
registration       managed_event, person, state, registered_at, invoice_ref (M11), team_ref
participation      managed_event | event_session, person, present, role(attendee|volunteer|
                   organiser|speaker|participant), marked_by, at
event_result       managed_event, person|team, position, award, certificate_ref (P4)
activity_credit    person, managed_event, credit_kind, points, awarded_by, term (M2)
event_resource     managed_event, kind(room|item|vehicle|budget), ref, state
team               managed_event, name, members[], captain
```

## 5. Lifecycle

```
managed_event:  proposed → approved → registration_open → registration_closed
                        → in_progress → completed → closed
                        ↘ rejected ↘ cancelled(reason)

registration:   applied → { confirmed | waitlisted } → attended
                        ↘ rejected ↘ cancelled ↘ no_show
```

## 6. Invariants

- Confirmed registrations may not exceed `capacity`; overflow waitlists (the same capacity rule as
  M17 beds and M18 seats — one pattern across D8 and D9).
- Registration is refused outside the open window, and outside the event's scope.
- A person registers once per event.
- Participation may only be marked for a confirmed registration, or for a declared walk-in.
- **A room booking goes through M6**, which owns rooms (AD-46) and already prevents double-booking.
  M22 requests; M6 decides. An event that books a room by writing its own row would defeat the
  conflict prevention M6 already enforces in the database.
- Activity credit is awarded once per person per event.
- Fees are M11's (AD-6).
- Tenant RLS with FORCE.

## 7. Activity credit, and why it is here

Many programmes require non-academic credit — NSS, NCC, sports, cultural, professional society
activity — and accreditation bodies ask for participation evidence.

Credit is recorded here and **read** by M10 for any graduation requirement, never stored as a
derived total on the student (AD-7). A student's credit position is computed from
`activity_credit` rows.

This is the quiet reason M22 matters: without it, participation lives in a coordinator's
spreadsheet and the accreditation return is assembled by hand every year.

## 8. Approvals (P1), notifications (P2), scheduled work (P9)

**Approvals:** event proposal (organiser → HoD → Principal by scale), budget, room allocation via
M6, off-campus events (higher bar, guardian consent for minors), credit award.

**Notifications:** announced (via M20's audience engine), registration opening and closing,
confirmed or waitlisted, **waitlist promotion**, reminder the day before, venue or time changed,
cancelled, certificate available.

**Jobs:** registration window transitions, waitlist promotion on cancellation, day-before
reminders, participation-marking chase after the event, credit posting, certificate generation.

## 9. Reports (P5)

Participation by event, department, programme and student. Activity credit position per student —
the accreditation input. Event calendar with resource usage. Registration versus attendance
(no-show rate names events that are over-subscribed on paper). Budget against actual. Student
engagement: who participates in nothing, which is a pastoral signal worth surfacing.

## 10. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Event list and detail | ✅ | ✅ **primary — students browse on a phone** |
| **Register** | ✅ | ✅ **primary, one tap** |
| My events and credit | ✅ | ✅ **primary** |
| Propose and configure | ✅ **primary** | ✅ simplified |
| **Mark participation** | ✅ | ✅ **primary — at the door, on a phone** |
| Team formation | ✅ | ✅ |
| Results and awards | ✅ primary | ✅ |
| Resources and budget | ✅ **primary** | ✅ read |
| Reports | ✅ primary | ✅ via P5 |

Marking participation is phone-first and reuses the attendance-marking interaction the teachers'
app already has — a list, a toggle, an offline-safe submit (AD-58, AD-59). It should feel identical,
because it is the same act.

## 11. Edge cases

- Event cancelled after paid registrations → M11 refunds; participants notified immediately.
- Clashes with a scheduled class (M6) → warned at proposal; attendance implications are the
  organiser's to resolve with the HoD, not the system's to decide.
- Student registers then never attends → `no_show`, which matters for repeat-registration policy.
- Walk-in participant → recorded without a registration, flagged as such.
- Multi-day event → `event_session` rows; participation per session, credit for the event.
- Inter-college participants → guests, recorded without accounts.
- Off-campus event with minors → guardian consent recorded before confirmation; a hard stop.
- Event needs a room already taken → M6 refuses; the conflict surfaces at proposal, not on the day.
- Credit disputed → a correction with an approval, never an edit (AD-13).
- Organiser leaves mid-planning → ownership transfers; an event with no live organiser is alerted.

## 12. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| EVT-1 | `managed_event` extending `calendar_events`; promotion (§2) | S, W, F | CAL-2 |
| EVT-2 | Sessions, room request via M6 | S, W, F | M6 |
| EVT-3 | **Registration, capacity, waitlist** | S, W, F | P9 |
| EVT-4 | Fees via M11 | S | M11 |
| EVT-5 | **Participation marking** (offline-safe) | S, W, F | AD-58, AD-59 |
| EVT-6 | Teams and results | S, W, F | — |
| EVT-7 | **Activity credit** | S, W, F | M10 read |
| EVT-8 | Certificates via P4 | S, W, F | P4 |
| EVT-9 | Announcement via M20's audience engine | S, W, F | M20 |
| EVT-10 | Resources and budget | S, W | M19 |
| EVT-11 | Reports | S, W, F | P5 |

## 13. Cross-module impact

Extends CAL-2's `calendar_events`. Requests rooms from M6 (AD-46). Announces through M20. Charges
M11. Feeds M10 (activity credit for graduation requirements) and M23 (participation strengthens a
placement profile). Reads M5 and M13 for audiences. Depends on P1, P2, P4, P5, P9.
