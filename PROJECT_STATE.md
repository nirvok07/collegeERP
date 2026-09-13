# Project State

Updated 2026-09-13. Compact, repository-oriented. Details live in the files named here.

## 1. Modules
M1–M7 built (see `MODULE_REGISTRY.md`). Offline outbox: slice 1 (AD-58) committed; slice 2, the
durable encrypted queue (AD-59), implemented and unit-tested in the commit after `7b1842f`.
Not device-verified yet.

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
- iOS: Xcode not installed (Command Line Tools only).
- Push delivery from the backend: tokens stored hash-only (Drift 6). Console send only.
- M10 examinations/results: OD-1.

## 6. Open decisions
OD-1 (examinations model), OD-4, Drift 6 resolution (recoverable push token), approvals P1 spec
(checklist 7.4), student role and account issuance.

## 7. Next slice
Verify outbox slice 2 on the Android phone: offline save → queued → reconnect → replayed, and a
conflict shown. Needs a signed-in teacher with a class: seed a dedicated `device-test` college
through the API, never by editing existing data.

## 8. Inspect before continuing
`docs/blueprint/capabilities/offline-outbox.md` §7, `lib/core/outbox/`, `lib/core/di/outbox_setup.dart`,
`test/core/outbox/outbox_test.dart`, `docs/12-mobile-platform-config.md` device table.

## 9. Known inconsistencies and risks
- Outbox deviations from its §7 design, recorded there: no roster cache (§7.2), so a register
  cannot be opened for the first time offline; no coalescing, since every queued write was
  already attempted online; transport failures retry indefinitely at 10 minutes, only 5xx parks.
- A queued "taught" shows in the schedule's waiting bar, not on its row, until it is sent.
- Queued writes of a person whose session expired stay dormant, encrypted, until they sign in
  again; another person on the device can neither see nor send them.
- `google-services.json` still lists the retired `com.example.college_erp` client.
- The dev server on port 3000 was restarted from a Claude session; restart `npm run dev` in a
  terminal to own it.
