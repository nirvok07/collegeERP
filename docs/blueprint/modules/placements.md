# M23 — Placements

Blueprint module M23, domain D9, phase 4. **Status: ❌ not built.**

Commercially this is the module a college markets itself on: the placement percentage is the number
prospective students and their parents compare. It is also the module whose data an institution most
wants to be able to prove.

## 1. What this module owns

The recruiter relationship, drives, eligibility, student applications, the selection process, offers
and their acceptance, and the placement record that outcomes reporting rests on.

It does **not** own: academic results (M10 — eligibility *reads* them), attendance (M7),
the student record (M5), alumni relations (M24 — a placed student becomes an alumnus on graduation),
or certificates (P4).

## 2. The naming collision, resolved

`docs/MASTER-PLAN.md` §8 flags it and it is worth restating at the top of this document:
**`Application` and `Offer` exist in both M4 (admissions) and M23 (placements)** and mean entirely
different things.

Schema names are therefore explicit: `placement_application` and `placement_offer` here,
`admission_application` and `admission_offer` there. Never the bare words. Getting this wrong is
the single most likely source of confusion between these two modules, and a bare `offers` table
would be ambiguous in every query written against it for the next five years.

## 3. Permissions

```
placement.read          normal     Drives, own applications
placement.apply         normal     Apply to a drive
drive.manage            sensitive  Recruiters, drives, eligibility, rounds
offer.record            sensitive  Record an offer and its acceptance
recruiter.manage        sensitive  Recruiter register
placement.report        sensitive  Outcome reporting and statistics
```

## 4. Entities

```
recruiter             tenant, name, industry, contact[], tier, mou_ref (P3), rating,
                      blacklisted, version
drive                 tenant, recruiter, academic_year, title, roles[], package{},
                      location, mode(on_campus|off_campus|pool|virtual), eligibility_rule,
                      registration_opens, closes, state, version
drive_round           drive, sequence, kind(aptitude|technical|gd|interview|hr), scheduled_at,
                      venue|link, shortlist_after
placement_application drive, student, state, applied_at, resume_ref (P3), version
round_result          drive_round, student, outcome(cleared|rejected|absent), remarks, at
placement_offer       drive, student, role, ctc_paise, joining_date, letter_ref (P3),
                      state, issued_at, responded_at, version
placement_record      student, offer, kind(placed|higher_studies|entrepreneurship|opted_out|
                      not_placed), recorded_at         -- the outcome truth for reporting
student_profile       student, resume_ref, skills[], certifications[], projects[],
                      preferences{}, willing_to_relocate
placement_policy      tenant, academic_year, offers_allowed, dream_offer_threshold_paise,
                      opt_out_allowed, version
```

## 5. Eligibility is computed, never typed

`02-domains.md` names this as D9 automation: *placement eligibility computed from academic rules.*

A drive declares a rule; the system evaluates it against live data:

```
eligibility := program in [...] and year_of_study = n
             and aggregate_percentage >= x        -- computed from M10, never stored (AD-7)
             and active_backlogs <= y             -- from M10
             and total_backlog_history <= z
             and attendance_percentage >= a       -- from M7
             and no_active_sanction               -- from M21
             and offers_held < policy.offers_allowed
```

Eligibility is shown to each student **with its derivation** — which criterion they fail and by how
much. "You are not eligible" with no reason produces a queue outside the placement office, and
students who believe the system is arbitrary.

Recomputed at application time and again at shortlisting, because results and backlogs change.

## 6. The placement policy nobody thinks about until it bites

Most institutions cap how many offers a student may hold — typically one, with a "dream offer"
exception above a package threshold. Without it, the strongest students take multiple offers,
recruiters find their accepted candidates do not join, and the college loses the relationship.

`placement_policy` makes this explicit, per year, configurable, and enforced at application and at
offer acceptance. Encoding it is cheap; discovering it in year two after a recruiter withdraws is not.

## 7. Lifecycle

```
drive:                announced → registration_open → registration_closed
                    → in_progress(rounds) → offers_released → closed
                    ↘ cancelled(reason)

placement_application: applied → shortlisted → in_round(n) → selected
                              ↘ rejected ↘ withdrawn ↘ absent

placement_offer:      issued → { accepted | declined } → { joined | reneged | withdrawn_by_recruiter }
```

## 8. Invariants

- A student applies once per drive.
- Application is refused when eligibility fails; the failure names the criterion (§5).
- Offers held may not exceed `placement_policy.offers_allowed`, except under the dream-offer rule
  (trigger).
- Accepting an offer withdraws other **pending** applications, per policy, with notification —
  never silently.
- `round_result` and `placement_record` are INSERT only.
- CTC is integer paise (M11 §3), so aggregate package statistics are exact.
- A blacklisted recruiter cannot open a drive.
- A drive cannot be announced without an eligibility rule — an unqualified drive is how a student
  with six backlogs ends up in an interview.
- Tenant RLS with FORCE. Offers and CTC are **sensitive reads, audited** (P6 §3): what a classmate
  was offered is not general information.

## 9. Approvals (P1)

Recruiter onboarding and MoU. Drive announcement (Placement Officer → Principal). Eligibility
relaxation for a named student — the most-requested exception and the one that most needs an audit
trail. Off-campus drive participation. Policy exception for a second offer.

## 10. Notifications (P2)

Student: drive announced (targeted through M20's audience engine to the eligible set only — telling
ineligible students about a drive they cannot apply to is noise), eligibility result, **shortlisted**,
round scheduled with venue and time, round result, **offer received**, offer response deadline.
Officer: registrations, round results pending, offers awaiting response, drive schedule conflicts.
Recruiter: handled by the officer; the ERP does not give recruiters accounts in v1 (§13).

Shortlist and round-schedule notifications are time-critical — a student who misses an interview
because the notification arrived in a digest is a placement lost. These are `action required`
urgency and bypass digesting (P2 §4).

## 11. Scheduled work (P9)

Registration window transitions. Eligibility recomputation after results are published (M10).
Round reminders the day before and the morning of. Offer response deadline chase and expiry.
Placement record finalisation at year end. Statistics snapshots for reporting.

## 12. Reports (P5)

**Placement percentage** by programme, department and year — computed from `placement_record`,
with its denominator stated. An institution quoting 95% must be able to say 95% of what: registered
students, eligible students, or the whole cohort. The report shows all three, because that
ambiguity is where placement statistics lose credibility.

Also: package distribution — median, mean, highest, quartiles. Recruiter history and repeat rate.
Drive conversion funnel: registered → eligible → applied → shortlisted → selected. Offers declined
and why. Department comparison. Multi-offer students. Higher-studies and entrepreneurship outcomes,
which are placements by another name and belong in the same denominator. NAAC and NBA placement
returns.

## 13. Deliberately out of scope for v1

**Recruiter self-service accounts.** A recruiter portal means external identities, an external
authentication surface, and data exposure decisions about student profiles. It is a genuine
extension and it needs its own ADR — the same reasoning that defers M4's guardian accounts
(ADM-A14) until AD-1's scope model is properly extended rather than improvised.

In v1 the placement officer is the interface to the recruiter.

## 14. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Drive list with eligibility shown | ✅ | ✅ **primary** |
| **Apply** | ✅ | ✅ **primary** |
| My applications and status | ✅ | ✅ **primary** |
| Profile and resume upload | ✅ **primary** | ✅ + P3 upload |
| Round schedule and results | ✅ | ✅ **primary** |
| **Offer and response** | ✅ | ✅ **primary** |
| Recruiter register and MoU | ✅ **primary** | ✅ read |
| Drive creation and eligibility builder | ✅ **primary** | ✅ read |
| Shortlisting and round marking | ✅ **primary** | ✅ |
| Statistics and reports | ✅ **primary** | ✅ via P5 |

Students live on the phone for this module; the office lives on the web. It is the cleanest
role-split in the system and a good check that AD-84 parity is being applied with judgement rather
than mechanically.

## 15. Edge cases

- **Offer withdrawn by the recruiter after acceptance** → named in `02-domains.md`. The student
  returns to the eligible pool, the record shows both, and the recruiter's rating carries it.
- **Student with two offers** → also named. Policy decides (§6); a permitted second offer is
  recorded with its exception approval.
- Reneges after accepting → recorded; institutional policy applies; the recruiter relationship is
  the real cost.
- Results published mid-drive change eligibility → recomputed; a student who becomes ineligible
  mid-process is handled by the officer, not auto-removed from an interview they are sitting in.
- Placed then fails final exams → offer conditional on graduation; the record shows the condition.
- Off-campus or pool drive → the college records the outcome without owning the process.
- Student opts out for higher studies → a `placement_record` kind, counted honestly in the
  denominator rather than quietly excluded to inflate the percentage.
- Drive cancelled after shortlisting → all applications close with a reason; students notified.
- Package in a foreign currency → stored in paise at a recorded conversion rate and date; statistics
  state the basis.

## 16. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| PLA-1 | Recruiter register, MoU, rating | S, W, F | P3, P1 |
| PLA-2 | Student profile and resume | S, W, F | P3 |
| PLA-3 | Drives, rounds, announcement | S, W, F | M20 |
| PLA-4 | **Eligibility engine with derivation** (§5) | S, W, F | M10, M7, M21 |
| PLA-5 | **Placement policy: offer caps, dream offer** (§6) | S, W | P8 |
| PLA-6 | Applications, shortlisting, round results | S, W, F | — |
| PLA-7 | **Offers, acceptance, response deadline** | S, W, F | P9 |
| PLA-8 | Placement records and outcome capture | S, W, F | — |
| PLA-9 | **Statistics with stated denominators** (§12) | S, W, F | P5 |
| PLA-10 | Accreditation placement returns | S, W | P5 |

PLA-4 before PLA-6: applications without a working eligibility engine are a manual filter, which is
the thing this module exists to remove.

## 17. Cross-module impact

Reads M10 (results, backlogs — the eligibility inputs), M7 (attendance), M5 (student), M21
(sanctions), M22 (activity participation strengthens a profile). Announces through M20. Feeds M24
(a placed graduate becomes an alumnus with a known employer) and the accreditation returns.
Depends on P1, P2, P3, P5, P6, P8, P9.
