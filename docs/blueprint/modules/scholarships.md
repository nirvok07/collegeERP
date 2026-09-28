# M12 — Scholarships

Blueprint module M12, domain D6, phase 3. **Status: ❌ not built.**

M11 Student Finance already carries the *mechanism* — `m11-student-finance.md` §5 defines
concessions and waivers with an approval shape, and §4 states that individual differences
"(scholarship, hardship, sibling discount, …) are concessions against the standard structure, never
a second structure." M12 is the layer above that: the schemes, eligibility, applications and
disbursement that decide **which** concessions exist and who gets them.

## 1. What this module owns

Scholarship schemes, their funding source, eligibility and selection, applications, awards,
renewal, and the disbursement or adjustment that follows.

It does **not** own money movement. **Every award becomes an M11 concession or a payment** (AD-6).
M12 decides entitlement; M11 records the ledger effect. This boundary is the module's whole design.

## 2. Two kinds of scholarship, and they behave differently

| | Institutional | External (government / trust / corporate) |
|---|---|---|
| Funded by | The college | A third party |
| Effect | Fee **reduced** — an M11 concession | Fee **paid**, often in arrears — an M11 payment |
| Student owes | Less, immediately | Full, until the funder pays |
| Risk | None | **The funder may not pay** |
| Tracked | Award only | Award, claim, receipt, reconciliation |

Collapsing these is the classic error. A government post-matric scholarship that reduces a
student's invoice on day one leaves the college with a receivable it is not tracking and a student
who believes they owe nothing. External schemes must keep the student's liability intact and record
the funder's obligation separately.

## 3. Permissions

```
scholarship.read      normal     Schemes, own applications
scholarship.apply     normal     Apply
scholarship.review    normal     Verify and recommend
scholarship.award     sensitive  Award, revoke, renew
scholarship.manage    sensitive  Schemes, criteria, budget
scholarship.disburse  critical   Record disbursement or adjustment
```

## 4. Entities

```
scheme               tenant, name, kind(institutional|government|trust|corporate), funder,
                     academic_year, budget_paise, slots, eligibility_rule, selection_rule,
                     renewable, renewal_rule, effect(concession|reimbursement), state, version
scheme_document      scheme, required_document_kind, mandatory
scholarship_app      scheme, student, state, submitted_at, score, rank, documents[] (P3), version
award                scheme, student, academic_year, amount_paise|percent, state,
                     awarded_by, concession_ref (M11), version
disbursement         award, kind(concession|payment|reimbursement), amount_paise,
                     effected_on, m11_ref, funder_claim_ref
funder_claim         scheme, period, students[], claimed_paise, submitted_at, state,
                     received_paise, received_on, reconciled_at
renewal              award, academic_year, criteria_met, decision, decided_by, at  -- INSERT only
```

## 5. Eligibility and selection are different questions

**Eligibility** is a filter: who may apply — category, income ceiling, programme, year, minimum
attendance (M7), minimum result (M10), no active sanction (M21).

**Selection** is a ranking within eligible applicants when slots or budget are finite: merit,
need, or a weighted combination, computed and shown **with its components**, exactly as M17 §7
requires for hostel allocation. A student who is refused a scholarship deserves to see the
derivation, and so does the institution when challenged.

Both are computed from live data (AD-7), never typed in by hand.

## 6. Lifecycle

```
scheme:   draft → open → closed → { selection → awarded } → disbursing → settled → closed

app:      submitted → documents_verified → eligible → ranked → { awarded | waitlisted | rejected }

award:    awarded → accepted → active → { renewed | lapsed | revoked | completed }

claim:    prepared → submitted → { part_received → received } → reconciled
```

## 7. Invariants

- Total awarded may not exceed `scheme.budget_paise` or `slots` (trigger). **The overcommitment
  invariant** — the same shape as M4's seat matrix and M17's bed allocation.
- One active award per student per scheme per academic year.
- An award's ledger effect goes through M11 and records `concession_ref` or `m11_ref`; M12 never
  writes a balance (AD-6).
- A revoked award reverses through M11 as a reversing entry, never an edit
  (`m11-student-finance.md` §3).
- Renewal cannot be granted without recorded criteria evaluation; `renewal` is INSERT only.
- Documents are P3 kinds with `requires_verification`.
- Integer paise, INR (M11 §3).
- Tenant RLS with FORCE. Income and category data are **sensitive reads, audited** (P6 §3).

## 8. Approvals (P1)

Scheme creation and budget (→ Principal). The award list, approved as a **set** rather than
one by one — a selection round is one decision over a ranked list, and forcing four hundred
individual approvals means nobody reads any of them. Individual awards outside the ranking, with a
reason. Revocation. Disbursement above a threshold.

## 9. External claims and the reconciliation nobody plans for

For `effect = reimbursement` schemes: the college claims from the funder, the funder pays late and
sometimes partially, and the shortfall lands back on the student or on the college.

`funder_claim` tracks claimed against received per period and per student. The reconciliation
report (§11) is the one finance actually needs, and the case the module is designed around — not
the happy path where a scholarship simply reduces a fee.

## 10. Notifications (P2) and scheduled work (P9)

Student: scheme open and eligibility, documents required, **awarded with amount and effect**,
disbursed, renewal criteria at risk, renewal decision, revocation with reason.
Officer: applications pending verification, budget nearly exhausted, claim due, funder payment
overdue, renewals due.

Jobs: scheme window transitions, eligibility recomputation after results publish (M10), renewal
criteria evaluation at year end, claim preparation, funder-payment overdue chase, budget
utilisation snapshots.

"Renewal criteria at risk" mid-year is the notification with real student impact: a student whose
attendance is drifting below a renewal threshold can still act on it in March, not in June.

## 11. Reports (P5)

Scheme utilisation: budget, slots, awarded, disbursed. Awards by category, programme and department —
a statutory return in India. Beneficiary register. **Funder claim reconciliation: claimed, received,
outstanding, ageing** (§9). Renewal outcomes and lapse reasons. Impact: comparison of results and
retention for holders against the cohort. Government scholarship statutory returns.

## 12. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Scheme list and eligibility | ✅ | ✅ **primary for students** |
| **Apply with documents** | ✅ | ✅ **primary — camera capture** (P3) |
| My applications and awards | ✅ | ✅ **primary** |
| Verification queue | ✅ **primary** | ✅ |
| Ranking and selection | ✅ **primary** | ✅ read |
| Award approval (as a set) | ✅ **primary** | ✅ approve |
| Disbursement and M11 effect | ✅ **primary** | ✅ read |
| Claims and reconciliation | ✅ **primary** | **exception: web only** |
| Reports | ✅ **primary** | ✅ via P5 |

Students apply from a phone with photographed documents — the same path as M4 admissions, and
deliberately the same interaction. Claim reconciliation is a spreadsheet-shaped finance task and is
a recorded web-only parity exception (AD-84 §6.4).

## 13. Edge cases

- Awarded, then fees already paid in full → refund or carry-forward credit through M11, per policy.
- Holds two scholarships → policy decides whether they stack; the cap is on the scheme and the total.
- Funder pays less than claimed → shortfall to the student or written off by decision, never
  silently absorbed.
- Funder never pays → receivable ages; the module surfaces it rather than hiding it in fees.
- Student leaves mid-year with a disbursed award → recovery per scheme terms, through M11.
- Renewal criteria missed marginally → an exception approval path exists, recorded.
- Income certificate expires mid-year → flagged at renewal, not retroactively.
- Category certificate found invalid after award → revocation and recovery, and an M21 case where
  misrepresentation is alleged.
- Scheme announced after invoices are raised → concession applies retroactively as an M11 credit.
- Sibling of an existing holder → a distinct scheme rule, not an informal adjustment.

## 14. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| SCH-1 | Schemes, funders, budget, slots | S, W, F | M11 |
| SCH-2 | **Eligibility and selection with derivation** (§5) | S, W, F | M7, M10, M21 |
| SCH-3 | Applications with documents | S, W, F | P3 |
| SCH-4 | Verification queue | S, W, F | P1 |
| SCH-5 | Ranking, award as a set, budget invariant | S, W, F | P1 |
| SCH-6 | **Institutional effect: M11 concession** | S | M11 |
| SCH-7 | **External effect: claims and reconciliation** (§9) | S, W | M11 |
| SCH-8 | Renewal evaluation and decision | S, W, F | P9 |
| SCH-9 | Revocation and recovery | S, W, F | M11, P1 |
| SCH-10 | Reports and statutory returns | S, W, F | P5 |

SCH-6 before SCH-7: prove the M11 boundary on the simple case before adding the funder receivable.

## 15. Cross-module impact

Effects land entirely in M11 (AD-6). Reads M5 (student, category), M7 (attendance), M10 (results),
M21 (sanctions), M4 (admission category data). Feeds M4's admission process where a scheme is
offered at admission. Depends on P1, P2, P3, P5, P6, P9.
