# M19 — Materials and Assets

Blueprint module M19, domain D8. **Status: ❌ not built.** Phase 4 in the blueprint's ordering.
Covers stores and inventory, indent and purchase, goods receipt, issue, and the fixed-asset register
with depreciation.

## 1. What this module owns

Consumables from indent to issue, and capital items from purchase to disposal. The vendor register
and the purchase workflow sit here.

It does **not** own money settlement (institutional accounts — M19 produces a payable, it does not
pay), the student ledger (M11 is for student charges only; procurement is institutional spend and
these are deliberately different ledgers), employees (M13), or the *use* of an asset once issued
(M18 runs the bus; M19 owns it as an asset).

## 2. Consumable and asset are different things

A box of chalk is consumed; a microscope is owned for ten years and depreciated. Modelling both as
"inventory" produces a stock ledger that cannot answer the auditor's question, and modelling both as
"assets" produces an asset register with forty thousand pencils in it.

| | Consumable | Asset |
|---|---|---|
| Tracked as | Quantity in stock | An individually tagged item |
| Leaves by | Issue, consumption | Disposal, write-off |
| Valued by | Moving average cost | Cost less accumulated depreciation |
| Auditor asks | "What is the stock position?" | "Show me item AST/2024/0412" |

A purchase may produce either, decided by the item's category and a value threshold from P8.

## 3. Permissions

```
inventory.read       normal     Stock position, own indents
indent.raise         normal     Request materials
indent.approve       normal     Approve within scope
purchase.order       sensitive  Create a purchase order
goods.receive        normal     Record a goods receipt
stock.issue          normal     Issue against an indent
asset.read           normal
asset.manage         sensitive  Tag, transfer, revalue
asset.writeoff       critical    Write off or dispose. Irreversible
vendor.manage        sensitive  Vendor register
```

## 4. Entities

```
item_category     tenant, name, kind(consumable|asset), depreciation_rate, asset_threshold_paise
item              tenant, category, code, name, unit, reorder_level, reorder_qty, version
store             tenant, campus, name, keeper (M13)
stock             store, item, quantity, moving_avg_cost_paise, version
stock_movement    store, item, kind(receipt|issue|return|adjust|transfer|write_off),
                  quantity, rate_paise, ref, at, actor, reason    -- INSERT only, append-only
vendor            tenant, name, gstin, contact, category[], rating, blacklisted, version
indent            tenant, department (M2), raised_by, items[], purpose, state, version
purchase_request  indent[], state, estimate_paise, justification
quotation         purchase_request, vendor, amount_paise, valid_to, document_id (P3)
purchase_order    vendor, items[], amount_paise, po_no, terms, state, approved_by, version
goods_receipt     purchase_order, received_at, items[], inspected_by, discrepancies[], grn_no
invoice_payable   purchase_order, goods_receipt, vendor, amount_paise, state, due_on
asset             item, asset_tag, store|department, acquired_on, cost_paise, useful_life_years,
                  condition, custodian (M13), state, version
depreciation_run  tenant, period, method, entries[], state
asset_movement    asset, from, to, kind(transfer|issue|return|repair|disposal), at, approved_by
```

`stock_movement` is append-only and the stock quantity is derived from it — the same discipline as
M11's ledger and M14's leave ledger. A stock figure that can be edited is a stock figure no audit
accepts. The `stock.quantity` column is a materialised convenience reconciled nightly by P9, a
declared exception to AD-7 with the reconciliation job as its price.

## 5. Lifecycle

```
indent:          draft → raised → approved → { ordered | issued_from_stock } → closed
                               ↘ rejected

purchase_order:  draft → approved → placed → { partially_received → received } → closed
                                  ↘ cancelled

asset:           acquired → in_use → { under_repair | idle } → { disposed | written_off }
```

## 6. Invariants

- Stock may not go negative (trigger). An issue beyond stock is refused, not recorded as −3.
- `stock_movement` is INSERT only.
- Goods receipt quantity may not exceed the purchase order quantity without an approved variance.
- A purchase order above a threshold requires quotations — count and threshold from P8 policy.
  **This is the anti-corruption control** and it is enforced, not advisory.
- A blacklisted vendor cannot receive a purchase order.
- Purchase order and GRN numbers are gapless per tenant per year (M11's rule).
- `asset_tag` is unique per tenant and never reused, even after disposal.
- An asset with an open custody assignment cannot be written off.
- `asset.writeoff` is `critical`: it destroys value on the books and requires approval plus a reason.
- Integer paise, INR (M11 §3).
- Tenant RLS with FORCE.

## 7. Purchase workflow (P1)

```
indent (requester)
  → HoD approval
  → store check: issue from stock, or raise a purchase request
  → quotations (count per threshold)
  → comparative statement
  → purchase committee (above threshold)
  → Principal approval
  → purchase order
  → goods receipt and inspection
  → payable to accounts
```

Thresholds come from P8 settings, because every institution's delegation of financial powers
differs and hard-coding one guarantees a customisation request.

**Nobody approves their own indent** (P1 §6). In a small department where the HoD is the requester,
the chain escalates to the Principal rather than auto-approving — the exact case P1 §6 was written for.

## 8. Depreciation

Straight-line or written-down value per category, run annually or monthly as a P9 job, producing
`depreciation_run` entries. Each run is **frozen** once posted; a correction is a new adjusting
entry, never an edit — the same rule as M15's payroll run and AD-23's published result.

The asset register with accumulated depreciation is a statutory output. Getting freeze semantics
right here is what makes the register defensible.

## 9. Notifications (P2)

Requester: indent approved, rejected, issued, order placed, expected delivery.
Approver: indent waiting, purchase approval waiting (P1 SLA).
Store keeper: **stock below reorder level**, goods expected today, GRN pending inspection,
discrepancy found.
Finance: payable due, purchase order committed but unreceived after N days.
Custodian: asset assigned, verification due, return required on exit (M13 clearance).

## 10. Scheduled work (P9)

Reorder alerts against `reorder_level`. Stock reconciliation against movements (§4). Depreciation
runs. Asset verification reminders (annual physical verification is a statutory requirement).
Purchase orders outstanding beyond expected delivery. Payables ageing. Vendor rating recomputation
from delivery performance.

## 11. Reports (P5)

Stock position and valuation by store. Movement register. Consumption by department — the input to
next year's budget. Reorder due list. Purchase register by vendor and period. Quotation comparison
history. **Vendor performance**: delivery time, discrepancy rate, price variance. Asset register
with depreciation. Asset verification discrepancies. Department-wise asset holding. Write-off register.

## 12. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Item master, categories, stores | ✅ **primary** | ✅ read |
| **Raise an indent** | ✅ | ✅ **primary — a HoD requesting from anywhere** |
| Indent approval | ✅ | ✅ **primary** (P1 inbox) |
| Quotations and comparative statement | ✅ **primary** | ✅ read |
| Purchase order | ✅ **primary** | ✅ approve |
| **Goods receipt and inspection** | ✅ | ✅ **primary — at the loading dock, with camera** |
| Stock issue | ✅ | ✅ **primary — at the store counter** |
| **Asset tagging and verification** | ✅ | ✅ **primary — walking with a phone, scanning tags** |
| Depreciation runs | ✅ **primary** | ✅ read |
| Vendor register | ✅ primary | ✅ read |
| Reports | ✅ | ✅ via P5 |

Like M16's stock verification, physical asset verification is genuinely phone-first: a person walks
the campus scanning tags and recording condition, with camera evidence through P3. Doing that with
a clipboard and transcribing later is how asset registers become fiction.

## 13. Edge cases

- Partial delivery → GRN per delivery, purchase order stays `partially_received`.
- Goods received damaged → recorded as a discrepancy, returned to vendor, payable adjusted, vendor
  rating affected.
- Rate differs from the order → variance approval; the invoice never silently overrides the order.
- Item is a consumable in one category and an asset above a value threshold → the threshold decides
  at receipt (§2), recorded so it is not arbitrary.
- Asset transferred between departments → `asset_movement`, custody changes, both departments' registers update.
- Asset lost → write-off with an investigation reference (M21 case where warranted).
- Stock discrepancy at physical verification → an `adjust` movement with a reason and an approval,
  never a silent correction. **`02-domains.md` names this edge case explicitly.**
- Vendor blacklisted with open orders → orders complete; no new ones.
- Emergency purchase without quotations → allowed with a recorded justification and a higher
  approval level; forbidding it entirely means people work around the system.
- Asset still held by an exiting employee → blocks M13's exit clearance.

## 14. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| MAT-1 | Categories, items, stores, reorder levels | S, W, F | M2, M13 |
| MAT-2 | Stock ledger, movements, reconciliation | S, W, F | P9 |
| MAT-3 | Vendors, blacklist, rating | S, W, F | — |
| MAT-4 | **Indent, approval chain, issue from stock** | S, W, F | P1 |
| MAT-5 | Purchase request, quotations, comparative statement | S, W, F | P3, P1 |
| MAT-6 | **Purchase order with threshold controls** | S, W, F | P1, P8 |
| MAT-7 | Goods receipt, inspection, discrepancies | S, W, F | P3 |
| MAT-8 | Payable handoff to accounts | S, W | — |
| MAT-9 | **Asset register, tagging, custody** | S, W, F | P3 |
| MAT-10 | Physical verification (phone-first) | S, W, F | — |
| MAT-11 | Depreciation runs, frozen | S, W | P9 |
| MAT-12 | Disposal and write-off (`critical`) | S, W, F | P1 |
| MAT-13 | Asset item for M13 exit clearance | S | AD-28 |
| MAT-14 | Reports | S, W, F | P5 |

## 15. Cross-module impact

Supplies holdings to M16 (books), vehicles to M18 (assets), equipment to departments (M2) and
rooms (M6). Reads M13 (custodians, store keepers) and feeds its exit clearance. Produces payables
for institutional accounts — **not** M11, which is the student ledger only. Depends on P1, P2, P3,
P5, P8, P9.
