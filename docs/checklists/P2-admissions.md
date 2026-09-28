# P2 — M4 Admissions and Student Lifecycle

Doc: `docs/blueprint/modules/admissions.md`. The largest functional hole in the academic core:
M5 is "minimum roster only" — nobody is ever *admitted*. Also the institution's annual revenue event.

**Module layout:** `server/src/modules/admissions/{application,domain,infrastructure,presentation}`,
`clients/web/src/features/admissions/`, `lib/features/admissions/`.

**Depends on:** P1 capabilities complete (P1, P2, P3, P4, P5, P9), M1, M2, M5, M11.

---

## ADM-A1 — Admission cycle, seat matrix, fee configuration

- [ ] `MIG` `admission_cycle`: tenant, academic_year, name, opens_at, closes_at, state, version
- [ ] `MIG` `seat_matrix`: cycle, program, category, quota, seats, filled, version
- [ ] `MIG` CHECK `seats >= 0`; CHECK `filled >= 0`
- [ ] `MIG` 🔴 Trigger: `filled` may never exceed `seats`. **Over-admission cannot be undone**
- [ ] `MIG` RLS FORCE; GRANTs; `migration-invariants.test.ts` updated
- [ ] `SVC` Cycle lifecycle: draft → open → closed; closing stops new applications, not existing offers
- [ ] `SVC` Seat matrix cannot be reduced below confirmed admissions
- [ ] `API` `GET|POST|PATCH /v1/admission/cycles`, `/v1/admission/cycles/:id/seat-matrix`
- [ ] `WEB` Cycle list and detail; seat matrix grid by program × category
- [ ] `APP` Cycle list and seat matrix read; edit for College Admin
- [ ] `SVC` Admission fee heads configured against M11 (application fee, admission fee)
- [ ] `TEST` Seat reduction below confirmed → refused
- [ ] `TEST` Unauthorised role cannot open a cycle

## ADM-A2 — Enquiry capture and follow-up

- [ ] `MIG` `enquiry`: tenant, name, contact, program_interest, source, state, assigned_to, version
- [ ] `SVC` States: new → contacted → converted | lapsed
- [ ] `SVC` Conversion links the enquiry to the applicant it became
- [ ] `API` `GET|POST|PATCH /v1/admission/enquiries`
- [ ] `WEB` `APP` Enquiry desk: capture, assign, log a follow-up, convert
- [ ] `JOB` Follow-up reminders at configured intervals
- [ ] `TEST` A counsellor sees only their assigned enquiries unless institution-scoped

## ADM-A3 — Application form, applicant self-service, submission

🔴 **The boundary that keeps this module honest: an applicant is not a student** (§2 of the doc).

- [ ] `MIG` `applicant`: tenant, name, contact, dob, identifiers — **not a Person, not a Student**
- [ ] `MIG` `application`: cycle, applicant, program, number, state, submitted_at, score, rank, version
- [ ] `MIG` `application_field`: application, key, value
- [ ] `MIG` `application_form`: cycle, program, sections, fields, required_documents, version
- [ ] `MIG` Gapless `application.number` per cycle, assigned in the submitting transaction
- [ ] `SVC` Form definition: sections, field types, validation, required documents
- [ ] `SVC` Draft application saved per applicant; resumable
- [ ] `SVC` Submission validates against the form version it was started under
- [ ] `SVC` Application fee invoice raised on submission (M11)
- [ ] `API` Public: `POST /v1/admission/applicants` (self-registration), OTP verification per AD-82
- [ ] `API` `GET|POST|PATCH /v1/admission/applications`, `POST /v1/admission/applications/:id/submit`
- [ ] `WEB` Form builder — **web primary**
- [ ] `WEB` `APP` Applicant self-service: register, fill, save draft, upload, submit, track
- [ ] `APP` 🔴 **Phone-first journey with camera document capture** (P3). Most Indian applicants
      have a phone and no laptop; AD-70's college-code-first app is already their entry point
- [ ] `DOC` Form builder is web-only — parity exception recorded
- [ ] `TEST` An applicant cannot appear on any student query (the §2 boundary, asserted)
- [ ] `TEST` Submission outside the cycle window → refused
- [ ] `TEST` Gapless numbering under concurrent submission

## ADM-A4 — Document verification

- [ ] `MIG` `application_document`: application, document_id (P3), kind, verification_state
- [ ] `SVC` Declared P3 `document_kind`s: marksheet, ID proof, category, migration, photograph, signature
- [ ] `SVC` Each with `requires_verification`, size and content-type limits, retention class
- [ ] `SVC` Rejection **supersedes, never overwrites** — the original is what the institution saw
- [ ] `SVC` Verification chain via P1: Counsellor → Admission Officer
- [ ] `WEB` `APP` Verification queue: document beside the field it supports
- [ ] `WEB` `APP` Reject with a reason; applicant notified and can replace
- [ ] `TEST` A rejected document's original remains retrievable
- [ ] `TEST` An unverified required document blocks confirmation (asserted at ADM-A7)

## ADM-A5 — Merit generation, freeze, publication

- [ ] `MIG` `merit_list`: cycle, program, category, published_at, published_by, **frozen_ranking**
- [ ] `MIG` Trigger: a published merit list is immutable (AD-34 discipline)
- [ ] `SVC` Scoring rule per cycle, computed from application fields and verified documents
- [ ] `SVC` 🔴 `frozen_ranking` is **stored** — a declared exception to AD-7, alongside AD-23's
      published result. Schema comment carries the reason
- [ ] `SVC` Ranking shown **with its components**, never a bare number
- [ ] `SVC` Publication is a P1 approval → Principal
- [ ] `API` `POST /v1/admission/merit-lists`, `POST /v1/admission/merit-lists/:id/publish`
- [ ] `WEB` `APP` Merit list: generate, preview with derivation, publish; read for applicants
- [ ] `TEST` A document verified after publication does **not** alter the frozen ranking
- [ ] `TEST` A published list cannot be edited

## ADM-A6 — Offers, expiry, waitlist

- [ ] `MIG` `offer`: merit_list, application, serial, state, issued_at, expires_at, terms, version
- [ ] `MIG` Gapless `serial` per cycle
- [ ] `MIG` 🔴 Trigger: offers issued may not exceed `seat_matrix.seats` for (program, category),
      counting accepted and confirmed
- [ ] `SVC` States: issued → accepted | declined | expired | withdrawn
- [ ] `SVC` Acceptance raises the admission-fee invoice (M11)
- [ ] `JOB` Offer expiry sweep; expired offers release the seat
- [ ] `JOB` Waitlist promotion on expiry or decline
- [ ] `JOB` 🔴 Offer-expiry reminder at 48 hours — commercially the most important notification;
      a lapsed offer is a seat unfilled and a student lost
- [ ] `API` `POST /v1/admission/offers`, `/:id/accept`, `/:id/decline`, `/:id/withdraw`
- [ ] `WEB` `APP` Offer issue, withdraw, waitlist board
- [ ] `APP` Applicant accepts or declines from the phone
- [ ] `TEST` Over-issue beyond seats → refused
- [ ] `TEST` Expiry releases the seat and promotes the waitlist
- [ ] `TEST` Accepting an expired offer → refused

## ADM-A7 — 🔴 Admission confirmation transaction

**The slice this module exists for.** Doc §8.

- [ ] `MIG` `admission`: offer, student_id (M5), confirmed_at, confirmed_by, invoice_id (M11)
- [ ] `SVC` **One transaction**, all of it or none — the AD-20 pattern:
  - [ ] Re-check offer state, expiry, documents and seat availability **under lock**
  - [ ] Create `Person` (M1) — AD-14 keeps Person and UserAccount separate
  - [ ] Create `UserAccount` and student sign-in path (AD-69, AD-82)
  - [ ] Create `Student` (M5)
  - [ ] Create the enrolment against the program's curriculum version (M3, AD-4)
  - [ ] Assign the student role (M1, AD-1) with validity
  - [ ] Raise the program fee invoice (M11)
  - [ ] Write `admission`, close the offer, increment `seat_matrix.filled`
  - [ ] Emit `admission.confirmed`
- [ ] `SVC` Idempotent by offer id (AD-58) — a retried confirmation never admits twice
- [ ] `API` `POST /v1/admission/offers/:id/confirm` — permission `admission.confirm` (`critical`, MFA)
- [ ] `WEB` `APP` Confirmation screen showing every precondition and its state
- [ ] `TEST` 🔴 Partial failure rolls back **everything** — no student without an invoice, no
      invoice without a student
- [ ] `TEST` Replay is idempotent
- [ ] `TEST` Unverified required document → refused
- [ ] `TEST` Seat full at the moment of confirm → refused under concurrency (two confirms, one seat)
- [ ] `TEST` Expired offer → refused

## ADM-A8 — Invoice on admission
- [ ] `S` Domain-event handler raises the M11 invoice; M4 holds no balance (AD-6)
- [ ] `TEST` The invoice references the admission and the correct fee structure

## ADM-A9 — Bulk import
- [ ] `S` `W` Import applications via CAP-8's pipeline with dry-run preview
- [ ] `S` Idempotent by (cycle, external reference)
- [ ] `DOC` **Web-only, parity exception recorded**

## ADM-A10 — Student lifecycle
- [ ] `MIG` `lifecycle_event`: student, kind, effective_date, reason, approved_by, version — INSERT only
- [ ] `SVC` Kinds: transfer, break, re-admit, exit, graduated
- [ ] `SVC` Re-admission → **new enrolment against the current curriculum version, same Student**
- [ ] `SVC` Transfer between programs → exit one enrolment, admit to another, events linked
- [ ] `SVC` Approvals via P1: HoD → Principal
- [ ] `WEB` `APP` Lifecycle actions on a student record, with history
- [ ] `TEST` Re-admission does not create a second Student record

## ADM-A11 — 🔴 Clearance capability (AD-28)
- [ ] `S` Declared capability: each of M11, M16, M17, M18, M21 answers
      `clearance(student) → { clear | blocked, reason }`
- [ ] `S` M4 aggregates and **names every blocker at once**, not one per visit to one office
- [ ] `S` Modules not yet built return `clear` — the interface exists before its implementers
- [ ] `WEB` `APP` Clearance screen listing each domain and its state
- [ ] `TEST` Exit refused with dues; the reason names the amount
- [ ] `TEST` Adding a new clearing module requires no change to M4

## ADM-A12 — Certificates
- [ ] `S` `W` `F` Bonafide, transfer certificate, conduct, migration via P4
- [ ] `S` TC eligibility = exit recorded **and** clearance complete (ADM-A11)
- [ ] `TEST` TC refused while any domain blocks

## ADM-A13 — Scholarships hand-off
- [ ] `S` `W` `F` Scheme offered at admission; award becomes an M11 concession (see M12 / P6)

## ADM-A14 — ⚠️ Parent/guardian accounts — **ADR first**
- [ ] `DOC` 🔴 Write the ADR **before any code**: guardian authority over **exactly one ward**,
      valid only while that ward is enrolled. This extends AD-1's scope model
- [ ] `DOC` Note `03-modules.md` §3.2 rejected a "parent portal *module*" — a parent is an actor
      with a scoped view, not a parallel system. The ADR must not contradict that
- [ ] `DOC` Consent model: what a guardian may see (attendance, fees, results, notices) and may not
- [ ] `MIG` Guardian scope type; link table; validity
- [ ] `S` `W` `F` Guardian sign-in, ward selection, scoped read-only views
- [ ] `TEST` A guardian cannot see another ward; access ends when enrolment ends

## ADM-A15 — Reports (via P5)
- [ ] `S` Admission funnel by stage with conversion rates
- [ ] `S` Seat matrix fill by program, category, quota
- [ ] `S` Category-wise compliance — a statutory requirement in India
- [ ] `S` Enquiry source effectiveness; application register; offer acceptance and lapse rates
- [ ] `S` Day-wise admission and collection; waitlist movement; admission register
- [ ] `WEB` `APP` All via the P5 surface

## ADM-A16 — Notifications (via P2)
- [ ] `S` Applicant: received, documents required, document rejected with reason, shortlisted,
      merit published, **offer issued with expiry**, expiring in 48h, expired, confirmed, fee due
- [ ] `S` Staff: new application, verification queue depth, seat matrix nearly full, offers
      expiring today

---

## 🚧 P2 EXIT GATE

- [ ] An applicant goes enquiry → application → documents → merit → offer → **enrolled student with
      an invoice**, end to end, on both surfaces
- [ ] Over-admission proven impossible under concurrency
- [ ] Partial confirmation proven impossible
- [ ] A student can be exited with clearance and issued a transfer certificate
- [ ] An applicant never appears in a student query
