# Institutional Accounts — a named gap

Domain D6's second half. **Status: ❌ not built, and not assigned a blueprint module number.**

`docs/blueprint/03-modules.md`'s module map runs M1–M24 and contains **no accounts module**. D6 is
described as Student Finance and is delivered as M11. Yet the domain's own responsibilities include
institutional money, and three built or planned modules already produce obligations that have
nowhere to go:

- **M19** produces `invoice_payable` to vendors.
- **M15** produces a payroll register — the institution's largest expense.
- **M12** produces funder receivables from external scholarship claims.

This document names the gap so it is a decision rather than an omission.

## 1. The boundary that already holds

**M11 owns the student ledger and nothing else.** AD-6 says all money lives in one ledger owned by
Student Finance, and in context that ledger is the *student's*: fees, fines, concessions, payments,
refunds. Library fines and hostel dues post there correctly (M16 §5, M17 §8).

A vendor payable is not a student charge. Posting it to M11 would mean one ledger holding two
unrelated books, and `03-modules.md` §3.3's rule — no module holds a monetary balance except M11 —
was written about *student* balances, not about the institution's own accounts.

So the honest statement is: **M11 is the receivables ledger for students. There is currently no
general ledger.**

## 2. Three options, and a recommendation

**(a) Export to an external accounting system.** The ERP produces the registers — fee collection,
payroll, payables, assets — and exports them to Tally or similar, which most Indian colleges already
run and where their chartered accountant already works. `MASTER-CHECKLIST.md` §15 lists Tally
integration and notes *export before API*.

**(b) Build a general ledger inside the ERP.** Chart of accounts, vouchers, journals, bank
reconciliation, trial balance, budgeting, financial statements. A genuinely large module — comparable
to M10's examination engine — and it competes with mature accounting products the institution
already owns.

**(c) A thin ledger: budgets and commitments only.** No statutory financial statements; enough to
answer "has this department exhausted its budget" and "what have we committed but not paid".

**Recommendation: (a), with (c) where budget control is needed.** Building (b) means competing with
Tally on Tally's ground, inside an ERP whose value is academic and operational. It is the
`03-modules.md` §3.2 LMS argument applied to accounting: *a different product, and integration is the
right answer.*

This should be recorded as an ADR before M15 or M19 is built, because both need to know where their
output goes.

## 3. Open decision — OD-ACC-1

> **Does the ERP keep the institution's general ledger, or export to an existing accounting system?**

| | |
|---|---|
| **Affects** | M15 payroll, M19 procurement and assets, M12 external scholarships, budgeting, statutory financial reporting |
| **Why it matters** | Decides whether a large module is built, and whether department budget control exists in the ERP at all |
| **Options** | (a) export-only, (b) full general ledger, (c) thin budget and commitment ledger |
| **Recommended** | (a) plus (c) |
| **Status** | **Open.** Must be answered before M15 (payroll) or M19 (procurement) begins |
| **Related** | OD-4 (collect or only record student money), OD-5 (legacy systems inventory) |

## 4. What is needed under the recommendation

If (a) + (c) is chosen, the work is modest and belongs to the modules that produce the data:

```
budget          tenant, financial_year, department (M2), head, allocated_paise, version
commitment      budget, source(purchase_order|payroll|other), ref, amount_paise, state
expense_export  tenant, period, kind(collection|payroll|payable|asset), frozen_payload,
                exported_at, format, ack_ref
```

- **Budget and commitment** give M19's purchase approval a real check: an indent that would exceed
  a department's remaining budget is flagged at approval, not discovered at year end. This is the
  one piece of institutional finance the ERP is genuinely better placed to own, because it sits
  inside the approval chain (P1).
- **Export** is a P5 report descriptor per register, frozen at export with an acknowledgement
  reference, so "what did we send the accountant in March" has an answer.

## 5. Invariants, if built

- Integer paise, INR (M11 §3) — one currency discipline across every ledger.
- A commitment is released when its source closes (purchase order cancelled, payroll released).
- An export is **frozen** at the moment of export, like M15's payroll run and AD-23's published
  result; re-exporting supersedes with a new reference.
- Budget overspend is refused or requires an explicit higher approval; it is never silent.
- Tenant RLS with FORCE.

## 6. Build slices, gated on OD-ACC-1

| Slice | Scope | Surfaces | Gate |
|---|---|---|---|
| ACC-1 | **Answer OD-ACC-1 and record the ADR** | D | — |
| ACC-2 | Budgets by department and head | S, W, F | (c) |
| ACC-3 | Commitment tracking from M19 and M15 | S, W | (c) |
| ACC-4 | Budget check inside P1 purchase approval | S | (c) |
| ACC-5 | Export registers: collection, payroll, payable, asset | S, W | (a) |
| ACC-6 | Tally export format adapter | S | (a), OD-5 |
| ACC-7 | Budget utilisation reports | S, W, F | (c) |

## 7. Cross-module impact

Receives payables from M19, the payroll register from M15, receivables from M12, and collection
from M11. Constrains M19's purchase approvals through P1. Reads M2 (departments). Depends on P1,
P5, P8, P9.
