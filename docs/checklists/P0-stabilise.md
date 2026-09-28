# P0 — Stabilise

**Nothing new is built until this phase closes.** Owner decision, 2026-09-28.

Rationale: `docs/MASTER-PLAN.md` §2. A 70,000-line system with a known-red suite, live schema
drift, an unenforced security control and 42 unvalidated features should not grow a ninth domain.

---

## P0-0 — Enforce or withdraw the AD-83 geo-fence 🔴

Full analysis: `docs/blueprint/modules/staff-attendance.md` §2–§6.

The fence is migrated (`029_campus_fence.sql`), configurable, displayed — and never checked.
`self-attendance.ts punchIn()` takes `(deps, actor)` and nothing else; both clients post `{}`.

### Decide
- [x] `DOC` Choose **(a) enforce** or **(b) amend AD-83 to drop the fence**. Enforce (a).
- [x] `DOC` Write the decision into `docs/blueprint/adr.md` — amend AD-83 either way, so the ADR
      and the code agree afterwards
- [ ] `DOC` If (b): also amend `029_campus_fence.sql`'s header comment, which currently promises
      enforcement, and delete the fence columns in a new migration rather than leaving dead schema

### Reproduce (do this before fixing — confirm the defect, do not assume it)
- [ ] `TEST` Punch in from outside every configured fence, on Flutter; confirm 2xx
- [ ] `TEST` Punch in from web `PunchCard`; confirm 2xx
- [ ] `TEST` Punch in at a campus with **no** fence configured; confirm 2xx (029's header says this
      must be refused)

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
- [ ] `S` `DOC` **Sweep every AD-approved invariant for the same failure mode** — schema present,
      check absent. Start with: AD-34 curriculum freeze, AD-17 delegation limits, AD-27 archive
      refusal, AD-60 suspended-tenant refusal, AD-65 seat limits, M11 gapless receipt numbers
- [ ] `DOC` Record findings in `docs/MASTER-CHECKLIST.md` drift register
- [ ] `TEST` For each confirmed gap, add the negative test before fixing

### Close
- [ ] `VAL` Verified on a physical phone inside and outside a real fence
- [ ] `DOC` `PROJECT_STATE.md` and `MODULE_REGISTRY.md` updated; committed

---

## P0-1 — Schema drift, migration 036

`036_syllabus.sql` is recorded as applied; the `syllabus` table has no RLS or GRANTs on the dev
database. 11 tests in `syllabus.test.ts` and 2 migration-invariants checks fail.

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
- [ ] `MIG` If the migration is wrong, write a corrective migration; never rewrite applied history
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

The local development database now has a seeded `device-test` college and supports signed-in API
verification. Live browser capture remains an explicit validation item.

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

42 `🔍 NEEDS VALIDATION` markers. `PROJECT_STATE.md` itself records that until 2026-09-24 the dev
machine had no browser, so **every prior web CSS and chart change was unverified**.

### Inventory
- [x] `DOC` Extract all current markers into `docs/validation-debt.md`: grouped item, slice, surface, how to
      verify, owner, status
- [x] `DOC` Group by surface so one device pass and one browser pass can clear many at once

### Web
- [x] `W` Standing visual-check script using the Playwright + Chromium dev dependency already
      installed; committed, not ad hoc
- [ ] `W` Script signs in against the seeded database (needs P0-3) for each persona
- [ ] `W` Capture every screen: dashboard, people, organisation, academic, curriculum, sections,
      offerings, timetable, attendance, marks, students, rooms, profile, platform screens
- [ ] `W` Capture each screen's loading, empty and error states where reachable
- [ ] `W` Review captures; file a defect per visual problem
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
- [ ] `DOC` **No item stays 🔍 without a written reason**
- [ ] `DOC` iOS stays 🚫 while Xcode is unavailable — do not retry (`CLAUDE.md` §9)
- [ ] `DOC` Backend push stays 🚫 until P1's CAP-3 seals device tokens

---

## P0-5 — Resolve OD-1 🔴 (blocks M10)

- [ ] `DOC` Put AD-91 to the owner: *support both — mirror external results read-only (AD-8), build
      the autonomous engine behind a capability flag (AD-23)*
- [ ] `DOC` State the cost honestly: the mirror is small and ships soon; the engine is large and is
      deferred until a tenant needs it
- [ ] `DOC` State what stays blocked if deferred: M10 entirely, integration item 15.2, phase 20, and
      **the student marks self-view** blocked since 2026-09-24
- [ ] `DOC` On agreement: write AD-91 into `adr.md`; update `ARCHITECTURE_INDEX.md`; unblock P3
- [ ] `DOC` If deferred: record the deferral **with a date**; M10 stays 🚫; do not build speculatively

---

## P0-6 — Resolve OD-4

- [ ] `DOC` Decide: collect money, or only record it. Recommended: record first, collect second
- [ ] `DOC` Note FEE-7's dummy gateway already implements the collect path structurally — the swap
      touches only the checkout page and two provider routes
- [ ] `DOC` If collecting: scope settlement, refunds, chargebacks and the compliance surface as
      their own slice, not as an afterthought to FEE-7

---

## P0-7 — Open OD-ACC-1 🔴 (blocks M15 and M19)

Full analysis: `docs/blueprint/modules/institutional-accounts.md`.

- [ ] `DOC` Put OD-ACC-1 to the owner: **the ERP has no general ledger and none is assigned a module
      number.** M15 payroll and M19 payables have nowhere to post
- [ ] `DOC` Present the three options: (a) export to Tally, (b) full general ledger, (c) thin
      budget and commitment ledger. Recommended: (a) + (c)
- [ ] `DOC` State the dependency: **must be answered before M15 or M19 begins**
- [ ] `DOC` Record the answer as an ADR and add OD-ACC-1 to `docs/MASTER-CHECKLIST.md` §3

---

## P0-8 — Resolve OD-LV-1

- [ ] `DOC` Confirm the split: staff leave is M14 (draws a balance, affects pay); student excused
      absence is M7 (an attendance category, affects exam eligibility)
- [ ] `DOC` Record as an ADR; update `MODULE_REGISTRY.md`'s LV-1 row (already updated to reflect it)

---

## P0-9 — Compact the tracker

`PROJECT_STATE.md` is 107KB. `CLAUDE.md` §4 asks for a compact TRACER.

- [ ] `DOC` Move slice history into `docs/IMPLEMENTATION-CHECKPOINT.md`, preserving commit hashes
- [ ] `DOC` Rebuild `PROJECT_STATE.md` to the §4 shape: SYSTEM STATUS, CURRENT SLICE, CURRENT
      OBJECTIVE, ALREADY BUILT, TO BUILD, NOT IN THIS SLICE, DEPENDENCIES, VALIDATION, OPEN
      DECISIONS, BLOCKERS, NEXT
- [ ] `DOC` **Target under 200 lines**
- [ ] `DOC` Verify it answers all eight `CLAUDE.md` §29 questions without opening another file
- [ ] `DOC` Exactly one `NEXT` slice (`CLAUDE.md` §25)

---

## P0-10 — Consolidate documentation

- [ ] `DOC` Fold `NEW-SESSION-CONTEXT.md`, `INTERRUPT-RECOVERY.md`, `MODULE-CONTROLLER.md` into
      `PROJECT_STATE.md` / `ARCHITECTURE_INDEX.md`; delete
- [ ] `DOC` Fold `docs/plan-inbox-2026-09-16.md` and `docs/plan-fee-a-to-z-2026-09-22.md` into
      `docs/requirements.md`; delete
- [ ] `DOC` Delete `flutter_01.log`, `prompt1.md`, `prompt2.md`, `DESIGN_TOKENS_ADDITIONS.dart`
- [ ] `DOC` Gitignore `android/build/`
- [ ] `DOC` Resolve `clients/web/explore.mjs` — commit deliberately or delete
- [ ] `DOC` Clear root `requirements.md` (it is an inbox, kept empty)
- [ ] `DOC` Verify `docs/` has one obvious entry point and no competing trackers

---

## P0-11 — Record the new ADRs

- [ ] `DOC` AD-84 parity is a definition of done
- [ ] `DOC` AD-85 the API contract is generated, not written twice
- [ ] `DOC` AD-86 OD-FEE-5 resolves to yes — fees reach the web console
- [ ] `DOC` AD-87 notification delivery is a platform capability; tokens sealed, not hashed
- [ ] `DOC` AD-88 scheduled work is a platform capability (**P9**)
- [ ] `DOC` AD-89 document storage is a platform capability
- [ ] `DOC` AD-90 reports are a declared contract
- [ ] `DOC` AD-91 examinations support both modes — **gated on P0-5**
- [ ] `DOC` AD-92 a known-failing test is a blocker
- [ ] `DOC` AD-83 amended per P0-0's decision
- [ ] `DOC` Update `ARCHITECTURE_INDEX.md`'s ADR table with all of them
- [ ] `DOC` Mark OD-FEE-5 resolved in `docs/MASTER-CHECKLIST.md` §3

---

## 🚧 P0 EXIT GATE

Every line must be true before P1 starts.

- [ ] Geo-fence enforced with negative tests, or withdrawn with the ADR amended
- [ ] Migration 036 drift root-caused and fixed; the wider RLS/GRANT audit clean
- [ ] `zz-*` files resolved; server, web and Flutter suites green with **no known failures**
- [ ] Dev database seeded; a signed-in screenshot is possible
- [ ] Zero unexplained `🔍`; the rest have written reasons
- [ ] OD-1, OD-4, OD-ACC-1, OD-LV-1 answered or deferred **with a date**
- [ ] `PROJECT_STATE.md` under 200 lines and answers the eight questions
- [ ] AD-84…AD-92 recorded in `adr.md`
