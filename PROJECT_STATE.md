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
- Offline Outbox slice 2, durable queue (AD-59): ✅ code, ✅ 133 Flutter tests; Android replay 🔍 NEEDS VALIDATION (device unavailable)
- Android runtime: ✅ build, launch, API, Firebase, Crashlytics init, Remote Config; FCM registration 🔍
- Platform Administration: ⚠️ PARTIAL. S1/S2 provisioning ✅; SA-1 lifecycle ✅; SA-2 audit view ✅ (migration 020 🔍 not yet applied to dev); SA-3…SA-5 ❌
- Approvals capability (P1): ❌ not specified
- Student role and student experience: ❌
- Examinations, Results (M10): 🚫 OD-1
- iOS validation: 🚫 Xcode not installed
- Backend push delivery: 🚫 Drift 6, tokens stored hash-only

### CURRENT SLICE
None in progress. SA-2 ✅ DONE: 347 server tests, 174 web tests, typechecks clean (commit `5774b28`).
**Action for the owner:** apply migration `020_platform_audit_read.sql` to `college_erp_dev`
(`npm run migrate` in `server/`). Until then `GET /v1/platform/audit` fails on the dev database.
AD-59 device replay ⏸️ POSTPONED until the phone is connected.

### NEXT SLICE — SA-3 Platform Accounts, Roles, Second Factor
Design: `docs/blueprint/capabilities/platform-administration.md` §5.
- **Why next:** platform accounts are the largest standing privilege, exist only by SQL insert,
  have no second factor, and have one all-powerful role. SA-5 (impersonation) depends on the
  Support role this slice introduces.
- **Already built:** `platform_accounts`, platform sign-in with lockout and audit, platform guard.
- **To build:** Owner and Support roles enforced server-side; account creation by command, not SQL;
  a second factor at platform sign-in.
- **Not in this slice:** impersonation (SA-5), seats and plan (SA-4), college-user MFA.
- **Open decision:** OD-SA-3, which second factor. It blocks only the second-factor part.

### OPEN DECISIONS (relevant)
| ID | Question | Why it matters | Affects | Options | Status |
|---|---|---|---|---|---|
| OD-SA-1 | What does "suspended" mean for a college's users? | Live sessions end or turn read-only | SA-1 | — | ✅ Resolved as AD-60: refused entirely |
| OD-SA-3 | Second factor for platform accounts | The platform's largest privilege is password-only | SA-3 | TOTP app; email one-time code | Open, blocks SA-3's second-factor part |
| OD-SA-2 | Retention and export for a closed college | Data protection duty | Export, retention | Fixed period; per contract | Open; close shipped without export or deletion |
| OD-1 | Examinations model | Blocks M10 | M10 | See MASTER-CHECKLIST | Open |

### BLOCKERS
Phone not connected (AD-59 device replay, FCM). Xcode (iOS). Drift 6 (backend push). OD-1 (M10).

## 1. Modules
M1–M7 built (see `MODULE_REGISTRY.md`). Offline outbox: slice 1 (AD-58) committed; slice 2, the
durable encrypted queue (AD-59), implemented and unit-tested (`a4f9622`). Real-device
validation BLOCKED at step 1 on 2026-09-13: no Android device connected (adb lists none, even
after an adb restart). Test data is seeded and verified over the API.
Platform administration: S1/S2 provisioning only; see `docs/blueprint/capabilities/platform-administration.md`.

## 2. Decisions
AD-1…AD-61, all Active; AD-59, AD-60 and AD-61 approved 2026-09-13. Index: `ARCHITECTURE_INDEX.md`.

## 3. Database
Migrations `001`–`019` applied on `college_erp_dev`; `020` (platform audit read) written and tested, **not applied to dev**: the owner applies it.

## 4. Commits (newest first)
```
7b1842f Design the durable outbox and propose the encrypted local store
71765a1 Register com.nirvok.collegeErp in Firebase and validate on a real phone
052e0eb Record outbox slice one in the checkpoint and requirement R40
e15590f Make teacher field writes replay-safe: outbox slice one
9180c3f Build internal assessment: the plan, the mark sheet, and corrections
6ac3683 Keep the web/** analyzer exclusion as the owner decided
```
Tests: 347 backend, 174 web, 133 Flutter, all passing.

## 5. Blockers
- AD-59 device validation: the Android phone is not connected.
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
- The dev server on port 3000 was restarted from a Claude session; restart `npm run dev` in a
  terminal to own it.
