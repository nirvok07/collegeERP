# M4 — Admissions and Student Lifecycle

Blueprint module M4, domain D3 (`docs/blueprint/02-domains.md` §D3). Implementation: **❌ not built.**
`MODULE_REGISTRY.md` records M5 Student Records as "minimum only: student, membership, enrolment" —
a roster exists because attendance needed one, but nobody is ever *admitted*.

This is the largest functional hole in the academic core, and the institution's annual revenue event.

## 1. What this module owns

The path from a stranger to an enrolled student, and every change of status afterwards: enquiry,
application, document verification, merit, offer, acceptance, admission, and then transfer, break,
re-admission and exit.

It does **not** own: the student's academic record once enrolled (M5), money (M11 — M4 *causes*
an invoice, it never holds a balance), the curriculum an applicant is admitted into (M3), or
accounts and authority (M1 — admission *causes* a Person and a UserAccount per AD-14, it does not
define them).

## 2. The boundary that keeps this module honest

**An applicant is not a student.** They are different entities with different lifetimes, and
conflating them is the most common design error in admissions modules.

An applicant may apply to three programmes, be rejected by two, never accept the third, and never
become a student at all. Modelling them as a student with `status = 'applicant'` means every student
query in every other module must remember to exclude them — and one day one will not, and an
applicant will appear on an attendance register.

So: `Applicant` and `Application` live here. `Student` is created by M5 **at the moment of
admission confirmation**, in the same transaction, and never before.

## 3. Roles

Two new college roles, seeded as system role templates (`role_definitions`, `tenant_id NULL`), the
way M11 seeded Accountant and Cashier:

- **Admission Officer** — cycles, application forms, merit lists, offers, admission confirmation.
  Institution-scoped.
- **Counsellor** — enquiries, follow-up, application review and document verification. May be
  department-scoped, so a department handles its own applications.

Existing roles: the College Admin holds everything; the Principal approves the seat matrix; the
Accountant (M11) configures admission fees; the HoD may review applications for their programme.

## 4. Permissions

```
admission.read          normal     View cycles, applications, merit
admission.manage        sensitive  Cycles, forms, seat matrix
application.review      normal     Verify documents, shortlist, recommend
merit.publish           sensitive  Publish a merit list
offer.issue             sensitive  Issue, withdraw, waitlist movement
admission.confirm       critical   Turn an offer into a student. Creates identity
student.lifecycle       sensitive  Transfer, break, re-admit, exit
```

`admission.confirm` is `critical` because it creates a Person, a UserAccount and a financial
liability in one transaction. `role.assign` and `person.export` are the existing precedents for that tier.

## 5. Entities

```
admission_cycle      tenant, academic_year, name, opens_at, closes_at, state, version
seat_matrix          cycle, program, category, quota, seats, filled      -- the capacity truth
application_form     cycle, program, sections[], fields[], required_documents[], version
enquiry              tenant, name, contact, program_interest, source, state, assigned_to
applicant            tenant, name, contact, dob, identifiers{}           -- NOT a person yet
application          cycle, applicant, program, number, state, submitted_at, score, rank, version
application_field    application, key, value                            -- answers to the form
application_document application, document_id (P3), kind, verification_state
merit_list           cycle, program, category, published_at, published_by, frozen_ranking
offer                merit_list, application, serial, state, issued_at, expires_at, terms
admission            offer, student_id (M5), confirmed_at, confirmed_by, invoice_id (M11)
lifecycle_event      student, kind, effective_date, reason, approved_by, version
```

`merit_list.frozen_ranking` is stored, not computed. A published merit list must show tomorrow
exactly what it showed today, even after a late document verification changes a score. This is the
same reasoning as AD-23's published result: **publication is the one moment a derived value becomes
a fact.** Everywhere else in this system AD-7 forbids storing derived values; this is a declared
exception and carries its reason in the schema comment.

## 6. Lifecycle

```
enquiry:      new → contacted → converted | lapsed

application:  draft → submitted → under_review → documents_verified
                    → shortlisted → offered → accepted → confirmed
                    ↘ rejected  ↘ withdrawn  ↘ waitlisted  ↘ offer_expired

offer:        issued → accepted → confirmed
                     ↘ declined ↘ expired ↘ withdrawn

student (M5): admitted → enrolled → { on_break | transferred } → graduated | exited
```

Transitions are server-owned. A client never posts a state; it posts an **action**, and the server
decides whether that action is legal from the current state. This is how M4 Teaching Delivery
already models class sessions (`m4-teaching-delivery.md` §6) and the pattern carries.

## 7. Invariants the database enforces

- An offer cannot be issued beyond `seat_matrix.seats` for its (program, category), counting
  accepted and confirmed offers. **Over-admission is the failure that cannot be undone** — a
  trigger, not application code.
- `application.number` and `offer.serial` are gapless per cycle, assigned in the issuing
  transaction (M11's receipt-number rule, `m11-student-finance.md` §3).
- A merit list, once published, is immutable (trigger, as AD-34 does for curriculum).
- `admission.confirm` requires: offer `accepted`, not expired, all `required_documents` verified,
  and admission fee paid or explicitly waived through M11's approval shape.
- One confirmed admission per applicant per cycle.
- `lifecycle_event` is INSERT only; a status correction is a new event, never an edit (AD-13).
- Tenant RLS with FORCE throughout; `erp_app` least privilege; DELETE on none.

## 8. The admission transaction

Confirmation is the most consequential write in this module. In **one** transaction:

1. Re-check the offer state, expiry, documents and seat availability under lock.
2. Create `Person` (M1) and `Student` (M5) — AD-14 keeps these separate.
3. Create the enrolment against the programme's curriculum version (M3, AD-4: enrolment is the
   unit of academic record).
4. Assign the student role (M1, AD-1).
5. Raise the admission invoice (M11).
6. Record `admission`, close the offer, decrement the seat matrix.
7. Emit `admission.confirmed`.

Partial success is not acceptable in any combination: a student with no invoice is lost revenue, an
invoice with no student is an unexplainable ledger entry. AD-20 already establishes this pattern —
tenant provisioning runs as one transaction across M1 and M2 — and this is the same reasoning.

Idempotent by offer id (AD-58), so a retried confirmation never admits twice.

## 9. Approvals (P1)

Document verification (chain: Counsellor → Admission Officer). Seat matrix changes (→ Principal).
Merit publication (→ Principal). Fee waiver at admission (→ M11's existing shape, migrated to P1).
Lifecycle events: transfer and re-admission (→ HoD → Principal); exit (→ clearance, §11).

## 10. Money boundary (M11)

M4 **causes** charges; it never holds them. Application fee at submission, admission fee at offer
acceptance, programme fee on confirmation. Each is an M11 invoice raised by a domain event. A
refund on withdrawal is an M11 reversal, never a negative row here. AD-6: all money lives in one
ledger, owned by Student Finance.

## 11. Exit clearance — a cross-domain question

A student cannot exit while: fees are outstanding (M11), a library item is out (M16), a hostel room
is occupied (M17), a transport pass is active (M18), or a case is open (M21).

Per AD-28 this goes through a **declared clearance capability**, not five shared reads. Each module
answers `clearance(student) → { clear | blocked, reason }` for its own domain. M4 aggregates and
refuses, naming every blocker at once — not one at a time across five visits to five offices.

The transfer certificate (P4) depends on the same answer, which is why it is one capability.

## 12. Notifications (P2)

Applicant: application received, documents required, document rejected with a reason, shortlisted,
merit published, **offer issued with its expiry**, offer expiring in 48 hours, offer expired,
admission confirmed, fee due.

Staff: new application, verification queue depth, seat matrix nearly full, offers expiring today.

The offer-expiry reminder is the one that matters commercially: an offer that lapses unnoticed is a
seat unfilled and a student lost to another college.

## 13. Scheduled work (P9)

Offer expiry sweep, waitlist promotion on expiry, enquiry follow-up reminders, cycle open/close
transitions, admission-fee overdue reminders, abandoned-draft nudges.

## 14. Documents (P3) and certificates (P4)

Documents: marksheets, ID proof, category certificate, migration certificate, photograph, signature
— each a declared `document_kind` with `requires_verification`. Camera capture matters: applicants
photograph documents on a phone (P3 §10).

Certificates: bonafide (enrolled), transfer certificate (exit + clearance), migration, conduct.
All through P4.

## 15. Reports (P5)

Admission funnel by stage with conversion rates. Seat matrix fill by programme, category, quota.
Category-wise compliance (a statutory requirement in India). Source effectiveness for enquiries.
Application register. Offer acceptance and lapse rates. Day-wise admission and collection. Admission
register for the statutory return. Waitlist movement.

## 16. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Cycle and seat matrix setup | ✅ primary | ✅ read + edit |
| Form builder | ✅ primary | read-only, **parity exception recorded** |
| Enquiry desk | ✅ | ✅ — a counsellor at a desk or on a phone call |
| Applicant self-service | ✅ | ✅ — **the phone is the primary surface here** |
| Document verification queue | ✅ primary | ✅ |
| Merit list and publication | ✅ | ✅ read |
| Offer issue, withdraw, waitlist | ✅ | ✅ |
| Admission confirmation | ✅ | ✅ |
| Bulk import of applications | ✅ | **exception: web only** (P8 §4) |
| Reports | ✅ | ✅ via P5 |

Applicant self-service on the phone is not optional. In most Indian colleges the applicant has a
phone and no laptop, and AD-70's college-code-first app already gives them a branded entry point
before they have an account.

## 17. Edge cases

- Applies to three programmes, admitted to one → three applications, one confirmation; the other
  two auto-withdraw with a recorded reason.
- Duplicate applicant (same person, second application) → matched on identifiers, merged before
  admission, never after; merging two students post-admission is a data migration, not a feature.
- Pays then withdraws → M11 reversal; the seat returns to the matrix.
- Seat matrix reduced below confirmed admissions → refused; capacity may not retroactively invalidate
  an admission.
- Document verified after merit published → score change does **not** alter the frozen ranking (§5);
  it feeds the next list.
- Admitted, never attends → a lifecycle event, not a deletion.
- Re-admission after exit → new enrolment against the current curriculum version, same Person, same
  Student, new lifecycle event. **Not a new student record.**
- Cycle closes with offers outstanding → offers keep their own expiry; closing a cycle stops new
  applications, not existing commitments.
- Transfer between programmes mid-year → exit from one enrolment, admit to another, both events
  linked, credits handled by M10's rules, not here.

## 18. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| ADM-A1 | Cycle, seat matrix, admission fee config | S, W, F | M2, M11 |
| ADM-A2 | Enquiry capture and follow-up | S, W, F | P2 |
| ADM-A3 | Form definition; applicant self-service; submission | S, W, F | P3, P8 |
| ADM-A4 | Document verification queue and chain | S, W, F | P3, P1 |
| ADM-A5 | Merit generation, freeze, publication | S, W, F | P1 |
| ADM-A6 | Offer issue, accept, decline, expiry, waitlist | S, W, F | P9, P2 |
| ADM-A7 | **Admission confirmation transaction** (§8) | S, W, F | M1, M5, M11 |
| ADM-A8 | Invoice on admission | S | M11 |
| ADM-A9 | Bulk import with dry-run | S, W | P8 |
| ADM-A10 | Lifecycle: transfer, break, re-admit, exit | S, W, F | P1 |
| ADM-A11 | **Clearance capability** across M11/M16/M17/M18 | S, W, F | AD-28 |
| ADM-A12 | Certificates: bonafide, TC, conduct, migration | S, W, F | P4 |
| ADM-A13 | Scholarships and concessions | S, W, F | M12, M11 |
| ADM-A14 | Parent/guardian accounts — **needs an ADR first** | S, W, F | M1 |
| ADM-A15 | Reports | S, W, F | P5 |
| ADM-A16 | Notifications | S | P2 |

ADM-A7 is the slice this module exists for; A1–A6 are its preconditions. ADM-A14 needs an ADR
before code: a guardian's authority over exactly one ward, valid only while that ward is enrolled,
is a genuine extension of AD-1's scope model and must not be improvised as an ad-hoc role.

## 19. Cross-module impact

Creates into M1 (Person, UserAccount) and M5 (Student, enrolment). Causes M11 invoices. Reads M2
(programmes, academic year, curriculum version) and M3. Feeds M10 (who sits an exam), M16/M17/M18
(who may be allocated a service), M20 (audience). Depends on P1, P2, P3, P4, P5, P8, P9.
