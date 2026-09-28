# Project State

Updated 2026-09-29. Current slice: P0 stabilisation close-out.

## SYSTEM STATUS

- Server: ✅ typecheck; ✅ 519/519 tests, 0 failures/cancellations/skips on the local test DB.
- Web: ✅ typecheck; ✅ 203/203 tests; ✅ Playwright/Chromium visual script and top-level captures.
- Flutter: ✅ analyze and ✅ 330/330 tests; APK builds pass.
- Database: historical local `college_erp_dev` seed evidence is recorded; the currently running API
  resolves to the configured managed development database, which has only `iit-delhi` and zero
  accounts. The device-test seed retry is blocked by that environment's `erp_migrator` RLS grant.
- Platform: ✅ tenant lifecycle and platform administration foundations; ⚠️ push delivery and
  impersonation remain unbuilt or externally blocked.
- Examinations/results: 🚫 OD-1 / AD-91 owner decision.
- iOS: 🚫 Xcode unavailable.

## CURRENT SLICE

P0 — stabilise the seeded system, reconcile architecture decisions, and close validation debt without
starting a new domain.

## CURRENT OBJECTIVE

Finish evidence-backed P0 work, keep every unresolved browser/device/owner dependency explicit, and
do not mark the project ready for P1 until the P0 exit gate is actually satisfied.

## ALREADY BUILT

- AD-83 staff attendance is server-enforced: phone sends coordinates and accuracy, the server resolves
  the assigned campus, checks the bounded Haversine allowance, discards coordinates, and refuses
  missing/outside/fenceless punches. Desktop punching is a documented phone-only parity exception.
- P0-0 invariant sweep: 93/93 focused tests cover curriculum freeze, archive refusal, suspended tenant,
  seat limits and gapless receipts; no implemented schema/check gap was found.
- P0-1 migration 036 audit: syllabus RLS, FORCE RLS, tenant policy and expected grants are compliant;
  no corrective migration is needed. P0-2 debug-test hygiene is complete.
- Seeded local API: 41 staff, 403 students, 5 departments, 4 programs, 1 published and 3 draft
  curriculum versions, branding, timetable, attendance corrections/cancellation, assessment and fee
  waiver fixtures. Seed reruns report `0 created, 129 already there`.
- Browser top-level captures: College Admin 11 sections; teacher 3 permission-filtered sections;
  student 2 permission-filtered sections; platform Owner 3 platform sections. Historical duplicate
  cancelled Calculus fixture rows are recorded as a named data defect.
- AD-84…AD-90 and AD-92 are recorded in `docs/blueprint/adr.md`; AD-93 records the M14 staff-leave
  versus M7 student-excused-absence boundary. OD-FEE-5 is resolved by AD-86.
- P0-9 compact tracking is complete. P0-10 has absorbed the dated planning queues into
  `docs/requirements.md` (R73, R77–R80), removed the duplicate design-token file into the canonical
  Flutter token source, and added the Android build ignore; methodology-file consolidation remains open.

## TO BUILD

- P0-4: capture reachable loading, empty and error states in a live browser; the standing script has
  forced-state modes, but its current headless run exits before authenticated shell creation.
- P0-3/P0-4: restore the approved seeded API target or bootstrap grant, then rerun device-test seed
  and authenticated browser state capture.
- P0-4: complete the physical Android pass, including GPS fence behavior, offline behavior and both
  `college` and `admin` flavors.
- P0-5/P0-7: obtain owner decisions for OD-1, OD-4 and OD-ACC-1 before dependent domains begin.
- P0-10: decide whether the still-referenced session/recovery/methodology files can be folded without
  losing their authoritative protocol content; the prompts remain live sources for now.

## NOT IN THIS SLICE

- M10 examinations/results, M15 payroll, M19 payables, and M14 leave implementation.
- Notification delivery (CAP-2), scheduled work (CAP-3/P9), document storage (CAP-4), generic reports
  (CAP-5), admissions, HR, scholarships, library, hostel, transport and other unbuilt domains.
- iOS validation while Xcode is unavailable; backend push delivery while CAP-3/device-token design
  remains unresolved.

## DEPENDENCIES

- A real Android device and owner/device access are required for physical validation.
- OD-1 determines whether M10 mirrors external results, owns an autonomous engine, or supports both.
- OD-4 determines whether payments are recorded only or collected with settlement/refund/compliance.
- OD-ACC-1 determines the accounting boundary before payroll/payables.
- CAP-3 and sealed recoverable device tokens are required before backend push validation.

## VALIDATION

- ✅ Server 519/519; web 203/203; Flutter 330/330.
- ✅ Seeded API and idempotent rerun evidence recorded in `docs/IMPLEMENTATION-CHECKPOINT.md` and
  `docs/checklists/P0-stabilise.md`.
- ✅ Browser happy-path sign-in and top-level captures recorded for admin, teacher, student and platform.
- 🔍 Forced browser loading/empty/error captures: not claimed; current runner exits before shell auth.
- 🔍 Physical GPS, permissions, offline replay, flavor side-by-side install and all mobile visual debt:
  phone required.
- 🚫 iOS and backend push: explicit capability/tooling blockers, not silently deferred.

## OPEN DECISIONS

| ID | Decision | Status |
|---|---|---|
| OD-1 / AD-91 | Examinations: mirror external results, autonomous engine, or both | 🔴 owner confirmation required |
| OD-4 | Record money first or collect it | 🔴 owner decision required |
| OD-ACC-1 | Tally export, full ledger, or thin budget/commitment ledger | 🔴 owner decision required |
| OD-LV-1 / AD-93 | Staff leave versus student excused absence | ✅ resolved 2026-09-15 |

## BLOCKERS

- Physical Android device and owner/device validation access.
- Browser forced-state harness: admin OTP is currently rate-limited and forced probes exit before shell
  authentication; happy-path captures remain valid and state coverage is not claimed.
- Current configured API target has no device-test accounts; the corrected seed reached an `erp_migrator`
  RLS refusal. No remote RLS repair was attempted.
- Xcode unavailable; CAP-3 backend push capability not built.

## NEXT

Restore the approved local/managed seed path, rerun device-test seed, then retry P0-4 browser state
capture with a healthy OTP bucket and authenticated headless run; record each reachable state or a
named defect before moving to the physical Android pass.

## SOURCES

- Historical slice record: `docs/IMPLEMENTATION-CHECKPOINT.md`.
- Execution map: `docs/EXECUTION-CHECKLIST.md`; P0 detail: `docs/checklists/P0-stabilise.md`.
- Architecture decisions: `docs/blueprint/adr.md`; index: `ARCHITECTURE_INDEX.md`.
- Validation register: `docs/validation-debt.md`; module status: `MODULE_REGISTRY.md`.
