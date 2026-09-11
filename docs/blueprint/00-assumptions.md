# Blueprint 0 — Assumptions and Open Decisions

Produced before any module specification. Every item here either constrains the architecture or
is waiting on an answer that would change it.

## 0.1 Standing assumptions

| ID | Assumption | If wrong, cost |
|---|---|---|
| S1 | Indian higher education. Semester or annual terms, an affiliating university relationship in most cases, government scholarship schemes, and accreditation reporting for NAAC and NBA | High. Term model, result authority and statutory reports all change |
| S2 | This is a **product sold to many colleges**, not a bespoke build for one. Every academic rule, fee head, grading scheme and approval chain must be configurable per tenant | Very high. A bespoke build would hard-code what is currently designed as configuration |
| S3 | One tenant is one institution, which may hold more than one campus | Medium. Covered by OD-2 |
| S4 | The college is the authority for internal assessment, attendance, fees and operations. The affiliating university is the authority for external examination results where one exists | High. Covered by OD-1 |
| S5 | Staff-heavy back-office work needs a desktop-class interface. Students and teaching staff need mobile | High. Covered by OD-3 |
| S6 | Offline capability is required for field roles on mobile, not for back-office work | Medium. Narrows the earlier system-wide offline commitment. See AD-9 |
| S7 | Personal data of minors may be present in some institutions, so consent and guardian access need modelling | Medium. Adds a consent register |
| S8 | The system must be auditable to an external auditor's standard for anything touching money, marks or attendance | High if wrong in the other direction. Audit cannot be retrofitted |

## 0.2 Open decisions

These genuinely change the architecture. Each carries a recommended default so work is not
blocked, and each default is reversible only at the stated cost.

**OD-1. Affiliating or autonomous?**
Does the college run its own end examinations and issue its own results, or does an affiliating
university own examinations, results and degrees?

This is the single largest question in the brief. If affiliating, the ERP owns internal
assessment only, mirrors university results read-only, and needs an integration or import path
per university, each with its own format. If autonomous, the ERP owns the full examination
lifecycle including question papers, seating, invigilation, evaluation, moderation, revaluation
and transcripts, which is roughly three times the module.

*Recommended default:* support both. Model external assessment as a mirrored, read-only record
with an import adapter, and build the autonomous examination engine in Phase 3 behind a tenant
capability flag. Cost of the default: a small amount of indirection now, far cheaper than either
retrofit.

**OD-2. Is campus a real scope dimension?**
Will any tenant operate more than one campus with separately managed academics, staff and fees?

If yes, campus becomes a scope on nearly every record and on every permission check, alongside
department and academic year. Retrofitting a scope dimension into a live authorization model is
one of the most expensive changes available.

*Recommended default:* model campus as a first-class scope from day one, defaulting to a single
implicit campus for tenants that have one. The schema cost is one column and one filter. The
retrofit cost is every query and every policy.

**OD-3. Is there a web console?**
Admissions processing, fee counters, exam cell work, procurement and payroll are desktop work
with large tables, bulk operations and keyboard-driven entry. Doing them on a phone is not
viable. The existing documentation commits to mobile only.

*Recommended default:* a responsive web console for back-office roles, and the Flutter mobile
app for students, faculty, parents and approvals on the move. Shared API, shared design tokens.
This contradicts an earlier requirement and needs your explicit call.

**OD-4. Does the ERP collect money, or only record it?**
Online collection means a payment gateway, settlement reconciliation, refunds, chargebacks,
idempotent webhooks and a far heavier compliance surface. Recording means the ERP tracks
invoices and receipts for money collected at a counter or by bank transfer.

*Recommended default:* record first, collect second. Build the fee ledger, invoicing and receipt
model so that online collection is an added payment channel rather than a different design.

**OD-5. Legacy data and existing systems.**
Is there an existing ERP, a spreadsheet estate, a Tally or similar accounting system, biometric
attendance devices, smart cards, or a university portal to integrate with?

Migration and integration usually cost more than the module they feed.

*Recommended default:* assume a spreadsheet estate and build a first-class import pipeline with
validation, dry-run and rollback. Treat device and accounting integrations as Phase 3 adapters.

**OD-6. Who are the paying customer and the daily operator?**
Is the buyer the management or the principal, and is the daily operator the office staff? This
decides which dashboard is the product's front door and where polish matters most.

*Recommended default:* management buys on reporting and visibility, office staff decide renewal
through daily friction. Optimize the office workflows hardest.

**OD-7. Attendance granularity and authority.**
Period-wise, day-wise, or both? Does the university mandate a percentage rule such as 75 percent
that the ERP must compute and defend in an audit?

*Recommended default:* period-wise capture with day-wise rollup, since period-wise can always
produce day-wise and the reverse is impossible. Make the shortfall rule configurable per program.

**OD-8. Are approval chains configurable?**
Fixed chains are far simpler. Real colleges differ on who approves leave, a fee concession, a
mark correction or a purchase.

*Recommended default:* a small configurable approval engine from Phase 2, with sensible
defaults per workflow. Hard-coded chains would be rewritten within a year.

## 0.3 Conflicts with the existing documentation

This brief supersedes parts of the earlier docs. Nothing has been changed there yet, pending
your answers.

| Earlier position | This brief implies | Status |
|---|---|---|
| Four roles: Super Admin, College Admin, Teacher, Student | Roughly thirty distinct actors, and "Admin" is not one role | Superseded, see [Actors](01-actors.md) |
| Mobile only in release one | Back-office work needs a desktop-class console | Open, OD-3 |
| Offline-first as a system-wide property | Offline-first for field roles on mobile, online-first for back office | Refined, see AD-9 |
| Release one is Core, Academics and Communication | Broadly holds, and is now stated as Phase 1 of five | Consistent |
