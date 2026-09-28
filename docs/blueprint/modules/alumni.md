# M24 — Alumni

Blueprint module M24, domain D9, phase 4. **Status: ❌ not built.** The last module in the
institution lifecycle, and the one that closes the loop: a student admitted in M4 leaves as an
alumnus here.

## 1. What this module owns

The alumni register, their post-graduation trajectory, engagement with the institution, and
contribution — mentoring, recruiting, guest lectures, donations.

It does **not** own: the academic record (M5 and M10 keep it; an alumnus is still the subject of
their transcript), placements (M23 records the first outcome; M24 records the decade after),
certificates (P4), or money (donations post to institutional accounts, not M11's student ledger).

## 2. An alumnus is a lifecycle state, not a new person

**The same Person (M1) and the same Student (M5) record, with a lifecycle event.** AD-14's
separation of Person from UserAccount is what makes this work cleanly: the academic record stays
with the Student, the login moves to a different authority.

Creating a separate alumni person record — the obvious shortcut — breaks the transcript link, so
a graduate requesting a duplicate marksheet in 2031 becomes a manual search. It also duplicates
contact data, and the duplicate is the one that goes stale.

What changes at graduation: authority. A student's role assignment ends (AD-1's validity); an
`alumnus` role begins, scoped to the institution, granting self-service and nothing else.

## 3. The consent problem, stated first

Alumni data is the one dataset in this system that **outlives the institutional relationship**. A
student was required to give the college their data; an alumnus is not.

So, before any outreach feature:

- Contact and engagement preferences are **opt-in after graduation**, not inherited.
- Every outreach carries an unsubscribe that works, per category (P2 §5).
- Employment data is voluntarily provided, never scraped or inferred.
- Erasure on request is honoured for engagement data, while the **academic record is retained**
  under its statutory basis (P3 §8 draws exactly this distinction).
- Alumni contact details are a `sensitive` read, audited (P6 §3).

A module that mails graduates who asked not to be mailed damages the relationship it exists to
build. This is a design constraint, not a compliance footnote.

## 4. Permissions

```
alumni.read           normal     Directory, within consent
alumni.manage         sensitive  Register, verify, merge
alumni.engage         sensitive  Campaigns and outreach
alumni.self           normal     Own profile and preferences
donation.record       sensitive  Record a contribution
```

## 5. Entities

```
alumnus              tenant, student (M5), graduated_on, program, batch, state, version
alumni_profile       alumnus, current_employer, designation, industry, location,
                     higher_studies{}, entrepreneurship{}, updated_by, updated_at, verified
alumni_contact       alumnus, kind, value, preferred, consent_state, consent_at
career_event         alumnus, kind(job_change|promotion|degree|award|venture), detail,
                     at, source(self|verified)          -- INSERT only
engagement           alumnus, kind(mentor|guest_lecture|recruiter|donor|event|survey),
                     ref, at, value_note
donation             alumnus, amount_paise, purpose, received_on, receipt_ref, acknowledged_at
alumni_chapter       tenant, name, region, coordinator
survey               tenant, title, audience_expression, questions[], opens, closes
survey_response      survey, alumnus|anonymous, answers[], at
```

## 6. Graduation: the transition

A P9 job at the end of an academic year, over students whose programme is complete and whose
results are published (M10):

1. Record the M5 lifecycle event `graduated` (M4 §17 owns lifecycle events).
2. Create the `alumnus` row linked to the same Student.
3. End the student role assignment; begin the `alumnus` role (AD-1 validity, not deletion).
4. Carry forward contact details **in `consent_state = 'pending'`** — usable once for a single
   confirmation request, and not again until confirmed (§3).
5. Trigger the exit clearance and certificate path (M4 §11, P4).

It is a job rather than a manual action because it happens to a whole cohort on one date, and
because doing it by hand means it does not happen at all in a busy year.

## 7. Invariants

- One `alumnus` per student per programme completion.
- An alumnus cannot exist without a completed or exited enrolment (M5).
- `career_event` is INSERT only; a career history is a timeline, not a mutable field.
- Outreach to a contact with `consent_state != 'confirmed'` is refused at the send path, not
  merely hidden in the UI (§3).
- Donations are integer paise (M11 §3), receipted, and post to institutional accounts — **never to
  the student fee ledger**, which is closed.
- Alumni reads that expose contact details are audited (P6).
- Tenant RLS with FORCE.

## 8. Verification, and why the directory is worth something

Self-reported employment goes stale and is occasionally inflated. A `verified` flag, set when an
employer is confirmed through a placement record (M23), a recruiter relationship, or an explicit
verification, is what makes the directory usable for accreditation returns and for prospective
students.

Unverified data is still kept and still shown — labelled as self-reported. Discarding it would
leave the register emptier and no more honest.

## 9. Approvals (P1), notifications (P2), scheduled work (P9)

**Approvals:** outreach campaigns above a size threshold (→ Principal), donation acknowledgement
above a threshold, directory data corrections, chapter formation.

**Notifications:** alumnus — graduation confirmed and consent request, event invitations, reunion,
newsletter (digest by default per P2 §5), donation receipt, mentoring request.
Institution — profile updates, donations received, survey responses, engagement opportunities.

**Jobs:** annual graduation cohort transition (§6), consent-confirmation follow-up (once, then
stop), profile-refresh requests at a low frequency, survey window transitions, donation
acknowledgement, milestone reminders such as ten-year reunions.

"Once, then stop" matters: a consent request repeated monthly is the behaviour that makes people
mark an institution as spam.

## 10. Reports (P5)

Alumni by batch, programme and current status. **Employment and higher-studies outcomes at 1, 3 and
5 years** — the accreditation input, and a far more meaningful number than the placement percentage
because it reflects careers rather than first jobs. Geographic and industry distribution.
Engagement rate by batch. Donation summary by purpose and year. Mentoring and recruiting
contribution. Survey results. Contactability rate — a low rate is the warning that the register is
decaying.

## 11. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| **My alumni profile and consent** | ✅ | ✅ **primary** |
| Alumni directory (consent-filtered) | ✅ **primary** | ✅ |
| Career updates | ✅ | ✅ **primary** |
| Events and reunions | ✅ | ✅ **primary** (via M22) |
| Mentoring and volunteering | ✅ | ✅ **primary** |
| Register management and verification | ✅ **primary** | ✅ read |
| Campaigns and surveys | ✅ **primary** | ✅ read |
| Donations | ✅ **primary** | ✅ record |
| Reports | ✅ **primary** | ✅ via P5 |

Alumni are the one user group with **no institutional device and no obligation to engage**. The
phone app is the only realistic surface for them, and a friction-free self-service profile is the
difference between a register that stays current and one that is three years stale. AD-84's parity
mandate is doing real work here.

## 12. Edge cases

- Exits without graduating → an alumnus by policy, marked as such. Many institutions include them;
  the setting is explicit rather than assumed.
- Two programmes at the same institution → one Person, two `alumnus` rows, two batches.
- Returns as a student (a graduate joining a PG programme) → **both roles concurrently**, which
  AD-1's role × scope × validity model represents without any special case.
- Returns as an employee → alumnus and employee (M13) at once, same Person.
- Asks for erasure → engagement data erased, academic record retained under statutory basis (§3).
- Deceased → state change, all outreach stops immediately, record retained with dignity.
- Contact details bounce repeatedly → marked unreachable, outreach stops, flagged for the register.
- Donation from a non-alumnus → institutional accounts, not M24; this module is not a donations
  platform.
- Institution renamed → certificates and records keep the name at issue (P4 §12); the directory
  shows both.

## 13. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| ALU-1 | `alumnus` entity, link to M5, `alumnus` role | S, W, F | M1, M5 |
| ALU-2 | **Graduation transition job** (§6) | S | P9, M10, M4 |
| ALU-3 | **Consent model and enforcement at the send path** (§3) | S, W, F | P2 |
| ALU-4 | Self-service profile, career updates | S, W, F | — |
| ALU-5 | Directory with consent filtering | S, W, F | P7 later |
| ALU-6 | Verification from M23 and explicit | S, W | M23 |
| ALU-7 | Engagement: mentoring, guest lectures, recruiting | S, W, F | M22, M23 |
| ALU-8 | Campaigns and surveys via M20's audience engine | S, W, F | M20 |
| ALU-9 | Donations and receipts | S, W, F | P4 |
| ALU-10 | Chapters | S, W, F | — |
| ALU-11 | **Outcome reports at 1/3/5 years** | S, W, F | P5 |

ALU-3 before ALU-8. Building outreach before consent enforcement means the first campaign is the
one that breaches it, and that is not recoverable.

## 14. Cross-module impact

Continues from M5 (student lifecycle) and M10 (results complete). Reads M23 (first placement,
verification). Uses M20 (audience engine), M22 (reunions as events), P4 (duplicate certificates for
graduates). Donations post to institutional accounts, not M11. Depends on P1, P2, P3, P5, P6, P9.
