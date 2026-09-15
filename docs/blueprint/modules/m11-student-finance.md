# M11 Student Finance (fees), FEE-0

Pulled forward from Release two (`docs/requirements.md` D1) at the owner's request, 2026-09-15.
This is the contract the FEE-1…FEE-8 slices build against. Decisions below were made by the owner
in conversation on 2026-09-15 and are recorded here as the ADR for the module; no code exists yet.

## 1. What this module owns

Fee heads and structures, invoices and instalments, concessions and waivers, counter payments,
receipts, late fees and fines, and (later, FEE-7) an online payment link. It does not own admissions,
academic status, or anything M5 (Student Records) already owns; it reads a student's program and
academic year from M5 and never duplicates them.

## 2. Roles

Two new college roles, seeded as system role templates (`role_definitions`, `tenant_id NULL`), the
same way `college_admin` / `department_head` / `faculty` are (migration 002):

- **Accountant** — fee heads, structures, invoices, late-fee and fine rules, concession/waiver
  *requests*, reports. Cannot record a payment or issue a receipt.
- **Cashier** — records counter payments and issues or cancels receipts. Cannot change a fee
  structure, raise a fine, or approve anything.

Both are institution-scoped (`allowed_scope_types = ARRAY['institution']`). The College Admin
appoints people into them (reuses the existing appoint-a-person path) and approves what Accountant
requests need approving. Nobody's permission set is invented here beyond what listing requires: a
`fee.*` permission family, granted only to these two roles and to `college_admin`.

## 3. Ledger invariants (checked from FEE-1 onward, never relaxed)

- **Append-only.** A ledger entry is never edited or deleted once written. A mistake is corrected
  by a reversing entry that references what it reverses, never by mutating it.
- **Integer paise, INR only.** No fractional currency, no other currency in v1. A column named
  `_paise` is always a `bigint`.
- **Gapless receipt numbers per college.** A `bigint` sequence per tenant, assigned only at the
  moment a receipt is actually issued (not pre-allocated), so a cancelled attempt never leaves a
  hole a chartered accountant has to explain.
- **A cancelled receipt is a reversal, not a deletion.** Its number is never reissued.

## 4. Fee structure scope (v1)

One fee structure per program **and** academic year (not per category, quota, or section). A
student's dues follow their program + academic year. Differences for an individual student
(scholarship, hardship, sibling discount, …) are concessions against the standard structure, never
a second structure.

## 5. Concessions, waivers, fines: one approval shape

All three share a state machine, because all three change what a student owes without a payment
having happened, and per the owner all three need the same accountability:

```
requested → approved → applied (reduces/adds to dues)
          → rejected
          → withdrawn (by the Accountant, before a decision)
```

- **Concession / waiver**: the Accountant requests a reduction (a concession on a fee head, or a
  waiver of an already-charged late fee or fine) with a reason; the College Admin approves or
  rejects. Only *approved* changes what is owed. A waiver is a credit entry against the ledger, the
  charge it waives is never deleted.
- **Fine**: the Accountant raises it directly (no approval to *charge* a student — only *removing*
  it needs approval, via the waiver path above). A fine is its own ledger line, not folded into
  late fees, since a fine's reason is freeform and a late fee's is always "instalment overdue".
- **Late fee**: not requested or approved at all — an optional flat amount on the fee structure,
  applied automatically once an instalment passes its due date unpaid. Only *waiving* one already
  charged goes through the approval path above.

This is a fee-owned state machine, not a general approvals engine: `P1` (a college-wide approvals
capability) stays unspecified, and this module does not wait for it.

## 6. Payment (FEE-4, counter; FEE-7, online)

- **Counter (FEE-4):** cash, UPI, cheque, or bank transfer, recorded by the Cashier. A payment is
  allocated to the student's oldest unpaid dues first (oldest instalment, then oldest fine/late
  fee, unless the Cashier's UI later needs to override — not in v1). A receipt is issued at the
  moment of recording, gapless per §3. Cancelling a receipt reverses the payment and the
  allocation; it does not delete the receipt row.
- **Online (FEE-7, 🚫 BLOCKED on a Razorpay merchant account and API keys):** the app never embeds
  a Razorpay checkout SDK (owner: no Play Store / App Store cut on a payment link opened in a
  browser). The server creates a Razorpay Payment Link (or an equivalent hosted page — assumption,
  confirm before building) and the app opens it via `url_launcher`. The payment is recorded **only**
  from Razorpay's signed webhook, verified server-side; the app polls or refreshes on return rather
  than trusting its own redirect. Every other FEE slice is buildable and useful without this.

## 7. What FEE-1 builds on this contract

Migration: `fee.*` permissions, the Accountant and Cashier role templates, `fee_heads`,
`fee_structures` (program × academic year, publish/draft), `fee_structure_lines` (head × amount ×
instalment), each under the same tenant-isolation RLS pattern as every other tenant-owned table
(`014_student_records.sql` §"Isolation, privileges and permissions" is the template). No invoices,
no payments yet — those are FEE-2 and FEE-4.
