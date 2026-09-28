# Execution Checklist

The tickable implementation plan for the whole ERP. Created 2026-09-28.

**This is not the planning checklist.** `docs/MASTER-CHECKLIST.md` tracks the *architecture design
process* (phases 0–21: discovery, domain architecture, quality gates, the open-decision register).
This file tracks *building the software*. Both are current; they answer different questions.

| Ask | Read |
|---|---|
| Why is the project shaped this way? | `docs/MASTER-PLAN.md` |
| What does module X need? | `docs/blueprint/modules/README.md` → the module's doc |
| Is the architecture process complete? | `docs/MASTER-CHECKLIST.md` |
| **What do I build next?** | **This file** |
| What is built right now? | `PROJECT_STATE.md` |

## How to use this

- Work **one slice at a time** (`CLAUDE.md` §8). Do not start a phase in parallel with another.
- A slice is `✅ DONE` only with validation evidence. Code existing is not done (`CLAUDE.md` §3).
- A slice shipping on fewer surfaces than **AD-84** requires is `⚠️ PARTIAL`, never done — unless a
  parity exception is recorded in `MODULE_REGISTRY.md` with its reason.
- Surfaces: `S` server · `W` web · `F` Flutter · `D` docs/decision · `—` none.
- Tick items in place. When a slice lands: update `PROJECT_STATE.md` and `MODULE_REGISTRY.md`, then commit.

## Definition of done, applied to every slice below

- [ ] Server: migration with RLS FORCE, least-privilege GRANTs, invariants asserted in
      `migration-invariants.test.ts`
- [ ] Server: business invariants enforced in triggers, with tests asserting the **negative case**
      (see P0-0 — this is the lesson of the unenforced geo-fence)
- [ ] Server: unauthorised-access test per endpoint (`CLAUDE.md` §19)
- [ ] Server: optimistic concurrency (AD-52) and idempotency (AD-58) where writes are replayable
- [ ] Web and Flutter: built, or a parity exception recorded (AD-84)
- [ ] Clients: loading, empty, error and success states (`docs/07-design-system.md` §7.6)
- [ ] Permission gating matches the server exactly; UI visibility is not authorization
- [ ] Tests pass on all three tiers with **no known failures** (AD-92)
- [ ] Validated on a real device or a live browser, or explicitly marked `🔍 NEEDS VALIDATION`
- [ ] `PROJECT_STATE.md`, `MODULE_REGISTRY.md` updated; committed

---

# PHASE 0 — Stabilise

**Nothing new is built until this phase closes.** A 70,000-line system with a known-red suite, live
schema drift, an unenforced security control and 42 unvalidated features should not grow a ninth
domain. Owner decision, 2026-09-28.

## P0-0 — Enforce or withdraw the AD-83 geo-fence 🔴 **highest priority**

Detail: `docs/blueprint/modules/staff-attendance.md` §2–§6. The fence is migrated, configurable,
displayed — and never checked. Any staff member can punch in from anywhere.

- [ ] **Decide**: enforce the fence, or amend AD-83 to drop it. Record the decision as an ADR `D`
- [ ] Reproduce: punch in from outside any fence, on both clients; confirm it succeeds `S`
- [ ] Add `latitude`, `longitude`, `accuracy_m` to the punch request contract `S`
- [ ] Add coordinates to `StaffAttendanceRepository.punchIn` port and the application service `S`
- [ ] Resolve the person's campus from their employment/assignment — **never from client input** `S`
- [ ] Load the campus fence; **refuse when no fence exists** (029's header) `S`
- [ ] Haversine check: distance ≤ `fence_radius_m + min(accuracy_m, 50)` — bound the allowance `S`
- [ ] Refusal message names the campus and the distance `S`
- [ ] **Discard coordinates**; store `fence_verified` and `accuracy_m` only (AD-83) `S`
- [ ] Store `source` (`app` | `web` | `biometric`) `S`
- [ ] Mobile: request location, send real coordinates, handle permission-denied as a **refusal** `F`
- [ ] Web: withdraw the punch action from `PunchCard.tsx`, keep the read-only "today" display `W`
- [ ] Record the web parity exception in `MODULE_REGISTRY.md` with the geo-fence reason `D`
- [ ] Tests — **negative cases**: punch outside radius refused; fenceless campus refused;
      permission-denied refused; boundary at exactly the radius `S`
- [ ] Test: punch inside the radius succeeds and stores no coordinates `S`
- [ ] **Sweep every other AD-approved invariant for the same failure mode** — schema present, check
      absent. Record findings in `docs/MASTER-CHECKLIST.md` `S` `D`

## P0-1 — Schema drift, migration 036

- [ ] Run `syllabus.test.ts`; capture the 11 failures and the 2 migration-invariants failures `S`
- [ ] Query the dev database for `syllabus` RLS state and GRANTs; diff against `036_syllabus.sql` `S`
- [ ] Determine **why** the ledger says applied while the clauses are absent — partial transaction,
      manual intervention, or a Supabase rebuild path that skips clauses `S`
- [ ] **If the rebuild path can skip clauses, audit every other table** — other tables are at risk `S`
- [ ] Fix the database state; do not edit the migration unless the migration is itself wrong `S`
- [ ] Add a `syllabus` assertion to `migration-invariants.test.ts` so this cannot recur silently `S`
- [ ] Record the root cause in `docs/MASTER-CHECKLIST.md` drift register `D`
- [ ] Full server suite green `S`

## P0-2 — Known-red tests (AD-92)

- [ ] `zz-err6` — fix or delete, reason recorded `S`
- [ ] `zz-syldebug` — fix or delete, reason recorded `S`
- [ ] CI fails the build on any red test from here `S`

## P0-3 — Seed a usable dev database

Currently 0 persons and 0 institutions, so no signed-in screenshot is possible.

- [ ] Seed: one institution, two campuses, four departments, programs, current year and term `S`
- [ ] ~40 staff with roles, ~400 students, enrolments `S`
- [ ] A timetable, four weeks of attendance, internal marks `S`
- [ ] Fee structures, invoices in mixed states (paid, part-paid, overdue) `S`
- [ ] Idempotent and re-runnable; documented in `docs/runbook/` `S` `D`

## P0-4 — Burn down validation debt

42 `🔍 NEEDS VALIDATION` markers. Unit tests are being treated as a proxy for "works".

- [ ] Extract all 42 items from `PROJECT_STATE.md` into one table: item, surface, owner `D`
- [ ] Standing Playwright visual check against the seeded database, committed as a script `W`
- [ ] Web: every screen captured and reviewed `W`
- [ ] Android: one device pass over every `🔍` mobile item; **record pass/fail per item**, never in
      aggregate `F`
- [ ] Each item → ✅ with evidence, or a named defect with an issue `D`
- [ ] iOS stays 🚫 while Xcode is unavailable — **do not retry** (`CLAUDE.md` §9) `D`

## P0-5 — Resolve OD-1 (blocks M10) 🔴

- [ ] Put AD-91 to the owner with its cost: mirror now, engine behind a flag `D`
- [ ] On agreement, write AD-91 into `adr.md`; unblock M10, P15.2, P20 `D`
- [ ] If deferred, record the deferral date; M10 stays 🚫 — do not build speculatively `D`

## P0-6 — Resolve OD-4 (collect or record money)

- [ ] Decide; recommended default is record first, collect second `D`
- [ ] Note FEE-7's dummy gateway already implements the collect path structurally `D`

## P0-7 — Open OD-ACC-1 (institutional accounts)

Detail: `docs/blueprint/modules/institutional-accounts.md`.

- [ ] Put OD-ACC-1 to the owner: export-only, full general ledger, or thin budget ledger `D`
- [ ] Recommended: export + thin budget ledger. Must be answered **before M15 or M19** `D`

## P0-8 — Compact the tracker

`PROJECT_STATE.md` is 107KB; `CLAUDE.md` §4 asks for a compact TRACER.

- [ ] Move slice history into `docs/IMPLEMENTATION-CHECKPOINT.md` `D`
- [ ] Rebuild `PROJECT_STATE.md` as the §4 TRACER. **Target under 200 lines** `D`
- [ ] Verify it answers all eight `CLAUDE.md` §29 questions `D`

## P0-9 — Consolidate documentation

- [ ] Fold `NEW-SESSION-CONTEXT.md`, `INTERRUPT-RECOVERY.md`, `MODULE-CONTROLLER.md` into
      `PROJECT_STATE.md` / `ARCHITECTURE_INDEX.md`; delete `D`
- [ ] Fold `plan-inbox-*.md`, `plan-fee-a-to-z-*.md` into `docs/requirements.md`; delete `D`
- [ ] Delete `flutter_01.log`, `prompt1.md`, `prompt2.md`, `DESIGN_TOKENS_ADDITIONS.dart` `D`
- [ ] Gitignore `android/build/`; resolve `clients/web/explore.mjs` deliberately `D`

## P0-10 — Record the new ADRs

- [ ] AD-84 parity is a definition of done `D`
- [ ] AD-85 generated API contract `D`
- [ ] AD-86 OD-FEE-5 resolves to yes — fees reach web `D`
- [ ] AD-87 notification delivery is a platform capability `D`
- [ ] AD-88 scheduled work is a platform capability (**P9**) `D`
- [ ] AD-89 document storage is a platform capability `D`
- [ ] AD-90 reports are a declared contract `D`
- [ ] AD-91 examinations support both modes — **gated on P0-5** `D`
- [ ] AD-92 a known-failing test is a blocker `D`
- [ ] Update `ARCHITECTURE_INDEX.md`'s ADR table; mark OD-FEE-5 resolved `D`

### 🚧 P0 EXIT GATE

- [ ] Fence enforced or withdrawn, with negative tests
- [ ] Suite green on a seeded database, no known failures
- [ ] Zero unexplained `🔍`
- [ ] `PROJECT_STATE.md` under 200 lines
- [ ] OD-1, OD-4, OD-ACC-1 answered or explicitly deferred with a date

---

# PHASE 1 — Parity debt and platform capabilities

Four unbuilt domains each need P1, P2, P3, P5 and P9. Build them once here or build them four times
later.

## Parity debt (AD-84, AD-86)

### PAR-1 — Fees on web `W`
- [ ] Fee heads and structures: list, create, edit, archive
- [ ] Invoices: list with filters, detail, per-student view
- [ ] Collection: record payment, allocate, reverse, issue receipt
- [ ] Fee requests: raise, approve, reject, register
- [ ] The four reports: collection, outstanding, defaulters, requests register
- [ ] Receipt and statement PDF, matching the Flutter `FeeDocument` output
- [ ] Unauthorised-role test on every route
- [ ] Close OD-FEE-5

### PAR-2 — Calendar on web `W`
- [ ] Month grid: holidays, events, today (web currently only reads holidays inside `PunchCard`)
- [ ] Add/edit/remove holiday, range and event behind `term.manage`
- [ ] Reads `GET /v1/calendar` — one source of truth with the Timetable holidays tab

### PAR-3 — Staff attendance on web `W`
- [ ] Register, monthly summary, reports
- [ ] Correction request approval
- [ ] Punch action resolved per P0-0

## CAP-1 — Contract generation (AD-85) `S` `W` `F`
- [ ] Emit OpenAPI 3.1 from the existing zod schemas; commit `server/openapi.json`
- [ ] Generate web TypeScript types; replace hand-written API types
- [ ] Generate Flutter Dart models; replace hand-written models
- [ ] CI check fails when the description and the code disagree

## CAP-2 — P9 Scheduled Work (AD-88) `S`
Doc: `docs/blueprint/capabilities/p9-scheduled-work.md`. **Built first — P2 and P1 both need it.**
- [ ] P9-1 Migration: `scheduled_job`, `job_run`, `job_lock`; RLS, GRANTs, invariants
- [ ] P9-2 Runner with PostgreSQL advisory-lock leader election; window claiming
- [ ] P9-3 Per-tenant execution under RLS; **tenant timezone**, tested at a date boundary
- [ ] P9-4 Timeout, retry with backoff, dead-letter, failure alerting
- [ ] P9-5 Job health screens; permissioned manual trigger `W` `F`
- [ ] Test: two instances, one run; a run claimed twice fails on the unique index

## CAP-3 — P2 Notifications (AD-87) `S` `W` `F`
Doc: `p2-notifications.md`.
- [ ] P2-1 Migration: templates, queue, receipts, preferences, digests
- [ ] P2-2 **Device tokens hash-only → AES-256-GCM sealed (AD-63). This is the Drift 6 fix**
- [ ] P2-2a Unique index moves to `push_token_fp`; devices re-register on next launch
- [ ] P2-3 Template registry, declared field schemas, render, **validation at save time**
- [ ] P2-4 Queue worker: `FOR UPDATE SKIP LOCKED`, retry, dead-letter, dedupe key
- [ ] P2-5 FCM provider — **verify a real push arrives on a physical phone**, not a console test
- [ ] P2-6 Email and SMS providers behind interfaces
- [ ] P2-7 Preferences per category, quiet hours, digests; security is not switchable off
- [ ] P2-8 Notification centre and in-app toast `W` `F`
- [ ] P2-9 Reports via P5
- [ ] Test: replayed domain event produces one message, not two

## CAP-4 — P1 Approvals `S` `W` `F`
Doc: `p1-approvals.md`. Currently "❌ not specified" — now specified.
- [ ] P1-1 Migration: definition, step, request, assignment, decision; INSERT-only decisions
- [ ] P1-2 Definition versioning, **frozen on use**; resolver implementations
- [ ] P1-3 Request lifecycle, step modes (`all`/`any`/`quorum`), decision recording
- [ ] P1-3a **Nobody approves their own request**; empty-step escalation, never auto-approve
- [ ] P1-3b `subject_version` re-check (AD-52); stale subject returns the request
- [ ] P1-4 SLA sweep and escalation at 50/100/150% (needs P9)
- [ ] P1-5 Approval inbox, request detail, requester view `W` `F`
- [ ] P1-6 **Retro-fit attendance corrections (AD-53) and mark verification onto P1** — the proof
- [ ] P1-7 Reports via P5

## CAP-5 — P3 Documents (AD-89) `S` `W` `F`
Doc: `p3-documents.md`.
- [ ] P3-1 Migration: `document`, `document_kind`, `retention_class`, access log
- [ ] P3-2 Storage interface, two-step grant/confirm, signed time-boxed URLs
- [ ] P3-3 Virus scan at ingest; quarantine; **unreadable until `clean`**, enforced at read
- [ ] P3-4 Read authorization, access log, one-time URLs for sensitive kinds
- [ ] P3-5 Verification state, supersede-not-overwrite, verification queue `W` `F`
- [ ] P3-6 Uploader (drag-drop on web, **camera on Flutter**) and viewer
- [ ] P3-7 **Migrate syllabus (036) onto P3** — the pilot, and it clears the drift
- [ ] P3-8 Retention sweep and erasure (resolves OD-M1-4)

## CAP-6 — P5 Reporting (AD-90) `S` `W` `F`
Doc: `p5-reporting.md`.
- [ ] P5-1 Descriptor schema, module registration, startup validation
- [ ] P5-2 Resolver: parameters, **scope filtering matching the owning module's read path**, keyset paging
- [ ] P5-3 CSV and PDF export, audited, `report.export` permission
- [ ] P5-4 Report surface and report library `W` `F`
- [ ] P5-5 Saved views
- [ ] P5-6 **Migrate the four fee reports onto P5** — the pilot
- [ ] P5-7 Scheduled delivery via P9 and P2, running as a named person's authority
- [ ] P5-8 Heavy-report routing to a read replica
- [ ] Test: every date aggregation at a local-midnight boundary (the 2026-09-23 bug class)

## CAP-7 — P4 Certificates `S` `W` `F`
Doc: `p4-certificates.md`.
- [ ] P4-1 Migration: kinds, series, issues, revocations
- [ ] P4-2 **Gapless numbering**, assigned transactionally, never pre-allocated
- [ ] P4-3 Template engine, freeze payload, render to PDF via P3
- [ ] P4-4 Eligibility rules; **clearance capability** (AD-28) across M11/M16/M17/M18
- [ ] P4-5 Request and issue queue with eligibility failures named `W` `F`
- [ ] P4-6 Register, revoke, reissue as supersede
- [ ] P4-7 Public verification endpoint — rate limited, non-enumerable (AD-70 pattern)
- [ ] P4-8 Approval chains via P1

## CAP-8 — Generic data table and bulk (P8 §4) `W` `F`
- [ ] Generic table: filters, keyset paging, column visibility, saved views, bulk select
- [ ] Bulk-action pattern with partial-failure reporting
- [ ] **Import pattern**: upload → parse → validate → **dry-run preview** → partial commit → error report

### 🚧 P1 EXIT GATE
- [ ] Parity debt cleared or exceptions recorded in `MODULE_REGISTRY.md`
- [ ] **A real push delivered to a real phone**
- [ ] A scheduled job running, with two instances proving exactly-once
- [ ] Attendance correction and mark verification running on P1 (P1-6)
- [ ] Syllabus on P3, four fee reports on P5

---

# PHASE 2 — M4 Admissions and Student Lifecycle

Doc: `docs/blueprint/modules/admissions.md`. The largest functional hole in the academic core.
M5 is "minimum roster only" — nobody is ever *admitted*.

- [ ] **ADM-A1** Cycle, seat matrix, admission fee config `S` `W` `F`
- [ ] **ADM-A2** Enquiry capture, assignment, follow-up `S` `W` `F`
- [ ] **ADM-A3** Form definition; applicant self-service; submission `S` `W` `F`
  - [ ] Applicant entity distinct from Student (§2 — an applicant is not a student)
  - [ ] Phone-first applicant journey with camera document capture
- [ ] **ADM-A4** Document verification queue and chain `S` `W` `F`
- [ ] **ADM-A5** Merit generation, **frozen ranking**, publication `S` `W` `F`
- [ ] **ADM-A6** Offer issue, accept, decline, **expiry sweep**, waitlist promotion `S` `W` `F`
- [ ] **ADM-A7** 🔴 **Admission confirmation transaction** `S` `W` `F`
  - [ ] One transaction: Person + Student + enrolment + role + invoice + seat decrement
  - [ ] Seat-matrix over-admission refused by trigger under lock
  - [ ] Idempotent by offer id (AD-58)
- [ ] **ADM-A8** Invoice on admission via M11 `S`
- [ ] **ADM-A9** Bulk import with dry-run `S` `W` — **web-only, exception recorded**
- [ ] **ADM-A10** Lifecycle: transfer, break, re-admit, exit `S` `W` `F`
- [ ] **ADM-A11** **Clearance capability** across M11/M16/M17/M18 (AD-28) `S` `W` `F`
- [ ] **ADM-A12** Certificates: bonafide, TC, conduct, migration via P4 `S` `W` `F`
- [ ] **ADM-A13** Scholarships hand-off to M12 `S` `W` `F`
- [ ] **ADM-A14** Parent/guardian accounts — ⚠️ **write the ADR first** `D` `S` `W` `F`
  - [ ] ADR: guardian authority over exactly one ward, valid only while enrolled (extends AD-1)
  - [ ] Note: `03-modules.md` rejected a "parent portal *module*" — this is an actor with a scope
- [ ] **ADM-A15** Reports via P5 `S` `W` `F`
- [ ] **ADM-A16** Notifications via P2 `S`

### 🚧 P2 EXIT GATE
- [ ] An applicant can be taken from enquiry to enrolled student with an invoice, end to end
- [ ] Over-admission is impossible; proven by test
- [ ] A student can be exited with clearance and a transfer certificate

---

# PHASE 3 — M10 Examinations and Results

Doc: `examinations-and-results.md`. **Gated on AD-91 (P0-5).**

- [ ] **M10-1** Confirm AD-91; write into `adr.md`; add the P8 capability flag `D` `S`
- [ ] **M10-2** Session, schedule, hall, seating, invigilation `S` `W` `F`
- [ ] **M10-3** Registration, eligibility, exam fee, hall ticket `S` `W` `F`
  - [ ] Attendance threshold read from M7 as of a date — never stored (AD-7)
  - [ ] Shortage condonation as a P1 approval with a reason
- [ ] **M10-4** Grading scale, versioned, frozen on use `S` `W`
- [ ] **M10-5** Mark aggregation from M9 + external components, computed `S`
- [ ] **M10-6** **External mirror + import adapters** (AD-8) `S` `W` — *affiliating*
  - [ ] `external_mark` has **no UPDATE grant** for `erp_app`
  - [ ] One adapter per university format, fixture-driven
- [ ] **M10-7** **Result freeze and publication** (AD-23) with approval `S` `W` `F`
- [ ] **M10-8** 🔴 **Student result view** — closes the 2026-09-24 blocked gap `S` `W` `F`
- [ ] **M10-9** Transcript and grade card via P4 `S` `W` `F`
- [ ] **M10-10** Mark entry, **script anonymity**, double evaluation `S` `W` — *autonomous*
- [ ] **M10-11** Moderation and grace marks `S` `W` — *autonomous*
- [ ] **M10-12** Revaluation with fee and outcome `S` `W` `F` — *autonomous*
- [ ] **M10-13** Supplementary sessions `S` `W` `F`
- [ ] **M10-14** Reports `S` `W` `F`

### 🚧 P3 EXIT GATE
- [ ] An affiliating college can mirror and publish results and students can see them (M10-6…M10-9)
- [ ] A published result is provably immutable

---

# PHASE 4 — D7 People and HR

Docs: `hr-and-staff.md`, `leave-and-workload.md`, `payroll.md`, `staff-attendance.md`.

## M13 HR and Staff
- [ ] **HR-1** Employee, employment period, designation; staff directory `S` `W` `F`
- [ ] **HR-2** 🔴 **Retro-fit `038_staff_attendance` onto `employee`** — currently orphaned `S`
- [ ] **HR-3** Qualifications and documents via P3 `S` `W` `F`
- [ ] **HR-4** Service record: confirmation, promotion, transfer (INSERT only) `S` `W` `F`
- [ ] **HR-5** Appointment workflow and approval `S` `W` `F`
- [ ] **HR-6** Workload from M3 assignments + duties; ceiling **warning, not block** `S` `W` `F`
- [ ] **HR-7** Self-service "my employment" `S` `W` `F`
- [ ] **HR-8** Exit, clearance items, **same-day access revocation job** `S` `W` `F`
- [ ] **HR-9** Certificates: experience, relieving, salary, NOC via P4 `S` `W` `F`
- [ ] **HR-10** Reports incl. **student-staff ratio** (accreditation) `S` `W` `F`

## Staff attendance (remainder; P0-0 already fixed the fence)
- [ ] **SA-A2** Register, monthly summary, reports `S` `W` `F`
- [ ] **SA-A3** Work calendar and duty exceptions `S` `W` `F`
- [ ] **SA-A4** Correction requests via P1 `S` `W` `F`
- [ ] **SA-A5** Local reminders; server notifications `S` `F`
- [ ] **SA-A6** Payroll input register `S`
- [ ] Auto-close job **marks days auto-closed; never invents a punch time**

## M14 Leave and Workload
- [ ] **LV-0** 🔴 **Resolve OD-LV-1**: staff leave (M14) vs student excused absence (M7) `D`
- [ ] **LV-1** Types, entitlements, policy config `S` `W` `F`
- [ ] **LV-2** Append-only ledger, balance, accrual job, nightly reconciliation `S` `W` `F`
- [ ] **LV-3** Apply; day computation server-side against the work calendar `S` `W` `F`
- [ ] **LV-4** Approval chains by duration via P1 `S` `W` `F`
- [ ] **LV-5** 🔴 **Substitution resolution** — propose, accept, or cancel the class `S` `W` `F`
- [ ] **LV-6** Department leave calendar; my balance `S` `W` `F`
- [ ] **LV-7** Lapse, carry-forward, encashment `S`
- [ ] **LV-8** Payroll input (LWP) `S`
- [ ] **LV-9** Reports incl. **unresolved substitutions** `S` `W` `F`
- [ ] **LV-10** Student excused absence in M7 (resolves OD-LV-1's second half) `S` `W` `F`

## M15 Payroll
- [ ] **PAY-0** OD-ACC-1 answered (P0-7) — payroll output needs a destination `D`
- [ ] **PAY-1** Components, structures, employee salary, effective dating `S` `W`
- [ ] **PAY-2** Statutory rates, versioned `S` `W`
- [ ] **PAY-3** Input collection from M14, staff attendance, arrears `S`
- [ ] **PAY-4** Run: draft → lock → compute; **balance invariant enforced** `S` `W`
- [ ] **PAY-5** **Variance review against the previous month** — the key control `S` `W`
- [ ] **PAY-6** Approval and release via P1, MFA, **preparer ≠ approver** `S` `W` `F`
- [ ] **PAY-7** Payslip freeze, PDF, self-service, one-time URLs `S` `W` `F`
- [ ] **PAY-8** Bank instruction export `S` `W`
- [ ] **PAY-9** Statutory returns and Form 16 `S` `W`
- [ ] **PAY-10** Reports `S` `W` `F`
- [ ] Test: a released run is immutable; a correction becomes an arrear, never an edit

### 🚧 P4 EXIT GATE
- [ ] Staff attendance attaches to an employment record and feeds payroll
- [ ] Approved teaching leave produces a substitution or a cancelled class — never a silent gap
- [ ] A payroll run cannot be released by the person who prepared it

---

# PHASE 5 — D9 Engagement

Docs: `communication.md`, `cases.md`, `events.md`, `placements.md`, `alumni.md`.
**M20 first** — it is blueprint phase 1, closes a live student-facing gap, and its audience engine
is reused by everything after it.

## M20 Communication
- [ ] **NOT-1** Categories, notice entity, draft, publish `S` `W` `F`
- [ ] **NOT-2** 🔴 **Audience expression, resolution, freeze at publish, preview count** `S` `W` `F`
- [ ] **NOT-3** Notice board and detail `W` `F`
- [ ] **NOT-4** Delivery via P2 by urgency `S`
- [ ] **NOT-5** Acknowledgement, chase, escalation `S` `W` `F`
- [ ] **NOT-6** Approval chains via P1 `S` `W` `F`
- [ ] **NOT-7** Attachments via P3 `S` `W` `F`
- [ ] **NOT-8** Scheduled publication and expiry `S`
- [ ] **NOT-9** Revision and **retraction, never deletion** `S` `W` `F`
- [ ] **NOT-10** Reach and acknowledgement reports `S` `W` `F`

## M21 Cases
- [ ] **CAS-1** Case types, committees, SLAs, appeal routes `S` `W` `F`
- [ ] **CAS-2** Case primitive: raise, gapless number, acknowledge, timeline `S` `W` `F`
- [ ] **CAS-3** 🔴 **Confidentiality in the read path** + P6 sensitive-read audit `S`
  - [ ] **Build before any real case exists** — the window cannot be undone
  - [ ] A College Admin does **not** see cases by virtue of being an admin
- [ ] **CAS-4** Triage, assignment, priority `S` `W` `F`
- [ ] **CAS-5** Evidence via P3, camera capture `S` `W` `F`
- [ ] **CAS-6** Anonymous raise, **sealed identity** (AD-63), permissioned unsealing with MFA `S` `W` `F`
- [ ] **CAS-7** Grievance policy, committee decision, alternative route (P1 §6) `S` `W` `F`
- [ ] **CAS-8** Discipline: hearing, minutes, sanction `S` `W` `F`
- [ ] **CAS-9** **Sanction application across modules** (AD-28); unconfirmed sanctions alert `S`
- [ ] **CAS-10** Appeals, decided at a higher level by a different person `S` `W` `F`
- [ ] **CAS-11** Helpdesk policy and queue `S` `W` `F`
- [ ] **CAS-12** SLA chase and deadline escalation `S`
- [ ] **CAS-13** **Anti-ragging type and statutory return** `S` `W` `F`
- [ ] **CAS-14** Reports `S` `W` `F`

## M22 Events
- [ ] **EVT-1** `managed_event` extending CAL-2's `calendar_events`; promotion model `S` `W` `F`
- [ ] **EVT-2** Sessions; **room request through M6** (AD-46), never a direct booking `S` `W` `F`
- [ ] **EVT-3** Registration, capacity, waitlist `S` `W` `F`
- [ ] **EVT-4** Fees via M11 `S`
- [ ] **EVT-5** Participation marking, offline-safe (AD-58, AD-59) `S` `W` `F`
- [ ] **EVT-6** Teams and results `S` `W` `F`
- [ ] **EVT-7** Activity credit, read by M10, never stored as a total `S` `W` `F`
- [ ] **EVT-8** Certificates via P4 `S` `W` `F`
- [ ] **EVT-9** Announcement through M20's audience engine `S` `W` `F`
- [ ] **EVT-10** Resources and budget `S` `W`
- [ ] **EVT-11** Reports `S` `W` `F`

## M23 Placements
- [ ] **PLA-1** Recruiter register, MoU, rating `S` `W` `F`
- [ ] **PLA-2** Student profile and resume `S` `W` `F`
- [ ] **PLA-3** Drives, rounds, announcement to the **eligible set only** `S` `W` `F`
- [ ] **PLA-4** 🔴 **Eligibility engine with shown derivation** `S` `W` `F`
- [ ] **PLA-5** Placement policy: offer caps, dream-offer threshold `S` `W`
- [ ] **PLA-6** Applications, shortlisting, round results `S` `W` `F`
- [ ] **PLA-7** Offers, acceptance, response deadline `S` `W` `F`
- [ ] **PLA-8** Placement records incl. higher studies and entrepreneurship `S` `W` `F`
- [ ] **PLA-9** **Statistics with stated denominators** `S` `W` `F`
- [ ] **PLA-10** Accreditation placement returns `S` `W`
- [ ] Schema names are `placement_application` / `placement_offer` — never bare `application`/`offer`

## M24 Alumni
- [ ] **ALU-1** `alumnus` entity linked to the same Student; `alumnus` role `S` `W` `F`
- [ ] **ALU-2** Graduation transition job `S`
- [ ] **ALU-3** 🔴 **Consent model enforced at the send path** — before any outreach `S` `W` `F`
- [ ] **ALU-4** Self-service profile, career updates `S` `W` `F`
- [ ] **ALU-5** Directory with consent filtering `S` `W` `F`
- [ ] **ALU-6** Verification from M23 `S` `W`
- [ ] **ALU-7** Engagement: mentoring, guest lectures, recruiting `S` `W` `F`
- [ ] **ALU-8** Campaigns and surveys via M20 `S` `W` `F`
- [ ] **ALU-9** Donations and receipts (to institutional accounts, **not M11**) `S` `W` `F`
- [ ] **ALU-10** Chapters `S` `W` `F`
- [ ] **ALU-11** Outcome reports at 1/3/5 years `S` `W` `F`

### 🚧 P5 EXIT GATE
- [ ] A notice reaches a precisely targeted audience with acknowledgement tracked
- [ ] A grievance can be raised anonymously and is unreadable to anyone outside the case
- [ ] Placement statistics state their denominator

---

# PHASE 6 — D8 Campus Services

Docs: `library.md`, `hostel.md`, `transport.md`, `materials-and-assets.md`.
**M16 first** — it proves the allocation primitive that M17 and M18 reuse.

## M16 Library
- [ ] **LIB-1** Items and holdings (the catalogue/holding split), accession, search `S` `W` `F`
- [ ] **LIB-2** Membership classes and memberships `S` `W` `F`
- [ ] **LIB-3** 🔴 **Circulation: issue, return, renew — with named refusal reasons** `S` `W` `F`
- [ ] **LIB-4** Reservations and queue; renewal refused when reserved `S` `W` `F`
- [ ] **LIB-5** 🔴 **Fine accrual job → M11 charge**, idempotent per (circulation, date) `S`
- [ ] **LIB-6** Waivers and write-offs via P1 `S` `W` `F`
- [ ] **LIB-7** Student self-service: my loans, dues, reserve `W` `F`
- [ ] **LIB-8** Stock verification — **phone-first, scanning shelves** `S` `W` `F`
- [ ] **LIB-9** Bulk catalogue import `S` `W`
- [ ] **LIB-10** Clearance answer for ADM-A11 `S`
- [ ] **LIB-11** Reports `S` `W` `F`

## M17 Hostel
- [ ] **HOS-1** Blocks, rooms, **beds** (bed is the unit, not room) `S` `W` `F`
- [ ] **HOS-2** Applications, priority scoring **with components shown** `S` `W` `F`
- [ ] **HOS-3** 🔴 Allocation, transfer, vacate; **one active allocation per bed** `S` `W` `F`
- [ ] **HOS-4** Allocation board — web-only, exception recorded `W`
- [ ] **HOS-5** Fees, deposit, refund via M11 `S`
- [ ] **HOS-6** Mess registration, attendance, charges `S` `W` `F`
- [ ] **HOS-7** 🔴 **Gate passes: guardian notification, overdue escalation** (safety) `S` `W` `F`
- [ ] **HOS-8** Room inventory, damage assessment with camera evidence `S` `W` `F`
- [ ] **HOS-9** Incidents linked to M21 `S` `W` `F`
- [ ] **HOS-10** Clearance answer for ADM-A11 `S`
- [ ] **HOS-11** Reports incl. deposit liability `S` `W` `F`

## M18 Transport
- [ ] **TRA-1** Routes, stops, sequences, timings `S` `W` `F`
- [ ] **TRA-2** 🔴 Vehicles, **compliance documents, automatic grounding on expiry** `S` `W` `F`
- [ ] **TRA-3** Crew assignment with licence validation `S` `W` `F`
- [ ] **TRA-4** Schedules and capacity `S` `W` `F`
- [ ] **TRA-5** Pass request, issue, fare via M11; capacity invariant `S` `W` `F`
- [ ] **TRA-6** My pass and route timings `W` `F`
- [ ] **TRA-7** Trips: start, complete, cancel with notification, incidents `S` `W` `F`
- [ ] **TRA-8** Boarding record — phone only, exception recorded `S` `F`
- [ ] **TRA-9** Clearance answer for ADM-A11 `S`
- [ ] **TRA-10** Reports `S` `W` `F`
- [ ] Live GPS tracking is **explicitly out of scope**; needs its own ADR incl. retention

## M19 Materials and Assets
- [ ] **MAT-0** OD-ACC-1 answered (P0-7) — payables need a destination `D`
- [ ] **MAT-1** Categories, items, stores, reorder levels `S` `W` `F`
- [ ] **MAT-2** Append-only stock ledger; nightly reconciliation `S` `W` `F`
- [ ] **MAT-3** Vendors, blacklist, rating `S` `W` `F`
- [ ] **MAT-4** Indent, approval chain, issue from stock `S` `W` `F`
- [ ] **MAT-5** Purchase request, quotations, comparative statement `S` `W` `F`
- [ ] **MAT-6** 🔴 **Purchase order with quotation-threshold controls** (anti-corruption) `S` `W` `F`
- [ ] **MAT-7** Goods receipt, inspection, discrepancies `S` `W` `F`
- [ ] **MAT-8** Payable hand-off per OD-ACC-1 `S` `W`
- [ ] **MAT-9** Asset register, tagging, custody `S` `W` `F`
- [ ] **MAT-10** Physical verification — **phone-first, scanning tags** `S` `W` `F`
- [ ] **MAT-11** Depreciation runs, frozen once posted `S` `W`
- [ ] **MAT-12** Disposal and write-off (`critical`) `S` `W` `F`
- [ ] **MAT-13** Asset item for M13 exit clearance `S`
- [ ] **MAT-14** Reports `S` `W` `F`

## M12 Scholarships · M8 Coursework
- [ ] **SCH-1…SCH-10** per `scholarships.md` §14 — **SCH-6 (M11 concession) before SCH-7 (claims)**
- [ ] **CW-1…CW-9** per `coursework.md` §12 — marks hand over to M9, never stored here

### 🚧 P6 EXIT GATE
- [ ] A library fine, a hostel charge and a transport fare all appear on one student ledger (AD-6)
- [ ] A student cannot exit with a book out, a bed held or a pass active
- [ ] A purchase above threshold cannot proceed without quotations

---

# PHASE 7 — Cross-cutting and production hardening

## Cross-cutting
- [ ] **X-1** Flutter motion tokens matching `07-design-system.md` §7.7 bands and curves, with a
      guard test mirroring the web stylesheet test (AD-31) `F`
- [ ] **X-2** Dark theme on both clients (AD-67 locked light-only "for now") `W` `F`
- [ ] **X-3** Accessibility: axe in the web test run; Flutter semantics audit `W` `F`
- [ ] **X-4** 🔴 **Statutory and accreditation returns module** (NAAC, NBA, AICTE, AISHE) with
      evidence trail and submission history — **not a report** (`p5-reporting.md` §11) `S` `W` `F`
- [ ] **X-5** Biometric device integration for staff attendance `S`
- [ ] **X-6** Data retention and erasure (resolves OD-M1-4) `S` `W`
- [ ] **X-7** SA-5 platform impersonation — read-only, time-boxed, audited (AD-19) `S` `W` `F`
- [ ] **X-8** Real Razorpay replacing the dummy gateway `S` `W` `F`
- [ ] **X-9** P7 Search and command palette `S` `W` `F`
- [ ] **X-10** P6 sensitive-read auditing and hash-chained tamper evidence `S`

## Production readiness

**Correctness**
- [ ] Suite green, no known failures · [ ] every migration applied and asserted on every environment
- [ ] Tenant isolation tested with a hostile second tenant · [ ] unauthorised-access test per endpoint
- [ ] Concurrency tested on every versioned entity · [ ] idempotency tested by replay
- [ ] **Every business invariant has a negative test** (the P0-0 lesson)

**Security**
- [ ] External penetration test · [ ] secrets in a manager, not `.env` in production
- [ ] Rate limiting on auth and OTP
- [ ] 🔴 **Replace the fixed OTP `123456` before go-live** (AD-82 carries this as accepted risk)
- [ ] MFA enforced on every `critical` permission · [ ] session and token lifetimes reviewed
- [ ] Audit covers every state-changing action · [ ] dependency and container scanning in CI

**Data**
- [ ] Backup with a **tested restore** · [ ] point-in-time recovery · [ ] retention implemented
- [ ] Rehearsed academic-year rollover (AD-11) · [ ] rehearsed tenant provisioning and closure

**Performance**
- [ ] Load-tested at OD-9 scale targets · [ ] every list keyset-paged (AD-61)
- [ ] Slow-query log reviewed and indexed · [ ] partitioning verified on the two high-volume tables
- [ ] Mobile cold start and frame timings on a low-end device

**Operations**
- [ ] Health, readiness, liveness endpoints · [ ] structured logging with no PII
- [ ] Error tracking on all three tiers · [ ] uptime and job-failure alerting
- [ ] Runbook for the top ten incidents · [ ] documented rollback · [ ] staging mirrors production

**Clients**
- [ ] 🔴 **iOS built and validated** — currently 🚫 Xcode unavailable; a real go-live blocker
- [ ] Android release signing and Play listing · [ ] forced-upgrade path
- [ ] Offline outbox verified under real network loss · [ ] web browser support matrix
- [ ] Accessibility audit passed

**Product**
- [ ] Every `🔍` cleared · [ ] no `⚠️ PARTIAL` shipped as done
- [ ] User documentation · [ ] admin training material · [ ] a pilot institution signed off

---

## Open decisions blocking work

| ID | Question | Blocks | Status |
|---|---|---|---|
| **OD-1** | Affiliating or autonomous | M10, P15.2, P20 | 🔴 open — AD-91 proposed (P0-5) |
| **OD-4** | Collect money or only record it | M11 online, P15.3 | 🔴 open (P0-6) |
| **OD-ACC-1** | General ledger or export | M15, M19, budgets | 🔴 **new** (P0-7) |
| **OD-LV-1** | Staff leave vs student excused absence | M14 | 🟡 open — recommendation in `leave-and-workload.md` §1 |
| OD-2 | Campus scope | — | 🟡 safe default in force |
| OD-5 | Legacy systems inventory | Integrations | 🟡 default assumed |
| OD-M1-4 | Retention and erasure | X-6, P3 | 🟡 open |
| OD-BIO-1 | Biometric lock confirmation | — | 🟡 open |
| ~~OD-FEE-5~~ | ~~Fees on web~~ | — | ✅ resolved by AD-86 → PAR-1 |
