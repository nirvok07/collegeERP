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
- College branding + college-code-first app (BR-1, AD-70): ✅ server, ✅ web, ✅ Flutter, ✅ tests, ✅ APK builds; 🔍 on the phone
- Operator password for platform accounts, dev only (OPS-1, AD-71): ✅; `owner@nirvok.com` set on local
- Super admin app, flavor `admin` (SAM-1, AD-72): ✅ sign-in with authenticator, colleges list and detail, add college; ✅ tests; ✅ both APKs build; 🔍 on the phone; SAM-2a ✅ suspend/reactivate/close/reissue; SAM-2b (plan, branding) and SAM-3 (audit, accounts) ❌
- API logs via Dio interceptor (LOG-1, AD-73): ✅ debug only, secrets masked, tested
- Real super admin account (OPS-2, AD-74): ✅ `nirvokofficial@gmail.com` Owner on local; `owner@nirvok.com` disabled; authenticator app kept
- College sign-in and invitation acceptance (WEB-1 web, ACC-1 mobile, AD-75): ✅ code, ✅ tests, ✅ end-to-end handover test; 🔍 on the phone and in a browser
- College Admin onboarding on the phone (ONB-1, AD-76): ✅ appoint teacher, admit student; ✅ tests; ✅ APK builds; 🔍 on the phone; student sign-in ❌ (ST-1)
- Dashboard sliver header and Profile (UX-2, AD-77): ✅ code, ✅ tests; 🔍 on the phone
- Biometric lock on every open (BIO-1, R59, AD-78): ✅ code, ✅ tests, ✅ both APKs build; 🔍 on the phone
- College Admin on the phone (ADM, R66, AD-79): ADM-1 ✅ admin dashboard and change password; ADM-2 ✅ campuses and departments (add, rename, archive); ADM-3 ✅ programs, academic years and terms; ADM-4 ✅ courses and curriculum versions; ADM-5 ✅ rooms; ADM-6 ✅ sections and members; ADM-7 ✅ course offerings, teachers, enrolments; ADM-8 ✅ timetable, classes, non-teaching days; ADM-9 ✅ students; ADM-10 ✅ access and college profile; ADM-11 ✅ registers and mark verification, corrections; ✅ tests; 🔍 on the phone. Every college module is on the phone (AD-81); Super Admin app SAM-2b ✅ plan, seats, branding; SAM-3 ✅ platform accounts, audit, invitation acceptance. Every module is on the phone
- Forgotten password (PW-1, R69, AD-80): ✅ reset codes from People (app) and from the Super Admin app; redeemed in the app and on the web; ✅ tests; 🔍 on the phone; web People has no reset button yet
- Firebase (R67, R68): Core, Crashlytics, Remote Config, Messaging built and initialised on Android; 🔍 first crash report and a console test push (owner); backend push 🚫 Drift 6
- Student role and student experience: ❌ (the prototype's attendance %, fees and circulars screens depend on it)
- Examinations, Results (M10): 🚫 OD-1
- iOS validation: 🚫 Xcode not installed
- Backend push delivery: 🚫 Drift 6, tokens stored hash-only

### CURRENT SLICE
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

### NEXT SLICE — ST-1: student accounts and "My attendance" on the phone
- **Why next:** every administrative module is on the phone; the student is the one actor with no
  way in. Decided in AD-69 (enrolment number + one-time code, a seat each).
- **Owner to confirm (OD-AD72-1):** retire the web platform console now that the Super Admin app
  covers it (AD-72 said so at parity). The college web console stays (AD-81).

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
| OD-1 | Examinations model | Blocks M10 | M10 | See MASTER-CHECKLIST | Open |
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
