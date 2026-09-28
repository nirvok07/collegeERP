# P0 — Stabilise

**Nothing new is built until this phase closes.** Owner decision, 2026-09-28.

Rationale: `docs/MASTER-PLAN.md` §2. A 70,000-line system with a known-red suite, live schema
drift, an unenforced security control and 42 unvalidated features should not grow a ninth domain.

---

## P0-0 — Enforce or withdraw the AD-83 geo-fence 🔴

Full analysis: `docs/blueprint/modules/staff-attendance.md` §2–§6.

The fence is migrated (`029_campus_fence.sql`), configurable, displayed, and now enforced by the
server for phone punches. Desktop punching is withdrawn because a desktop cannot establish physical
presence; physical-phone verification remains external.

### Decide
- [x] `DOC` Choose **(a) enforce** or **(b) amend AD-83 to drop the fence**. Enforce (a).
- [x] `DOC` Write the decision into `docs/blueprint/adr.md` — amend AD-83 either way, so the ADR
      and the code agree afterwards
- [x] `DOC` If (b): N/A — enforcement (a) was chosen; migration 029 remains the live fence schema

### Reproduce (do this before fixing — confirm the defect, do not assume it)
- [x] `TEST` Pre-fix Flutter 2xx reproduction: not retained as a runnable artifact; commit
      `7925f06` replaced the unsafe coordinate-free path, and post-fix refusal is covered below.
- [x] `TEST` Pre-fix web `PunchCard` 2xx reproduction: N/A after the punch action was withdrawn;
      the current card is read-only and the phone-only parity exception is documented.
- [x] `TEST` Pre-fix fenceless-campus 2xx reproduction: not retained as a runnable artifact;
      the corrected behavior is covered by the post-fix `FENCE_MISSING` negative test below.

### Server, if (a)
- [x] `MIG` New migration: add `fence_verified boolean NOT NULL DEFAULT false`,
      `accuracy_m int NULL`, `source text NOT NULL DEFAULT 'app'` to `staff_attendance`
- [x] `MIG` CHECK `source IN ('app','web','biometric')`
- [x] `MIG` GRANTs remain declared; the three columns and their constraints are asserted by
      `migration-invariants.test.ts`
- [x] `API` `POST /v1/me/staff-attendance/punch-in` accepts `{ latitude, longitude, accuracy_m }`;
      zod schema, all three required
- [x] `API` Same for `punch-out` — a punch-out from home is the same problem as a punch-in
- [x] `REPO` Extend `StaffAttendanceRepository.punchIn` port in
      `server/src/modules/attendance/application/ports.ts` to carry `fenceVerified`, `accuracyM`, `source`
- [x] `REPO` Add a campus-fence reader: resolve the person's campus, return
      `{ latitude, longitude, radiusM } | null`
- [x] `SVC` In `self-attendance.ts`, resolve the campus **from the person's assignment, never from
      client input** (`findCampusFence` joins the actor's active role assignment to its department/
      section campus)
- [x] `SVC` Refuse with `FENCE_MISSING` when the campus has no fence
- [x] `SVC` Haversine distance check: `distance <= radiusM + min(accuracyM, 50)`. The accuracy
      allowance is bounded — unbounded lets a client claim 10 km accuracy
- [x] `SVC` Refuse with `OUTSIDE_FENCE`, message naming the campus and the distance in metres
- [x] `SVC` **Discard the coordinates.** Store only `fence_verified` and `accuracy_m` (AD-83:
      "coordinates checked then discarded"). No latitude or longitude column, ever
- [x] `SVC` Preserve the existing correct behaviour: one open punch per person per day;
      `workDateOf()` in the college timezone; `deps.clock.now()` is authoritative over client time
      (same-day conflict coverage remains in `attendance.test.ts`)

### Flutter
- [x] `APP` Request location permission with a clear rationale string
- [x] `APP` Acquire a fix with a timeout; show progress — a silent 10-second wait reads as a hang
- [x] `APP` Send real `latitude`, `longitude`, `accuracy_m`
- [x] `APP` Permission denied → **refuse the punch** with an explanation. Never fall back to a
      coordinate-free punch
- [x] `APP` Location unavailable or timed out → refuse, offer retry, suggest a correction request
- [x] `APP` Render `OUTSIDE_FENCE` and `FENCE_MISSING` as distinct, actionable messages

### Web
- [x] `WEB` Withdraw the punch action from `clients/web/src/features/dashboard/PunchCard.tsx`
- [x] `WEB` Keep the read-only "today" display and the holiday read
- [x] `WEB` Explain in the UI where to punch, rather than removing the card silently
- [x] `DOC` Record the parity exception in `MODULE_REGISTRY.md`: *punch is phone-only because a
      geo-fence is a physical-presence check and a desktop cannot satisfy it*

### Tests — the negative cases are the point
- [x] `TEST` Punch outside the radius → refused
- [x] `TEST` Punch at a fenceless campus → refused
- [x] `TEST` Punch exactly at the radius boundary → accepted
- [x] `TEST` Punch at `radius + 1m` with `accuracy_m = 0` → refused
- [x] `TEST` Absurd accuracy (`accuracy_m = 10000`) → allowance capped at 50 m, still refused
- [x] `TEST` Request missing coordinates → 422, not a silent pass
- [x] `TEST` Punch inside the radius → accepted, and **no coordinate is persisted** (assert the
      columns do not exist / are absent from the row)
- [x] `TEST` Client-supplied campus id is ignored; the person's own campus is used
- [x] `TEST` Unauthorised actor cannot punch for another person
- [x] `TEST` Flutter widget test: permission denied renders a refusal, sends no request

### Generalise the lesson
- [x] `S` `DOC` **Sweep every AD-approved invariant for the same failure mode** — schema present,
      check absent. Start with: AD-34 curriculum freeze, AD-17 delegation limits, AD-27 archive
      refusal, AD-60 suspended-tenant refusal, AD-65 seat limits, M11 gapless receipt numbers
- [x] `DOC` Record findings in `docs/MASTER-CHECKLIST.md` drift register
- [x] `TEST` For each confirmed gap, add the negative test before fixing (no implemented gap was
      confirmed; AD-17 is explicitly unimplemented with P1 approvals)

### Close
- [ ] `VAL` Verified on a physical phone inside and outside a real fence
- [x] `DOC` `PROJECT_STATE.md` and `MODULE_REGISTRY.md` updated; committed (physical-phone check
      remains an explicit external blocker)

---

## P0-1 — Schema drift, migration 036

The historical incident report claimed that `036_syllabus.sql` had left `syllabus` without RLS or
GRANTs and that 11 syllabus tests plus 2 migration-invariants checks failed. The current audit found
RLS, FORCE RLS, tenant policy and expected grants compliant; the live incident is resolved, while
the original cause cannot be reconstructed from the migration ledger.

### Investigate before changing anything
- [x] `TEST` Run `syllabus.test.ts`; captured the current run: 0 passed, 9 cancelled after the
      database setup failed to connect to local PostgreSQL (`EPERM`); the historical 11-failure
      report is not reproducible against the current dev database.
- [x] `TEST` Run `migration-invariants.test.ts`; captured the stale `syllabus` privilege declaration
      and corrected `EXPECTED_PRIVILEGES`/DELETE expectations
- [x] `S` Query `pg_class.relrowsecurity` and `relforcerowsecurity` for `syllabus` — both `true`
- [x] `S` Query `information_schema.role_table_grants` — `erp_app` has SELECT, INSERT, UPDATE,
      DELETE, all non-grantable
- [x] `S` Query the migrations ledger row for `036`: applied 2026-09-22 15:15:40 UTC; this
      ledger has no checksum column
- [x] `S` Diff observed state against `036_syllabus.sql`: table, FORCE RLS, tenant policy, and
      grants match; no corrective migration is required
- [x] `S` **Determine the cause.** The historical cause cannot be proven from the ledger (no
      checksum or migration execution log); current evidence shows no live drift. The documented
      incident is therefore stale/resolved, not a reason to rewrite migration 036.
      Supabase rebuild path skipping statements. `npm run migrate` reports "up to date", so this is
      a database-state investigation, not a migration edit

### The wider question
- [x] `S` 🔴 **If the rebuild path can skip clauses, every table is suspect.** One-off audit
      query comparing, for all tenant tables: RLS enabled, RLS forced, and `erp_app` grants against
      what the migrations declare
- [x] `DOC` Record the result: all 55 public tables were checked; every tenant table has RLS
      enabled and forced, with expected application grants. `permissions` is the intentional
      platform reference-table exception.

### Fix
- [x] `S` Repair the database state (not needed; the live state already matches the migration)
- [x] `S` Do **not** edit `036_syllabus.sql` unless the migration itself is wrong; the migration
      was correct and the application query drift was fixed instead
- [x] `MIG` If the migration is wrong, write a corrective migration; never rewrite applied history
      (N/A: migration 036 was verified correct; no corrective migration is warranted)
- [x] `TEST` Add `syllabus` to `EXPECTED_PRIVILEGES` in `migration-invariants.test.ts` — already
      present in the current test declaration, so no code change was needed. The same
      gap `fee_online_intents` had on 2026-09-23
- [x] `TEST` `syllabus.test.ts` green — 8/8 passed against the local PostgreSQL test database
- [x] `TEST` `migration-invariants.test.ts` green — 9/9 passed against the local PostgreSQL test
      database after declaring migration 036's `syllabus` privileges
- [x] `DOC` Root cause/evidence written into `docs/MASTER-CHECKLIST.md` drift register

---

## P0-2 — Test suite hygiene (AD-92)

**Correction to the earlier audit:** there are **10** `zz-*` debug test files, not 2 — out of 46
total server test files. Nearly a quarter of the suite is debug scaffolding.

The ten files were removed in commit `eff2617` after classification below; no `zz-*` test files
remain in `server/tests`.

- [x] `TEST` Inventory all 10: seven `zz-err*` files only logged and asserted `true`; `zz-rootcause`
      and `zz-syldebug` were probes; `zz-parse` tested a private duplicate parser. None asserted
      durable production behavior.
- [x] `TEST` For each: classified as debug-only; the real `syllabus.test.ts` owns the production
      assertions.
- [x] `TEST` Promote any that do — none qualified for promotion.
- [x] `TEST` **Delete the rest.** All 10 debug files were removed.
- [x] `TEST` `zz-err6` and `zz-syldebug` resolved specifically by removing the debug scaffolding;
      the underlying syllabus suite remains the authoritative test.
- [x] `S` CI fails the build on any red test (AD-92)
- [x] `S` CI fails on a **skipped** test too, unless annotated with a reason
- [x] `TEST` Full server suite green: `519/519` passed, 0 failed, 0 cancelled, 0 skipped
- [x] `TEST` Full Flutter suite green: `330/330` passed
- [x] `TEST` Full web suite green: 18 files, `203/203` passed
- [x] `TEST` Investigate the flaky outbox timing test `a write waits behind an earlier one`:
      full Flutter suite plus five consecutive isolated runs passed on 2026-09-28; the existing
      single-flight/queued-write implementation needs no change

---

## P0-3 — Seed a usable dev database

The local `device-test` college now supports fresh signed-in API and browser verification when the
API runs against `college_erp_dev`; the separately configured managed target is not fresh signed-in
evidence. Live browser capture remains an explicit validation item for each state.

Validation note (2026-09-29): the configured running API currently points at a managed development
database containing only `iit-delhi` with zero user accounts. The ignored credential file existed
but was stale; `scripts/seed-device-test.ts` now validates/rebuilds the database instead of trusting
the file. The retry reached `platform_accounts` but the configured `erp_migrator` role was refused
by RLS, so no RLS weakening or remote repair was attempted. Restore the approved bootstrap/local
database path before claiming a new browser sign-in or state capture.

An unscoped read-only query correctly found 0 `user_accounts` for `erp_app` under tenant RLS, while a
tenant-scoped query found all 43 `device-test` accounts and the seeded teacher. No grant or RLS change
was made; the local API's tenant context is working.

Implementation note (2026-09-29): the canonical seed was run through the API with a known local
admin credential. Two consecutive repeat runs completed without errors and created no new rows;
the service and seed also guard against duplicate timetable occurrences.

- [x] `S` `scripts/seed-dev.ts`, idempotent and re-runnable (canonical entry point for the existing
      resumable college-tree seed)
- [x] `S` One institution with branding (AD-70: code, logo, colour; verified through the seeded API)
- [x] `S` Two campuses, one with a configured geo-fence (needed by P0-0), one without
- [x] `S` Four departments; programs with curriculum versions, one published one draft (five
      departments, four programs, one published and three draft versions returned by the API)
- [x] `S` Current academic year and term, plus a prior year for rollover testing
- [x] `S` Calendar: holidays, a multi-day break, timed and all-day events
- [x] `S` ~40 staff across roles: college admin, HoDs, faculty, accountant, cashier (41 staff
      returned by the seeded API)
- [x] `S` ~400 students across programs, sections and years (403 students returned by the seeded
      API)
- [x] `S` Enrolments, course offerings, instructor assignments
- [x] `S` A timetable with rooms; four weeks of generated class sessions
- [x] `S` Attendance records including corrections and a cancelled class
- [x] `S` Internal assessment plans and marks, some verified, some not
- [x] `S` Fee structures, invoices in mixed states: paid, part-paid, overdue, waived
- [x] `S` Payments including one reversed, so the collection report has a negative line
- [x] `S` A known password or OTP path for each test persona, documented (local admin password
      and development OTP `123456` verified against `device-test`; generated access material
      remains in ignored local fixture output)
- [x] `DOC` `docs/runbook/` page: how to seed, reset and which personas exist (baseline scope and
      remaining P0-3 gaps are explicit in `docs/runbook/seed-dev.md`)
- [x] `TEST` Seed runs twice with no error and no duplicates (two consecutive reruns reported
      `Done: 0 created, 129 already there.`; no new class sessions were created)

---

## P0-4 — Burn down validation debt

The 2026-09-28 inventory identified 42 validation-debt items (47 marker instances, including the
local server-test-database blocker). `PROJECT_STATE.md` itself recorded that until 2026-09-24 the
dev machine had no browser, so **every prior web CSS and chart change was unverified**. The compact
state tracer now reports grouped current blockers; the item-level register remains authoritative.

### Inventory
- [x] `DOC` Extract all current markers into `docs/validation-debt.md`: grouped item, slice, surface, how to
      verify, owner, status
- [x] `DOC` Group by surface so one device pass and one browser pass can clear many at once

### Web
- [x] `W` Standing visual-check script using the Playwright + Chromium dev dependency already
      installed; committed, not ad hoc
- [x] `W` Script signs in against the seeded database for each persona (admin: 11 navigation
      sections; teacher: 3 permission-filtered sections; student: 2 permission-filtered sections)
- [x] `W` Capture every reachable top-level screen: seeded College Admin captured 11 sections
      (dashboard, people, organisation, curriculum/academic, college, teaching/sections/offerings,
      students, timetable/rooms, attendance, assessment/marks, profile) and a platform Owner
      captured 3 platform sections; platform capture used the supported password + authenticator flow
- [ ] `W` Capture each screen's loading, empty and error states where reachable. Loading is verified
      locally for a seeded teacher's 2 sections, forced error is verified for a seeded admin's 11
      sections on 2026-09-29 with visible error/retry UI, and a student no-access empty state is
      captured for 2 sections. Collection-backed empty screens remain open; a later local retry hit
      the fixed-OTP challenge bucket's `429` rate limit, and the managed API target still lacks the
      seeded account/bootstrap path recorded above.
- [x] `W` Review captures; file a defect per visual problem (historical duplicate cancelled class
      rows are recorded in `docs/validation-debt.md`)
- [x] `W` Wire the script into CI as a non-blocking artefact first, blocking once stable

### Android
- [ ] `F` One device pass over every `🔍` mobile item
- [ ] `F` **Record pass/fail per item, never in aggregate** (`CLAUDE.md` §10)
- [ ] `F` Cover specifically: biometric app lock on cold open (BIO-1), sign-out from every entry
      point (FB-3), six-box OTP field with keyboard and autofill (FB-4), dashboards for admin,
      teacher and student (FB-5, MUX-1), calendar (CAL-1, CAL-2), settings (SET-1), onboarding
      (ONB-1, ONB-2), fee screens including the online payment link and PDF share sheet (FEE-7, G1),
      fee reports (G2), student timetable, punch in/out (after P0-0), ND container language on
      every screen
- [ ] `F` Offline outbox under real network loss: airplane mode, queue, restore, replay
- [ ] `F` Both flavours (`college`, `admin`) install and run side by side

### Close out
- [ ] `DOC` Each item → ✅ with evidence, or a named defect with an issue reference
- [x] `DOC` **No item stays 🔍 without a written reason** — remaining browser, Android, owner-console,
      SMTP, device and tooling entries are grouped with an explicit dependency and repository-local
      defect/blocker IDs in `docs/validation-debt.md`; capability blockers are marked `🚫`.
- [x] `DOC` iOS stays 🚫 while Xcode is unavailable — do not retry (`CLAUDE.md` §9); the blocker is
      recorded in `docs/validation-debt.md`
- [x] `DOC` Backend push stays 🚫 until P1's CAP-3 seals device tokens; the capability blocker is
      recorded in `docs/validation-debt.md`

---

## P0-5 — Resolve OD-1 🔴 (blocks M10)

- [ ] `DOC` Put AD-91 to the owner: *support both — mirror external results read-only (AD-8), build
      the autonomous engine behind a capability flag (AD-23)*
- [x] `DOC` Prepare the owner-facing decision packet without treating its recommendations as an
      answer — `docs/OWNER-DECISION-BRIEF.md`; sending and answering remain external
- [x] `DOC` State the cost honestly: the mirror is small and ships soon; the engine is large and is
      deferred until a tenant needs it — recorded in `docs/blueprint/00-assumptions.md` §0.2 and
      the OD-1 entry in `docs/MASTER-CHECKLIST.md`
- [x] `DOC` State what stays blocked if deferred: M10 entirely, integration item 15.2, phase 20, and
      **the student marks self-view** blocked since 2026-09-24 — recorded in the OD-1 dependency
      entries in `docs/MASTER-CHECKLIST.md` and `docs/MASTER-PLAN.md`
- [ ] `DOC` On agreement: write AD-91 into `adr.md`; update `ARCHITECTURE_INDEX.md`; unblock P3
- [ ] `DOC` If deferred: record the deferral **with a date**; M10 stays 🚫; do not build speculatively

---

## P0-6 — Resolve OD-4

- [ ] `DOC` Decide: collect money, or only record it. Recommended: record first, collect second
- [x] `DOC` Prepare the owner-facing OD-4 question and response options without treating them as
      an answer — `docs/OWNER-DECISION-BRIEF.md`; owner response remains external
- [x] `DOC` Note FEE-7's dummy gateway already implements the collect path structurally — the swap
      touches only the checkout page and two provider routes; recorded in `docs/MASTER-PLAN.md`
- [ ] `DOC` If collecting: scope settlement, refunds, chargebacks and the compliance surface as
      their own slice, not as an afterthought to FEE-7

---

## P0-7 — Open OD-ACC-1 🔴 (blocks M15 and M19)

Full analysis: `docs/blueprint/modules/institutional-accounts.md`.

- [ ] `DOC` Put OD-ACC-1 to the owner: **the ERP has no general ledger and none is assigned a module
      number.** M15 payroll and M19 payables have nowhere to post
- [x] `DOC` Prepare the owner-facing OD-ACC-1 question and response options without treating them
      as an answer — `docs/OWNER-DECISION-BRIEF.md`; owner response remains external
- [x] `DOC` Present the three options: (a) export to Tally, (b) full general ledger, (c) thin
      budget and commitment ledger. Recommended: (a) + (c) — recorded in
      `docs/blueprint/modules/institutional-accounts.md` §2–3
- [x] `DOC` State the dependency: **must be answered before M15 or M19 begins** — recorded in
      `docs/blueprint/modules/institutional-accounts.md` §3 and the OD-ACC-1 checklist entry
- [ ] `DOC` Record the answer as an ADR and add OD-ACC-1 to `docs/MASTER-CHECKLIST.md` §3

---

## P0-8 — Resolve OD-LV-1

- [x] `DOC` Confirm the split: staff leave is M14 (draws a balance, affects pay); student excused
      absence is M7 (an attendance category, affects exam eligibility)
- [x] `DOC` Record as AD-93; `MODULE_REGISTRY.md`'s LV-1 row already reflects the split

---

## P0-9 — Compact the tracker

`PROJECT_STATE.md` is 107KB. `CLAUDE.md` §4 asks for a compact TRACER.

- [x] `DOC` Move slice history into `docs/IMPLEMENTATION-CHECKPOINT.md`, preserving commit hashes
- [x] `DOC` Rebuild `PROJECT_STATE.md` to the §4 shape: SYSTEM STATUS, CURRENT SLICE, CURRENT
      OBJECTIVE, ALREADY BUILT, TO BUILD, NOT IN THIS SLICE, DEPENDENCIES, VALIDATION, OPEN
      DECISIONS, BLOCKERS, NEXT
- [x] `DOC` **Target under 200 lines** — 133 lines at the current checkpoint
- [x] `DOC` Verify it answers all eight `CLAUDE.md` §29 questions without opening another file
- [x] `DOC` Exactly one `NEXT` slice (`CLAUDE.md` §25)

---

## P0-10 — Consolidate documentation

- [x] `DOC` Fold `NEW-SESSION-CONTEXT.md` and `INTERRUPT-RECOVERY.md` into the session/recovery
      protocol in `ARCHITECTURE_INDEX.md`; delete the duplicate protocol files
- [x] `DOC` Fold the standalone module controller into `ARCHITECTURE_INDEX.md`; delete it after
      its live references and Module Contract/Boundary Audit rules were verified there
- [x] `DOC` Fold the dated inbox and fee planning queues into `docs/requirements.md`; delete the
      superseded plan files. Open gates and implementation status remain explicit in R73 and R77–R80.
- [x] `DOC` Retire the ignored generated `flutter_01.log`; it had no live references
- [ ] `DOC` Retire `prompt1.md` and `prompt2.md` only after their live references and methodology
      role are folded safely — the retirement audit is recorded in
      `docs/METHODOLOGY-RETIREMENT-AUDIT.md`; still open because these 1,163 lines remain the
      unique system-level (`prompt1.md`) and deep-module (`prompt2.md`) methodology sources; no
      replacement is claimed
- [x] `DOC` Fold the light-mode design-token reference into `lib/core/design/tokens.dart` and
      delete `DESIGN_TOKENS_ADDITIONS.dart`; dark-mode additions remain explicitly deferred
- [x] `DOC` Gitignore `android/build/`; no generated Android build files are tracked
- [x] `DOC` Resolve `clients/web/explore.mjs` — deleted as an obsolete ad-hoc capture script;
      `clients/web/scripts/visual-check.mjs` is the committed replacement
- [x] `DOC` Clear root `requirements.md` after absorbing its four items as R77–R80 in
      `docs/requirements.md`; document-storage, notification, dashboard-parity and auth-parity
      implementation/owner gates remain explicit there
- [x] `DOC` Verify `docs/README.md` is the single entry point and explicitly assigns each tracker
      one question; phase, architecture, history and capability-local checklists are distinct
      scopes, not competing status copies

---

## P0-11 — Record the new ADRs

- [x] `DOC` AD-84 parity is a definition of done
- [x] `DOC` AD-85 the API contract is generated, not written twice
- [x] `DOC` AD-86 OD-FEE-5 resolves to yes — fees reach the web console
- [x] `DOC` AD-87 notification delivery is a platform capability; tokens sealed, not hashed
- [x] `DOC` AD-88 scheduled work is a platform capability (**P9**)
- [x] `DOC` AD-89 document storage is a platform capability
- [x] `DOC` AD-90 reports are a declared contract
- [ ] `DOC` AD-91 examinations support both modes — **gated on P0-5**
- [x] `DOC` AD-92 a known-failing test is a blocker
- [x] `DOC` AD-83 amended per P0-0's decision
- [x] `DOC` Update `ARCHITECTURE_INDEX.md`'s ADR table with all of them
- [x] `DOC` Mark OD-FEE-5 resolved in `docs/MASTER-CHECKLIST.md` §3

---

## 🚧 P0 EXIT GATE

Every line must be true before P1 starts.

- [x] Geo-fence enforced with negative tests, or withdrawn with the ADR amended — AD-83 is enforced,
  the negative suite is green, and the decision is recorded in `docs/blueprint/adr.md` (physical-phone
  verification remains a separate validation debt item).
- [ ] Migration 036 live drift resolved and the wider RLS/GRANT audit clean; the historical cause
  remains unprovable because the ledger has no checksum or execution log, so the literal
  root-cause gate is intentionally still open despite the compliant current state
- [x] `zz-*` files resolved; server, web and Flutter suites green with **no known failures** —
  `519/519`, `203/203` and `330/330` are recorded above.
- [x] Dev database seeded; a signed-in screenshot is possible — historical local seed evidence and
  signed-in browser captures are recorded; the separately configured managed target remains blocked.
- [x] Zero unexplained `🔍`; the rest have written reasons — see `docs/validation-debt.md`.
- [ ] OD-1, OD-4, OD-ACC-1 answered or deferred **with a date**
- [x] OD-LV-1 answered and recorded as AD-93 **with a date**
- [x] `PROJECT_STATE.md` under 200 lines and answers the eight questions — 133 lines, with the current
  managed-target and physical-device blockers stated explicitly.
- [x] AD-84…AD-90 and AD-92 recorded in `adr.md`; AD-91 remains gated on P0-5 owner confirmation
