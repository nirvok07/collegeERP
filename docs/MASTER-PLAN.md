# MASTER PLAN — College ERP

Written 2026-09-28. Owner-directed re-audit and forward execution plan.

**This document does not restate settled architecture.** The blueprint in `docs/blueprint/`
and the 83 ADRs in `docs/blueprint/adr.md` remain the source of truth for anything already
decided. This plan adds only four things the repository did not have:

1. an honest audit of the current direction, verified against code rather than notes;
2. a coverage map of a complete college ERP against what this repository actually contains;
3. the engineering response to the parity mandate (AD-81), which is the largest unpriced cost in the project;
4. a granular, tickable execution plan for everything still unbuilt.

## 0. Anti-duplication contract

`CLAUDE.md` §2 forbids competing project-memory systems. This file obeys that by pointing,
not copying.

| If you need | Read |
|---|---|
| Domain definitions, entities, workflows, edge cases | `docs/blueprint/02-domains.md` (D1–D9) |
| Actors and their authority | `docs/blueprint/01-actors.md` |
| Module boundaries and what was rejected | `docs/blueprint/03-modules.md` |
| Any architectural decision | `docs/blueprint/adr.md` (AD-1…AD-83) |
| Design system, component inventory, motion | `docs/07-design-system.md` |
| Container/ratio language layered on top | `docs/new-design/` |
| Current build state, slice history | `PROJECT_STATE.md` |
| Delivery-stream to blueprint mapping | `MODULE_REGISTRY.md` |
| Drift and open decisions | `docs/MASTER-CHECKLIST.md` |

When this plan and one of those files disagree, **that file wins** unless this plan records a
new ADR in §3, in which case the ADR is appended to `adr.md` and this plan's copy is a pointer.

---

## 1. Project audit

Verified 2026-09-28 against the working tree, not against previous notes.

**Measured scale.** Server 21,770 lines across 100 TypeScript files with 189 test files.
Web 14,355 lines across 88 files. Flutter 33,732 lines across 189 files with 51 test files.
38 migrations, 4,412 lines of SQL. 43 permission keys. This is a real system, not a prototype.

### 1.1 Strong — keep, do not redesign

- **The domain model is genuinely good.** Nine domains, not twenty-five modules (AD-5).
  `02-domains.md` already covers admissions, HR, payroll, leave, library, hostel, transport,
  inventory, purchase, assets, notices, events, grievance, discipline, placement and alumni —
  each with entities, approvals, reports, notifications, automation and edge cases. The
  "complete ERP discovery" exercise was already done, and done well. It does not need redoing.
- **Authority as role × scope × validity (AD-1)**, not a role column. Delegation cannot be
  chained or outlive its source (AD-17). Deny by default, and no-access is a designed state
  (AD-18). This is the part most college ERPs get wrong, and here it is right.
- **No derived academic value is stored (AD-7)**, with one deliberate exception for a published
  result (AD-23). Attendance percentages and aggregates are computed, never cached into a column
  that silently goes stale. This single decision prevents the most common class of ERP data bug.
- **Correction is a workflow, never a database edit (AD-13).** Correction tables are INSERT and
  SELECT only. Submitted registers are corrected by the head of department, not the teacher (AD-53).
- **Tenant isolation is enforced, not assumed.** Row-level security with FORCE, least-privilege
  `erp_app`, DELETE granted only on declared tables, cross-tenant reads only through narrow
  SECURITY DEFINER functions. A `migration-invariants` test asserts the grant surface, which is
  how the missing `fee_online_intents` declaration was caught.
- **Optimistic concurrency by `version` (AD-52) layered with idempotency keys (AD-58)**, and a
  durable offline outbox (AD-59) that was verified on a real Android device on 2026-09-13.
- **The motion system is better than most production web apps.** `docs/07-design-system.md` §7.7
  defines duration bands by interaction complexity, shorter exits than entrances, a motion
  hierarchy where feedback outranks transitions, stagger capped at eight rows and dropped above
  twenty-four, and **a test that parses the stylesheet and fails on any property that can trigger
  layout**. The reasoned rejection of GSAP is correct for this product.
- **Calendar dates are calendar strings end to end (AD-49)**, and rosters resolve as of the class
  date (AD-50). The fee collection report bug near local midnight was caught precisely because
  this discipline exists elsewhere.

### 1.2 Weak

- **`PROJECT_STATE.md` has become a 107KB changelog.** `CLAUDE.md` §4 asks for a compact TRACER
  that answers eight questions at a glance. Single status bullets now run to twenty lines of
  prose with embedded commit hashes. It can no longer be read at the start of a session, which
  defeats its entire purpose and costs context on every task.
- **Validation debt: 42 `🔍 NEEDS VALIDATION` markers.** Almost everything built since 2026-09-13
  is coded and unit-tested but never seen on a device or in a live browser. `PROJECT_STATE.md`
  itself records the discovery on 2026-09-24 that the dev machine had no browser at all, so
  *every prior web CSS and chart change had been unverified.* Unit tests are being treated as a
  proxy for "works", which `CLAUDE.md` §10 explicitly forbids.
- **Schema drift is live and unfixed.** `036_syllabus.sql` is recorded as applied, but the
  `syllabus` table has no RLS or GRANTs on the dev database. 11 tests in `syllabus.test.ts` and
  2 migration-invariants checks fail. `npm run migrate` reports "up to date", so the migration
  ledger and the database disagree. Ten `zz-*` debug test files sit in the suite (of 46
  server test files), two of them — `zz-err6`, `zz-syldebug` — as known failures. **A red suite that is known-red stops being a signal.**
- **Delivery has become reactive.** Recent slices are named FB-1…FB-5, feedbackchanges #1–#4,
  owner requests. Valuable, but the blueprint's own phase order in `MASTER-CHECKLIST.md` has not
  driven a slice in some time.

### 1.3 Incomplete

Four of nine domains are essentially unbuilt, and they are not small:

| Domain | State | Evidence |
|---|---|---|
| D3 Admissions and Student Lifecycle | ❌ | `MODULE_REGISTRY.md`: M5 is "minimum only: student, membership, enrolment". No enquiry, application, merit, offer, admission, transfer, or exit. |
| D7 People and HR | ⚠️ fragment | Staff attendance (AD-83) partly built; no Employee entity, no service record, no workload, no leave (LV-1 unbuilt, OD-LV-1 open), no payroll, no appraisal, no exit clearance. |
| D8 Campus Services | ❌ | No library, hostel, transport, inventory, purchase or asset code at all. |
| D9 Engagement, Cases and Outcomes | ❌ | No notices module — `PROJECT_STATE.md` records "circulars (no module)" as a student-facing gap. No events, grievance, discipline, helpdesk, placement or alumni. |

Also incomplete inside built areas: approvals capability (P1) "❌ not specified", attendance and
assessment approval workflows, SA-5 impersonation, backend push delivery, examinations and
results (M10).

### 1.4 Over-engineered

Very little, which is unusual and worth saying. Two candidates:

- **The documentation surface itself.** `docs/` holds `MASTER-CHECKLIST.md`,
  `IMPLEMENTATION-CHECKPOINT.md`, `MODULE-CONTROLLER.md`, `NEW-SESSION-CONTEXT.md`,
  `INTERRUPT-RECOVERY.md`, `plan-inbox-*.md`, `plan-fee-a-to-z-*.md`, plus `docs/blueprint/`,
  `docs/new-design/`, `docs/runbook/`, plus three root trackers. Several are session-recovery
  scaffolding that outlived its session. This is the one place the project *has* duplicated its
  memory, and it should be consolidated (§15, P0-8).
- **`docs/blueprint/m1-identity-and-access.md` is 71KB** for a module whose built surface is
  considerably smaller. Not wrong, but it is the least-read-per-byte file in the repository.

### 1.5 Under-engineered

- **Notifications.** FCM registers and revokes tokens, but **backend push delivery is blocked
  because tokens are stored hash-only** (Drift 6). Every domain in the blueprint lists
  notifications as a first-class output — leave approved, fee overdue, book due, drive announced,
  case escalated. There is currently no server-side delivery capability to build them on. This is
  a capability gap, not a feature gap, and it blocks work in four unbuilt domains.
- **No background job runner.** Automation described across every domain — accrue fines by rule,
  credit leave on a schedule, escalate a case on deadline breach, reorder alerts, overdue
  reminders, invoice generation — all require scheduled work. Nothing in `server/src` provides it.
- **No document/file storage capability.** D3 needs application documents, D7 needs qualifications
  and payslips, D8 needs asset records, D9 needs case evidence. `syllabus` upload exists as a
  one-off; there is no general capability.
- **Reporting is per-module and hand-written.** The four fee reports are good, but each new report
  is bespoke SQL plus a bespoke screen on two clients. Across D3/D7/D8/D9 that does not scale.
- **The permission catalogue stops at the built modules.** 43 keys covering M1–M9. Nothing exists
  for admissions, HR, payroll, leave, library, hostel, transport, inventory, notices, grievance
  or placement.

### 1.6 Remove

- `flutter_01.log`, `prompt1.md`, `prompt2.md`, `DESIGN_TOKENS_ADDITIONS.dart` (a root-level
  loose Dart file that is not part of `lib/`), `android/build/` and `clients/web/explore.mjs`
  (both untracked build/scratch artefacts).
- The ten `zz-*` debug test files — nearly a quarter of the 46 server test files. Promote the ones
  that assert production behaviour, delete the rest. A permanently red test is worse than no test,
  and debug scaffolding left in a suite is noise that hides signal.
- After consolidation: `NEW-SESSION-CONTEXT.md`, `INTERRUPT-RECOVERY.md`, `MODULE-CONTROLLER.md`,
  and the dated `plan-*.md` files once their content is folded into the register.

### 1.7 Redesign

- **`PROJECT_STATE.md` → compact TRACER + `docs/IMPLEMENTATION-CHECKPOINT.md` for history.**
  The history is worth keeping; it just does not belong in the file read at session start.
- **Notifications from a token store into a delivery capability** (§10).
- **Reporting from bespoke screens into a report contract** (§11).

---

## 2. Problems in the current direction

Stated plainly, worst first.

**P-0 — AD-83's geo-fence is specified, stored, configurable, and never enforced.**

Found during this audit, and the most concrete defect in it. Migration `029_campus_fence.sql`
adds `fence_latitude`, `fence_longitude` and `fence_radius_m` to `campuses`, with a CHECK that
all three are present or none, and a header stating plainly: *"Staff punch in and out only
[within the fence]. A campus without a fence cannot be punched at."* The institution module reads
and writes those columns, so an administrator can configure a fence and see it.

But `server/src/modules/attendance/application/self-attendance.ts` `punchIn()` **takes no
coordinates and performs no fence check.** Its repository port signature is
`{ id, tenantId, personId, workDate, at }` — there is nowhere for a location to go. Both clients
post an empty body: `api.post('/v1/me/staff-attendance/punch-in', {})` on web, and the mobile
path is the same shape. No code anywhere reads `fence_latitude` for the purpose of validating a
punch.

**Consequence: any staff member can punch in from anywhere, on either client.** The control is
inert. It is currently harmless only because staff attendance is not yet wired to anything; the
moment D7 payroll consumes it (P4), it becomes attendance fraud with a money consequence.

This is also a governance signal worth naming: an ADR was approved, its schema was migrated, its
admin UI was built, and the one line that made it a control was never written — and nothing in
the test suite noticed. §16's "every endpoint tested for unauthorised access" would not have
caught it either, because the caller *is* authorised. The check that was missing is a
*business* invariant, and those need tests that assert the negative case.

**P-1 — The two clients drifted apart while nobody was measuring the gap.**
AD-24 said the back office is a web console and Flutter serves students and faculty. AD-81
superseded it with *every module on the phone*. What actually happened is neither: new modules
landed on **mobile only**. Fees is 2,766 lines and 17 files on Flutter and **zero on web**.
Calendar and staff attendance are likewise phone-only. `OD-FEE-5` — "does the web console get fee
screens?" — has stood open since 2026-09-22 while the fee module went on to grow online payments,
PDF receipts and four reports, all phone-only.

The concrete consequence: **a Cashier at a fee counter must run collection from a phone.** So must
an Accountant reconciling a day's takings, and so must anyone reading the defaulters report. That
is the wrong tool for that job, and it is not what AD-81 intended.

*The owner has reaffirmed full parity on both surfaces.* That is the right call for access, but
parity is currently an aspiration with no mechanism and no cost control. §8 makes it real.

**P-2 — "Built" and "verified" have been allowed to mean the same thing.**
42 unvalidated items, a browser that did not exist on the dev machine until four days ago, a dev
database with 0 persons and 0 institutions so no signed-in screenshot is even possible, and a
known-red test suite. `CLAUDE.md` §10 asks implementation and verification to be reported
separately; the tracker does that honestly, but the *backlog* it honestly reports has been growing
for two weeks without being burned down.

**P-3 — The schema ledger and the database disagree.**
Migration 036 is marked applied but its RLS and GRANTs are absent. For a system whose entire
tenant-isolation guarantee rests on RLS being present, "a migration says it ran but its security
clauses are missing" is the most serious class of defect this architecture can have. It is
currently carried as a known-red test rather than as an incident.

**P-4 — Four domains are unbuilt and three shared capabilities they all need are missing.**
D3, D7, D8 and D9 each depend on notifications, scheduled jobs and document storage. Building any
of those domains first would mean building its own private version of all three. The capabilities
must come first or they will be built four times.

**P-5 — OD-1 has blocked Examinations and Results for over two weeks.**
Whether the institution is affiliating or autonomous decides whether the ERP owns examinations or
mirrors them. It is a question for the customer, not for engineering, and no amount of building
resolves it. Its recommended default — *support both: mirror external results read-only, build the
autonomous engine behind a capability flag* — has been sitting in `MASTER-CHECKLIST.md` unadopted.

**P-6 — The tracker costs more context than it saves.** See §1.2.

---

## 3. Decisions taken in this plan

To be appended to `docs/blueprint/adr.md` as proper ADRs. Recorded here so this plan is readable
standalone; `adr.md` remains authoritative once they land.

| ID | Decision | Rationale |
|---|---|---|
| **AD-84** | **Parity is a definition of done, not an aspiration.** A module slice is not complete until it exists on server, web and Flutter, or until an explicit parity exception is recorded with a reason. | Owner reaffirmed AD-81. Without a mechanism, parity silently becomes phone-only, as fees proved. |
| **AD-85** | **The API contract is generated, not hand-written twice.** The server publishes an OpenAPI description from its existing zod schemas; web TypeScript types and Flutter Dart models are generated from it. | Parity doubles client cost. Generation is the only lever that makes it affordable across D3/D7/D8/D9. |
| **AD-86** | **OD-FEE-5 resolves to yes.** Fees reach the web console. | Follows from AD-84. Closes the largest parity gap. |
| **AD-87** | **Notification delivery is a platform capability**, owned centrally: device tokens stored recoverably (sealed per AD-63, not hash-only), one outbound queue, per-domain templates, delivery receipts. | Unblocks Drift 6 and prevents four domains each building their own. |
| **AD-88** | **Scheduled work is a platform capability**, a single job runner with tenant-scoped, idempotent, auditable jobs. | Every unbuilt domain's automation depends on it. |
| **AD-89** | **Document storage is a platform capability**, tenant-scoped, permissioned, virus-scanned at ingest, with retention. | D3, D7, D8, D9 all need it; `syllabus` upload is the one-off to generalise. |
| **AD-90** | **Reports are a declared contract**, not bespoke screens: a report descriptor (columns, filters, permission, export) rendered by one generic surface per client. | Makes reporting across four new domains a data task, not a UI task, on two clients. |
| **AD-91** | **Adopt OD-1's recommended default.** Support both: mirror external results read-only (AD-8), build the autonomous engine behind a capability flag (AD-23). | Unblocks M10 without pre-empting the customer, who can still choose. Two weeks blocked is enough. |
| **AD-92** | **A known-failing test is a blocker, not a note.** The suite returns to green and stays green. | A red suite is not a signal. |

**AD-91 needs owner confirmation before M10 work starts.** The other eight are engineering
decisions within the existing architecture and are recommended for adoption as written.

---

## 4. Coverage map — a complete college ERP against this repository

Every area from a full ERP scope, mapped to this repository's own domain model. **"Blueprint"**
means `02-domains.md` already specifies it. **"Built"** means code exists and is tested.

| Area | Domain | Blueprint | Server | Web | Flutter | Verdict |
|---|---|---|---|---|---|---|
| Identity, accounts, authority, sessions, devices | D1 | ✅ | ✅ | ✅ | ✅ | **Built** |
| Institution, campus, department, org units | D1/D2 | ✅ | ✅ | ✅ | ✅ | **Built** |
| Academic year, term, calendar, holidays, events | D2 | ✅ | ✅ | ⚠️ read | ✅ | **Parity gap** — web reads holidays, cannot manage |
| Programs, courses, curriculum versions, syllabus | D2 | ✅ | ✅ | ✅ | ✅ | **Built** (syllabus RLS drifted) |
| Sections, offerings, instructor assignment | D4 | ✅ | ✅ | ✅ | ✅ | **Built** |
| Rooms, timetable, class sessions | D4 | ✅ | ✅ | ✅ | ✅ | **Built** |
| Attendance (student), corrections | D4 | ✅ | ✅ | ✅ | ✅ | **Built**; approval workflow ❌ |
| Internal assessment, marks, verify, correct | D5 | ✅ | ✅ | ✅ | ✅ | **Built**; approval workflow ❌ |
| Examinations, results, transcripts, degrees | D5 | ✅ | ❌ | ❌ | ❌ | **Blocked** OD-1 → AD-91 |
| Student records (roster minimum) | D3 | ✅ | ⚠️ | ⚠️ | ⚠️ | **Minimum only** |
| Admissions: enquiry, application, merit, offer, admit | D3 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Student lifecycle: transfer, break, re-admit, exit | D3 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Scholarships and concessions | D3/D6 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Fees: structures, invoices, payments, fines, waivers | D6 | ✅ | ✅ | ❌ | ✅ | **Parity gap** (AD-86) |
| Online payment | D6 | ✅ | ⚠️ dummy | ❌ | ⚠️ | **Dummy gateway**; OD-4 |
| Receipts, statements, fee reports | D6 | ✅ | ✅ | ❌ | ✅ | **Parity gap** |
| Institutional accounts, budget, vouchers | D6 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Employee record, service history, qualifications | D7 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Recruitment and appointment | D7 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Workload allocation | D7 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Leave: types, balances, requests, approval | D7 | ✅ | ❌ | ❌ | ❌ | **Not built**; LV-1, OD-LV-1 |
| Staff attendance (punch) | D7 | ✅ AD-83 | ⚠️ | ⚠️ | ⚠️ | **Partial, orphaned, fence unenforced** (§2 P-0) |
| Payroll: salary structure, runs, payslips, statutory | D7 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Appraisal, promotion, exit clearance | D7 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Library: catalogue, circulation, fines | D8 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Hostel: rooms, allocation, mess, gate pass | D8 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Transport: routes, stops, vehicles, passes | D8 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Inventory, indents, purchase, GRN, vendors | D8 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Assets and depreciation | D8 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Notices and circulars | D9 | ✅ | ❌ | ❌ | ❌ | **Not built** — student-facing gap |
| Events and participation | D9 | ✅ | ⚠️ calendar | ❌ | ⚠️ | **Calendar events only** |
| Grievances, discipline, helpdesk (case primitive) | D9 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Placement: recruiters, drives, offers | D9 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Alumni | D9 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Parent/guardian access | D3/D9 | ⚠️ actor only | ❌ | ❌ | ❌ | **Not built** |
| Documents and certificates (bonafide, TC, transcript) | D3/D5 | ✅ | ❌ | ❌ | ❌ | **Not built** |
| Platform administration (multi-tenant) | Platform | ✅ | ✅ | ✅ | ✅ | **Built**; SA-5 ❌ |
| Audit log | Platform | ✅ | ✅ | ✅ | ✅ | **Built** |
| Roles and permissions | D1 | ✅ | ✅ | ✅ | ✅ | **Built** |
| Offline outbox | Capability | ✅ | ✅ | n/a | ✅ | **Built, device-verified** |
| Approvals capability | Capability | ⚠️ | ❌ | ❌ | ❌ | **Not specified** — P1 |
| Notification delivery | Capability | ⚠️ | ⚠️ tokens | ❌ | ⚠️ | **Blocked** Drift 6 → AD-87 |
| Scheduled jobs | Capability | ❌ | ❌ | n/a | n/a | **Missing** → AD-88 |
| Document storage | Capability | ⚠️ | ⚠️ syllabus | ⚠️ | ⚠️ | **One-off only** → AD-89 |
| Reporting contract | Capability | ❌ | ❌ | ❌ | ❌ | **Missing** → AD-90 |
| Dashboards and MIS | Cross | ✅ | ⚠️ | ✅ | ✅ | **Per-role dashboards built** |
| Integrations | Cross | ✅ | ❌ | ❌ | ❌ | **Blocked** OD-1/4/5 |

**Additions this audit found that the blueprint under-serves** — each needs a blueprint amendment
before it is built:

- **Parent/guardian as an authenticated actor.** Listed as an actor in D3/D9 but with no account
  model, no scoping rule ("a parent sees exactly their ward, and only while the ward is enrolled"),
  and no consent model. This is a real product requirement for a college ERP in India and it
  touches D1's authority model directly.
- **Certificate issuance as a controlled, serially-numbered, revocable artefact** — bonafide,
  transfer certificate, character certificate, migration certificate. D3 mentions exit; it does not
  model the certificate register that an institution is audited on.
- **Accreditation and statutory returns as a first-class output** (NAAC/NBA/AICTE/AISHE). Several
  domains list "accreditation staffing returns" or "anti-ragging statutory returns" as reports, but
  nothing owns the aggregate return, its evidence trail, or its submission history.
- **Biometric device integration for staff attendance.** AD-83 chose geo-fenced phone punch; most
  institutions already own biometric hardware. Listed in the integration inventory but not modelled.
- **Data retention and the right to erasure.** OD-M1-4 is open. With student data, parent data and
  payroll data, retention is a compliance obligation, not a nice-to-have.

---

## 5. Architecture — confirmed, and the deltas

**Confirmed unchanged.** The stack is locked and correct for this product: Node 24 + Fastify 5 +
`pg` without an ORM + zod on the server; React 19 + Vite + TypeScript on web; Flutter + Cubit +
Dio + get_it + Drift on mobile; shared PostgreSQL with row-level tenant isolation and partitioning
on the two high-volume tables (AD-22). Firebase for FCM, Remote Config and Crashlytics only
(AD-30). No Flutter Web (AD-54). Nothing in this audit argues for changing any of it.

Deliberately *not* recommended: an ORM (the raw-SQL + RLS discipline is the tenant-isolation
guarantee and an ORM would erode it), a microservice split (one deployable is correct at this
scale), GraphQL (the REST surface is well-shaped and AD-85 generates clients from it), or GSAP
(§7.7's rejection still holds).

**Five capability deltas**, all additive, none disturbing an approved boundary:

### 5.1 Contract generation (AD-85)
The server already validates with zod. Emit an OpenAPI 3.1 description from those schemas at
build time, commit it as `server/openapi.json`, and generate web TS types and Flutter Dart models
from it. A CI check fails when the committed description and the code disagree. This is the single
highest-leverage change in the plan: it is what makes the parity mandate affordable.

### 5.2 Notification delivery (AD-87)
`notification_templates` (per domain event, per channel, tenant-overridable),
`notification_queue` (tenant-scoped, idempotent, retry with backoff, dead-letter),
`notification_receipts` (sent, delivered, read). Device tokens move from hash-only to sealed at
rest under AES-256-GCM per AD-63 — this is the exact change that unblocks Drift 6. Channels: push
(FCM), in-app, email and SMS behind provider interfaces. Domain events (AD-10) are the trigger, so
no module calls the notifier directly.

### 5.3 Scheduled jobs (AD-88)
One runner, one `scheduled_jobs` table, jobs declared per module with a tenant scope, an
idempotency key and an audit row. Leader election by PostgreSQL advisory lock so a second server
instance never double-runs. First jobs: fee overdue reminders, invoice generation, leave accrual,
library fine accrual, notification queue drain, session materialisation.

### 5.4 Document storage (AD-89)
`documents` (tenant, owner entity, kind, content hash, size, uploader, retention class),
object storage behind an interface, signed time-boxed URLs, permission checked on every read,
virus scan at ingest. `syllabus` upload is the pilot to generalise.

### 5.5 Report contract (AD-90)
A report is a declared descriptor — id, permission key, parameters, columns with types and
formats, default sort, export formats. The server resolves a descriptor to rows; **one** generic
report surface per client renders any descriptor, with filters, keyset paging, column visibility,
saved views and CSV/PDF export. New reports become data, not screens. The four existing fee
reports are the migration pilot.

---

## 6. Parity contract (AD-84)

Parity is now a mandate. Left unmanaged it doubles the client cost of D3, D7, D8 and D9 —
realistically 30,000+ lines of duplicated UI. Four mechanisms keep it affordable:

1. **Generated contracts (AD-85).** Models, endpoints and error shapes are never written twice.
2. **One report surface per client (AD-90).** Most of D7/D8/D9's screens are lists with filters
   and a detail pane. A generic surface absorbs them.
3. **Definition of done includes both clients.** A slice that ships server + one client is
   `⚠️ PARTIAL`, never `✅ DONE`. `MODULE_REGISTRY.md` already has Server/Web/Flutter columns —
   they become gates rather than observations.
4. **Recorded parity exceptions.** Some screens genuinely should not exist on both. Geo-fenced
   punch in/out is phone-only by physics. Bulk import of 4,000 admission rows is web-only by
   ergonomics. An exception is legitimate **when recorded with a reason** in
   `MODULE_REGISTRY.md`; it is drift when it is silent. That distinction is what failed with fees.

**Standing parity debt, to clear in P0/P1:**

| Gap | Surface missing | Slice |
|---|---|---|
| Fees — structures, invoices, collection, requests, reports | Web | PAR-1 |
| Academic calendar — holidays and events | Web | PAR-2 |
| Staff attendance — reports and correction approvals (not punch) | Web | PAR-3 |
| Student marks self-view | Both, blocked by OD-1 → AD-91 | M10 |

---

## 7. Role and permission map

**Existing: 43 permission keys** on a `key / module / label / sensitivity / requires_mfa /
delegable` model, composed into role definitions per tenant. Sensitivity tiers are `normal`,
`sensitive`, `critical`; `critical` keys such as `role.assign`, `role.define` and `person.export`
require MFA and are non-delegable. **The model is right; it simply stops where the build stopped.**

Roles resolve as role × scope × validity (AD-1), scope being institution → campus → department →
section/committee. A role grants permission; an instructor assignment constrains reach (AD-40).
Platform authority is separate — Owner or Support (AD-64) — and never a college role (`CLAUDE.md` §21).

**Permission keys to add per unbuilt domain.** Naming follows the existing `noun.verb` convention;
sensitivity follows the existing tiers.

```
D3  admission.read  admission.manage  application.review  merit.publish
    offer.issue     admission.confirm student.lifecycle   scholarship.manage
    document.issue  certificate.issue[critical, mfa]
D7  employee.read   employee.manage[sensitive]  appointment.approve[critical]
    workload.manage leave.apply     leave.approve   leave.configure
    staffattendance.read  staffattendance.correct  staffattendance.approve
    payroll.read[sensitive]  payroll.run[critical, mfa]  payslip.read.self
    appraisal.manage  exit.clear
D8  library.read  library.circulate  library.manage  fine.waive
    hostel.read   hostel.allocate    hostel.manage
    transport.read  transport.manage  pass.issue
    inventory.read  indent.raise  indent.approve  purchase.order[sensitive]
    asset.manage  asset.writeoff[critical]
D9  notice.read  notice.publish  notice.approve
    event.manage  event.register
    case.raise  case.triage  case.investigate  case.resolve  case.appeal
    placement.read  drive.manage  offer.record  alumni.manage
Cap approval.act  report.read  report.export[sensitive]  document.read  document.upload
```

**Two role-model gaps this audit found:**

- **Parent/guardian** has no account model. It needs a scope type of its own — authority over
  *exactly one ward*, valid only while that ward is enrolled — which is a genuine extension of
  AD-1's scope dimension and should be an ADR, not an ad-hoc role.
- **Self-service permissions** (`payslip.read.self`, `leave.apply`, `case.raise`) are a different
  shape from the rest: they are not scoped grants but statements that a person may act on their
  own record. The `/v1/me/*` endpoints already do this implicitly. It should be made explicit
  before D7 multiplies it, or every domain will re-invent it.

---

## 8. Entity architecture — the delta

38 migrations, 4,412 lines of SQL. The existing conventions hold and every new table follows them:
tenant column with RLS FORCE, least-privilege GRANTs declared in the migration and asserted by
`migration-invariants.test.ts`, invariants in triggers with `v_`-prefixed PL/pgSQL variables,
`version` for optimistic concurrency, DATE columns read as calendar dates, archived-not-deleted,
corrections as INSERT-only tables.

New entity groups, by domain. Names follow `02-domains.md`, which already chose them.

**Capabilities first** — `notification_templates`, `notification_queue`, `notification_receipts`,
`device_tokens` (altered to sealed), `scheduled_jobs`, `job_runs`, `documents`,
`document_retention_classes`, `report_descriptors`, `saved_views`, `approval_requests`,
`approval_steps`, `approval_decisions`.

**D3** — `Enquiry`, `Application`, `ApplicationDocument`, `MeritList`, `Offer`, `Admission`,
`StudentLifecycleEvent` (transfer, break, re-admit, exit), `Scholarship`, `ScholarshipAward`,
`CertificateRegister` (serial, issued, revoked).

**D7** — `Employee`, `EmploymentPeriod`, `Designation`, `Qualification`, `ServiceRecord`,
`WorkloadAllocation`, `LeaveType`, `LeaveBalance`, `LeaveRequest`, `SalaryStructure`,
`PayrollRun`, `Payslip`, `AppraisalCycle`, `ExitClearance`. Existing staff-attendance tables
(migration 038) attach to `Employee` rather than standing alone.

**D8** — `LibraryItem`, `Holding`, `Circulation`, `Fine`; `Hostel`, `Room`, `Bed`,
`HostelAllocation`, `MessRegister`, `GatePass`; `Route`, `Stop`, `Vehicle`, `TransportAllocation`;
`Item`, `Stock`, `Indent`, `PurchaseOrder`, `GoodsReceipt`, `Asset`, `Depreciation`.

**D9** — `Notice`, `NoticeAudience`, `NoticeReceipt`; `Event`, `Registration`, `Participation`;
`Case`, `CaseEvent`, `CaseResolution`, `Appeal`; `Recruiter`, `Drive`, `Application`, `Offer`,
`AlumniEngagement`.

**Three invariants to enforce in the database, not in application code:**

- **All money flows to one ledger (AD-6).** Library fines, hostel charges, transport passes and
  scholarship credits are charges on the student ledger owned by D6 — never money tracked inside
  D8. `02-domains.md` already states this; the schema must make it impossible to violate.
- **`Application` and `Offer` collide between D3 (admissions) and D9 (placement).** They are
  different entities with the same word. Name them `admission_application` / `admission_offer` and
  `placement_application` / `placement_offer` at the schema level. Getting this wrong is the single
  most likely source of confusion across these two domains.
- **Exit clearance spans domains.** A student cannot be cleared while a library item is out, a
  hostel room is occupied or a fee is due. That is a cross-domain check, and per AD-28 it goes
  through a declared capability, not a shared read.

---

## 9. UI/UX and motion — state and gaps

**The design system does not need redesigning.** `docs/07-design-system.md` covers principles,
colour, typography, spacing/radius/elevation, a component inventory, a screen state contract
(loading/empty/error/success), motion, responsiveness and accessibility. `docs/new-design/` layers
a container and ratio language on top, rolled out through ND-S1…ND-S7 on both clients.

The motion system is, as noted in §1.1, unusually good: duration bands by interaction complexity,
exits shorter than entrances, feedback outranking transitions in the hierarchy, stagger capped and
then dropped, and a stylesheet-parsing test that **fails the build on any property that can
trigger layout**. That test is the reason this system will stay fast as it grows.

**The real gaps are enforcement and parity, not design:**

| Gap | Detail |
|---|---|
| **Motion parity on Flutter** | AD-31 says Flutter implements the same principles natively. There is no Dart equivalent of the duration/easing token set and no equivalent of the layout-property test. `lib/core/design/tokens.dart` should carry the same bands and curves, with a widget-test guard. |
| **Dark theme** | AD-67 locked light-only "for now". Enterprise users working long administrative days ask for dark. Tokens are already semantic, so the cost is bounded — schedule it, do not let it accumulate as per-screen hacks. |
| **No generic data-table surface on either client** | Every list is hand-built. With AD-90's report contract, one table component per client with filters, keyset paging, column visibility, saved views, bulk selection and export absorbs most of D7/D8/D9. |
| **Bulk operations** | Admissions, payroll and library circulation are inherently bulk. No bulk-select or bulk-action pattern exists yet. |
| **Import/export** | Admissions import, payroll import, library catalogue import. Needs one validated, previewable, partially-failable import pattern, not one per module. |
| **Accessibility unverified** | §7.8 specifies it; nothing tests it. Add axe to the web test run. |
| **Visual verification** | Playwright + Chromium landed 2026-09-24 as an ad-hoc tool. Make it a standing visual check, which requires a seeded dev database (currently 0 persons, 0 institutions). |

**Animation policy — where motion belongs and where it does not.** Already implied by §7.7;
stated explicitly here because the prompt asked:

*Use motion for:* route and section changes (one wrapper element, not per row), drawers and bottom
sheets entering from the edge they return to, dialogs and popovers, expand/collapse, a one-pass
highlight on a row whose value just changed, press feedback, skeleton→content cross-fade, capped
list entry on first paint, and dashboard figures counting up once on load.

*Do not animate:* table rows on hover beyond a background colour, anything during typing or
filtering (results must feel instant), validation errors (they must read immediately), repeated
re-renders of the same list, anything in a bulk operation over 24 rows, or anything at all when
`prefers-reduced-motion` is set beyond a 1ms collapse and a fade in place of travel.

---

## 10. Notifications and automation

Currently: FCM registers and revokes tokens on Android; **backend delivery is blocked because
tokens are hash-only** (Drift 6). AD-87 fixes the storage, AD-88 adds the runner, and domain
events (AD-10) are the trigger so no module calls the notifier directly.

Per-domain notification inventory is already written in `02-domains.md` under each domain's
*Notifications* and *Automation* headings — that is the build list, and it does not need restating
here. The delivery matrix by channel:

| Urgency | Push | In-app | Email | SMS |
|---|---|---|---|---|
| Action required now (approval waiting, hearing scheduled) | ✅ | ✅ | ✅ | — |
| Time-bound (fee due, book overdue, pass expiring) | ✅ | ✅ | ✅ | escalation only |
| Informational (notice published, payslip available) | ✅ | ✅ | digest | — |
| Security (sign-in code, role granted, impersonation) | — | ✅ | ✅ | ✅ |

Quiet hours, per-person channel preferences and a digest option are required before D8 and D9
land, or overdue reminders alone will make the app unusable.

---

## 11. Reporting and analytics

Today: four hand-written fee reports plus per-role dashboards. Good work, wrong shape for scale
(§5.5, AD-90).

Three tiers:

1. **Operational reports** — a declared descriptor, rendered by the generic surface, exported to
   CSV/PDF. The bulk of D3/D7/D8/D9 reporting. Every domain's *Reports* heading in
   `02-domains.md` is the backlog.
2. **Dashboards and MIS** — per-role, already built for admin/teacher/student, extended per domain.
   Figures are computed, never stored (AD-7).
3. **Statutory and accreditation returns** — NAAC, NBA, AICTE, AISHE. These need an evidence trail
   and a submission history, and per §4 nothing currently owns them. This is a real gap and it
   deserves its own module, not a report.

Analytics performance: reports run against the same PostgreSQL under RLS. Above the OD-9 scale
targets, move heavy aggregates to a read replica before reaching for a warehouse.

---

## 12. Integration strategy

The inventory in `MASTER-CHECKLIST.md` §15.1 stands. Status:

| Integration | Blocked by | Note |
|---|---|---|
| University result portal | OD-1 → AD-91 | Read-only mirror per AD-8; one adapter per university format |
| Payment gateway (Razorpay) | OD-4, credentials | Dummy gateway in place; the swap touches only the checkout page and two provider routes, which was the right way to build it |
| Accounting export (Tally) | OD-5 | Export before API |
| Biometric attendance devices | — | Not modelled; §4 addition |
| SMS gateway | — | Needed by AD-87's security channel |
| Email | — | Needed by AD-87 |
| Government portals (AISHE, scholarship) | — | Statutory returns, §11 tier 3 |

Principle: every integration sits behind an interface with a recorded contract, a replayable
inbound webhook with idempotency, and a fixture-driven test. The dummy payment gateway is the
pattern to copy.

---

## 13. Module dependencies and build order

```
Capabilities (notifications, jobs, documents, reports, approvals)
    ├── D3 Admissions ──────► D6 Fees (invoice on admission)
    │        └──► D5 Assessment (enrolment → marks)
    ├── D7 People/HR ───────► D4 Teaching (workload, substitution on leave)
    │        └──► Staff attendance (existing, currently orphaned)
    ├── D8 Campus Services ─► D6 Fees (all charges to one ledger, AD-6)
    │        └──► D3 exit clearance (cross-domain, via AD-28 capability)
    └── D9 Engagement ──────► D5 (placement eligibility from academic rules)
```

**Hard ordering constraints:**
- Capabilities precede all four domains. Building any domain first means building notifications,
  jobs and documents privately, four times over (P-4).
- `Employee` (D7) precedes payroll, leave, appraisal and exit — and retro-fits the orphaned staff
  attendance tables.
- D6's ledger precedes D8 charges (AD-6).
- D3 admissions precedes any meaningful student lifecycle work.
- M10 needs AD-91 confirmed.

---

## 14. Implementation phases

| Phase | Theme | Gate to the next phase |
|---|---|---|
| **P0** | Stabilise | Suite green, drift fixed, tracker compact, OD-1/OD-4 answered |
| **P1** | Parity debt + capabilities | Fees/calendar on web; notifications, jobs, documents, reports, approvals live |
| **P2** | D3 Admissions and Student Lifecycle | An applicant can be admitted end to end and invoiced |
| **P3** | M10 Examinations and Results | Per AD-91, both modes |
| **P4** | D7 People and HR | Employee → leave → workload → payroll |
| **P5** | D9 Engagement | Notices first, then the case primitive, then placement |
| **P6** | D8 Campus Services | Library → hostel → transport → inventory |
| **P7** | Production hardening | The §16 checklist passes |

P0 first is the owner's decision and the right one: a 70,000-line system with a known-red suite,
live schema drift and 42 unvalidated features should not grow a ninth domain.

---

## 15. Execution checklist

Tick items in place. One slice at a time (`CLAUDE.md` §8). A slice is `✅ DONE` only with
validation evidence, and `⚠️ PARTIAL` when it ships on fewer surfaces than AD-84 requires.
Each item names its **surfaces**: `S` server, `W` web, `F` Flutter, `D` docs, `—` none.

### P0 — Stabilise  *(current phase)*

**P0-0 Enforce or withdraw the AD-83 geo-fence** `S` `W` `F`  *(highest priority in P0)*
- [ ] Decide: enforce the fence, or amend AD-83 to drop it. Do not leave a control that does not control
- [ ] If enforcing: add coordinates to the punch request contract and the repository port
- [ ] Server resolves the person's campus, loads its fence, and refuses a punch outside the radius
- [ ] Refuse a punch at a campus with no fence, exactly as 029's header states
- [ ] Discard the coordinates after the check (AD-83: "coordinates checked then discarded") — do not store them
- [ ] Mobile sends real device coordinates; handle permission-denied as a refusal, not a silent pass
- [ ] **Web punch cannot satisfy a fence from a desktop** — withdraw `PunchCard`'s punch action, or gate it behind a recorded exception
- [ ] Tests asserting the *negative*: a punch outside the radius is refused, and a punch at a fenceless campus is refused
- [ ] Audit every other AD-approved invariant for the same failure mode — schema present, check absent

**P0-1 Schema drift — migration 036** `S`
- [ ] Reproduce: run `syllabus.test.ts`, capture the 11 failures and the 2 migration-invariants failures
- [ ] Query the dev database directly for `syllabus` RLS state and GRANTs; compare with `036_syllabus.sql`
- [ ] Determine *why* the ledger says applied while the clauses are absent — partial transaction, manual intervention, or a Supabase rebuild that skipped it
- [ ] Fix the database state; do **not** edit the migration unless the migration itself is wrong
- [ ] Add a migration-invariants assertion for `syllabus` so this specific drift cannot recur silently
- [ ] Record the root cause in `docs/MASTER-CHECKLIST.md` — if the rebuild path can skip clauses, other tables are at risk too
- [ ] Full server suite green

**P0-2 Known-red tests** `S`
- [ ] All ten `zz-*` files triaged: promote what asserts production behaviour, delete the rest
- [ ] `zz-err6` and `zz-syldebug` resolved specifically (the two documented as red)
- [ ] CI fails the build on any red test from here (AD-92)

**P0-3 Seed a usable dev database** `S` `D`
- [ ] Seed script: one institution, two campuses, four departments, programs, a current year and term
- [ ] ~40 staff, ~400 students, enrolments, a timetable, four weeks of attendance, marks, fee structures and part-paid invoices
- [ ] Idempotent and re-runnable; documented in `docs/runbook/`
- [ ] Unblocks every signed-in screenshot and the visual check

**P0-4 Burn down validation debt** `W` `F`
- [ ] List all 42 `🔍 NEEDS VALIDATION` items from `PROJECT_STATE.md` into one table with a surface and an owner
- [ ] Standing Playwright visual check against the seeded database, covering every web screen, committed as a script
- [ ] One device pass on Android covering every `🔍` mobile item; record pass/fail per item, never in aggregate
- [ ] Each item moves to ✅ with evidence or to a named defect. **No item stays 🔍 without a reason**
- [ ] iOS stays 🚫 while Xcode is unavailable — do not retry (`CLAUDE.md` §9)

**P0-5 Resolve OD-1** `D`
- [ ] Put AD-91 (support both) to the owner with its cost
- [ ] On agreement, write AD-91 into `adr.md` and unblock M10, P15.2 and P20
- [ ] If the owner defers, record the deferral date and keep M10 🚫 — do not build speculatively

**P0-6 Resolve OD-4** `D`
- [ ] Decide collect-versus-record; the recommended default is record first, collect second
- [ ] Note that FEE-7's dummy gateway already implements the collect path structurally

**P0-7 Compact the tracker** `D`
- [ ] Move slice history from `PROJECT_STATE.md` into `docs/IMPLEMENTATION-CHECKPOINT.md`
- [ ] Rebuild `PROJECT_STATE.md` as the `CLAUDE.md` §4 TRACER: status model, current slice, next slice, blockers, open decisions. Target under 200 lines
- [ ] Verify it answers all eight `CLAUDE.md` §29 questions

**P0-8 Consolidate documentation** `D`
- [ ] Fold `NEW-SESSION-CONTEXT.md`, `INTERRUPT-RECOVERY.md` and `MODULE-CONTROLLER.md` into `PROJECT_STATE.md` / `ARCHITECTURE_INDEX.md`, then delete
- [ ] Fold `docs/plan-inbox-*.md` and `docs/plan-fee-a-to-z-*.md` into the requirements register, then delete
- [ ] Delete `flutter_01.log`, `prompt1.md`, `prompt2.md`, `DESIGN_TOKENS_ADDITIONS.dart`
- [ ] Gitignore `android/build/`; remove or commit `clients/web/explore.mjs` deliberately
- [ ] Add this file to `ARCHITECTURE_INDEX.md`

**P0-9 Record the new ADRs** `D`
- [ ] AD-84…AD-90 and AD-92 into `adr.md` (AD-91 gated on P0-5)
- [ ] Update `ARCHITECTURE_INDEX.md`'s ADR table
- [ ] Mark OD-FEE-5 resolved by AD-86

**P0 exit gate.** Fence enforced or withdrawn · suite green on a seeded database · zero unexplained `🔍` · tracker under 200
lines · OD-1 and OD-4 answered or explicitly deferred with a date.

---

### P1 — Parity debt and platform capabilities

**PAR-1 Fees on web (AD-86)** `W`
- [ ] Fee heads and structures — list, create, edit, archive
- [ ] Invoices — list with filters, detail, student view
- [ ] Collection — record a payment, allocate, reverse, print a receipt
- [ ] Fee requests — raise, approve, reject, register
- [ ] The four reports — collection, outstanding, defaulters, requests register
- [ ] Receipt and statement PDF (the Flutter side renders client-side; web should match, not diverge)
- [ ] Permission gating matches mobile exactly; test an unauthorised role on every route (`CLAUDE.md` §19)

**PAR-2 Calendar on web** `W`
- [ ] Month grid with holidays, events and today (web currently only *reads* holidays, inside `PunchCard`)
- [ ] Add/edit/remove a holiday, a range and an event, behind `term.manage`
- [ ] Reads the same `GET /v1/calendar`; one source of truth with the Timetable holidays tab

**PAR-3 Staff attendance on web** `W`
- [ ] Reports and charts; correction request approval
- [ ] Decide punch on web: it **already exists** (`PunchCard.tsx`, 415 lines) but cannot satisfy AD-83's fence from a desktop. Either gate it behind a fence check (P0-0) or withdraw it and record the exception in `MODULE_REGISTRY.md`

**CAP-1 Contract generation (AD-85)** `S` `W` `F`
- [ ] Emit OpenAPI 3.1 from the existing zod schemas; commit `server/openapi.json`
- [ ] Generate web TS types; replace hand-written API types
- [ ] Generate Flutter Dart models; replace hand-written models
- [ ] CI check fails when the description and the code disagree

**CAP-2 Notification delivery (AD-87)** `S` `W` `F`
- [ ] Migration: `notification_templates`, `notification_queue`, `notification_receipts`; RLS, GRANTs, invariants test
- [ ] Alter device tokens from hash-only to AES-256-GCM sealed per AD-63 — **this is the Drift 6 fix**
- [ ] Queue worker: idempotent, retry with backoff, dead-letter
- [ ] Channel providers behind interfaces: FCM, in-app, email, SMS
- [ ] Trigger from domain events (AD-10); no module calls the notifier directly
- [ ] Per-person channel preferences, quiet hours, digest option
- [ ] In-app notification centre on both clients
- [ ] **Verify a real push arrives on a real device** — not a console test (`CLAUDE.md` §10)

**CAP-3 Scheduled jobs (AD-88)** `S`
- [ ] Migration: `scheduled_jobs`, `job_runs`; tenant-scoped, idempotent, audited
- [ ] Runner with PostgreSQL advisory-lock leader election
- [ ] First jobs: notification queue drain, fee overdue reminders, invoice generation
- [ ] Admin view of job health; alert on repeated failure

**CAP-4 Document storage (AD-89)** `S` `W` `F`
- [ ] Migration: `documents`, `document_retention_classes`; RLS, GRANTs
- [ ] Object storage behind an interface; signed time-boxed URLs
- [ ] Permission check on every read; virus scan at ingest
- [ ] Migrate `syllabus` upload onto it as the pilot
- [ ] Upload and viewer components on both clients

**CAP-5 Report contract (AD-90)** `S` `W` `F`
- [ ] Descriptor schema: id, permission, parameters, columns, formats, default sort, exports
- [ ] Server resolver; keyset paging per AD-61
- [ ] One generic report surface per client: filters, paging, column visibility, saved views, CSV/PDF export
- [ ] Migrate the four fee reports onto it as the pilot

**CAP-6 Approvals capability (P1)** `S` `W` `F`
- [ ] Specify first — it is currently "❌ not specified" and four domains depend on it
- [ ] Migration: `approval_requests`, `approval_steps`, `approval_decisions`
- [ ] Chain definition per tenant; escalation on timeout; delegation obeying AD-17
- [ ] Approval inbox on both clients
- [ ] Retro-fit attendance and assessment corrections onto it

**CAP-7 Data-table and bulk surface** `W` `F`
- [ ] Generic table: filters, keyset paging, column visibility, saved views, bulk select
- [ ] Bulk-action pattern with partial-failure reporting
- [ ] Import pattern: upload, validate, preview, partially-failable commit, error report

**P1 exit gate.** Parity debt cleared or exceptions recorded · a real push delivered to a real
device · a scheduled job running in production shape · one report and one upload migrated onto
the new capabilities.

---

### P2 — D3 Admissions and Student Lifecycle

Read `docs/blueprint/02-domains.md` §D3 first. Each slice is server + web + Flutter per AD-84.

- [ ] **ADM-A1** Admission cycle, application form definition, fee configuration
- [ ] **ADM-A2** Enquiry capture and follow-up
- [ ] **ADM-A3** Application submission with documents (uses CAP-4); applicant self-service
- [ ] **ADM-A4** Application review, verification, shortlist (uses CAP-6)
- [ ] **ADM-A5** Merit list generation and publication
- [ ] **ADM-A6** Offer issue, acceptance, decline, waitlist movement
- [ ] **ADM-A7** Admission confirmation → creates Person, Student, enrolment, account (AD-14, AD-69)
- [ ] **ADM-A8** Invoice on admission (integrates D6)
- [ ] **ADM-A9** Bulk import of applications (uses CAP-7); **web-only, exception recorded**
- [ ] **ADM-A10** Lifecycle events: transfer, break, re-admit, exit
- [ ] **ADM-A11** Exit clearance across D6/D8 via an AD-28 capability
- [ ] **ADM-A12** Certificate register: bonafide, TC, character; serial-numbered, revocable
- [ ] **ADM-A13** Scholarships and concessions, posting to the D6 ledger
- [ ] **ADM-A14** Parent/guardian accounts — **needs an ADR first** (§7); scope is one ward while enrolled
- [ ] **ADM-A15** Reports via CAP-5: funnel, category-wise, seat matrix, admission register
- [ ] **ADM-A16** Notifications via CAP-2: application received, shortlisted, offer, payment due

### P3 — M10 Examinations and Results  *(gated on AD-91)*

- [ ] **M10-1** Confirm AD-91 and write it into `adr.md`
- [ ] **M10-2** Exam schedule, hall ticket, seating, invigilation
- [ ] **M10-3** Internal + external mark aggregation per curriculum rules (computed, AD-7)
- [ ] **M10-4** Autonomous engine behind a capability flag: moderation, revaluation, grade and pass/fail
- [ ] **M10-5** External result mirror, read-only (AD-8); one adapter per university format
- [ ] **M10-6** Result publication — the one permitted materialized academic value (AD-23)
- [ ] **M10-7** Student self-view of marks — **this is the blocked item** from 2026-09-24
- [ ] **M10-8** Transcript, grade card, consolidated statement
- [ ] **M10-9** Reports: pass percentage, subject analysis, toppers, backlog register

### P4 — D7 People and HR

- [ ] **HR-1** `Employee`, employment period, designation, qualification, service record
- [ ] **HR-2** Retro-fit migration 038 staff attendance onto `Employee` — it is currently orphaned
- [ ] **HR-3** Recruitment and appointment (uses CAP-6)
- [ ] **HR-4** Workload allocation; integrates D4; policy-ceiling warning
- [ ] **HR-5** Leave types, balances, requests, approval chain (LV-1; resolve OD-LV-1)
- [ ] **HR-6** Leave accrual and lapse as a CAP-3 job
- [ ] **HR-7** Substitution triggered by approved teaching leave
- [ ] **HR-8** Staff attendance reports, correction approvals, monthly summary
- [ ] **HR-9** Salary structure, payroll run, payslip, statutory deductions — `critical`, MFA-gated
- [ ] **HR-10** Payslip self-service (uses the self-service permission shape, §7)
- [ ] **HR-11** Appraisal and promotion
- [ ] **HR-12** Exit clearance and same-day access revocation
- [ ] **HR-13** Reports: staff strength, student-staff ratio, workload, leave patterns, payroll register, attrition

### P5 — D9 Engagement, Cases and Outcomes

- [ ] **ENG-1** Notices and circulars — compose, target from the org tree, approve, publish, track acknowledgement. **Closes a known student-facing gap; build first**
- [ ] **ENG-2** Events, registration, participation, activity credit; folds in the existing calendar events
- [ ] **ENG-3** The case primitive — one model serving grievance, discipline and helpdesk
- [ ] **ENG-4** Grievance, including anonymous, with an alternative route when the subject would normally handle it
- [ ] **ENG-5** Discipline: hearing, decision, sanction, appeal
- [ ] **ENG-6** Case escalation on deadline breach as a CAP-3 job
- [ ] **ENG-7** Placement: recruiters, drives, eligibility computed from academic rules, applications, offers
- [ ] **ENG-8** Alumni register and engagement
- [ ] **ENG-9** Reports: notice reach, participation, case ageing, anti-ragging statutory return, placement percentage

### P6 — D8 Campus Services

- [ ] **CS-1** Library: catalogue, holdings, membership
- [ ] **CS-2** Circulation: issue, return, renew, reserve; fines accruing via CAP-3, charged to the D6 ledger (AD-6)
- [ ] **CS-3** Hostel: blocks, rooms, beds, allocation, vacate, part refund
- [ ] **CS-4** Mess register and gate pass
- [ ] **CS-5** Transport: routes, stops, vehicles, passes
- [ ] **CS-6** Inventory: items, stock, reorder alerts
- [ ] **CS-7** Indent → approval → purchase order → goods receipt → issue
- [ ] **CS-8** Assets and depreciation; write-off as `critical`
- [ ] **CS-9** Vendor register
- [ ] **CS-10** Service dues feeding exit clearance (ADM-A11)
- [ ] **CS-11** Reports: circulation, overdue, occupancy, route utilisation, stock, asset register

### P7 — Cross-cutting, scheduled through the phases above

- [ ] **X-1** Flutter motion tokens matching §7.7's bands and curves, with a guard test (AD-31)
- [ ] **X-2** Dark theme on both clients
- [ ] **X-3** Accessibility: axe in the web test run; Flutter semantics audit
- [ ] **X-4** Statutory and accreditation returns module (NAAC, NBA, AICTE, AISHE) with evidence trail
- [ ] **X-5** Biometric device integration for staff attendance
- [ ] **X-6** Data retention and erasure (resolves OD-M1-4)
- [ ] **X-7** SA-5 platform impersonation — read-only, time-boxed, audited (AD-19)
- [ ] **X-8** Real Razorpay, replacing the dummy gateway

---

## 16. Production readiness checklist

Nothing here is ticked yet. This is the P7 gate.

**Correctness** — [ ] suite green with no known failures · [ ] every migration applied and
asserted on every environment · [ ] tenant isolation tested with a hostile second tenant ·
[ ] every endpoint tested for unauthorised access (`CLAUDE.md` §19) · [ ] concurrency tested on
every versioned entity · [ ] idempotency tested by replay

**Security** — [ ] external penetration test · [ ] secrets in a manager, never in `.env` in
production · [ ] rate limiting on auth and OTP · [ ] **replace the fixed OTP `123456` before
go-live** (AD-82 carries this as an accepted risk) · [ ] MFA enforced on every `critical`
permission · [ ] session and token lifetimes reviewed · [ ] audit log covers every
state-changing action · [ ] dependency and container scanning in CI

**Data** — [ ] backup with a *tested* restore · [ ] point-in-time recovery · [ ] retention policy
implemented · [ ] a rehearsed academic-year rollover (AD-11) · [ ] a rehearsed tenant
provisioning and de-provisioning

**Performance** — [ ] load-tested at the OD-9 scale targets · [ ] every list keyset-paged
(AD-61) · [ ] slow-query log reviewed and indexed · [ ] partitioning verified on the two
high-volume tables · [ ] mobile cold start and frame timings measured on a low-end device

**Operations** — [ ] health, readiness and liveness endpoints · [ ] structured logging with no
PII · [ ] error tracking on all three tiers · [ ] uptime and job-failure alerting · [ ] runbook
for the top ten incidents · [ ] documented rollback · [ ] staging mirroring production

**Clients** — [ ] **iOS built and validated** (🚫 Xcode unavailable — this is a real go-live
blocker, not a deferrable one) · [ ] Android release signing and Play listing · [ ] forced-upgrade
path · [ ] offline outbox verified under real network loss · [ ] web browser support matrix ·
[ ] accessibility audit passed

**Product** — [ ] every `🔍` cleared · [ ] no `⚠️ PARTIAL` capability shipped as done · [ ] user
documentation · [ ] admin training material · [ ] a pilot institution signed off

---

## 17. Future expansion

Beyond P7, in rough order of value:

- **Multi-campus and multi-institution groups.** AD-2 made campus first-class from day one and
  AD-22 gives shared-cluster tenancy, so the foundation is already there.
- **True SaaS self-onboarding.** Platform administration already provisions tenants (S1/S2,
  SA-1…SA-4); self-service signup, plan upgrade and billing are the remaining distance.
- **Student and parent mobile self-service depth** — fees, results, attendance, certificates,
  grievances from the phone.
- **Analytics**: at-risk-student prediction from attendance and internal marks; admission funnel
  and yield analysis; workload and capacity planning.
- **Learning delivery**: assignments, submissions, plagiarism, content — only if the institution
  is not already using an LMS. `03-modules.md` §3.2 rejected this for now; that rejection still
  looks right.
- **Public APIs** for institutional integrations, once the OpenAPI description of AD-85 exists.
- **Regional language support** — relevant for parent-facing surfaces in particular.

---

## How to use this document

1. `PROJECT_STATE.md` remains the operational tracker. This is the map, not the position.
2. Work one slice from §15 at a time (`CLAUDE.md` §8).
3. A slice is done on all surfaces AD-84 requires, or its exception is recorded.
4. When a slice lands, tick it here and update `PROJECT_STATE.md` and `MODULE_REGISTRY.md`.
5. When this plan and `docs/blueprint/` disagree, the blueprint wins unless a §3 ADR says otherwise.
