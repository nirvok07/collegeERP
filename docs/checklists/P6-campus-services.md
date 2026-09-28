# P6 — D8 Campus Services

Docs: `library.md`, `hostel.md`, `transport.md`, `materials-and-assets.md`, plus `scholarships.md`
and `coursework.md`.

`02-domains.md` groups library, hostel, transport and materials as one domain because they are four
expressions of **one primitive**: a finite resource allocated to a person for a period, with issue,
return, condition and charge.

**M16 first** — it is the fullest expression, and LIB-3 + LIB-5 prove the primitive that M17 and
M18 reuse.

🔴 **OD-ACC-1 (P0-7) must be answered before M19** — payables need a destination.

---

# M16 — Library

## LIB-1 — Catalogue and holdings
- [ ] `MIG` `library_item`: tenant, title, authors, isbn, publisher, year, edition, classification,
      subjects, kind(book|journal|thesis|ebook|media), version
- [ ] `MIG` `holding`: item, accession_no, campus, location, condition, status, acquired_ref (M19),
      cost_paise, version
- [ ] `MIG` Gapless `accession_no` per tenant; 🔴 **never reused, even after a write-off**
- [ ] `SVC` 🔴 **The catalogue/holding split** (doc §2): a reservation queues against the *item*;
      an issue attaches to a *holding*. Collapsing them means you cannot answer "how many copies do
      we have and where are they", which is the entire job of a library
- [ ] `WEB` `APP` Catalogue search; `APP` **primary for students**
- [ ] `WEB` `APP` Cataloguing and accession; `APP` camera ISBN capture
- [ ] `TEST` Three copies of one title = one item, three holdings

## LIB-2 — Membership
- [ ] `MIG` `membership_class`: tenant, applies_to(student|staff), max_items, loan_days,
      renewals_allowed, fine_per_day_paise, fine_cap_paise, reserve_allowed, version
- [ ] `MIG` `membership`: person, class, valid_from, valid_to, state
- [ ] `SVC` Staff membership follows employment (M13); exit revokes it

## LIB-3 — 🔴 Circulation with named refusal reasons
- [ ] `MIG` `circulation`: holding, person, issued_at, due_on, returned_at, renewals, state,
      issued_by, returned_by, version
- [ ] `MIG` 🔴 Unique partial index: a holding has at most one open circulation
- [ ] `SVC` Issue refused when: membership invalid or expired, `max_items` reached, unpaid fine over
      threshold, holding not available
- [ ] `SVC` 🔴 **Every refusal names its reason.** A counter that says "cannot issue" without saying
      why creates a queue
- [ ] `SVC` `due_on` is a calendar date (AD-49), computed from the work calendar so it never lands
      on a closing day
- [ ] `SVC` Renewal refused when a reservation exists — **the queue outranks the holder**
- [ ] `API` `/v1/library/circulation/issue`, `/return`, `/renew`
- [ ] `WEB` Counter — **web primary** (a desk with a scanner)
- [ ] `APP` Counter with barcode via camera, for a mobile issue desk during admissions week
- [ ] `TEST` Double-issue of one holding refused under concurrency
- [ ] `TEST` Each refusal path returns a distinct, human reason

## LIB-4 — Reservations
- [ ] `MIG` `reservation`: item, person, placed_at, state, expires_at, fulfilled_holding
- [ ] `JOB` Reservation expiry and queue advance
- [ ] `WEB` `APP` Reserve and queue position; `APP` primary
- [ ] `TEST` Item withdrawn while reserved → reservations cancelled and notified, never silently dropped

## LIB-5 — 🔴 Fine accrual to M11
- [ ] `MIG` `fine`: circulation, kind(overdue|damage|loss), amount_paise, state, invoice_ref (M11),
      waiver_ref
- [ ] `JOB` Nightly accrual per day at the class rate, **capped at `fine_cap_paise`**
- [ ] `SVC` 🔴 Idempotent by `(circulation, date)` — running twice must not double-charge
- [ ] `SVC` Accrual stops on return, on declared loss, and on days the library is closed
- [ ] `SVC` 🔴 The fine is **charged to M11, not held here** (AD-6). A student's dues are one number
      across fees, library, hostel and transport
- [ ] `TEST` Job run twice charges once
- [ ] `TEST` 🔴 An uncapped fine would exceed the book's replacement cost — the cap prevents it

## LIB-6…LIB-11
- [ ] `S` `W` `F` Waivers and write-offs via P1; a waiver is a reversing entry, never a delete
- [ ] `WEB` `APP` Student self-service: my loans, dues, reserve — `APP` primary
- [ ] `MIG` `stock_verification`; `APP` 🔴 **phone-first — walking shelves scanning accession barcodes**
- [ ] `S` `W` Bulk catalogue import via CAP-8
- [ ] `S` Clearance answer for ADM-A11
- [ ] `S` Reports: circulation, overdue ageing, fine collection and waivers, most and **least**
      borrowed (which informs deselection), holdings by classification, verification discrepancies
- [ ] `S` 🔴 Per-student borrowing history is a **sensitive read, audited** — what a person reads
      is private
- [ ] `TEST` Lost book → replacement charge to M11, holding `lost`, accession never reused
- [ ] `TEST` Graduating student with a book out blocks exit clearance and the TC

---

# M17 — Hostel

## HOS-1 — Blocks, rooms, beds
- [ ] `MIG` `hostel_block`: tenant, campus, name, gender(male|female|mixed), warden (M13), capacity
- [ ] `MIG` `hostel_room`: block, floor, number, kind, capacity, condition
- [ ] `MIG` `hostel_bed`: room, label, state(available|allocated|blocked|maintenance), version
- [ ] `SVC` 🔴 **Bed, not room, is the unit** (doc §2). Occupancy computed from rooms is the classic
      source of a hostel reporting space it does not have
- [ ] `WEB` `APP` Setup; `WEB` primary

## HOS-2 — Applications and priority
- [ ] `MIG` `hostel_application`: student, academic_year, preferences, state, priority_score
- [ ] `SVC` Score from declared weighted criteria in P8: distance, year, category, merit, sibling,
      special need
- [ ] `SVC` 🔴 Computed and **shown with its components**, never a bare number. A warden explaining
      why one student got a room and another did not needs the derivation — so does the institution
      when the parent calls
- [ ] `SVC` The system ranks; **a human allots**

## HOS-3 — 🔴 Allocation
- [ ] `MIG` `allocation`: bed, student, from_date, to_date, state, allotted_by, invoice_ref, version
- [ ] `MIG` `room_transfer`: INSERT only
- [ ] `MIG` 🔴 Unique partial index: one active allocation per bed. **The invariant this module
      exists to protect** — double allocation is what a warden discovers at 11pm
- [ ] `MIG` Trigger: one active allocation per student
- [ ] `MIG` Trigger: block gender enforced against the student record unless `mixed`
- [ ] `MIG` Trigger: a bed in `maintenance` cannot be allocated
- [ ] `SVC` A transfer closes one allocation and opens another
- [ ] `WEB` `APP` Allocate, transfer, vacate
- [ ] `TEST` Concurrent allocation of one bed: one wins
- [ ] `TEST` Room reallocated while the occupant is on long leave → **refused; leave is not vacating**

## HOS-4 — Allocation board
- [ ] `WEB` Visual bed map with drag-to-allot — **web only, parity exception recorded**

## HOS-5 — Fees, deposit, refund
- [ ] `S` Hostel fee on allocation, security deposit, pro-rata refund on vacating — all M11
- [ ] `SVC` 🔴 Deposit refund with a **stated deduction and reason**; the room inventory is the
      evidence. This is the one that gets contested

## HOS-6 — Mess
- [ ] `MIG` `mess_registration`, `mess_attendance`
- [ ] `JOB` Mess charge computation per plan or per attendance
- [ ] `APP` **Primary — marking at the mess door**

## HOS-7 — 🔴 Gate passes
- [ ] `MIG` `gate_pass`: student, kind(day|overnight|vacation), out_at, expected_in, actual_in,
      reason, destination, guardian_informed, approved_by, state
- [ ] `SVC` 🔴 An overnight pass for a minor requires a **recorded guardian approval — a hard stop**
- [ ] `SVC` Guardian contact missing for a minor → cannot approve
- [ ] `JOB` 🔴 **Overdue escalation**: `expected_in` passed and `actual_in` null → escalate to warden
      **and guardian**. This is a *safety* feature, not an administrative one, and it is why P9 is a
      hard dependency
- [ ] `WEB` `APP` Request, approve, mark in/out; `APP` **primary on all three — at the gate**
- [ ] `TEST` Overdue escalates; a minor's overnight pass without guardian approval is refused
- [ ] `TEST` Closed manually because the student returned by another gate → recorded actor, never
      auto-closed silently

## HOS-8…HOS-11
- [ ] `MIG` `inventory_item` per room (furniture, fittings); condition with camera evidence (P3)
- [ ] `S` `W` `F` Incidents linked to M21
- [ ] `S` Clearance answer for ADM-A11
- [ ] `S` Reports: occupancy and vacancy by block/kind/gender, allocation register, waitlist with
      scores, mess cost per student, gate pass register and overdue history, incident log,
      **deposit liability outstanding** (a real balance-sheet number)
- [ ] `TEST` Two students swapping rooms informally → must be recorded, or the register and reality
      diverge and **the fire roll is wrong**

---

# M18 — Transport

## TRA-1 — Routes and stops
- [ ] `MIG` `route`, `stop` (sequence unique per route, latitude/longitude **for display only**)
- [ ] `WEB` Route and sequence editor — **web primary**

## TRA-2 — 🔴 Vehicles and compliance grounding
- [ ] `MIG` `vehicle`, `vehicle_document`: kind(fitness|insurance|permit|pollution|tax), valid_to,
      document_id (P3)
- [ ] `MIG` 🔴 Trigger: **a vehicle with an expired compliance document cannot be scheduled.**
      Enforced, not warned — running a bus with lapsed fitness or insurance is a legal exposure the
      system must refuse to facilitate. This is the one hard stop in the module
- [ ] `JOB` Expiry warnings at 60/30/7 days; **automatic grounding on the expiry date** — a job, not
      a UI action, because it must happen whether or not anyone is looking
- [ ] `TEST` Scheduling a grounded vehicle refused; grounding happens without human action

## TRA-3 — Crew
- [ ] `MIG` `crew_assignment`: vehicle, employee (M13), role(driver|attendant), from, to
- [ ] `SVC` A driver must hold a valid licence record (M13 qualification, P3 verified)

## TRA-4 — Schedules and capacity
- [ ] `MIG` `route_schedule`
- [ ] `MIG` 🔴 Trigger: active passes may not exceed the assigned vehicle's capacity —
      **this module's version of hostel double-allocation**

## TRA-5 — Passes
- [ ] `MIG` `transport_pass`: person, route, stop, term, from_date, to_date, state, fare_paise,
      invoice_ref, pass_no, version
- [ ] `MIG` Gapless `pass_no`; one active pass per person per term
- [ ] `S` Fare by distance band or flat, invoiced through M11; stop change mid-term is a fare
      adjustment, credit or debit
- [ ] `DOC` **TRA-2 before TRA-5**: passes should not be sold for a route whose vehicle cannot legally run

## TRA-6…TRA-10
- [ ] `WEB` `APP` My pass and route timings — `APP` primary
- [ ] `MIG` `trip`, `boarding`, `incident`
- [ ] `APP` 🔴 **Trip start/complete and incidents — the driver has a phone**
- [ ] `APP` Boarding scan — **phone only, exception recorded**
- [ ] `S` 🔴 Trip cancellation notification — *the one parents judge the system by*: a bus that does
      not arrive with no message is the complaint that reaches the Principal
- [ ] `S` Clearance answer for ADM-A11
- [ ] `S` Reports: route utilisation and **cost per passenger** (the number that decides whether a
      route survives), pass register, fare collection, compliance status with ageing, trip
      punctuality, stop-wise demand
- [ ] `DOC` 🔴 **Live GPS tracking is explicitly out of scope.** It needs a device fleet, streaming
      ingest, a maps licence and a location-retention policy, and it is what every stakeholder asks
      for first. Continuous location history of minors is a decision, not a feature — it gets its
      own ADR

---

# M19 — Materials and Assets

🔴 **Blocked until OD-ACC-1 (P0-7).**

## MAT-1 — Items and stores
- [ ] `MIG` `item_category`: kind(consumable|asset), depreciation_rate, asset_threshold_paise
- [ ] `MIG` `item`, `store`
- [ ] `SVC` 🔴 **Consumable and asset are different things** (doc §2). A box of chalk is consumed; a
      microscope is owned for ten years and depreciated. Modelling both as inventory gives a stock
      ledger that cannot answer the auditor; modelling both as assets gives a register with forty
      thousand pencils in it

## MAT-2 — Stock ledger
- [ ] `MIG` `stock`, `stock_movement` (INSERT only, append-only)
- [ ] `MIG` 🔴 Trigger: stock may not go negative. An issue beyond stock is **refused, not recorded
      as −3**
- [ ] `SVC` Quantity derived from movements; `stock.quantity` is a materialised convenience —
      a declared AD-7 exception with a nightly reconciliation job as its price
- [ ] `JOB` Reconciliation with divergence alert; reorder alerts

## MAT-3 — Vendors
- [ ] `MIG` `vendor`: gstin, category, rating, blacklisted
- [ ] `SVC` A blacklisted vendor cannot receive a new purchase order; open orders complete

## MAT-4…MAT-8 — Indent to payable
- [ ] `MIG` `indent`, `purchase_request`, `quotation`, `purchase_order`, `goods_receipt`,
      `invoice_payable`
- [ ] `MIG` Gapless PO and GRN numbers per tenant per year
- [ ] `SVC` Chain via P1: indent → HoD → store check (issue or purchase) → quotations →
      comparative statement → purchase committee → Principal → PO → GRN → payable
- [ ] `SVC` 🔴 **A PO above a threshold requires quotations** — count and threshold from P8.
      This is the anti-corruption control, and it is enforced, not advisory
- [ ] `SVC` 🔴 **Nobody approves their own indent** (P1 §6). Where the HoD is the requester, the
      chain escalates to the Principal rather than auto-approving — the exact case P1 §6 exists for
- [ ] `SVC` GRN quantity may not exceed PO quantity without an approved variance
- [ ] `SVC` Emergency purchase without quotations allowed **with a recorded justification and a
      higher approval** — forbidding it entirely means people work around the system
- [ ] `APP` 🔴 Goods receipt at the loading dock, with camera evidence
- [ ] `APP` 🔴 Indent raised and approved from anywhere
- [ ] `TEST` PO above threshold without quotations refused; self-approval escalates

## MAT-9…MAT-14 — Assets
- [ ] `MIG` `asset`, `asset_movement`, `depreciation_run`
- [ ] `MIG` `asset_tag` unique per tenant, **never reused after disposal**
- [ ] `MIG` Trigger: an asset with open custody cannot be written off
- [ ] `SVC` `asset.writeoff` is `critical` — it destroys value on the books
- [ ] `APP` 🔴 **Physical verification phone-first — walking the campus scanning tags** with camera
      evidence. Doing it with a clipboard and transcribing later is how asset registers become fiction
- [ ] `SVC` Depreciation straight-line or WDV per category; a posted run is **frozen** — a
      correction is a new adjusting entry, never an edit (M15 and AD-23 discipline)
- [ ] `S` Asset item for M13 exit clearance
- [ ] `S` Reports: stock position and valuation, movement register, consumption by department (next
      year's budget input), reorder due, purchase register, **vendor performance** (delivery time,
      discrepancy rate, price variance), asset register with depreciation, verification
      discrepancies, write-off register
- [ ] `TEST` 🔴 Stock discrepancy at verification → an `adjust` movement **with a reason and an
      approval**, never a silent correction

---

# M12 — Scholarships

- [ ] `SCH-1` Schemes, funders, budget, slots `S` `W` `F`
- [ ] `MIG` 🔴 Trigger: total awarded may not exceed budget or slots — the same overcommitment
      shape as M4's seat matrix and M17's beds
- [ ] `SCH-2` Eligibility **and** selection as separate questions, both with shown derivation `S` `W` `F`
- [ ] `SCH-3` Applications with documents (P3), camera capture `S` `W` `F`
- [ ] `SCH-4` Verification queue `S` `W` `F`
- [ ] `SCH-5` 🔴 Award **as a set**, not one by one — forcing four hundred individual approvals
      means nobody reads any of them `S` `W` `F`
- [ ] `SCH-6` 🔴 **Institutional effect: an M11 concession.** Prove the boundary here first `S`
- [ ] `SCH-7` 🔴 **External effect: claims and reconciliation.** A government scholarship that
      reduces the invoice on day one leaves the college with an untracked receivable and a student
      who believes they owe nothing. External schemes keep the liability intact `S` `W`
- [ ] `SCH-8` Renewal evaluation; 🔴 "renewal criteria at risk" mid-year, so a student whose
      attendance is drifting can act in March, not June `S` `W` `F`
- [ ] `SCH-9` Revocation and recovery through M11 `S` `W` `F`
- [ ] `SCH-10` Reports incl. 🔴 **funder claim reconciliation: claimed, received, outstanding,
      ageing** — the report finance actually needs `S` `W` `F`
- [ ] `DOC` Claim reconciliation is **web-only**, parity exception recorded

# M8 — Coursework

- [ ] `CW-1` Assignments, brief, attachments, due dates `S` `W` `F`
- [ ] `CW-2` Submission; 🔴 **late is accepted and marked late, never silently refused** — a hard
      block means a student with a genuine problem has no record `S` `W` `F`
- [ ] `CW-3` Evaluation, rubrics, return with feedback `S` `W` `F`
- [ ] `CW-4` 🔴 **Mark handover to M9** — M8 emits, M9 records against its plan under AD-53's rules.
      Storing marks here gives a student two grades for one piece of work `S`
- [ ] `CW-5` Group work and teams `S` `W` `F`
- [ ] `CW-6` Non-submitter tracking — **a pastoral signal, often the first visible sign of a student
      in difficulty** `S` `W` `F`
- [ ] `CW-7` Plagiarism provider; a provider outage **never blocks a submission** `S`
- [ ] `CW-8` Course feedback: sealed identity (AD-63, **never unsealed**), minimum response
      threshold before any aggregate, 🔴 **released only after results are published** — otherwise a
      student evaluates a teacher who has not yet graded them `S` `W` `F`
- [ ] `CW-9` Reports `S` `W` `F`

---

## 🚧 P6 EXIT GATE

- [ ] 🔴 A library fine, a hostel charge and a transport fare all appear on **one student ledger** (AD-6)
- [ ] A student cannot exit with a book out, a bed held, a pass active or an asset in custody
- [ ] A purchase above threshold cannot proceed without quotations
- [ ] A vehicle with lapsed insurance cannot be scheduled, and grounding happens without human action
- [ ] A bed cannot be double-allocated under concurrency
- [ ] Fine accrual run twice charges once
