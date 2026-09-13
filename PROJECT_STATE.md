# Project State

Updated 2026-09-13. Compact, repository-oriented. Details live in the files named here.

## TRACER

### SYSTEM STATUS
- Foundation (S1): ✅
- Identity & Authority (M1): ✅
- Academic Structure and Curriculum (M2): ✅
- Section, Offering, Instructor assignment (M3): ✅
- Teaching Delivery (M4): ✅
- Student Records (M5): ⚠️ minimum roster only; no admissions, no student accounts
- Attendance (M6): ✅ corrections by permission; approval workflow ❌
- Internal Assessment (M7): ✅ verify and correct by permission; approval workflow ❌
- Offline Outbox slice 1, idempotency (AD-58): ✅
- Offline Outbox slice 2, durable queue (AD-59): ✅ code, ✅ unit tests, ✅ Android real-device replay and conflict, 2026-09-13
- Android runtime: ✅ build, launch, API, Firebase, Crashlytics init, Remote Config, FCM registration and revocation (2026-09-13); push delivery 🔍 console, 🚫 backend (Drift 6)
- Platform Administration: ⚠️ PARTIAL. S1/S2 ✅; SA-1 ✅; SA-2 ✅; SA-3 ✅; SA-4a ✅ (023 on Supabase by hand, untracked; local at 024); SA-5 ❌
- Approvals capability (P1): ❌ not specified
- Mobile dashboard + light theme (MUX-1, AD-67): ✅ code, ✅ tests, ✅ APK builds; 🔍 visual check on the phone
- Dev database on Supabase (ENV-2, AD-68): 🟡 tooling ✅ tested; 🚫 schema rebuild awaits the owner (destructive on an external service)
- College branding + college-code-first app (BR-1, AD-70): ✅ server, ✅ web, ✅ Flutter, ✅ tests, ✅ APK builds; 🔍 on the phone
- Operator password for platform accounts, dev only (OPS-1, AD-71): ✅; `owner@nirvok.com` set on local
- Student role and student experience: ❌ (the prototype's attendance %, fees and circulars screens depend on it)
- Examinations, Results (M10): 🚫 OD-1
- iOS validation: 🚫 Xcode not installed
- Backend push delivery: 🚫 Drift 6, tokens stored hash-only

### CURRENT SLICE
Just done (2026-09-13): BR-1 ✅ and OPS-1 ✅. ENV-2 🟡 below still awaits the owner's rebuild.
- **BR-1 (R51, AD-70, migration 024):** the app opens on the college code
  (`lib/features/auth/presentation/college_code_screen.dart`); `GET /v1/public/colleges/:code`
  returns name, logo URL and colour, one identical 404 for unknown/suspended/closed; sign-in and the
  dashboard show the college's logo and name; its colour becomes the accent only at 4.5:1 with
  white. Set by the platform (provisioning, college drawer "Branding") and the College Admin (web
  "College" page, `/v1/college/profile`), version-pinned, audited `institution.branding_changed`.
- **OPS-1 (AD-71):** `npm run platform:set-password` (dev only, policy-checked, audited, password
  from the environment, authenticator untouched). Used for `owner@nirvok.com` on local.

ENV-2 🟡 — Supabase as the development and app-testing database (R49, AD-68; tooling `5772603`). Node API unchanged;
production stays on our own Node + PostgreSQL; `npm test` stays on local `college_erp_test`.
- Found 2026-09-13: Supabase reachable through its pooler; its `public` schema is untracked (no
  `schema_migrations`, 022's table missing), 39 empty tables plus 3 seeded role definitions.
  Backup of that data and inventory: session scratchpad `supabase-backup-2026-09-13/`.
- Built: `npm run db:supabase:rebuild -- --confirm "REBUILD <ref>"`
  (`server/scripts/supabase-dev-rebuild.ts`, helpers `src/infrastructure/db/supabase-dev.ts`).
  Refuses in production, without the phrase, or if any table holds non-seed data; clears public,
  provisions roles, migrates, checks the app role connects, rewrites `server/.env` (`LOCAL_*` kept).
- **Owner action:** run the rebuild (Claude Code's auto mode refused the drop on an external
  database). Then `npm run dev`, move `.device-test.local.json` aside, `npm run seed:device-test`.
- Until then `server/.env` still points at local `college_erp_dev`.

Previous: MUX-1 ✅ DONE (R48, AD-67, commit `649a45b`): the mobile home is a dashboard in the prototype's
style (`assets/*.jpeg`); bottom navigation removed; light theme only.
- `lib/features/dashboard/`: greeting, headline numbers, the class now and next, a "waiting on you"
  card for unmarked classes, a four-week teaching-record ring, a week-ahead bar chart, courses.
- Charts are native (`lib/core/widgets/charts.dart`), with screen-reader labels; no new package.
- Schedule, courses, people, organisation and account are pushed routes, each shown only with its
  permission. The offline banner moved to `MaterialApp.builder` so it shows over every route.
- No server change: `/me/sessions` and `/me/teaching` only. Earlier: SA-4a (`05a34d3`); the owner
  ran `023_seat_limits.sql` on Supabase (2026-09-13), which the rebuild re-applies, tracked.

### NEXT SLICE — ST-1: student accounts and "My attendance" on mobile
- **Why next:** the owner asked to complete the app from the prototype, and all three prototype
  screens (attendance %, fees, circulars) are student surfaces. Attendance data already exists
  (M6); only the student role, the account and a self-scoped read are missing. Fees (D1) and
  circulars (no module) come later. Drift 6 stays ready and unblocked.
- **To build:** the student's account linked to the M5 student; `GET /me/attendance` summarised
  per subject; the prototype's attendance screen and a student dashboard.
- **Decided (AD-69):** College Admin onboards one person at a time (no bulk); a student activates
  with college code + enrolment number + a one-time code (hash-only, expiring, printable), then a
  password; each student account takes a seat. Teachers keep the email invitation.
- **Needs first:** ENV-2 finished (the rebuild), so ST-1 is built and tried on Supabase.

### OPEN DECISIONS (relevant)
| ID | Question | Why it matters | Affects | Options | Status |
|---|---|---|---|---|---|
| OD-SA-1 | What does "suspended" mean for a college's users? | Live sessions end or turn read-only | SA-1 | — | ✅ Resolved as AD-60: refused entirely |
| OD-SA-3 | Second factor for platform accounts | — | SA-3 | — | ✅ Resolved as AD-62: TOTP authenticator app |
| OD-SA-5 | How the server stores a secret it must read back | — | SA-3b | — | ✅ Resolved as AD-63 |
| OD-SA-4 | What a seat is | — | SA-4 | — | ✅ Resolved as AD-65 |
| OD-ENV-1 | Which database is development's source of truth | — | Development | — | ✅ AD-66 (local), superseded by AD-68: Supabase for dev and app testing |
| OD-SA-6 | Minimum number of active Owners beyond "never zero" | A single Owner is a single point of failure | Platform administration | Keep "never zero"; require two | Open, blocks nothing |
| OD-SA-2 | Retention and export for a closed college | Data protection duty | Export, retention | Fixed period; per contract | Open; close shipped without export or deletion |
| OD-1 | Examinations model | Blocks M10 | M10 | See MASTER-CHECKLIST | Open |
| OD-ST-1 | How a student gets an account: who issues it, how they sign in, does it take a seat (AD-65) | Identity, seats, data protection | ST-1 | — | ✅ Resolved as AD-69: admin-issued, enrolment number + one-time code, takes a seat |

### BLOCKERS
Supabase schema rebuild (owner runs or approves it; ENV-2). Xcode (iOS, deferred). Drift 6
(backend push delivery). OD-1 (M10).

## 1. Modules
M1–M7 built (see `MODULE_REGISTRY.md`). Offline outbox: slice 1 (AD-58) committed; slice 2, the
durable encrypted queue (AD-59), implemented and unit-tested (`a4f9622`). Real-device
validation BLOCKED at step 1 on 2026-09-13: no Android device connected (adb lists none, even
after an adb restart). Test data is seeded and verified over the API.
Platform administration: S1/S2 provisioning only; see `docs/blueprint/capabilities/platform-administration.md`.

## 2. Decisions
AD-1…AD-66, all in force. AD-65 implemented by SA-4a (migration 023 pending application). Index: `ARCHITECTURE_INDEX.md`.

## 3. Database
Migrations `001`–`022` applied on `college_erp_dev`, confirmed by the owner. Local `college_erp_dev`: `001`–`024` applied; 023 and 024 by `npm run migrate` on 2026-09-13.
Supabase: 023 was run there by hand (untracked, trigger verified); the rebuild applies `001`–`024`
tracked.
Supabase's `SUPABASE_DB_URL` password ends in an unencoded `@`: psql cannot parse it, the rebuild's
URL parser reads it correctly (tested).
Supabase (AD-68): stale untracked schema, to be rebuilt with all of `001`–`023` by
`npm run db:supabase:rebuild`; no data of anybody's there (3 seeded role definitions).

## 4. Commits (newest first)
```
5772603 Prepare ENV-2: Supabase for development, onboarding decided (AD-68, AD-69)
649a45b Build MUX-1: a dashboard home in place of bottom navigation, light theme only
05a34d3 Build SA-4a: plan and seat limits with a database-enforced seat check
7b1842f Design the durable outbox and propose the encrypted local store
71765a1 Register com.nirvok.collegeErp in Firebase and validate on a real phone
052e0eb Record outbox slice one in the checkpoint and requirement R40
e15590f Make teacher field writes replay-safe: outbox slice one
9180c3f Build internal assessment: the plan, the mark sheet, and corrections
6ac3683 Keep the web/** analyzer exclusion as the owner decided
```
Tests: 412 backend, 193 web, 156 Flutter, all passing.

## 5. Blockers
- iOS: Xcode not installed (Command Line Tools only).
- Push delivery from the backend: tokens stored hash-only (Drift 6). Console send only.
- M10 examinations/results: OD-1.

## 6. Open decisions
OD-1 (examinations model), OD-4, Drift 6 resolution (recoverable push token), approvals P1 spec
(checklist 7.4), student role and account issuance, OD-SA-1…4 (platform administration).

## 7. Next slice
1. When the phone is connected: AD-59 device validation (steps in `docs/12-mobile-platform-config.md`),
   using `npm run seed:device-test` data; credentials in `server/.device-test.local.json`.
2. Next capability: **SA-1 Tenant lifecycle** (platform-administration.md §5), after OD-SA-1.

## 8. Inspect before continuing
`docs/blueprint/capabilities/offline-outbox.md` §7, `lib/core/outbox/`, `lib/core/di/outbox_setup.dart`,
`test/core/outbox/outbox_test.dart`, `docs/12-mobile-platform-config.md` device table.

## 9. Known inconsistencies and risks
- `server/.env` still names local `college_erp_dev` for both roles until the Supabase rebuild runs
  and rewrites it (AD-68); `SUPABASE_POOLER_DATABASE_URL` (erp_app) and `SUPABASE_DB_URL` (postgres)
  are its inputs. The direct `db.<ref>.supabase.co` host does not resolve from here; the pooler does.
- On Supabase, no platform Owner exists after the rebuild. `seed:device-test` creates one
  (`owner+device-test@…`, credentials in `.device-test.local.json`); there is no first-Owner CLI.
- After reconnecting, the outbox honours its backoff (up to 10 minutes) until the teacher taps
  "Send now", because the app has no connectivity listener. Observed on device; by design today.
- Firebase console test sends need the owner's console access; not yet done.
- `IMPLEMENTATION-CHECKPOINT.md` calls S2 "Super Admin console — COMPLETE". It covers sign-in and
  provisioning only; tenant lifecycle, audit view, platform roles and impersonation are missing.
- The seat limit is stored and never enforced (SA-4).
- College status is cached up to 15 s per server process; another process lags by at most that.
- Outbox deviations from its §7 design, recorded there: no roster cache (§7.2), so a register
  cannot be opened for the first time offline; no coalescing, since every queued write was
  already attempted online; transport failures retry indefinitely at 10 minutes, only 5xx parks.
- A queued "taught" shows in the schedule's waiting bar, not on its row, until it is sent.
- Queued writes of a person whose session expired stay dormant, encrypted, until they sign in
  again; another person on the device can neither see nor send them.
- `google-services.json` still lists the retired `com.example.college_erp` client.
- The dashboard's "now / up next" reads the device clock at load; it updates on pull-to-refresh
  or on returning from another screen, not on a timer.
- `AppTheme.dark()` builds but is not wired (AD-67); re-enable with `darkTheme:` in `app.dart`.
- No request rate limiting anywhere in the API; the public college lookup (AD-70) makes that
  visible. Accepted for development; to close before production.
- A college logo is an https link until the storage port (Cloudinary) exists; the app falls back
  to initials when it fails to load.
- `owner@nirvok.com` has a known password on local only; on Supabase it does not exist until an
  Owner creates it in the console (or run OPS-1 there after it exists).
- `server/.env.example` has an uncommitted edit containing the real Supabase password; it must
  go back to the placeholder and never be committed.
- The dev server on port 3000 was restarted from a Claude session; restart `npm run dev` in a
  terminal to own it.
