# M18 — Transport

Blueprint module M18, domain D8. **Status: ❌ not built.** The third expression of M16's allocation
primitive, and the simplest: a seat on a route for a term, charged through M11.

## 1. What this module owns

Routes, stops and schedules; vehicles and their compliance documents; drivers and attendants;
passes allocating a student or staff member to a route and stop; and trip records.

It does **not** own money (M11), staff records (M13 — a driver is an employee), student records
(M5), or vehicle procurement and maintenance costs (M19 owns the asset; M18 owns its use).

## 2. Permissions

```
transport.read      normal     Routes, stops, own pass
transport.manage    sensitive  Routes, stops, vehicles, schedules
pass.issue          normal     Issue, transfer, cancel a pass
trip.record         normal     Record a trip, boarding
vehicle.compliance  sensitive  Fitness, insurance, permit, pollution documents
```

## 3. Entities

```
route             tenant, campus, name, code, direction, distance_km, active, version
stop              route, sequence, name, landmark, latitude, longitude, pickup_time, drop_time
vehicle           tenant, registration_no, kind, capacity, asset_ref (M19), state, version
vehicle_document  vehicle, kind(fitness|insurance|permit|pollution|tax), number, valid_to,
                  document_id (P3)
crew_assignment   vehicle, employee (M13), role(driver|attendant), from, to
route_schedule    route, vehicle, weekday_pattern, effective_from, effective_to
transport_pass    person, route, stop, academic_year|term, from_date, to_date, state,
                  fare_paise, invoice_ref (M11), pass_no, version
trip              route_schedule, on_date, vehicle, driver, started_at, completed_at, state
boarding          trip, stop, person, at, direction   -- optional, where scanning is used
incident          trip|vehicle, kind, description, case_ref (M21), at
```

## 4. Invariants

- Active passes on a route may not exceed the assigned vehicle's capacity for that schedule
  (trigger). **Overselling seats is this module's version of hostel double-allocation.**
- One active pass per person per term.
- A stop belongs to exactly one route at one sequence position; `sequence` is unique per route.
- A vehicle with an **expired compliance document cannot be scheduled** — enforced, not warned.
  Running a bus with lapsed fitness or insurance is a legal exposure the system must refuse to
  facilitate, and this is the one hard stop in the module.
- A driver must hold a valid licence record (M13 qualification, P3 verified) to be assigned.
- `pass_no` is gapless per tenant (M11's rule).
- Fares are integer paise, INR (M11 §3).
- Charges are M11's (AD-6).
- Tenant RLS with FORCE.

## 5. Lifecycle

```
pass:     requested → issued → active → { expired | cancelled | transferred }
trip:     scheduled → started → completed
                    ↘ cancelled (reason) ↘ breakdown → replaced
vehicle:  active → { maintenance | grounded(document expired) } → active → retired
```

## 6. Money boundary (M11)

Fare by route distance band or a flat rate, per term or per year, invoiced on pass issue. Pro-rata
refund on cancellation per policy. A change of stop mid-term is a fare adjustment, credit or debit,
through M11. No balance is held here.

## 7. Approvals (P1)

Route creation and changes (Transport Manager → Principal — a route change affects families' daily
logistics and is not a casual edit). Fare setting. Pass cancellation with refund. Vehicle grounding
and return to service. Crew assignment.

## 8. Notifications (P2)

Passenger and guardian: pass issued, **pass expiring**, fare due, route or timing changed,
**trip cancelled or delayed**, vehicle breakdown with the replacement arrangement.
Manager: compliance document expiring at 60/30/7 days, capacity nearly full, trip not started,
incidents.
Crew: schedule assignment, route change.

Trip cancellation notification is the one parents judge the system by: a bus that does not arrive
with no message is the complaint that reaches the Principal.

## 9. Scheduled work (P9)

**Compliance expiry warnings and automatic grounding** on the expiry date. Pass expiry and renewal
reminders. Capacity utilisation snapshots. Trip generation from schedules. Unstarted-trip alerts.
Fare-due reminders.

Automatic grounding is a job, not a UI action, because it must happen whether or not anyone is
looking (§4).

## 10. Reports (P5)

Route utilisation and cost per passenger — the number that decides whether a route survives.
Pass register by route and stop. Fare collection and outstanding. Vehicle compliance status with
expiry ageing. Trip completion and punctuality. Incident log. Dues for exit clearance. Stop-wise
demand, which is how a new route is justified.

## 11. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Routes, stops, schedules | ✅ **primary** | ✅ read |
| Vehicles and compliance | ✅ primary | ✅ + camera for documents (P3) |
| Pass request | ✅ | ✅ **primary** |
| Pass issue and register | ✅ primary | ✅ |
| My pass and route timing | ✅ | ✅ **primary** |
| Trip start/complete, incidents | ✅ | ✅ **primary — the driver has a phone** |
| Boarding scan | — | ✅ **phone only, exception recorded** |
| Reports | ✅ | ✅ via P5 |

Route and schedule design is web-first (a map and a sequence editor). Everything operational —
the driver starting a trip, a student checking whether the bus is running, a parent seeing a delay —
is phone-first.

## 12. Deliberately out of scope for v1

**Live GPS tracking.** It needs a device fleet, a streaming ingest path, a maps licence and a
location-retention policy — and it is what every stakeholder asks for first. It is a project of its
own, and recorded here so it is scoped deliberately rather than half-built into a term's work.

The `latitude`/`longitude` on `stop` are for displaying a route, not for tracking a vehicle. When
tracking is built it gets an ADR covering retention, because continuous location history of minors
is a decision, not a feature.

## 13. Edge cases

- Boards without a valid pass → recorded as an exception; enforcement is the institution's policy,
  and the register is the evidence either way.
- Breakdown mid-route → replacement vehicle on the same trip, both recorded; passengers notified.
- Stop changed mid-term → fare adjustment via M11, pass updated, history kept.
- Route discontinued → passes transferred or refunded; nobody is left with a pass to nowhere.
- Sibling passes on the same route → separate passes, possible family discount as an M11 concession.
- Staff using transport → same pass model, fare per HR policy, possibly nil.
- Vehicle sold or retired → M19 asset disposal; open schedules must be reassigned first.
- Compliance document renewed the day after expiry → grounded in between; the gap is visible.
- Trip on a non-working day → refused unless an exception is recorded (reads M2 calendar, AD-39).

## 14. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| TRA-1 | Routes, stops, sequences, timings | S, W, F | M2 |
| TRA-2 | Vehicles, **compliance documents and grounding** | S, W, F | P3, P9 |
| TRA-3 | Crew assignment with licence validation | S, W, F | M13 |
| TRA-4 | Schedules and capacity | S, W, F | — |
| TRA-5 | **Pass request, issue, fare via M11** | S, W, F | M11, P1 |
| TRA-6 | My pass and route timings | W, F | — |
| TRA-7 | Trips: start, complete, cancel, incidents | S, W, F | P2 |
| TRA-8 | Boarding record (phone) | S, F | — |
| TRA-9 | Clearance answer for M4 §11 | S | AD-28 |
| TRA-10 | Reports | S, W, F | P5 |

TRA-2 before TRA-5: passes should not be sold for a route whose vehicle cannot legally run.

## 15. Cross-module impact

Reads M5 (students), M13 (drivers, licences), M2 (campus, calendar), M19 (vehicle as an asset).
Charges M11. Raises cases into M21. Answers M4's clearance capability. Depends on P1, P2, P3, P5, P9.
