# P4 — Certificates and Letters

Blueprint capability P4. **Status: ❌ not built.** `docs/MASTER-PLAN.md` §4 flags the certificate
register as an audit gap: the blueprint mentions exit, but nothing models the serially-numbered,
revocable artefact an institution is audited on.

## 1. What this capability owns

Templated generation from live data, numbering, an issue register, revocation and reissue. Bonafide,
transfer, conduct, migration, experience letters and transcripts are **one capability**, not six
features, because they differ only in template and eligibility.

## 2. Why this is a capability and not a feature of M5

A certificate is a statement the institution makes about a person to a third party. Three
properties follow, and none of them belong in a student-records module:

- **It is numbered, gaplessly, per institution per kind.** The same reasoning as M11's gapless
  receipt numbers: a hole is something a registrar has to explain.
- **It is revocable.** A transfer certificate issued in error must be revocable, and the revocation
  must be discoverable by whoever holds the paper.
- **It freezes its data.** A bonafide certificate says what was true on its issue date. Regenerating
  it next year from live data would produce a different document with the same number.

## 3. Entities

```
certificate_kind      key, label, template, numbering_series, eligibility_rule,
                      requires_approval, permission_issue, retention_class
certificate_issue     tenant, kind, serial, person, issued_by, issued_at, frozen_payload,
                      document_id, state(issued|revoked|superseded), verification_code
certificate_revocation issue, reason, revoked_by, at        -- INSERT only
certificate_series    tenant, kind, year, next_number       -- gapless, per AD/M11 pattern
```

`frozen_payload` is the rendered data, stored. `document_id` points at the PDF held by P3. The
payload is stored **as well as** the PDF because a PDF is not queryable and a register must be.

## 4. Numbering

`<TENANT-CODE>/<KIND>/<YEAR>/<NNNN>`, assigned inside the issuing transaction from
`certificate_series`, never pre-allocated. A failed render rolls back the number with it. This is
exactly M11's receipt-number rule (`m11-student-finance.md` §3) and deliberately so — one rule for
numbered artefacts across the system.

## 5. Eligibility, and the check nobody should be able to skip

A certificate kind declares an eligibility rule evaluated at issue time against live data:

| Kind | Rule |
|---|---|
| Bonafide | Enrolled and not exited, in the current academic year |
| Transfer certificate | Exit recorded **and** clearance complete across M11, M16, M17, M18 |
| Conduct | No open case in M21, no active sanction |
| Migration | Programme completed, results published (M10) |
| Experience letter | Employment period closed in M13 |
| Transcript | Results published for every enrolled term (M10) |

Clearance is a cross-domain question and goes through a declared capability, not a shared read
(AD-28). **The TC is the one an institution gets sued over**: issuing it while fees are outstanding
or a library book is out is the classic failure, and the rule above is why it cannot happen here.

## 6. Verification by a third party

Every issue carries a `verification_code` and a public endpoint that answers, for a code:
kind, person's name, serial, issue date, and current state — and **nothing else**. An employer
verifying a certificate needs to know it is genuine and not revoked; they do not need the holder's
address.

Per AD-70's precedent for unauthenticated lookups, the endpoint answers identically for an unknown
code and a revoked one where disclosure would leak — rate-limited, and never enumerable.

## 7. Revocation and reissue

Revocation records a reason and an actor, flips the public verification answer, and never deletes.
A reissue (name correction, lost original) **supersedes**: new serial, old one marked `superseded`,
both discoverable. A duplicate is stamped as a duplicate on its face.

## 8. Invariants

- Serial assignment is transactional and gapless (§4); UPDATE on `certificate_issue.serial` refused.
- `certificate_revocation` is INSERT only.
- `frozen_payload` is immutable after issue (trigger).
- Eligibility is re-evaluated server-side at issue; a client cannot assert it.
- Tenant RLS with FORCE; verification lookups run through a narrow SECURITY DEFINER function, the
  same pattern as AD-61's platform event read.

## 9. Approvals (P1)

Kinds with `requires_approval` — transfer, migration, transcript — open a P1 request. Bonafide
does not; requiring an approval for a routine letter is how institutions end up with students
waiting three days for a form they need that afternoon.

## 10. Reports (P5)

Issue register by kind and period. Revocations with reasons. Pending requests by age. Verification
lookups by kind — a spike is worth knowing about.

## 11. Clients (AD-84 parity)

**Request**, both surfaces: a student requests a bonafide from the phone; this is among the most
common real student interactions with a college office and should never require a visit.

**Issue queue**, both surfaces: office staff see requests, eligibility computed and shown with
failures named ("2 books out, ₹4,500 due"), issue in one action.

**Register**, both surfaces: searchable by serial, person, kind, date; revoke with a reason.

**Delivery**: PDF via P3, OS share/print sheet on Flutter (the pattern already built for fee
receipts, `FeeDocument`), download on web.

## 12. Edge cases

- Name differs between records and the board marksheet → the certificate states the record name;
  correction is an M5 workflow first.
- Issued then exit reversed → the certificate stands; a TC issued in error is revoked explicitly.
- Bulk issue at graduation → one transaction per certificate, not one for all, so a single failure
  does not lose four hundred serials.
- Template edited after issues exist → issues keep `frozen_payload`; the template is versioned.
- Institution renamed or rebranded → historical certificates keep the name at issue time.

## 13. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P4-1 | Migration: kinds, series, issues, revocations; RLS, GRANTs, invariants | S |
| P4-2 | Gapless numbering, transactional issue | S |
| P4-3 | Template engine, freeze, render to PDF via P3 | S |
| P4-4 | Eligibility rules, clearance capability (AD-28) | S |
| P4-5 | Request and issue queue | W, F |
| P4-6 | Register, revoke, reissue | W, F |
| P4-7 | Public verification endpoint, rate limited | S |
| P4-8 | Approval chains via P1 | S, W, F |

## 14. Cross-module impact

Consumed by M4 (exit, TC), M5, M10 (transcript), M13 (experience letter). Depends on P3 (PDF
storage), P1 (approval), P5 (register reports), P6 (audit), and the clearance capability spanning
M11, M16, M17, M18.
