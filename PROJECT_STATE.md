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
- Platform Administration: ⚠️ PARTIAL, S1/S2 provisioning and colleges list only
- Approvals capability (P1): ❌ not specified
- Student role and student experience: ❌
- Examinations, Results (M10): 🚫 OD-1
- iOS validation: 🚫 Xcode not installed
- Backend push delivery: 🚫 Drift 6, tokens stored hash-only

### CURRENT SLICE
None in progress. AD-59 device replay ⏸️ POSTPONED until the phone is connected.

### NEXT SLICE — SA-1 College Lifecycle
Design: `docs/blueprint/capabilities/platform-administration.md` §5.
- **Already built:** `POST/GET /v1/institutions` (platform guard), W0 one-transaction
  provisioning, status column `trial/active/suspended/closed`, new sign-in refused when suspended
  or closed, web colleges list and provision drawer.
- **To build:** institution detail; suspend, reactivate, close with a required reason; suspension
  enforced on refresh and per request; reissue the administrator invitation (old token invalid,
  new one shown once); an audit event per transition; web detail screen with these actions.
- **Not in this slice:** audit view (SA-2), platform roles and second factor (SA-3), plan and
  seats (SA-4), impersonation (SA-5), data export for closed colleges.
- **Dependencies:** M1 sessions and refresh, M2 institution record, audit writer.
- **Validation:** server tests for each transition, refusals for college actors, suspended
  refresh and request refused, reissue invalidates the old token, audit rows; web tests.
- **Open decision:** OD-SA-1 below. Only the per-request enforcement depends on it.
- **Blockers:** none, if the provisional OD-SA-1 answer is accepted.

### OPEN DECISIONS (relevant)
| ID | Question | Why it matters | Affects | Options | Status |
|---|---|---|---|---|---|
| OD-SA-1 | What does "suspended" mean for a college's users? | Decides whether live sessions end or turn read-only | SA-1 | Refused entirely; read-only | Open. Provisional: refused entirely, matching today's sign-in refusal |
| OD-SA-2 | Retention and export for a closed college | Data protection duty | SA-1 close, later export | Fixed period; per contract | Open; close ships without export |
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
AD-1…AD-59, all Active; AD-59 approved 2026-09-13. Index: `ARCHITECTURE_INDEX.md`.

## 3. Database
Migrations `001`–`018` applied on `college_erp_dev`. No migration in the outbox slice 2.

## 4. Commits (newest first)
```
7b1842f Design the durable outbox and propose the encrypted local store
71765a1 Register com.nirvok.collegeErp in Firebase and validate on a real phone
052e0eb Record outbox slice one in the checkpoint and requirement R40
e15590f Make teacher field writes replay-safe: outbox slice one
9180c3f Build internal assessment: the plan, the mark sheet, and corrections
6ac3683 Keep the web/** analyzer exclusion as the owner decided
```
Tests: 327 backend, 161 web, 133 Flutter, all passing.

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
- No endpoint reissues an administrator invitation; the device-test seed rotates it in SQL.
- A suspended or closed college refuses new sign-ins, but existing sessions keep working.
- The seat limit is stored and never enforced.
- Outbox deviations from its §7 design, recorded there: no roster cache (§7.2), so a register
  cannot be opened for the first time offline; no coalescing, since every queued write was
  already attempted online; transport failures retry indefinitely at 10 minutes, only 5xx parks.
- A queued "taught" shows in the schedule's waiting bar, not on its row, until it is sent.
- Queued writes of a person whose session expired stay dormant, encrypted, until they sign in
  again; another person on the device can neither see nor send them.
- `google-services.json` still lists the retired `com.example.college_erp` client.
- The dev server on port 3000 was restarted from a Claude session; restart `npm run dev` in a
  terminal to own it.
