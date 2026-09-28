# M16 — Library

Blueprint module M16, domain D8. **Status: ❌ not built.**

`02-domains.md` groups library, hostel, transport and materials as one domain because they are four
expressions of one primitive: **a finite resource allocated to a person for a period, with issue,
return, condition and charge.** M16 is the fullest expression of it and is built first, so the
allocation pattern is proven once.

## 1. What this module owns

The catalogue, physical holdings, membership, circulation, reservations, fines and stock
verification.

It does **not** own money (M11 — a fine is a charge on the student ledger per AD-6), people (M1,
M5, M13), or procurement (M19 buys books; M16 catalogues them).

## 2. The catalogue/holding split

One of two modelling decisions that decide whether this module works.

- **`library_item`** is the bibliographic record: *Introduction to Algorithms, Cormen, 3rd ed, ISBN…*
  One row, however many copies exist.
- **`holding`** is a physical copy: accession number, shelf, condition, status.

A reservation queues against the **item**; an issue attaches to a **holding**. Collapsing them means
you cannot answer "how many copies do we have and where are they", which is the entire job of a
library. Keeping them separate also makes M19's purchase of three more copies an insert of three
holdings against an existing item.

## 3. Permissions

```
library.read        normal     Search catalogue, see own loans
library.circulate   normal     Issue, return, renew. The counter operation
library.manage      sensitive  Catalogue, holdings, accession, withdraw
library.policy      sensitive  Loan rules, fine rates, membership classes
fine.waive          sensitive  Waive a fine, with a reason
```

`library.circulate` is deliberately separate from `library.manage`, mirroring M11's Cashier/Accountant
split (`m11-student-finance.md` §2): the person at the counter issues books; they do not rewrite the
catalogue or the fine rates.

## 4. Entities

```
library_item        tenant, title, authors[], isbn, publisher, year, edition, classification,
                    subjects[], kind(book|journal|thesis|ebook|media), version
holding             item, accession_no, campus, location, condition, status, acquired_ref (M19),
                    cost_paise, version
membership_class    tenant, applies_to(student|staff), max_items, loan_days, renewals_allowed,
                    fine_per_day_paise, fine_cap_paise, reserve_allowed, version
membership          person, class, valid_from, valid_to, state
circulation         holding, person, issued_at, due_on, returned_at, renewals, state,
                    issued_by, returned_by, version
reservation         item, person, placed_at, state, expires_at, fulfilled_holding
fine                circulation, kind(overdue|damage|loss), amount_paise, state,
                    invoice_ref (M11), waiver_ref
stock_verification  tenant, campus, started_at, completed_at, scope, findings[]
```

## 5. The second modelling decision: fines are M11's, not M16's

A fine is **charged**, not **held**. M16 computes what is owed and raises an M11 charge; M11 owns
the balance, the payment and the receipt. AD-6 is explicit — all money lives in one ledger, owned by
Student Finance — and `02-domains.md` names this for D8: *push every service charge to the student
ledger rather than tracking money in four places.*

The practical payoff: a student's dues are one number across fees, library, hostel and transport, and
exit clearance (M4 §11) asks one module, not four.

## 6. Lifecycle

```
holding:      on_order → available → { issued | reserved | in_repair } → available
                                   ↘ lost → written_off
                                   ↘ withdrawn

circulation:  issued → { returned | renewed → issued }
                     ↘ overdue → returned_late
                     ↘ declared_lost → charged

reservation:  placed → { available_for_pickup → fulfilled }
                     ↘ expired ↘ cancelled
```

## 7. Invariants

- A holding is issued to at most one person at a time (unique partial index on open circulations).
- Issue is refused when: membership invalid or expired, `max_items` reached, an unpaid fine exceeds
  the policy threshold, or the holding is not `available`. **Refusals name the reason** — a counter
  that says "cannot issue" without saying why creates a queue.
- `due_on` is a calendar date (AD-49), computed from the work calendar so it never lands on a closing day.
- Renewal is refused when a reservation exists against the item. The queue outranks the holder.
- Fines are INSERT-only ledger charges; a waiver is a reversing entry with an approval, never a delete.
- Accession numbers are gapless per tenant (M11's rule).
- A holding with an open circulation cannot be withdrawn or written off.
- Tenant RLS with FORCE.

## 8. Fine accrual (P9)

A nightly job accrues overdue fines per day at the class rate, capped at `fine_cap_paise`, and
raises or updates the M11 charge. Idempotent by `(circulation, date)` — running twice must not
double-charge, which is P9 §4's requirement made concrete.

Fines stop accruing on return, on declared loss (replaced by the loss charge), and on days the
library is closed.

## 9. Approvals (P1)

Fine waiver (Librarian → Principal above a threshold). Loss write-off. Holding write-off. Policy
changes. Membership class assignment outside the default.

## 10. Notifications (P2)

Borrower: due in 2 days, due today, overdue, fine accruing, **reservation ready for pickup with its
expiry**, membership expiring.
Librarian: reservations to fulfil, overdue over 30 days, stock verification discrepancies,
reorder suggestions from demand.

The due-soon reminder is what keeps fine income low and goodwill high. P2's quiet hours and digest
(P2 §5) matter here: an entire cohort's due-date reminders at 6am is exactly the pattern that makes
people disable notifications for everything.

## 11. Scheduled work (P9)

Fine accrual (§8). Due reminders at −2, 0, +1, +7 days. Reservation expiry and queue advance.
Membership expiry on exit or graduation. Long-overdue escalation to declared-loss. Reorder alerts
from reservation demand.

## 12. Reports (P5)

Circulation by period, category and department. Overdue register with ageing. Fine collection and
waivers. Most and least borrowed — the least-borrowed report is what informs deselection.
Holdings by classification. Stock verification discrepancies. Per-student borrowing history
(a sensitive read, audited per P6 §3 — what a person reads is private). Dues for exit clearance.

## 13. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Catalogue search | ✅ | ✅ **primary for students** |
| Counter: issue, return, renew | ✅ **primary** | ✅ — barcode via camera |
| My loans, dues, history | ✅ | ✅ **primary** |
| Reserve and queue position | ✅ | ✅ **primary** |
| Cataloguing and accession | ✅ primary | ✅ camera ISBN capture |
| Stock verification | ✅ | ✅ **primary — walking the shelves with a phone** |
| Policy and membership classes | ✅ primary | ✅ read |
| Bulk catalogue import | ✅ | **exception: web only** (P8 §4) |
| Reports | ✅ | ✅ via P5 |

Two genuinely phone-first surfaces here: stock verification (a person walking shelves scanning
accession barcodes) and student self-service. The counter is web-primary because it is a desk with
a scanner, but the Flutter counter exists for a mobile issue desk during admissions week.

## 14. Edge cases

- Book lost rather than returned → replacement cost plus processing, charged to M11; the holding
  becomes `lost`, and the accession number is **never reused**.
- Returned damaged → a damage fine with a recorded condition assessment; the holding goes `in_repair`.
- Student graduates with a book out → blocks exit clearance (M4 §11) and the transfer certificate (P4 §5).
- Fine exceeds the book's value → `fine_cap_paise` exists for this; an uncapped per-day fine
  eventually exceeds the replacement cost, which no institution intends.
- Two holdings, same accession, different campuses → accession is unique per tenant, not per campus.
- Reservation ready, borrower does not collect → expires, queue advances, no penalty by default.
- Staff member with no end date → membership follows employment (M13); exit revokes it.
- Item withdrawn while reserved → reservations cancelled and notified, never silently dropped.
- Inter-campus transfer of a holding → location change with a history row, not a new holding.

## 15. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| LIB-1 | Items, holdings, accession, catalogue search | S, W, F | P7 later |
| LIB-2 | Membership classes and memberships | S, W, F | M5, M13 |
| LIB-3 | **Circulation: issue, return, renew** with refusal reasons | S, W, F | — |
| LIB-4 | Reservations and queue | S, W, F | P2 |
| LIB-5 | **Fine accrual and M11 charge** | S | P9, M11 |
| LIB-6 | Waivers and write-offs via P1 | S, W, F | P1 |
| LIB-7 | Student self-service: my loans, dues, reserve | W, F | — |
| LIB-8 | Stock verification | S, W, F | — |
| LIB-9 | Bulk catalogue import | S, W | P8 |
| LIB-10 | Clearance answer for M4 §11 | S | AD-28 |
| LIB-11 | Reports | S, W, F | P5 |

LIB-3 and LIB-5 together prove the D8 primitive: allocate a finite resource for a period, then
charge for its misuse through the one ledger. M17 and M18 reuse both.

## 16. Cross-module impact

Reads M5 (students), M13 (staff), M2 (campus, calendar). Charges M11. Answers M4's clearance
capability. Receives holdings from M19 acquisitions. Depends on P1, P2, P5, P9, and later P7 (search).
