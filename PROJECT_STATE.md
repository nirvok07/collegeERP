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
- Platform Administration: ⚠️ PARTIAL. S1/S2 ✅; SA-1 ✅; SA-2 ✅; SA-3 ✅; SA-4a ✅; SAM-2b ✅, SAM-3 ✅ (all in the Super Admin app); SA-5 (impersonation) ❌
- Approvals capability (P1): ❌ not specified
- Mobile dashboard + light theme (MUX-1, AD-67): ✅ code, ✅ tests, ✅ APK builds; 🔍 visual check on the phone
- Dev database on Supabase (ENV-2, AD-68): ✅ rebuilt 2026-09-14 (all 24 migrations, tracked); `server/.env` points at Supabase; Owner `nirvokofficial@gmail.com` created there
- Dev server starts by itself (ENV-3, 2026-09-15): ✅ `scripts/dev-up.sh` (idempotent: starts `npm run dev` detached if `/health` is silent, then `adb reverse` when a phone is on USB; log `server/dev-server.log`), `scripts/dev-down.sh`; VS Code runs it on folder open and as `preLaunchTask` of both app launches (`.vscode/`). Owner asked for Supabase-as-backend instead; not done: it would move all server logic into Edge Functions (AD-68 / docs/11-decisions keep the Node API); production hosting stays for go-live. Tested: start / rerun / stop on a spare port. 🔍 NEEDS VALIDATION: auto-run on VS Code open (needs one-time "Allow automatic tasks") and adb reverse with a phone attached.
- College branding + college-code-first app (BR-1, AD-70): ✅ server, ✅ web, ✅ Flutter, ✅ tests, ✅ APK builds; 🔍 on the phone
- Operator password for platform accounts, dev only (OPS-1, AD-71): ✅; `owner@nirvok.com` set on local
- Super admin app, flavor `admin` (SAM-1, AD-72): ✅ sign-in with authenticator, colleges list and detail, add college; ✅ tests; ✅ both APKs build; 🔍 on the phone; SAM-2a ✅ suspend/reactivate/close/reissue; SAM-2b (plan, branding) and SAM-3 (audit, accounts) ❌
- API logs via Dio interceptor (LOG-1, AD-73): ✅ debug only, secrets masked, tested
- Real super admin account (OPS-2, AD-74): ✅ `nirvokofficial@gmail.com` Owner on local; `owner@nirvok.com` disabled; authenticator app kept
- College sign-in and invitation acceptance (WEB-1 web, ACC-1 mobile, AD-75): ✅ code, ✅ tests, ✅ end-to-end handover test; 🔍 on the phone and in a browser. WID-1 (2026-09-22): web college sign-in moved off password onto the OTP flow (AD-82), matching mobile — college code + email/mobile → six-digit code, `AuthSession.requestCollegeCode`/`verifyCollegeCode` against `/v1/auth/otp/*`. Platform (Super Admin) sign-in unchanged: password + authenticator (SA-3b) on both clients. ✅ tsc clean, ✅ 202 web tests pass, ✅ seen in headless Chrome, 🔍 not seen with a live server
- College Admin onboarding on the phone (ONB-1, AD-76): ✅ appoint teacher, admit student; ✅ tests; ✅ APK builds; 🔍 on the phone; student sign-in ❌ (ST-1)
- Dashboard sliver header and Profile (UX-2, AD-77): ✅ code, ✅ tests; 🔍 on the phone
- Biometric lock on every open (BIO-1, R59, AD-78): ✅ code, ✅ tests, ✅ both APKs build; 🔍 on the phone. Owner feedback fix (2026-09-22, feedbackchanges.md #3): `AppLockPreference.settled` — the phone was asked before the saved on/off choice had even loaded (optimistic default), so a person who turned the lock off could still be asked on the next cold open. `_lockWhenSignedIn` now waits for `settled` before asking anything; `AppLockLoading` is the safe placeholder shown meanwhile. ✅ 3 new tests, ✅ 316 total pass; 🔍 on the phone
- College Admin on the phone (ADM, R66, AD-79): ADM-1 ✅ admin dashboard and change password; ADM-2 ✅ campuses and departments (add, rename, archive); ADM-3 ✅ programs, academic years and terms; ADM-4 ✅ courses and curriculum versions; ADM-5 ✅ rooms; ADM-6 ✅ sections and members; ADM-7 ✅ course offerings, teachers, enrolments; ADM-8 ✅ timetable, classes, non-teaching days; ADM-9 ✅ students; ADM-10 ✅ access and college profile; ADM-11 ✅ registers and mark verification, corrections; ✅ tests; 🔍 on the phone. Every college module is on the phone (AD-81); Super Admin app SAM-2b ✅ plan, seats, branding; SAM-3 ✅ platform accounts, audit, invitation acceptance. Every module is on the phone
- Forgotten password (PW-1, R69, AD-80): ✅ reset codes from People (app) and from the Super Admin app; redeemed in the app and on the web; ✅ tests; 🔍 on the phone; web People has no reset button yet
- Firebase (R67, R68): Core, Crashlytics, Remote Config, Messaging built and initialised on Android; 🔍 first crash report and a console test push (owner); backend push 🚫 Drift 6
- Student sign-in and "My attendance" (ST-1, AD-69, R72): ✅ server, ✅ app, ✅ tests; 🔍 on the phone; fees (D1) and circulars (no module) ❌
- Owner feedback (feedbackchanges.md, 2026-09-22) #2/#4 — saved-first reads: `fromSaved` (AD-9 amended) already covered dashboard, schedule, my-fees, my-teaching, and both onboarding forms (REF-1, confirming #4 "appoint-teacher loads the whole page" was already fixed). Extended to the remaining list/reference screens that used to call the network on every open: academic, organisation, people, rooms, all 5 fee screens (heads, requests, structures, structure detail, student fees), sections, curriculum, students, and a section's course offerings — 13 more cubits. Every post-write reload and every pull-to-refresh across them now passes `refresh: true` explicitly (`onRefresh: cubit.load` tear-offs, which silently defaulted to the cache path, were the same bug in 4 fee screens; fixed). Deliberately excluded: attendance and mark-sheet marking (live, per-session data — caching it risks marking against a stale roster) and the timetable/offering/section/version/student *detail* screens (not yet migrated; a real follow-up slice, not urgent). ✅ analyze clean, ✅ 317 tests (1 new e2e), 🔍 NEEDS VALIDATION on the phone
- Owner feedback #1 — Fee module A-Z: plan `docs/plan-fee-a-to-z-2026-09-22.md`. FEE-7 online payment ✅ built 2026-09-22 with a **dummy gateway** (owner: "razorpay abhi k liye dummy kar lo") — migration 037 (`fee_online_intents`, `payments.method` gains 'online', `received_by` nullable exactly for it); server `POST /v1/me/fees/online`, `GET /v1/me/fees/online/:id`, and the dummy provider's own hosted checkout page + `complete`/`fail` routes standing in for a signed webhook (module doc §6 shape unchanged); mobile `MyFeesScreen` gets a "Pay ... online" button (`url_launcher` added). Swapping to real Razorpay later only touches the checkout-page rendering and the two provider routes. ✅ server 5 new tests (24/24 fees.test.ts pass), ✅ Flutter analyze clean, ✅ 318 tests (1 new), 🔍 not tried on a phone. **G1 (receipt/statement PDF) ✅ built 2026-09-23** — client-render only, no new server work beyond the receipt fields already denormalized onto `payments` (§10-adjacent); `FeeDocument` (`lib/features/fees/domain/fee_document.dart`) builds a receipt (per payment, CANCELLED banner when reversed) or a statement (full invoice/payment ledger, running balance) to PDF via `pdf`; `ReceiptButton`/`StatementAction` (`fee_document_actions.dart`) hand it to the OS view/print/share sheet via `printing`; wired into `StudentFeeScreen` (Cashier/Accountant) and `MyFeesScreen` (student). ✅ Flutter analyze clean, ✅ 320 tests (2 new: Cashier and student side), ✅ server fees.test.ts unaffected/passing (full suite's only 2 failures are pre-existing, unrelated `zz-err6`/`zz-syldebug` debug tests). 🔍 NEEDS VALIDATION: OS print/share sheet on a real phone (cannot be unit-tested). Committed `d78fd90`. **G2 (reports) ✅ built 2026-09-23** — 4 read-only reports against the existing ledger (`payments`, `payment_allocations`, `invoices`, `fee_requests`), no new tables: `GET /v1/fees/reports/{collection,outstanding,defaulters,requests-register}`, behind `fee.read`. Collection groups by day/cashier/method with a reversal as its own negative line, never netted; outstanding/defaulters share one query (net of partial payments, days overdue); register joins requester/decider names. Dates UTC-normalized throughout (`AT TIME ZONE 'UTC'` explicit in the collection query — this caught a real bug where the report returned nothing near local midnight, since DB session timezone ≠ UTC). Mobile: one `FeeReportsScreen`, 4 segmented tabs, each reads its own report only when selected; dashboard tile behind `fee.read` in both tile-grid layouts. Also fixed a pre-existing gap: `migration-invariants.test.ts`'s `EXPECTED_PRIVILEGES` was missing `fee_online_intents` (left over from FEE-7, 2026-09-22) — its migration already granted correctly, only the test's declaration was stale. ✅ server 3 new tests (27/27 fees.test.ts pass), ✅ Flutter analyze clean, ✅ 323 tests (3 new). Committed `1ccb820` (server), `54f9f48` (mobile). This completes the plan's G1/G2 queue. **Discovered, not fixed (out of scope for this slice):** the dev DB has drifted from `migrations/036_syllabus.sql` — the `syllabus` table has no RLS/GRANTs applied even though the migrations table shows it as applied, breaking `syllabus.test.ts` (11 tests) and 2 migration-invariants checks; unrelated to fees, needs its own slice (re-running `npm run migrate` reports "up to date", so this needs an actual DB-state investigation, not a migration edit). FEE-7 stays on the dummy gateway (Razorpay credentials still pending). Open decision OD-FEE-5 (fees on web) unchanged: not yet
- Examinations, Results (M10): 🚫 OD-1
- iOS validation: 🚫 Xcode not installed
- Backend push delivery: 🚫 Drift 6, tokens stored hash-only
- New design container language (ND, `docs/new-design/`): ✅ spec, ✅ S1 tokens, ✅ S2 containers, ✅ S5 admin dashboard, ✅ S6 mobile rollout in code: light theme ground is neutral-50, every screen's `ListTile` rows are card rows (`AppListTile`), dashboard panels are `AppCard`, attendance/marks rosters are one card. ✅ analyze clean, ✅ 313 tests (twice), ✅ dashboards and rooms checked in test screenshots; 🔍 NEEDS VALIDATION on the phone for every screen; ✅ ND-S4 `AppSheet`: forms (`showSubmitDialog`, organisation, academic) are bottom sheets on a phone and a centred dialog from 600dp, sheet/dialog radius 24; confirmations stay dialogs; the 8 hand-built bottom sheets only got the radius; ✅ ND-S7 web parity: `--nd-*` tokens named like the Flutter `AppGeometry`; every card surface (dashboard, tables, cohorts, panes, terms, campuses, days, register rows) is borderless with the soft ND shadow at radius 16; module tiles are rows; the drawer is a 480 side panel with the 24 radius; sign-in card 24; web tests 202 pass, typecheck and build pass, sign-in seen in headless Chrome, the signed-in screens not (they need a session); other web screens keep their own layouts and the dashboard's information architecture is unchanged (ND-O3); the outbox timing test `a write waits behind an earlier one` failed once in a full run and passed on rerun (not from ND, flaky)

### CURRENT SLICE
Owner feedback, 2026-09-14 (`feedbackchanges.md`):
- FB-1 ✅ `151ec7c` People does not list the signed-in person. Flutter test.
- FB-2 ✅ `28a4060` Edit + archive for programs, academic years and terms (migration 027, applied
  to Supabase). Archive = removal (no DELETE by design); name/sequence freed for reuse. Rules: year
  dates must hold its terms; term dates fixed once a section uses it; current year / year with terms
  / anything a section uses cannot be archived; program code, department, length fixed. Server +7
  tests (incl. 403 for a teacher), Flutter +2. 🔍 NEEDS VALIDATION on the phone.
- FB-3 ✅ (2026-09-15) Sign out did nothing: Account is a pushed route and stayed above the sign-in
  screen, and sign-out waited up to 45 s for the server. Now both apps pop to home on SignedOut, the
  server revoke is not awaited, and every sign-out button (Account, No access, Super Admin colleges)
  asks "Sign out?" first (`core/widgets/confirm_sign_out.dart`; unsent writes still named). Lock-screen
  sign-out stays unconfirmed (it sits above the Navigator). Appoint teacher no longer shows an
  invitation code: "Appoint", then a message with the college code saying a sign-in code comes;
  dashboard says "N people have not signed in yet". Server still issues the unused invitation (OTP-5).
  Flutter 277/277 (+4). 🔍 NEEDS VALIDATION on the phone.
- FB-4 ✅ (2026-09-15) the sign-in code is six boxes in both apps (`core/widgets/otp_code_field.dart`:
  one invisible field over the boxes, so autofill/paste/backspace work); the last digit signs in, the
  button stays. Flutter 277/277 (sign-in test types into the boxes, checks one auto-submit).
  🔍 NEEDS VALIDATION on the phone (keyboard, SMS/email autofill).
- FB-5 ✅ (2026-09-15) a teacher's dashboard opens on the admin's two-column tile grid ("Your work":
  Schedule "N to mark", Courses "N courses", People/Organisation with person.read, Verify marks for a
  HoD, Onboarding when allowed, Profile), replacing the icon row; today's classes, week and courses
  stay below. One `_ModuleGrid` draws both dashboards and both skeletons. Admin tiles no longer
  mention passwords. Flutter 277/277. 🔍 NEEDS VALIDATION on the phone.

Owner requests, 2026-09-15 (in order of build):
- CAL-1 ✅ Academic calendar module: years, terms and holidays in one screen, managed by the College
  Admin (term.manage), read by everyone signed in to the college incl. students. Reuses
  `non_teaching_days` (AD-39/AD-46); no new table. Server ✅: `GET /v1/calendar?from&to` (college
  session only, no permission), `POST /v1/non-teaching-days` takes `to_date` (range ≤ 60 days, all or
  none, clashing day named). Flutter ✅ `features/calendar/`: month grid (holidays, term tint, today),
  "In <month>" and "Coming up" (a break of several days is one entry, with a countdown), terms; the
  College Admin adds a day or range and removes a whole break (confirmed). Tile on both dashboards,
  card on the student home. Server 468/468 (+6), Flutter 281/281 (+4). The Timetable's Holidays tab
  still edits the same rows (one source of truth; the tab may later just link here).
  🔍 NEEDS VALIDATION on the phone.
- CAL-2 ✅ (owner, 2026-09-15) the calendar is not tied to semesters, and carries events. Migration
  030 `calendar_events` (title, date, optional start/end time = full day when absent, note; removed is
  marked, never deleted; RLS; applied to Supabase). `POST|PATCH|DELETE /v1/calendar/events` (term.manage,
  audited `calendar.event_added|changed|removed`); `GET /v1/calendar` returns `events` (server still
  returns `periods`, the phone ignores them). An event does not close the day (classes still
  generated). Phone: term tint, term line and Terms list removed; events drawn as a dot, listed with
  "All day" or "11 AM – 2 PM"; "Add" sheet chooses Holiday or Event; tapping an event edits it.
  Server 475/475 (+4), Flutter 287/287.
- SET-1 ✅ Settings where the profile icon was (dashboard header, student home): Profile, App lock
  and Sign-in (informational: AD-78 lock always on, AD-82 codes), changes waiting to send, Sign out
  (confirmed). Flutter test +1. 🔍 NEEDS VALIDATION on the phone for both.
  - SET-1a ✅ (owner, 2026-09-15) the admin and teacher dashboards no longer keep their own Profile
    tile: Settings is the one door to it everywhere. `_profileTile` and its `_tileCount` entry
    removed from `dashboard_screen.dart`; dashboard test updated to assert the tile's absence.
    Flutter 288/288 (net +1 test file: `test/app/account_screen_test.dart`).
  - SET-1b ✅ (owner, 2026-09-15) Profile (`account_screen.dart`) no longer refreshes itself on
    every open, unlike the rest of AD-9 amended: it reads `/v1/auth/me` once, saves it (the existing
    saved-reads mechanism), and every later open answers from that — a pull to refresh is the one
    thing that asks again. The saved copy is cleared the same way every saved read is, at sign-in
    and sign-out (`SavedReads.clear`), so nothing of it survives a logout. New test:
    `test/app/account_screen_test.dart` (first open asks once, a second open does not, a pull does).
    🔍 NEEDS VALIDATION on the phone.
  - ONB-2 ✅ (owner, 2026-09-15) the Onboarding hub screen is gone: the admin and teacher dashboards
    show **Appoint a teacher** and **Onboard a student** as their own tiles (each present only with
    its own permission), opening `Routes.appointTeacher` / `Routes.admitStudent` directly.
    `onboarding_screen.dart` and `Routes.onboarding` removed; nothing else referenced them.
    Flutter 287/287 (the hub's own widget test removed, its permission-gating already covered by
    the dashboard tests). 🔍 NEEDS VALIDATION on the phone.
- Staff attendance (AD-83): SA-A1 ✅ campus attendance area: migration 029 (fence lat/long/radius on
  `campuses`, all three or none, radius 25–2000 m); `PATCH|DELETE /v1/campuses/:id/fence` (campus.manage,
  audited `campus.fence_set|cleared`; 0,0 and out-of-range refused); `GET /v1/campuses` returns
  `fence`. Flutter: Organisation → campus menu → "Attendance area" sheet ("Use my location" via
  `geolocator`, typed lat/long, radius slider, remove); list shows "Attendance area 200 m";
  `core/platform/current_location.dart` shared with punching; Android fine/coarse location, iOS
  when-in-use text. Server 471/471 (+3), Flutter 284/284 (+3). 🔍 NEEDS VALIDATION on the phone
  (real GPS fix, permission prompts). Migration 029 applied to Supabase 2026-09-15 (owner approved). SA-A2 ❌ punch
  in/out (online, server time, distance check, mock refused); SA-A3 ❌ my report with charts + admin
  view; SA-A4 ❌ forgotten punch → reason + time → admin approves/rejects; SA-A5 ❌ reminders as local
  notifications (backend push blocked, Drift 6).
- LV-1 ❌ Leave management for teachers and students (sick, short leave, half day; reason; apply →
  approve). OD-LV-1 ✅ resolved by the owner 2026-09-15 (record as AD-84 when LV-1 starts): a
  teacher's leave is approved by their HoD (College Admin when there is none), a student's by their
  section's teacher; the College Admin can approve any; teachers have a yearly quota per type set by
  the admin (balance shown), students none; a student's approved leave pre-fills their classes as
  Excused on the register (teacher can still change it).
- AD-83 note: `institutions.timezone` already exists (default Asia/Kolkata); the college day and the
  late time use it, so AD-83's timezone assumption is not needed.
- OTP sign-in 🟡 AD-82 approved (everyone incl. Super Admin; no passwords; fixed code 123456 on every
  server until go-live, risk accepted by owner). Slices, in order:
  - OTP-1 ✅ `adf1fe5` server: `/v1/auth/otp/request|verify` (college: email, mobile, enrolment no.)
    and `/v1/auth/platform/otp/*`; 5-min single-use hashed codes, 5 tries, 5 requests / 15 min, decoy
    for unknown identifiers (no existence disclosure); invited → active on first code; sender port
    (fixed-code sender; unconfigured sender refuses all alike); startup warning. AD-62 superseded:
    guard, /auth/me, renewal and account actions no longer need an authenticator. Migration 028
    (applied to Supabase). Server 449/449 (+10 OTP tests, platform tests rewritten).
  - OTP-2 ✅ `77975e5` college app: identifier → code (Change, Send a new code); removed the
    invitation, student-activation and change-password screens/routes, Profile's Change password,
    People's Reset password; student "Give app access" confirms access, shows no code. Flutter 269/269.
  - OTP-3 ✅ `f3152d0` Super Admin app: email → code; password, authenticator setup and invitation
    form removed. Flutter 269/269.
  - 🔍 NEEDS VALIDATION on the phone: both apps sign in with 123456; a session renews.
  - OTP-4 ✅ `265e9be` students can be admitted with a mobile (server stores it on the person);
    admit form asks for a mobile or email; appoint form says the email/mobile is where the code
    goes. Server 450/450, Flutter 270/270. Runbook 09 steps 7, 8 and 13 describe code sign-in.
    Platform accounts have no phone column: the Super Admin signs in by email only.
    **Superseded by AD-85** (owner, 2026-09-15): a student's mobile-only path is retired; email is
    now mandatory at admission and is what the sign-in code goes to. Server: `admitBody.email`
    required (was optional); `admitStudent` takes a non-null `email`. The OTP-4 mobile-only test
    replaced with one asserting admission without an email is refused (422) and sign-in is by
    email. Every server test admitting a student without an email updated to give one
    (`enrolment.test.ts`, `attendance.test.ts`, `assessment.test.ts`, `idempotency.test.ts`,
    `student-access.test.ts`). Mobile stays as an optional extra contact field, still sent and
    stored, just not a sign-in path of its own for a student. Flutter: `StudentInput`/
    `studentFormError` require a valid email; `admit_student_screen.dart` asks for email before
    the now-optional mobile. Runbook 06 and 09 updated. Server 475/475, Flutter 288/288.
    🔍 NEEDS VALIDATION on the phone.
  - OTP-5 ❌ web console to codes; remove password endpoints; real WhatsApp / SMS senders.
  - OTP-7 ✅ `488d6b2` real email codes over SMTP (nodemailer; Gmail app password / Brevo / SES / Resend by
    config: `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`). With SMTP set, email (college + Super Admin) gets a
    random code, sent, and 123456 does not open it; WhatsApp/SMS have no provider (owner's decision
    2026-09-15) and keep the fixed code, nothing sent. No SMTP → every channel fixed, as before. Send
    failures logged without code/address; answer unchanged (no existence disclosure). Server 462/462
    (+5, `tests/otp-email.test.ts`). 🔍 NEEDS VALIDATION: a real email arriving via a real SMTP account.
  - OTP-6 ✅ `9b0199b` change a person's email or mobile: `PATCH /v1/people/:id/contact`
    (account.manage), from People and from a student's record. New address works at once, old one
    stops (staff sign-in name moves with the email; live codes cancelled); duplicates refused (mobile
    by last ten digits); an account keeps an email or mobile, staff keep an email; audited. People
    list and student records carry the mobile. Server 457/457 (+7), Flutter 273/273 (+3).
  - Docs ✅ runbook START-HERE, 01, 06 and 09 describe code sign-in; 04 (web console) still passwords
    until OTP-5.
- WEB-POLISH-1 ✅ (web dark-mode toggle + branded sign-in + token hygiene) `669c779`: the console
  now has a theme toggle in the header (persists via localStorage, follows the OS until a choice);
  a remembered theme applies from first paint (main.tsx init); sign-in is a token-driven split
  panel (indigo brand hero left, the existing form card right; hero hides under 720px); raw
  #6b7280/#fff in sign-in.css tokenised. 3 new theme tests. 192 passing; build clean. 🔍 browser.
- WEB-POLISH-2 ✅ (shared page-header hierarchy + per-screen eyebrows) `45c35cd`: page titles move to
  the display scale with an optional group eyebrow (People & access / Academic / College / Platform);
  .page__head gets a bottom rule; table rows highlight on :focus-within. All 12 pages adopt it.
  192 passing; build clean. 🔍 browser.
- WID-2 ✅ (web dashboard arrangement; owner asked why the web console "isn't arranged well, unlike
  mobile"; root cause: no web home landing — the shell landed on the first nav tab) `fd5e671`:
  the web console is now dashboard-first. Home is the first signed-in tab for a college person;
  `DashboardPage` mirrors the mobile dashboard — an admin stat band from `/v1/college/overview`
  (staff, students, departments, teaching setup, pending-invitations chip), a teacher week panel
  from `/me/sessions` + `/me/teaching` (today's classes, a week-ahead sequential-bar chart using
  the new data-viz palette, my courses), and a permission-gated module grid whose gate mirrors
  `sectionsFor()` exactly. `AppShell` exposes a `ShellNav` context so a tile switches the active
  tab without threading callbacks. Data-viz palette (sequential + diverging, light + dark) added
  to `design/tokens.css`. Wired in the pre-staged `motion-one.ts` by typing its bezier easing as a
  tuple and using motion 13's `EffectTransition`, so the whole `tsc` build is green. No server
  change. Web tests 189 (+7: module-grid gate contract, overview/courses/week read mapping);
  `tsc -b` + `vite build` clean. 🔍 NEEDS VALIDATION in a browser (sign in as College Admin and as a
  teacher; tiles switch sections).
- WEB-PREMIUM-1 ✅ (web left sidebar nav, owner asked to move modules to a side panel) `a515963`:
  the module list moves from centred top tabs to a left sidebar. `.shell` becomes a 252px/1fr grid;
  a sticky sidebar holds the brand header (gradient mark + product + scope) and grouped vertical nav
  ("Modules" for a college person, "Platform" for platform items) with inline 20px stroke icons and
  section eyebrows. Active item is never colour alone (§7.8): a 3px `--primary` accent bar + filled
  fill + number kbd all persist. Responsive: ≥1024px pinned sidebar; 720–1024px collapses to a 64px
  icon rail (labels hidden, aria-label kept); <720px becomes an off-canvas drawer toggled by a
  hamburger with a scrim. Number-key switching, `ShellNav` context and dashboard `.go()` tiles
  unchanged (they call `setActive`). `shell.css` gains `--surface-side` (chrome surface) and the
  drawer exit work. `tsc -b` clean.
- WEB-PREMIUM-2 ✅ (turn on the global motion system on the shared Drawer) `722fa38`: the shared
  Drawer now closes with a brief slide back out the edge it entered from instead of an instant
  unmount (its `leaving` state was declared but unwired; the exit keyframe didn't exist). Adds
  `m-slide-out-end`, the `.drawer--exit` CSS and the JS exit phase (slide out, then unmount).
  Reduced motion collapses it to a fade via motion.css's global override. The shell section entrance
  (head rises, body staggers) already shipped in WEB-PREMIUM-1's shell.css. A `reveal.ts` JS wrapper
  was proposed in the plan but skipped — the CSS already achieves the choreography on the global
  system; a wrapper would be over-engineering (§17). Build + tests green.
- WEB-PREMIUM-3 ✅ (premium colour & depth tokens) `6bc186e`: adds `--gradient-primary`(indigo→violet)
  and `--chrome-gradient`(whisper tint) in light + both dark blocks, and defines `--shadow-elevate`
  in light too (the sidebar already referenced it but it only elevated in dark). Sidebar brand mark
  renders the gradient token; the rail layers the chrome tint over its solid surface; the dashboard
  hero figure gets a gradient text fill guarded by `@supports` (falls back to solid primary). Now no
  raw `linear-gradient` lives in components — gradients come from tokens. Build green; 192 passing
  (only known pre-existing `motion.test.ts` jsdom `node:` failure remains). 🔍 NEEDS VALIDATION in a
  browser: sidebar + motion + gradients in both themes at all breakpoints.
- WEB-POLISH-3 ✅ (sidebar items visible again + collapse/expand toggle) `afff5c6`: owner hit the
  real page and reported (a) sidebar modules not showing and (b) no way to collapse/expand. Root
  cause of (a): college module items had no `icon`/`section`, so the width-driven 64px rail showed
  only blank squares. Fixed: every college item now carries `MODULE_ICONS.*` + `section:'Modules'`.
  Root cause of (b): a 1024px breakpoint auto-collapsed the sidebar with no control. Replaced with
  an explicit persisted chevron toggle (localStorage `shell:collapsed`); the full sidebar keeps
  labels at all desktop widths; only a deliberate toggle or a ≤768px off-canvas drawer hides them.
  Active accent uses `--gradient-primary`. Build green; 192 tests pass.
- WEB-POLISH-4 ✅ (web: one premium light theme; dark toggle removed) `14831da`: owner asked to drop
  the light/dark concept and ship one premium light look. Deletes the theme system (theme.ts + test),
  the toggle, sun/moon icons and the main.tsx remembered-theme init; strips both dark token blocks so
  the palette is always light regardless of OS; base.css forces `color-scheme: light`. Palette reworked
  premium: white cards on a soft blue-violet canvas (#f5f6fb), cooler rails, deep indigo-black text
  (#1b1c2b), indigo-tinted shadows. Build green; 189 tests.
- WEB-POLISH-5 ✅ (web: always-visible collapse toggle, sidebar motion, tighter type) `7d28f02`:
  owner reported the collapse toggle wasn't discoverable, the sidebar felt unanimated and the type
  oversized. Collapse control moved from the sidebar footer into the top bar (always visible on
  desktop); small screens keep the off-canvas drawer and hide the redundant control. Sidebar mounts
  with the global stagger (`m-stagger`), and collapsing animates the grid columns (`--dur-panel`)
  instead of snap-jumping. Type scale reined in: display 32→28, headline 24→20, title-lg 20→17,
  title 16→15, label 14→13 (body stays 14). Build green; 189 tests.
- 🚫 GO-LIVE BLOCKER (AD-82): no WhatsApp/SMS senders; `OTP_FIXED_CODE=123456` lets anyone who knows
  a mobile number sign in as that person (and anyone, by email too, when SMTP is unset). Must be
  removed before any real college uses the system.

From `feedbackchanges.md` (owner, 2026-09-15), building in order: LK-1 → CR-1 → REF-1 → FEE-0…FEE-8.
- LK-1 ✅ (2026-09-15) App lock off/on in Settings (default on). Amends AD-78 ("always on").
  `AppLockPreference` (`ValueNotifier<bool>`, `core/security/app_lock_preference.dart`) backed by a
  new `SessionStore` key (`app_lock_enabled`, default true when absent); `SessionStore.clear()`
  deletes it too, so OD-LK-1 (sign-out puts it back on) holds even across a restart. `app.dart`
  wraps `AppLockGate` in a `ValueListenableBuilder` and skips it entirely when off; the `SignedOut`
  event also calls `resetOnSignOut()` so the in-memory value flips at once, not just on next read.
  Settings' static "App lock" row is now a `SwitchListTile`: turning it off asks the phone's own
  check first (`DeviceUnlock.unlock`) since disabling the lock must sit behind the lock it removes;
  turning it back on needs no check; a phone with no lock (`isAvailable() == false`) turns off
  without asking, consistent with AppLockGate's own "no lock, no lock-out" rule. Found and fixed:
  the preference's constructor read the store asynchronously and could silently overwrite an
  explicit disable()/resetOnSignOut() that happened first — fixed with a `_settled` latch so the
  first explicit value wins. Scope: the college app only; the Super Admin app's lock stays always-on
  (no Settings surface exists there to add a switch to). Flutter 292/292 (+5: `AppLockPreference`
  unit tests, two Settings widget tests for the switch). `flutter analyze` clean.
  🔍 NEEDS VALIDATION on the phone (the biometric prompt on toggle, and that a phone with a broken
  keystore still degrades to "on" rather than crashing).
- CR-1a ✅ (2026-09-15) the behaviour change, on the screens AD-9's saved-first mechanism already
  covers: dashboard, my teaching, my schedule, student home ("My attendance"), the academic
  calendar, and Profile (already done as SET-1b). Each `load({refresh})` used to show the saved
  answer and then quietly ask the network anyway; now it asks only when nothing was saved, on an
  explicit refresh (pull, or a caller passing `refresh: true` after its own write), or never for a
  plain saved-only open. Student home and the calendar had no `refresh` parameter at all (`load()`
  always hit the network); both gained one, and their `RefreshIndicator`s now pass `refresh: true`.
  Fixed while at it: `saved_reads_test.dart`'s two "a screen" tests were asserting the very
  behaviour just removed (a background refresh after a saved hit, and a plain open failing when
  offline) — rewritten to assert CR-1's rule instead. Flutter 292/292, `flutter analyze` clean.
  🔍 NEEDS VALIDATION on the phone.
- CR-1b ✅ (2026-09-15) OD-CR-1's "Updated 2 h ago" freshness line. `ApiClient.savedAt(path)`
  reads a saved entry's timestamp without touching the network; `SavedFreshness`
  (`core/widgets/saved_freshness.dart`) is the shared "Updated …" widget, `freshnessLabel` its pure
  formatter (just now / N m / N h / yesterday / N d / a date), unit-tested directly. Each of the 5
  single-read screens gained a `lastSaved`-style method on its repository (`myTeachingSavedAt`,
  `mySessionsSavedAt`, `readSavedAt`, `myAttendanceSavedAt`, `mineSavedAt` on `AuthorityApi`) and an
  `updatedAt` field on its state, set after every successful read (saved-hit or live) and shown at
  the top of the list. Every fake implementing these interfaces across the test suite updated to
  match (additive methods only, no existing signature changed). The dashboard is excluded on
  purpose: it combines three concurrent reads (sessions, teaching, overview) with no single
  freshness to show honestly; giving it one needs its own design, not a bolt-on. Flutter 294/294
  (+1: `saved_freshness_test.dart`), `flutter analyze` clean. 🔍 NEEDS VALIDATION on the phone.
- CR-1c ❌ NOT BUILT — OF-R2 (the back-office screens: people, organisation, students, sections,
  offerings, rooms, timetable, access, college profile, review lists, platform screens) currently
  have no saved-reads wiring at all, not even the old background-refresh version; giving them CR-1's
  behaviour means building AD-9's saved-first mechanism into each for the first time, not just
  changing one line in an existing `load()`. Larger than CR-1a; its own slice.
- REF-1 ✅ (2026-09-15) Appoint a teacher and Onboard a student, the two forms the owner named,
  stop reloading their picker (departments / programs) on every visit. Scope narrowed from the
  original sketch: no new `GET /v1/reference` aggregate endpoint. The existing per-resource
  endpoints (`/v1/departments`, `/v1/programs`, …) already run through `ApiClient.get`, which
  already saves every read (AD-9); a combined endpoint would need its own cross-module read model
  (institution + curriculum + teaching + delivery, like `PgCollegeOverviewReader`) and its own
  per-field permission logic, since departments need `person.read` and programs need a different
  permission — real cost for no gain when CR-1's own mechanism already solves the actual complaint.
  `AppointTeacherCubit.load`/`AdmitStudentCubit.load` gained a `refresh` parameter and the CR-1
  saved-first pattern; a failed refresh keeps the form and its list, showing the inline warning
  instead of replacing the screen. Both screens wrapped in `RefreshIndicator`. New test in
  `saved_reads_test.dart` (opens on saved departments, only a pull asks again). Flutter 293/293,
  `flutter analyze` clean. 🔍 NEEDS VALIDATION on the phone.
  NOT in this slice: campuses, rooms, academic years/terms and sections, and every other picker
  across the back-office screens — same CR-1c / OF-R2 boundary as before, since those screens have
  no saved-reads wiring at all yet.
- FEE (M11 Student Finance, D6). Pulled forward from Release two (docs/requirements.md D1).
  Online-only (AD-9: desk roles). Owner decisions 2026-09-15 (record as ADRs in FEE-0):
  - OD-FEE-1 ✅ two new college roles (migration seeding them like 002): **Accountant** (fee heads,
    structures, invoices, fines, concession/waiver requests, reports) and **Cashier** (record
    counter payments, issue/cancel receipts only). College Admin appoints them; approves requests.
  - OD-FEE-3 ✅ one structure per program + academic year; no category/quota in v1.
  - OD-FEE-4 ✅ concessions: Accountant requests, College Admin approves/rejects; only an approved
    one reduces dues. Fee-owned request state machine (requested → approved | rejected |
    withdrawn), audited; not a general approvals engine (P1 stays unspecified).
  - Late fee ✅ optional flat amount per structure, charged once an instalment is overdue.
  - Fines ✅ Accountant raises a fine on a student (amount, reason). Late fees and fines can be
    waived through the same request → Admin approval; a waiver is a credit entry, never a delete.
  - OD-FEE-2 ✅ design decided, build 🚫 BLOCKED (no Razorpay merchant account / API keys yet,
    owner 2026-09-15): paid in a web page, not in-app billing — the app opens the payment page in
    the browser (`url_launcher`); server creates the Razorpay order/payment link; the payment counts
    only on the signed webhook (server verifies), which records payment + receipt; the app
    refreshes on return. Assumption: Razorpay Payment Links (hosted page) unless the owner wants
    our own checkout page. FEE-7 stays a ❌ NOT BUILT TODO until the owner has the keys; every other
    slice does not depend on it (counter payments cover collection without it).
  Slices:
  - FEE-0 ✅ (2026-09-15) module contract, no code:
    `docs/blueprint/modules/m11-student-finance.md` — roles, ledger invariants (append-only,
    integer paise, gapless per-college receipt numbers, a mistake is a reversal), fee structure
    scope, the shared concession/waiver/fine approval state machine, and the FEE-7 payment design.
    FEE-1 builds directly on it.
  - FEE-1 ✅ (2026-09-15) roles, fee heads, fee structures. Migration 031: permissions
    (`fee.read`, `fee.manage`, `fee.collect`, `fee.approve`); **Accountant** and **Cashier** system
    role templates seeded the same way `college_admin`/`department_head`/`faculty` were (002);
    `college_admin` granted every `fee.*` permission (same move as 014 did for `student.*`);
    `fee_heads`, `fee_structures` (draft/published/superseded/discarded, one live per
    program+year), `fee_structure_instalments` (seq, due date, optional flat late fee),
    `fee_structure_lines` (head × amount within an instalment) — the same tenant-isolation RLS and
    no-DELETE pattern as every other tenant-owned table. Server: `modules/fees/` (ports,
    `manage-fees.ts`, Pg repositories, `fee-routes.ts`); `GET/POST /v1/fees/heads`,
    `DELETE /v1/fees/heads/:id`, `GET/POST /v1/fees/structures`, `GET /v1/fees/structures/:id`,
    `POST .../instalments`, `POST /v1/fees/instalments/:id/lines`,
    `POST /v1/fees/structures/:id/publish` (refuses with no instalments, or an instalment with no
    lines; irreversible once complete — same shape as curriculum's `publishVersion`). No invoices,
    payments or money yet — FEE-2 and FEE-4. Server 478/478 (+3 in `tests/fees.test.ts`: an
    Accountant manages heads and a duplicate code is refused, a Cashier reads but cannot manage
    and a teacher can do neither, a draft is refused an incomplete publish then published once
    complete and is immutable after). `npm run typecheck` clean.
  - FEE-2 ✅ (2026-09-15) invoices generated from a published structure. Migration 032:
    `invoices` (student × instalment, unique so regenerating never duplicates; `due`/`paid`/
    `cancelled`; UPDATE allowed unlike the append-only ledger proper, since FEE-4's payments and
    receipts are the actual money ledger and an invoice is only a receivable — same reasoning as
    `fee_structures` itself and `curriculum_versions`). `POST /v1/fees/structures/:id/invoices`
    (`fee.manage`) invoices every currently *enrolled* student of the structure's program — v1's
    scope is program + year only (§4), so it does not filter by year-of-study — one invoice per
    student per instalment, amount summed from that instalment's lines; idempotent (`{generated,
    skipped}`), so a later admission is picked up by running it again without touching existing
    invoices. Refuses a draft structure (422). `GET /v1/fees/structures/:id/invoices` and
    `GET /v1/fees/students/:id/invoices` (`fee.read`, so a Cashier reads but cannot generate).
    Server 481/481 (+3 in `tests/fees.test.ts`). `npm run typecheck` clean.
  - FEE-3 ✅ (2026-09-15) concession requests + College Admin approval. Migration 033:
    `fee_requests` (`kind` 'concession' now, 'waiver' from FEE-5 reusing the same table and state
    machine per the module doc §5; requested → approved | rejected | withdrawn; a decision writes
    `decided_by`/`decided_at` once, checked by constraint; at most one open request per invoice —
    `fee_requests_one_open_uq`). `POST /v1/fees/concessions` (`fee.manage`: Accountant or College
    Admin) refuses one over the invoice's remaining amount (422) or a second open request on the
    same invoice (409). `POST /v1/fees/requests/:id/{approve,reject}` needs `fee.approve` —
    **the College Admin alone**, not the Accountant who requested it, even though `college_admin`
    also holds `fee.manage`; an approval reduces the invoice's `amount_paise`
    (`InvoiceRepository.reduceAmount`, guarded by `status='due' AND amount_paise >= reduction` so a
    stale request can't push it negative) and is irreversible; a rejection leaves the invoice
    untouched. `POST /v1/fees/requests/:id/withdraw` (the Accountant, only their own, only while
    `requested`) frees the invoice for a new request. `GET /v1/fees/requests` (`fee.read`,
    optional `student_id`/`status` filter). Server 484/484 (+3). `npm run typecheck` clean.
  - FEE-4 ✅ (2026-09-15) counter payments, allocation, receipts — the actual money ledger the
    module doc's §3 invariants are about. Migration 034: `payments` (INSERT+SELECT only, no
    UPDATE grant at all — the same enforcement as `audit_events`; `kind` 'payment' or 'reversal',
    a reversal names what it reverses and why, amount always positive so a stray SUM never nets
    two rows that were never meant to cancel out); `payment_allocations` (append-only, how a
    payment or its reversal splits across invoices); `receipts` (status issued/cancelled, never
    deleted, number never reissued); `fee_receipt_counters` (one gapless `bigint` sequence per
    college, a number taken only when `POST /v1/fees/payments` actually issues a receipt, via one
    `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` that serializes concurrent Cashiers on that
    row). `recordPayment` allocates oldest-due-first (`InvoiceRepository.listDueByStudent`),
    marking an invoice `paid` only once fully covered — partial payments are accepted and simply
    leave it `due`; refuses (422) a student with nothing due, or an amount over their total current
    dues (v1 boundary: no advance/credit balance concept yet). `cancelPayment` inserts a reversal
    mirroring the original's allocations (never edits or deletes the original), moves any invoice
    the payment had fully paid back to `due`, and flips the receipt to `cancelled` — its number is
    never reused, a fresh payment gets the next one. `fee.collect` (Cashier or College Admin, not
    the Accountant) records and cancels; `fee.read` lists. Server 487/487 (+3 in `tests/fees.test.ts`:
    oldest-first allocation across a partial then a completing payment with gapless receipt numbers,
    cancelling reverses and un-pays without touching the receipt row and the next payment still gets
    the next number, an Accountant cannot collect and a teacher cannot even read). `npm run
    typecheck` clean. Flutter UI followed once FEE-1..5 were all in place — see below.
  - FEE-5 ✅ (2026-09-15) fines, late fees, and waiving either. Migration 035 generalises
    `invoices` to carry a `kind` ('instalment' | 'fine' | 'late_fee'), makes `fee_structure_id`/
    `instalment_id` nullable, adds `reason`, and replaces the old (student, instalment) uniqueness
    with one index per kind so an instalment and its late fee can share an `instalment_id` without
    colliding; also relaxes `amount_paise` from `> 0` to `>= 0` (found while testing: a full
    waiver/concession reducing an invoice to nothing owed hit the old constraint with a raw 500).
    `POST /v1/fees/students/:id/fines` (`fee.manage`) charges a fine directly — no approval to
    *raise* one, only to waive it (module doc §5). `POST /v1/fees/instalments/:id/late-fees`
    charges the instalment's flat late fee on every student still owing past its due date,
    idempotent like `generateInvoices`; refuses one not yet overdue or with no late fee configured.
    **v1 boundary, recorded rather than solved**: this codebase has no scheduler, so a late fee is
    triggered by the Accountant, not applied automatically at midnight. `POST /v1/fees/waivers`
    reuses FEE-3's `fee_requests` with `kind='waiver'`, restricted to a `fine`/`late_fee` invoice
    (an instalment takes a concession instead, 422) and always for the *whole* charge — no partial
    waiver in v1; approving now marks the invoice `paid` once it reaches exactly zero (also fixed
    generically for concessions, so a 100% concession does the same). Server 492/492 (+5). `npm run
    typecheck` clean. The dev/test databases needed a real rebuild for the relaxed CHECK
    constraint to take effect (`dropdb`/`createdb` + `npm run db:bootstrap`, since `migrate()`
    tracks applied filenames, not content) — noted here in case a similar edit-an-applied-migration
    situation recurs before this reaches Supabase.
  - Fee-scoped student search ✅ (2026-09-15): `GET /v1/fees/students?q=` (`fee.read`) — neither
    Cashier nor Accountant holds `student.read`, so recording a payment or raising a fine had no
    way to find who it was for. Returns only id/name/enrolment number/program. Server 493/493 (+1).
  - **Flutter, Accountant/Cashier screens ✅ (2026-09-15)**, owner asked for mobile alongside the
    server (`lib/features/fees/`): `FeesRepository`/`FeesApi` cover every FEE-1..5 endpoint plus the
    student search. `FeeHeadsScreen` (`fee.manage` adds/archives). `FeeStructuresScreen` → create a
    draft for a program + year, `FeeStructureDetailScreen` composes it (instalments, fees, optional
    late fee), publishes it (irreversible, fixed after), generates invoices, charges an overdue
    instalment's late fee. `FeeRequestsScreen` — `fee.approve` (College Admin, never the requesting
    Accountant) decides concessions and waivers. `FeeStudentSearchScreen` (the fee-scoped search
    above) → `StudentFeeScreen`: dues, invoices, payments; `fee.collect` records a payment
    (server allocates oldest-due-first) and cancels one; `fee.manage` raises a fine and requests a
    concession (an instalment) or a waiver (a fine/late fee). Dashboard tiles in both
    `_AdminModules` and `_TeacherModules` (Accountant/Cashier aren't `institution.manage`, so they
    land in the "your work" grid, which already hosts every non-admin permission-gated tile):
    **Fee heads** (`fee.manage`), **Fee structures** (`fee.read`), **Concessions & waivers**
    (`fee.approve` or `fee.manage`), **Student fees** (`fee.collect` or `fee.manage`) — a Cashier
    sees only the last; an Accountant sees all four. `FakeFeesRepository`
    (`test/features/fees/fee_test_support.dart`) implements the whole interface once, faithfully
    enough to allocate a payment oldest-due-first itself, for every fee screen's test to share.
    Flutter 311/311 (+18), `flutter analyze` clean.
  - FEE-6 ⚠️ PARTIAL, corrected 2026-09-22 (was stated ❌, verified against the repository):
    student's own dues/invoices/payments view is ✅ built (`GET /v1/me/fees`, `MyFeesCubit`,
    `MyFeesScreen`, saved-first). Receipt/statement PDF (view/print/share; new `pdf`/`printing`
    packages, mobile only) is ❌ NOT BUILT — planned as G1 in `docs/plan-fee-a-to-z-2026-09-22.md`.
    FEE-7 🚫 BLOCKED — Razorpay web payment + webhook, TODO until the owner supplies a merchant
    account and API keys. FEE-8 ❌ reports (daily collection by cashier/mode, outstanding,
    defaulters, concession/waiver register), server + mobile — does not need FEE-7; planned as G2
    in `docs/plan-fee-a-to-z-2026-09-22.md`. Full A-to-Z plan, with an open decision on whether fees
    ever reach the web console (OD-FEE-5): `docs/plan-fee-a-to-z-2026-09-22.md`.

Saved reads first (AD-9 amended 2026-09-14, owner's decision): every mobile screen opens on the data
it last received and refreshes in the background; writes unchanged.

OF-R1 ✅ (2026-09-14) the mechanism, and the screens opened first.
- `lib/core/saved_reads/`: its own encrypted Drift file (`saved_reads.sqlite`, AD-59 handling via
  the now-shared `openEncryptedDatabase`, own key `saved_reads_key`); one row per account + read;
  cleared at every sign-in and sign-out (a generation counter drops a late write from before).
- `ApiClient.get` saves every successful read's `data`; inside `fromSaved(...)` answers from the
  phone only (a miss throws `NotSaved`, ending that pass quietly); 403/404 drops the entry, offline
  keeps it. `saveAs:` names date-window reads (`/v1/me/sessions?days=N`) so a new day still hits.
- Saved-first: dashboard, my schedule, my teaching, student home, and `/v1/auth/me` (so the shell
  opens at once; a failed refresh keeps the saved permissions, the server still enforces). College
  and Super Admin apps both wired. `fromSaved` declines when no store exists (open failed, fakes).
- Tests: 11 new (store, encryption at rest, ApiClient save/replay/miss/refusal/scope/window, a
  screen saved → fresh, offline stays on saved). Flutter 268/268. 🔍 NEEDS VALIDATION on the phone.

NOT IN OF-R1, next in order:
- OF-R2: the remaining back-office screens (people, organisation, academic, curriculum, sections,
  offerings, students, rooms, timetable, access, college profile, review lists, platform screens):
  the same two-line `load` each.
- OF-R1b: open fully offline. Today a launch waits for renewal (AD-25) and nothing is shown until
  the network answers; showing saved data while renewal retries needs the actor kept on the phone
  and changes AD-25's "wait" — record as an AD-25 amendment first.
- OF-R3: attendance and mark sheets. A background refresh must never overwrite marks being typed;
  needs its own design against the outbox (§7.2 roster cache).
- A "Saved 2 h ago" freshness line (design system §7.6).

Just done (2026-09-14): UX-3 ✅ skeletons match the real layouts. A skeleton kit
(`lib/core/widgets/skeleton.dart`: one shimmer clock per screen, ListTile-true rows with the real
leading/trailing, filters, tabs, detail header, day/cohort cards, register rows at 40-pt targets,
forms) replaces the one avatar-row list every screen used. The dashboard draws its real navy header
(college name and logo) with placeholder numbers, then the admin tile grid or the teacher's
shortcuts/today/week/courses in place. All 31 loading states mapped. Flutter 257/257 (13 new:
every preset at 320 wide, one "Loading" announcement, tap-target sizes, admin and teacher dashboard
while loading). 🔍 NEEDS VALIDATION: seen on the phone.

Fixed on the phone test (2026-09-14): college users were signed out ~15 minutes after sign-in
("Your session has ended"). Not the design (AD-25 sliding 30-day renewal is intact): the same
Supabase cause as 025. `auth_resolve_refresh_token` and `auth_revoke_token_family` (005) are
SECURITY DEFINER, owned by the migrator; `refresh_tokens` forces row-level security, so without
BYPASSRLS they saw only platform rows. The first renewal of every college session failed, and
sign-out/replay revoked nothing. Migration 026 adds `migrator_resolves` (SELECT) and
`migrator_revokes` (UPDATE) policies; applied to Supabase. New session test removes the migrator's
BYPASSRLS and proves renew + sign-out (failed with 401 before 026, passes after). Server 432/432.
🔍 NEEDS VALIDATION: a college user on the phone still signed in after 15+ minutes.
Session length (2026-09-14, user request): refresh window 30 → 365 days, still sliding (AD-25
amended): anyone who opens the app within a year of last use never signs in again. Sign-out,
suspension, deactivation and replay still end a session. Applies to platform sessions too.
UX (2026-09-14, user request): "Add program" on the phone opens as a bottom sheet instead of a
dialog (drag handle, lifts above the keyboard, full-width Cancel / Add program). Same fields,
validation and cubit call. Widget test asserts the sheet; Flutter 244/244. Other add forms
(year, term, department) are still dialogs; not changed.
Follow-up (not this slice): `platform_audit_events` (020/022) is migrator-owned SECURITY DEFINER over
forced-RLS `audit_events`; on Supabase it likely misses platform events that carry a college.

Earlier (2026-09-14): adding a college on Supabase failed with "using all 0 of its
seats". The seat check (023) runs as its owner, the migrator; `institutions` forces row-level
security with only `app_role_only`; on Supabase the migrator has no BYPASSRLS (locally it does, so
tests passed), so the check saw no college. Migration 025 adds a read-only `migrator_reads` policy;
applied to Supabase and confirmed. The Super Admin app's add-college form now has a Seats field
(default 500). Server 431/431, Flutter 244/244, admin APK rebuilt and installed on the phone.

Just done (2026-09-14): ST-1 ✅ (AD-69, R72; `688696b`). Students on the phone. Server: `POST
/v1/students/:id/access` issues a one-time code (12 characters, 7 days; a reset for an active student,
24 hours), creating the student's account on first issue (a seat); `POST /v1/auth/student-activate`
redeems it only with that student's enrolment number; `/auth/me` carries `student`; `GET
/v1/me/attendance` counts submitted registers only (`identity/application/student-access.ts`,
`enrolment/infrastructure/student-self.ts`, `tests/student-access.test.ts`). App: Students → a student
→ "App access code" (message to print or send); sign-in → "Student? Activate your account"; a
student's home is "My attendance" by course with a 75% warning (`lib/features/student/`). Tested:
server 431/431 plus the new 4 (435 in the next full run), Flutter 244/244, analyze clean, both APKs
build. Not tested: on the phone.

Also (2026-09-14): the runbook, `docs/runbook/` (prerequisites, database, server, web console,
mobile apps, first college end to end, tests and builds, troubleshooting), asked for by the owner;
the root README points to it. Found and fixed: `server/.env.example` held a real Supabase database
URL with its password since `ff0f91d` (not on any remote branch in this clone). The file now holds a
placeholder; the password stays in local history, so the owner should reset the Supabase database
password before pushing.

Just done (2026-09-14): SAM-3 ✅ (AD-72, AD-81; `c549779`). The Super Admin app now has "Platform accounts"
(list; Owners invite Owner or Support and hand over a one-time code; an account's screen offers only
the server's actions: disable, enable, change role pinned to the role shown, reset authenticator,
new invitation, each with a reason; nothing on your own account; refusals such as "the platform must
always keep an active Owner" stay in the form) and "Platform audit" (newest first, by college,
pages by cursor, before and after in a sheet). Its sign-in has "I have an invitation", which sets
the password and goes straight to setting up the authenticator, so no platform person needs the
web. `lib/admin/platform/`. No server change. With this, every module is on the phone (AD-81).
Tested: Flutter full suite, analyze clean, admin APK builds. Not tested: on the phone.

Just done (2026-09-14): SAM-2b ✅ (AD-72, AD-81; `258940a`). The Super Admin app's college detail changes the
plan label and seat limit (a reason required, recorded in the platform audit; only what changed is
sent; a warning when the limit is below the seats in use) and the college's branding (name, logo
link with a preview, colour, the same checks as the college's own profile), both pinned to the
version on screen and showing the server's updated college. Hidden for closed colleges and without
`platform.colleges.manage`. No server change. Tested: Flutter 237/237, analyze clean, admin APK
builds. Not tested: on the phone.

Just done (2026-09-14): ADM-11 ✅ (AD-81; `4cee78c`). Review on the phone (`lib/features/review/`, a repository of
its own so the teacher's offline-queued repositories and their fakes stay as they are):
"Registers" shows a day's classes across the college with each register's state and counts, and a
submitted register opens for correcting one student's mark with a reason (`attendance.correct`);
"Verify marks" lists submitted (or verified) mark sheets within reach, verifies one pinned to the
version read (`assessment.verify`) and corrects a closed sheet's result with a reason, the score
checked against the maximum (`assessment.correct`). The dashboard's "coming next" note is gone:
every college module is now on the phone. No server change. Tested: Flutter 234/234, analyze
clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-10 ✅ (AD-81; `d558b20`). Access on the phone (`lib/features/access/`): People →
a person → "Manage access" lists their roles and scopes (needs `audit.read`, as the list is the
college's assignments); with `role.assign`, give a college-wide role not already held or a
department role in a chosen department, and remove one with a reason; the server's refusals (own
access, last administrator) stay in the form. The sheet's "managed from the web console" line is
gone. "College profile" (`lib/features/college/college_profile.dart`): name, logo link with a
preview, colour, the web's checks (AD-70), saved pinned to the version read; the app's header shows
the new brand when the college is next opened. No server change. Tested: Flutter 232/232, analyze
clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-9 ✅ (AD-81; `e956717`). "Students" on the phone (`lib/features/students/`): the
list opens on enrolled students; search, status, program and "not in a section" filters are the
server's (`/v1/students?…`, first 200); "Admit student" reuses the ONB-1 form; a student's screen
shows the record, "Change status" (reason required for on leave and withdrawn; a warning that
withdrawn and graduated end section and course places) and the section history, named when
sections can be read. `student.read` / `student.manage`. No server change. Tested: Flutter
227/227, analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-8 ✅ (AD-81; `4103271`). The timetable on the phone (`lib/features/timetable/`):
a course's screen has "Weekly timetable" (add a slot: day, start, end, room; remove it) and
"Generate the term's classes", which previews first (classes, skipped non-teaching days) and
refuses on clashes, listing them; a "Timetable" screen shows the college's classes a week at a
time (move: date, times, room kept unless changed, reason; cancel with a reason) and non-teaching
days (add, remove). `session.read` / `session.manage` / `term.manage`. `ClassSession` now carries
`room_id`, so moving a class keeps its room (the server treats a missing room as none). No server
change. Tested: Flutter 224/224, analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-7 ✅ (AD-81; `080a2fa`; the owner again: "sub kuch phone pe bhi hoga, everything").
Course offerings on the phone (`lib/features/offerings/`), inside a section's screen ("Courses
taught": add a course as lecture, lab or tutorial) and on their own screen: the server's
transitions ("Start teaching" disabled with the reason until a teacher is assigned and the section
is active; cancel needs a reason), teachers (assign from staff as lead, co or assistant; end with a
reason), roster (enrol the whole section in one step, choose students of the section, drop with a
reason). `offering.manage`, `instructor.assign`, `enrolment.manage`. No server change. Tested:
Flutter 219/219, analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-6 ✅ (AD-81; `a35dd2f`). "Sections" on the phone (`lib/features/sections/`): the
term that contains today by default (or all terms); add a section (program, academic term, term of
the program, next free label suggested, capacity); a section's screen shows the server's allowed
transitions as buttons (cancel needs a reason; refusals such as enrolled students stay in the form),
capacity, and members: `enrolment.manage` adds unplaced enrolled students of the program (search,
choose several) and takes a student out with a reason. `section.read` to see (with `person.read` for
programs), `section.manage` to change, `student.read` for members. No server change. Answers
OD-MOB-2 for cohort sections. Tested: Flutter 216/216, analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-5 ✅ (AD-81; `6650b8f`). "Rooms" on the phone (`lib/features/rooms/`): rooms by
campus with type, seats and timetable use; add (campus, permanent code sent in capitals, name,
type, seats), edit (name, type, seats), archive with a warning when the timetable uses it and
the server's refusal kept in the form. Read with `session.read`, write with `room.manage`;
campuses read only for managers. Dashboard tile "Rooms". No server change. Tested: Flutter full
suite (one unrelated failure in one run, none on two reruns: the known SQLCipher flake under
load), analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-4 ✅ (AD-81; `5746d1e`). "Curriculum" on the phone (`lib/features/curriculum/`):
Regulations (one program at a time; new draft with this year and the program's term count by
default; version screen term by term: add course with credits and core/elective/audit, remove,
publish with the empty-term warning; published versions offer "New version": revision or new
regulation year, with a reason) and Courses (search, add with a permanent code, rename).
`department.manage`; read with `person.read`. Shared `lib/core/widgets/submit_dialog.dart`
(`showSubmitDialog`, `invalidInput`) and `ApiClient.delete`. No server change.
- Found and fixed: dialogs disposed their text controllers while still closing (crash on
  the exit animation). The shared dialog now owns and disposes them; the Super Admin app's
  "Reset an administrator's password" (PW-1) moved onto it and keeps a server refusal in the form.
- Tested: Flutter full suite, analyze clean, both APKs build. Not tested: on the phone.

Just done (2026-09-14): AD-81 recorded (owner: "all modules for phone too"; OD-MOB-1 resolved) and
ADM-3 ✅ (`3f0b740`): "Academic setup" on the phone (`lib/features/academic/`), Programs tab (by department; add
with department, code, award, duration, semesters/annual; archive) and Calendar tab (years with
terms; add year June–May by default, add the next term by default); `department.manage` /
`term.manage`; calendar read only with `section.read`. Dashboard tile "Academic setup". No server
change. Tested: Flutter 206/206 (found and fixed a crash sorting a constant list when the calendar
is not readable), analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-2 ✅ and PW-1 ✅ (AD-79, AD-80; R69, R70; `2f6852b`).
- ADM-2: Organisation on the phone adds campuses (FAB), opens every campus (even empty) to add
  departments, renames and archives with a reason; each action only with `campus.manage` /
  `department.manage`; server refusals shown on the field. `lib/features/organisation/`,
  `ApiClient.patch`. People and Organisation now receive `ManageArgs` (authority, college).
- PW-1 (OD-PW-1 → option a): `identity/application/password-reset.ts`; `accept-invitation.ts`
  redeems reset codes (ends sessions, lifts lockout, refuses shut accounts). App: People sheet →
  "Reset password" / "Send a new invitation" → one-time message; sign-in "Forgot password?"; Super
  Admin app college detail → "Reset an administrator's password". Web accept page takes reset codes.
- Tested: server 427/427 (`password-reset.test.ts` 6), web 195/195, Flutter all pass, analyze
  clean, both APKs build. Not tested: on the phone; web People reset button not built.

Just done (2026-09-14): ADM-1 ✅ (AD-79; R65, R66; `a74d340`). The owner found the College Admin's dashboard
was a teacher's, and no way to change a password.
- Server: `GET /v1/college/overview` (counts under RLS, `institution.read`;
  `modules/institution/infrastructure/overview.ts`) and `POST /v1/auth/password`
  (`identity/application/change-password.ts`; ends every session, audited). Tests
  `college-overview.test.ts`, `change-password.test.ts`.
- App: an admin (`institution.manage`) sees the college's numbers in the header, a pill for
  unaccepted invitations, and "Manage your college" (Onboarding, People, Organisation, Profile);
  teaching parts only if they teach. Profile → Change password (`lib/features/account/`).
- Tested: server 421/421, Flutter 193/193 (the SQLCipher smoke test failed once under load and
  passed on rerun), analyze clean. Not tested: on the phone; web change password not built.
- Inbox absorbed: Firebase Crashlytics and "all Firebase things" as R67, R68 (already built; console
  checks remain for the owner).

Just done (2026-09-14): ENV-2 ✅. The owner ran the rebuild: Supabase now holds all 24 migrations,
tracked. Its last step failed with 28P01 because Supabase's pooler keeps a role's old password for a
while after bootstrap re-sets it; finished by hand (new migrator password, logins retried, `.env`
switched with `LOCAL_*` kept, `BOOTSTRAP_DATABASE_URL` left empty so `npm run migrate` no longer
re-sets passwords). The rebuild now retries through that delay. Supabase has no colleges yet; the
Owner signs in there with the same password and sets up a new authenticator (a new account).

Before that, BIO-1 ✅ (AD-78, R59; `1de03b6`). Both apps ask for the phone's fingerprint, face or
screen lock when opened on a saved session and on every return from the background (not right
after typing the password); `lib/core/security/`. `local_auth` 3.0.2; `MainActivity` is a
`FlutterFragmentActivity`; `USE_BIOMETRIC` declared.

Before that, UX-2 ✅ (AD-77; R60, R61, R64; `47ace6c`). The dashboard's header is a collapsing navy
sliver app bar after the prototype's attendance screen (college, teaching-record ring, your week,
waiting pill); no greeting or personal details on the dashboard; Profile shows name, sign-in email,
college and roles, read from `/v1/auth/me`, which now returns the person's own name and login.
The owner's inbox (6 items) is absorbed as R59–R64 and the inbox cleared.

Before that, ONB-1 ✅ (AD-76, R58; `09e79c2`) — the college app's dashboard has "Onboarding" for the
College Admin: appoint a teacher (name, email, department, Faculty or Head of Department → one
invitation message to copy) and onboard a student (name, enrolment number, program, admission date).
Same endpoints as the web; no server change. A new college needs departments and programs first,
still added on the web; the forms say so.

Before that, the college flow, end to end (AD-75, R55–R57; `0e19d41`).
- **SAM-2a:** the Super Admin app suspends, reactivates and closes a college (reason; close needs
  the code typed; version-pinned), and reissues an administrator's invitation. The invitation
  screen says who it is for, offers one message to copy, and warns it is not an authenticator key
  (the owner had entered it into Google Authenticator).
- **WEB-1:** the web console signs in college accounts by default and has `/accept-invite`; the
  platform sign-in sits behind a link until AD-72 retires it.
- **ACC-1:** the college app's sign-in has "I have an invitation".
- **Proved end to end** (`server/tests/e2e-college-handover.test.ts`): create with the super admin
  as temporary admin → accept → set up → invite the real admin → real admin accepts and revokes the
  temporary one (who loses access) → suspend (sessions stop, lookup 404) → reactivate → close.
- No deletion, by the owner's choice; handover via a temporary administrator; nothing emailed.

Earlier today: OPS-2 ✅ (`f9303c0`) — `npm run platform:create-owner` and `platform:disable-account`
(dev only, exact phrase, audited as the system). Used on local: Owner `nirvokofficial@gmail.com`
created (authenticator set up at first sign-in), `owner@nirvok.com` disabled (AD-74).
Before that: SAM-1 ✅ (`4474abd`) and LOG-1 ✅ (`ff0f91d`). ENV-2 🟡 still awaits the owner's rebuild.
- **SAM-1 (R52, AD-72):** `lib/main_admin.dart` + `lib/admin/`, Android flavor `admin`
  (`com.nirvok.collegeErp.admin`, "Super Admin", no Firebase). Platform sign-in (password → code,
  or authenticator setup by key), colleges list with totals, college detail (seats, administrator,
  branding), add college with a one-time invitation screen (code + token, copyable). Server
  unchanged. Web platform console kept until SAM-2/SAM-3 reach parity, then retired.
- **LOG-1 (R53, AD-73):** `CustomLogInterceptor` on `ApiClient`'s own Dio, debug
  non-production only; authorization is masked and passwords, tokens, keys and platform auth
  codes are redacted.

Earlier, 2026-09-13: BR-1 ✅ (`817eb5e`) and OPS-1 ✅ (`5c98d42`). ENV-2 🟡 below still awaits the owner's rebuild.
- **BR-1 (R51, AD-70, migration 024):** the app opens on the college code
  (`lib/features/auth/presentation/college_code_screen.dart`); `GET /v1/public/colleges/:code`
  returns name, logo URL and colour, one identical 404 for unknown/suspended/closed; sign-in and the
  dashboard show the college's logo and name; its colour becomes the accent only at 4.5:1 with
  white. Set by the platform (provisioning, college drawer "Branding") and the College Admin (web
  "College" page, `/v1/college/profile`), version-pinned, audited `institution.branding_changed`.
- **OPS-1 (AD-71):** `npm run platform:set-password` (dev only, policy-checked, audited, password
  from the environment, authenticator untouched). Used for `owner@nirvok.com` on local.

ENV-2 ✅ (2026-09-14) — Supabase as the development and app-testing database (R49, AD-68; tooling `5772603`). Node API unchanged;
production stays on our own Node + PostgreSQL; `npm test` stays on local `college_erp_test`.
- Found 2026-09-13: Supabase reachable through its pooler; its `public` schema is untracked (no
  `schema_migrations`, 022's table missing), 39 empty tables plus 3 seeded role definitions.
  Backup of that data and inventory: session scratchpad `supabase-backup-2026-09-13/`.
- Built: `npm run db:supabase:rebuild -- --confirm "REBUILD <ref>"`
  (`server/scripts/supabase-dev-rebuild.ts`, helpers `src/infrastructure/db/supabase-dev.ts`).
  Refuses in production, without the phrase, or if any table holds non-seed data; clears public,
  provisions roles, migrates, checks the app role connects, rewrites `server/.env` (`LOCAL_*` kept).
- Done 2026-09-14 by the owner, finished as described under CURRENT SLICE. `server/.env` now names
  Supabase for the app and migrator roles; local values are `LOCAL_*` for switching back.
- Test data on Supabase: none yet. `seed:device-test` still holds local credentials in
  `.device-test.local.json`; move it aside before seeding Supabase.

Previous: MUX-1 ✅ DONE (R48, AD-67, commit `649a45b`): the mobile home is a dashboard in the prototype's
style (`assets/*.jpeg`); bottom navigation removed; light theme only.
- `lib/features/dashboard/`: greeting, headline numbers, the class now and next, a "waiting on you"
  card for unmarked classes, a four-week teaching-record ring, a week-ahead bar chart, courses.
- Charts are native (`lib/core/widgets/charts.dart`), with screen-reader labels; no new package.
- Schedule, courses, people, organisation and account are pushed routes, each shown only with its
  permission. The offline banner moved to `MaterialApp.builder` so it shows over every route.
- No server change: `/me/sessions` and `/me/teaching` only. Earlier: SA-4a (`05a34d3`); the owner
  ran `023_seat_limits.sql` on Supabase (2026-09-13), which the rebuild re-applies, tracked.

### Owner feedback, 2026-09-24 (feedbackchanges.md)
- WID-2 ✅ web sign-in/second-factor code field is now six boxes over one invisible input
  (`OtpField`, `clients/web/src/components/index.tsx`), matching mobile's `otp_code_field.dart`;
  sixth digit auto-submits. Wired into both `SignInPage.tsx` code steps. tsc clean, 202/202 web
  tests pass. Committed `ab07f9a`.
- Module visibility by permission ("jiske pass access nahi wo module nahi dikhega"): mobile ✅
  confirmed already correct — `dashboard_screen.dart`'s `_AdminModules`/`_TeacherModules` gate every
  tile with `if (authority.can('...'))` (~15 tiles); Academic calendar is the one unconditional tile,
  by design. **Web was wrong** — first assessed "already fine" here, which was an error found later
  the same day: web's sidebar/dashboard gated whole-college tiles (People, Sections, Students,
  Timetable, the Attendance overview...) on the flat permission set, but most of those routes require
  the permission at institution scope exactly (`institutionScope()`), which a department/section-
  scoped grant — any teacher's — does not satisfy. A teacher (sonam@gmail.com) saw the tile, opened
  it, and got "You do not have access to do that." ✅ Fixed same day — see below.
- Timetable for everyone ("sub k pass"): ⚠️ PARTIAL. Teachers already have a "Schedule" tile
  (`session.read` → `/me/sessions`, instructor-assignment based). Students have no timetable/schedule
  view at all — `/me/sessions` only returns classes where the caller teaches, so a student-scoped
  equivalent (their enrolled section's slots/sessions) does not exist server- or client-side yet.
  Needs its own small slice: a self-scoped `GET /v1/me/timetable`-style read (enrolment → section →
  slots/sessions, mirroring the `/me/sessions` self-scope pattern) plus a tile on
  `student_home_screen.dart`. Not started.
- Teacher/student "apna attendance dekh payen" (own attendance): student side ✅ already built
  (ST-1). Teacher side ✅ **SA-ATT-1 built 2026-09-24** — owner decision (OD-STAFF-ATT-1 resolved):
  self-service punch in/out, not marked by HoD/Admin. Migration 038 `staff_attendance` (one row per
  person per day, unique on tenant+person+work_date, immutable INSERT+SELECT+UPDATE only — a punch is
  never deleted, only closed). Server: `POST /v1/me/staff-attendance/punch-in`, `POST
  /v1/me/staff-attendance/punch-out`, `GET /v1/me/staff-attendance?from&to` (self-scoped, no
  permission, mirrors `/v1/me/sessions`; distinct from the student's `/v1/me/attendance` and from a
  teacher marking a class roster). Refuses a double punch-in and a punch-out with nothing open.
  Mobile: `lib/features/staff_attendance/` (API, cubit, screen) — a "My attendance" tile on both
  admin and teacher dashboards, one button that reads "Punch in" / "Punch out" / "Done for today",
  history below. ✅ server 3 new tests (39/39 attendance.test.ts, 509/523 full suite — 14 failures are
  the pre-existing syllabus/debug drift, unrelated), ✅ Flutter analyze clean, 327/327 tests (2 new).
  Seeded 60 days of realistic history for `sonam@gmail.com` (weekday, ~92% present) so the UI is not
  empty. 🔍 NEEDS VALIDATION on the phone. Committed `5c33971`. Owner feedback 2026-09-24 ("punchin
  punchout dashboard pe hoga"): `PunchCard` (web) / `punch_card.dart` (mobile) now sit at the top of
  the dashboard itself, self-scoped, same tier as week/courses; Profile keeps only the history list.
  Owner also confirmed "my attendance" should exist for everyone (already true: self-scoped, no
  permission) and asked whether a teacher can mark their own students' attendance — that's a distinct,
  already-built capability (M6, `AttendanceScreen`/`Routes.attendance`, opened from a class session),
  not part of SA-ATT-1; no gap found. ✅ web tsc clean, 203/203 tests; ✅ Flutter analyze clean,
  dashboard_test.dart 17/17. Committed `109eada`. Owner feedback 2026-09-24 (round 2): confirmed
  punch-out already has no time restriction anywhere (self-scoped, no permission, server allows it any
  time the day is still open) — no change needed. Dashboard punch button made compact on both clients.
  Punch record now has a visual form: an hours-worked bar chart, oldest-to-newest over the last 7
  recorded days, reusing the existing chart pattern (`.dash__chart` on web, `core/widgets/charts.dart`
  `BarChart` on mobile) — no new charting dependency. Web: Profile's attendance history; mobile: the
  full "My attendance" screen. ✅ web tsc clean, 203/203; ✅ Flutter analyze clean, dashboard_test.dart
  17/17, staff_attendance_test.dart 2/2. Committed `0ffe3c4`. Owner feedback 2026-09-24 (round 3): "sari
  details profile se hata k dashboard pe" — web's `PunchCard` now owns the whole attendance record
  (status, button, hours chart, recent history); Profile dropped its attendance section and the
  `/v1/me/staff-attendance` read entirely. Mobile already had this split right (dashboard punch card +
  a separate "My attendance" screen, nothing on Account/Profile), so only web changed. ✅ tsc clean,
  203/203 tests. Committed `4175a21`. Owner feedback 2026-09-24 (round 4): "animated graph k through...
  smoothly", plus a "smart donut chart" for the month — days present, absent, on holiday, remaining.
  Web `PunchCard`: hours-worked bars now grow in (CSS `height` transition, not a snap); new `MonthDonut`
  — hand-drawn SVG ring (animated `stroke-dasharray` per arc, no charting library), classifying every
  day of the current month using the existing self-scoped `GET /v1/calendar` (CAL-1/CAL-2) for
  holidays, no new endpoint. Mobile: `staff_attendance/domain/month_counts.dart` (shared classification:
  present = a punch exists; absent = a past working day with none, incl. today until punched in;
  holiday = academic calendar; remaining = future) + `presentation/month_donut.dart` drawing it with
  the existing `RingChart` (`core/widgets/charts.dart`, already animated) and a count legend, wired into
  the full "My attendance" screen (dashboard's punch card stays the compact link to it, unchanged).
  ✅ web tsc clean, 203/203; ✅ Flutter analyze clean, full suite 327/327 (staff_attendance_test.dart
  updated with a fake CalendarRepository). Committed `5b464bb`. Owner feedback 2026-09-24 (round 5):
  "aise time mat dikhao" (the raw "2026-09-10: 9:20 – 18:28" list) — the chart should be the whole
  record, covering the whole month, not the last 7 days. Web `HoursChart`/mobile `_HoursChart` redrawn
  one bar per day of the current month (labels thin to every 5th day + day 1 + today, today
  highlighted); exact times moved to the web bar's hover title/accessible name; mobile's "Recent days"
  raw list removed outright. Then a UI/UX pass (ui-ux-pro-max skill): the punch/attendance block was
  three loose pieces in the page flow, unlike the dashboard's own card language (`.dash__band`); it is
  now one `.dash__band` ("Attendance") with "This month"/"Hours worked" as h3 subheads (same pattern as
  TeacherPanel), a real loading skeleton instead of rendering nothing, 8px donut-legend spacing, and
  `role="alert"` on the punch error — no new colors, every value an existing token. ✅ web tsc clean,
  203/203; ✅ Flutter analyze clean, full suite 327/327. Committed `31313b9`, `704ebcc`. Owner feedback 2026-09-24 (round 6, web-only): polish the donut's
  interactivity without changing its data or layout — hovering an arc (or its linked legend row) now
  thickens it, dims the rest, swaps the centre readout to that segment, and opens a small tooltip
  (name, value, %, "of N days in <Month>") anchored to the arc's midpoint on the ring, computed from the
  same cumulative-angle math already drawing the arcs. Every value an existing token; reduced-motion
  respected. ✅ tsc clean, 203/203 tests. Committed `a4cb823`. Owner feedback 2026-09-24 (round 7): donut moved below the hours chart instead of
  beside it (`.dash__punch-detail` one column now, chart first); mobile app forced to 12-hour time
  everywhere (`app.dart` MaterialApp `builder` wraps the tree in
  `MediaQuery(...copyWith(alwaysUse24HourFormat: false))`, covering `TimeOfDay.format`/`showTimePicker`
  app-wide, not just the hand-rolled `_time()` helpers already used for punch times). ✅ web tsc clean,
  203/203; ✅ Flutter analyze clean, full suite 327/327. Committed `fe5d393`. Owner feedback 2026-09-24 (round 8, web-only): the hours-vs-date chart should give
  every precise detail in one glance. The native `title` tooltip is now a floating tooltip matching the
  donut's (date, exact hours, punch in-out times, or "No punch"/"Not reached yet"), anchored above the
  hovered bar; the hovered bar highlights and the rest dim; every bar is keyboard-focusable with its own
  accessible name (not mouse-only). No new colors. ✅ tsc clean, 203/203 tests. Committed `fabf2bb`. Owner feedback 2026-09-24 (round 9, web-only): shared reference images (glowing
  gradient curve chart; sculpted 3D-look donut) and asked for that visual quality; confirmed via
  AskUserQuestion to keep the app's existing light theme/tokens rather than a dark theme for just these
  charts. `HoursChart` is now a smooth gradient curve (Catmull-Rom-to-Bezier through each day's hours,
  blue→teal stroke via `--info`/`--primary`/`--success`, soft glow, fading area fill) replacing the
  ~30-bar chart; hover tooltip/accessible labels unchanged in behavior. `MonthDonut` got a subtle
  top-left gloss and per-arc drop-shadow for a lightly sculpted ring; data/layout/tooltip unchanged. No
  new colors — reused tokens throughout (including `--primary`'s RGB the same way `--chrome-gradient`
  already does). Removed now-dead `--month` bar-chart CSS. ✅ tsc clean, 203/203 tests. Committed
  `0c20002`. Owner feedback 2026-09-24 (round 10, web-only): shared a bar+line combo reference with
  value labels at standout points, asked for "is type ka bar chart". Added translucent bars behind the
  curve (same per-day scale as the line) and a direct amber-marked label on the month's best day
  ("8.5h"), so the standout figure reads without hovering. Found and fixed a real bug while doing this:
  the SVG's `preserveAspectRatio="none"` non-uniformly stretches everything drawn inside it, so the
  existing hover/today dot circles were actually rendering as ellipses (and any text would squash) —
  moved every dot and the new peak label out of the SVG into percentage-positioned HTML (same technique
  the tooltip already used), leaving only paths/rects (curve, area, bars) in SVG since those have no
  circular/text symmetry to break. ✅ tsc clean, 203/203 tests. Committed `9d737e2`. Owner feedback 2026-09-24 (round 11, web-only): "donut chart jaisa screenshot diya
  tha waisa hi chahiye" — the earlier subtle gloss wasn't enough; needed the actual extruded-3D-puck
  shape from the reference. Each segment now has a small rounded gap from its neighbours and is drawn
  twice (a darkened `brightness(0.72)`-filtered "side" copy 3.5px lower, behind a true-colour "top"
  copy), thicker ring (20px), still every existing token — no new colors, light theme kept per the
  earlier decision. Data/hover/tooltip/legend unchanged. ✅ tsc clean, 203/203 tests. Committed
  `0d8d6cf`. 🔍 NEEDS VALIDATION on the phone and in a browser.
- "Your roles" said "Faculty for a department" with no department name (owner: "exact kis department
  me hai... sub cheez"). ✅ Fixed 2026-09-24 — `/v1/auth/me` resolves each assignment's `scope_ref_id`
  to a real name (department/section/program/campus, one lookup per distinct id) and returns
  `scope_name`; both clients show it in place of the generic scope-type label. The existing "Your
  teaching" section (subjects/classes/department per offering, from `/v1/me/teaching`) already covers
  "subjects kya hain, classes kaun c hain" — unchanged, just confirmed still correct.
- Web sidebar/dashboard showed tiles a person could not open (owner: "jis cheez ka access hi nahi hai
  wo module dikhao hi mat karo"). ✅ Fixed 2026-09-24 — `/v1/auth/me` now also returns
  `institution_permissions` (`institutionPermissionKeys`, `domain/authority.ts`): the subset of a
  person's permissions actually held at institution scope, distinct from the flat `permissions` set
  which includes narrower department/section grants that most whole-college list routes refuse.
  `sectionsFor()` (App.tsx) and `buildTiles()` (DashboardPage.tsx, reused by ProfilePage) gate People,
  Organisation, Curriculum, College, Teaching, Students, Timetable and the Attendance overview on
  `institution_permissions` instead; `assessment.verify` stays on the flat set since the server
  already narrows the verification queue to the reader's own cohort (correctly designed, not
  affected). Also added punch in/out to web Profile (mobile had it from SA-ATT-1, web didn't). ✅ tsc
  clean, 203/203 web tests pass (+2 new); server 15/15 people.test.ts (+2 new asserting a
  department-scoped grant is excluded from `institution_permissions` while the granting admin's is
  included); full suite 509/523 (pre-existing syllabus/debug drift, unrelated). Committed `be16e09`.
  **Not yet audited**: whether any other web page (beyond the ones this pass covered) calls a route
  requiring `institutionScope()` while being reachable by a department/section-scoped role; this pass
  fixed every tile currently in `sectionsFor()`/`buildTiles()`, not a from-scratch audit of every route.

### NEXT SLICE — validate on the phone, end to end (runbook 06)
- **Why next:** every module is built and unit-tested but none has been opened on a real phone since
  ADM-1, and since then skeletons (UX-3), saved reads (OF-R1), calendar/program edit and archive
  (FB-2) and sign-in by code (OTP-1…4, OTP-6) were all built without a device. One pass of
  `docs/runbook/06-first-college.md` against a running server, both apps, signing in with code
  123456, records what works and what breaks before more is built.
- **Then:** a student's marks and timetable (their other self-scoped reads); fees (D1) and circulars
  need their modules specified first. OD-AD72-1 (retire the web platform console) awaits the owner.

### LATER — ST-1 detail
- **Why next:** the owner asked to complete the app from the prototype, and all three prototype
  screens (attendance %, fees, circulars) are student surfaces. Attendance data already exists
  (M6); only the student role, the account and a self-scoped read are missing. Fees (D1) and
  circulars (no module) come later. Drift 6 stays ready and unblocked.
- **To build:** the student's account linked to the M5 student; `GET /me/attendance` summarised
  per subject; the prototype's attendance screen and a student dashboard.
- **Decided (AD-69):** College Admin onboards one person at a time (no bulk); a student activates
  with college code + enrolment number + a one-time code (hash-only, expiring, printable), then a
  password; each student account takes a seat. Teachers keep the email invitation.
- **Not blocked:** trying it on Supabase after ENV-2 is preferred, but ST-1 does not depend on it.
- **After ST-1:** SAM-2b (plan, seats, branding in the admin app), then SAM-3 (audit, accounts), then
  the web platform console retires (AD-72).

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
| OD-1 | Examinations model | Blocks M10 | M10 | See docs/MASTER-CHECKLIST.md | Open |
| OD-MOB-1 | Should every module be on mobile too (R63)? | — | Mobile scope | — | ✅ Resolved as AD-81: every module, one slice at a time |
| OD-MOB-2 | "Create classes" (R62): a cohort section, or timetable sessions? | — | M3/M4 on mobile | — | ✅ Both, under AD-81: sections are ADM-6 (built); timetable slots and sessions are ADM-8 |
| OD-BIO-1 | A phone with no screen lock: let through (built) or refuse? Lock-screen sign-out keeps unsent changes dormant (built) or deletes them? | Security vs. being locked out of work | BIO-1 | As built; or stricter | Open, owner to confirm |
| OD-PW-1 | How does a college user who forgot their password get back in (R69)? | — | Identity, security | — | ✅ Resolved as AD-80: option (a), one-time reset code; emailed link later with an email provider |
| OD-AD72-1 | Retire the web platform console now that the Super Admin app covers it? | AD-72 said to retire it at parity; SAM-2b and SAM-3 reach parity | Web platform console | Retire (remove its routes from the web client); keep as a fallback | Open, owner to confirm; blocks nothing |
| OD-ST-1 | How a student gets an account: who issues it, how they sign in, does it take a seat (AD-65) | Identity, seats, data protection | ST-1 | — | ✅ Resolved as AD-69: admin-issued, enrolment number + one-time code, takes a seat |

### BLOCKERS
Xcode (iOS, deferred). Drift 6 (backend push delivery). OD-1 (M10).

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
9b0199b Change where a person's sign-in code goes (OTP-6, AD-82)
e32ddde Runbook and tracker: sign-in is by code (AD-82)
265e9be Capture a mobile number for students and teachers, for their sign-in code (OTP-4, AD-82)
f3152d0 The Super Admin app signs in with a code to its email (OTP-3, AD-82)
77975e5 The college app signs in with a code to email or mobile (OTP-2, AD-82)
adf1fe5 Sign in by a one-time code to email or mobile, on the server (OTP-1, AD-82)
d4f6121 Seed script reuses an existing calendar, and seeds 7 teachers, 10 students
28a4060 Edit and archive programs, academic years and terms (FB-2)
151ec7c People no longer lists the person looking at it (FB-1)
7814377 Add a script that builds runbook 09's whole college through the API
943ea33 Record today's commits in the tracker
a1f9d11 Open screens on their saved data, then refresh (OF-R1)
16c1545 Amend AD-9: reads are cache-first on every mobile screen
90bce01 Make every loading skeleton match its screen (UX-3)
93a726a Keep sessions for a year from last use
b8e0e71 Add program opens as a bottom sheet on the phone
a4bb19e Fix college users signed out after 15 minutes on Supabase (migration 026)
688696b Build ST-1: students sign in with their enrolment number and see their attendance (AD-69)
4924220 Add the runbook, and take a real database URL out of .env.example
5c1c541 Record the SAM-3 commit in the tracker
c549779 Build SAM-3: platform accounts, the audit and invitations in the Super Admin app (AD-72, AD-81)
cba69d7 Record the SAM-2b commit in the tracker
258940a Build SAM-2b: plan, seats and branding in the Super Admin app (AD-72, AD-81)
eff961d Record the ADM-11 commit in the tracker
4cee78c Build ADM-11: registers, mark verification and corrections on the phone (AD-81)
e5ec63d Record the ADM-10 commit in the tracker
d558b20 Build ADM-10: access and the college profile on the phone (AD-81)
f054e4d Record the ADM-9 commit in the tracker
e956717 Build ADM-9: students on the phone (AD-81)
927424c Record the ADM-8 commit in the tracker
4103271 Build ADM-8: the timetable, classes and non-teaching days on the phone (AD-81)
85fbe1c Record the ADM-7 commit in the tracker
080a2fa Build ADM-7: course offerings, their teachers and enrolments on the phone (AD-81)
f5f85e5 Record the ADM-6 commit in the tracker
a35dd2f Build ADM-6: sections and their members on the phone (AD-81)
40e5b2f Record the ADM-5 commit in the tracker
6650b8f Build ADM-5: rooms on the phone (AD-81)
68004bf Record the ADM-4 commit in the tracker
5746d1e Build ADM-4: courses and curriculum versions on the phone (AD-81)
c2a7cc2 Record the ADM-3 commit in the tracker
3f0b740 Build ADM-3 and decide AD-81: every module on the phone; programs and the calendar first
f1c3d10 Record the ADM-2 and PW-1 commit in the tracker
2f6852b Build ADM-2 and PW-1: campuses and departments on the phone; forgotten passwords by reset code (AD-80)
a74d340 Build ADM-1: the College Admin's own dashboard, and change password (AD-79)
838c839 Finish ENV-2: development runs on Supabase; the rebuild survives the pooler's delay
1de03b6 Build BIO-1: the phone's own lock guards every open of a signed-in app
47ace6c Build UX-2: a collapsing navy dashboard header, and a Profile for the person
09e79c2 Build ONB-1: the College Admin appoints teachers and onboards students from the phone
0e19d41 Build the college handover flow: lifecycle in the Super Admin app, invitations accepted on web and phone
f9303c0 Build OPS-2: operators create an Owner and disable an account in development
4474abd Build SAM-1: a separate Super Admin app with its own entry point
ff0f91d Build LOG-1: API logs through one redacting Dio interceptor
817eb5e Build BR-1: the app opens on the college code and wears the college's brand
5c98d42 Build OPS-1: a dev-only command to set a platform account's password
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
Tests: 417 backend, 195 web, 190 Flutter, all passing. One outbox test ("a write waits behind an
earlier one…") failed once under full-suite load and passed alone three times and on rerun: timing-sensitive.

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
- `server/.env` names Supabase (through its session pooler) since 2026-09-14 (AD-68); local values
  are kept as `LOCAL_*`. The direct `db.<ref>.supabase.co` host does not resolve from here; the
  pooler does. After any role password change the pooler refuses logins (28P01) for up to a minute.
- Platform accounts have forced row-level security: the migrator login sees none of them; check
  them with the admin login.
- On Supabase, no platform Owner exists after the rebuild. `seed:device-test` creates one
  (`owner+device-test@…`, credentials in `.device-test.local.json`); there is no first-Owner CLI.
- After reconnecting, the outbox honours its backoff (up to 10 minutes) until the teacher taps
  "Send now", because the app has no connectivity listener. Observed on device; by design today.
- Firebase console test sends need the owner's console access; not yet done.
- `docs/IMPLEMENTATION-CHECKPOINT.md` calls S2 "Super Admin console — COMPLETE". It covers sign-in and
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
- Platform accounts on local: Owner `nirvokofficial@gmail.com` (real, no authenticator yet);
  `owner@nirvok.com` disabled; dev leftovers `o@n.com`, `owner+31650@nirvok.com`,
  `owner+device-test@nirvok.dev` still active. Supabase has none until its rebuild, then
  `platform:create-owner` gives it the same Owner.
- Owner's change, committed inside `d15ca38` and `0e19d41` (it was staged, and those commits took
  the whole index; 2026-09-14): `ApiClient` logs through
  `CustomLogInterceptor` (`dio_intercepter.dart`, coloured `dart:developer` output) instead of
  `withApiLogs`; it masks the token and redacts bodies with the shared `redact` (AD-73 holds).
  `AuthApi` and `PlatformAuthApi` still use `ApiLogInterceptor`. Left in it: `onError` prints the
  raw response (only on transport failures, since every status is a response), and the
  `DisplayOnlineExam`/`FeeBackStudent` path check is always true.
- `server/.env.example` has an uncommitted edit containing the real Supabase password; it must
  go back to the placeholder and never be committed.
- No email delivery anywhere: invitations are handed over by the super admin (AD-75).
- Departments, programs and curriculum can only be created on the web console; a fresh college
  (IIT Doon, IIT Delhi) has none, so phone onboarding shows "No departments/programs yet" until then.
- A college account cannot be deactivated yet; after a handover the temporary administrator has no
  access but still uses one seat (AD-65).
- Local colleges IIT Doon and IIT Delhi (2026-09-14) have invited administrators who have not
  accepted; their invitations can now be reissued from the Super Admin app.
- The super admin app has no app lock; an unlocked phone holding an Owner session is platform
  access. Biometric lock recommended before production (AD-72). iOS flavors not configured.
- The dev server on port 3000 was restarted from a Claude session; restart `npm run dev` in a
  terminal to own it.
