# Fee Module A-to-Z — Plan (2026-09-22)

Status: **PLAN — not implemented.** Nothing here is built by this document; it exists so the owner
can say "go" on one slice at a time. Built against the approved contract in
`docs/blueprint/modules/m11-student-finance.md` (M11, FEE-0) and the state actually found in the
repository on 2026-09-22 — not from memory of an earlier report.

## 1. Why this plan, and what changed since the last one

`docs/plan-inbox-2026-09-16.md` §E1 said "FEE-6 slice built" in passing and left the rest as a
single open line. This plan replaces that line with an inspected, corrected state and a specific
slice queue, because "fee module A to Z" is too large a unit to implement or verify in one pass
(CLAUDE.md §7).

**Correction found while writing this plan:** `PROJECT_STATE.md` currently reads `FEE-6 ❌ student's
own dues/invoices/payments view`. That is stale. The self-view **is built**: server `GET /v1/me/fees`
(`fee-routes.ts:105`), `StudentSelfRepository.myFees()`, `MyFeesCubit`, `MyFeesScreen`
(`lib/features/student/presentation/my_fees_*`), saved-first (CR-1), with its own dashboard tile.
What was never built is the second half of that same line: **a receipt/statement the student can
view, print or share.** `PROJECT_STATE.md` is corrected alongside this plan (§7 below).

## 2. What is already built (verified in the repository, not assumed)

| Piece | Where | Evidence |
|---|---|---|
| Roles: Accountant, Cashier | migration 031 | `fee.read/manage/collect/approve` permissions |
| Fee heads, fee structures (draft→published, program×year) | FEE-1 | `server/src/modules/fees/`, `fee_heads_screen.dart` |
| Instalments, lines, publish (irreversible) | FEE-1 | `fee_structure_detail_screen.dart` |
| Invoice generation from a published structure | FEE-2 | `POST /v1/fees/structures/:id/invoices`, idempotent |
| Concessions: request → College Admin approve/reject/withdraw | FEE-3 | `fee_requests`, `FeeRequestsScreen` |
| Counter payments, oldest-due-first allocation, gapless receipts | FEE-4 | `payments`, `payment_allocations`, `receipts` |
| Fines, late fees, waivers (reuse the request state machine) | FEE-5 | `POST .../fines`, `POST .../late-fees`, `POST /v1/fees/waivers` |
| Fee-scoped student search (Accountant/Cashier have no `student.read`) | — | `GET /v1/fees/students?q=` |
| Accountant/Cashier phone screens for all of the above | — | `lib/features/fees/` (7 screens), dashboard tiles |
| **Student's own dues/invoices/payments, saved-first** | **FEE-6 (self-view half)** | `GET /v1/me/fees`, `MyFeesScreen` |
| Open-once / saved-first everywhere in fees | R74 (2026-09-22) | all 5 Accountant/Cashier fee cubits |

This is already a working, correctly-modelled fee system for heads through payments. "A to Z" is
not a rewrite; it is the pieces below it never had.

## 3. What is genuinely missing

| Gap | Owner's words | Size |
|---|---|---|
| **G1 — Receipt / statement, view + print + share** | "print karwa payega" | Medium |
| **G2 — Reports** (daily collection, outstanding, defaulters, concession/waiver register) | "sub kuch details me dekh payega" | Medium-large |
| **G3 — Online payment (FEE-7)** | implied by "poora fee management system" | 🚫 Blocked — needs a Razorpay merchant account and API keys from the owner; design already decided (module doc §6), nothing to plan here until unblocked |
| **G4 — Web fee screens** | not asked for directly, but "A to Z" implies every desk role, not only mobile | Large, **open decision** — see §6 |

G1 and G2 are the two real slices this plan queues. G3 stays a blocked TODO, unchanged. G4 is a
decision to make before it becomes a slice, not a slice yet.

## 4. G1 — Receipt and statement (view, print, share)

### Scope
- **Receipt** (one payment): shows receipt number (gapless, §3 of the module doc), date, student,
  what it paid (allocations), method, amount, the college's name/logo (already in `CollegeBrand`).
  A cancelled receipt renders with a clear "CANCELLED" mark, never silently.
- **Statement** (one student, one academic year, or "to date"): every invoice, payment and
  request in the FEE-1..5 ledger, running balance, the same "why" a concession/waiver reduced a
  line.
- Both render to PDF, on the phone, so a Cashier or a student can view / print / share it — this is
  a client-side render, no server work, because every field it needs is already returned by
  existing endpoints (`GET /v1/fees/students/:id/{invoices,payments}`, `GET /v1/me/fees`).

### Who sees it
- Cashier/Accountant: a "Receipt" action from a payment row in `StudentFeeScreen` (already lists
  payments); a "Statement" action from the student's fee screen.
- Student: a "Receipt" action from a payment row in `MyFeesScreen`; a "Statement" action for their
  own record.

### Design
- New package: `pdf` (render) + `printing` (the OS print/share sheet) — both pure-Dart/Flutter,
  no native permissions beyond what `printing` already declares. No new server endpoint; a receipt
  is exactly the shape `payments`/`receipts` already return, formatted.
- One shared `FeeDocument` builder in `lib/features/fees/domain/`, used by both the Cashier's and
  the student's screens, so a receipt looks the same regardless of who opens it (ND container
  language, `docs/new-design/`, once ND-S6/S7 reach these screens — not blocking this slice).

### Exclusions
- No email/SMS delivery of a receipt (share-sheet only, v1).
- No server-rendered PDF (a client render is enough for print/share; a server copy would only
  matter for audit, which the ledger itself already is).

### Validation
- A receipt's total matches the payment's `amount_paise` and its allocations exactly.
- A cancelled receipt is visually unmistakable.
- Share/print opens the OS sheet on a real device (cannot be verified by a unit test; 🔍 phone).

## 5. G2 — Reports

### Scope, from the owner's "sub kuch details me dekh payega" and the module's own shape
1. **Daily collection** — by day, grouped by Cashier and by method (cash/UPI/cheque/transfer),
   with reversals shown as negative lines, not netted away (append-only ledger, module doc §3).
2. **Outstanding** — every student with a due invoice, amount, how overdue.
3. **Defaulters** — outstanding past a configurable number of days, for follow-up.
4. **Concession/waiver register** — every request with its decision, who decided, when; the
   accountability trail the module doc's approval state machine already keeps, surfaced as a list.

### Design
- **Server**: each report is a read against tables that already exist (`payments`,
  `payment_allocations`, `invoices`, `fee_requests`) — no new tables, no new invariant. Behind
  `fee.read` (Accountant, Cashier, College Admin all already hold it for their own scope).
  New endpoints, one per report: `GET /v1/fees/reports/collection`, `/outstanding`, `/defaulters`,
  `/requests-register`, each taking a date range where relevant.
- **Mobile**: one "Reports" screen (Accountant/College Admin dashboard tile, `fee.manage` or
  `institution.manage`) with the four as sections or tabs; simple totals and a list, no charting
  library beyond what `core/widgets/charts.dart` already provides if a bar/summary is wanted.
- Numbers only, no export in v1 (a report is read on the phone; G1's statement covers the
  per-student printable document).

### Exclusions
- No scheduled/emailed reports.
- No cross-tenant or platform-level reporting (Super Admin's own audit view is separate,
  already built, SA-3).

### Validation
- Collection total for a day equals the sum of that day's `payments`/reversals, independently
  computed in a test.
- Outstanding total equals the sum of `due` invoices' `amount_paise`.
- Server tests per endpoint (permission boundary: a teacher gets 403); Flutter widget tests for
  the screen's states (loading/empty/error/success), following the existing fee screens' pattern.

## 6. Open decision — OD-FEE-5: does the web console get fee screens?

The web client has **zero** fee screens today (`clients/web/src` has no `fees` feature directory).
Every Accountant/Cashier action lives only on the phone. "A to Z" quietly assumes a desk role works
at a desk; a Cashier processing a queue of counter payments may want a keyboard and a bigger screen
more than a phone does.

- **Option A** — leave fees mobile-only, as every other back-office module currently is (`R63`:
  "all modules for phone too" was the direction, not "web too"). No web work.
- **Option B** — bring G1/G2 (or all of FEE-1..6) to web once ND-S7 (the new design) reaches the
  web console's other list/detail screens, so fee screens are built once, in the current pattern,
  not twice.

**Recommendation:** Option A for now, revisit if a Cashier's daily volume makes the phone a real
friction point once G1/G2 ship — not before, since nobody has reported it and it would double the
size of this plan for a need not yet confirmed.

This decision does not block G1 or G2; both proceed mobile-first either way.

## 7. Sequencing and what it corrects

```
G1 (receipt/statement)  →  G2 (reports)  →  FEE-7 stays blocked, revisit when unblocked
```

G1 first: it is smaller, has no new server surface, and closes the exact word the owner used
("print"). G2 depends on nothing G1 builds but is naturally read after collection has receipts to
report on.

**Tracker correction to make alongside this plan** (not deferred — this is a documentation fix,
not a code change): `PROJECT_STATE.md`'s `FEE-6 ❌ ...` line is split into "self-view ✅ built" and
"receipt/statement PDF ❌, this plan's G1", so the tracker stops understating what already works.

## 8. Out of scope for this plan

- Anything FEE-7 needs beyond what module doc §6 already decided — that is a credentials
  blocker, not a design question.
- A general "documents" capability (scan Aadhar/degree/marksheet, R-inbox DOC-1) — a different,
  already-separately-planned piece (`docs/plan-inbox-2026-09-16.md` §A); fee receipts are
  generated documents, not uploaded ones, and share nothing with that plan.
- Any change to the approval state machine, roles, or ledger invariants in the module contract —
  none of G1/G2 needs one.

## 9. Next

Exactly one recommended next slice once the owner says go: **G1, receipt and statement PDF**
(view/print/share, phone-only, no server change). G2 follows it. FEE-7 and OD-FEE-5 stay open,
not blocking either.
