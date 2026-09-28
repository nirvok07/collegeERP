# Validation debt register

Updated 2026-09-28 during P0-4 inventory. `PROJECT_STATE.md` contains 47 `🔍` markers: 46
product/runtime checks plus the local server-test-database blocker. The entries below group related
markers so one browser or Android pass can clear several slices; each row still names the evidence
required before it can be marked complete.

| Surface | Slice(s) | Evidence required | Status |
|---|---|---|---|
| Server | P0-1 / P0-2 | Run `syllabus.test.ts`, `migration-invariants.test.ts`, and the full server suite against the local test DB | ✅ `519/519` server tests passed on 2026-09-28 |
| Android | AD-83 / P0-0 | Real GPS fix inside and outside a configured campus fence; verify missing/outside messages | 🔍 phone required |
| Android | BIO-1, FB-3/4/5, MUX-1 | Cold-open lock, every sign-out route, OTP keyboard/autofill, admin/teacher/student dashboards | 🔍 phone required |
| Android | BR-1, ADM, ONB-1/2, UX-2, SET-1 | Branding, admin modules, onboarding, profile/settings flows on a real phone | 🔍 phone required |
| Android | CAL-1/2, ST-1 | Calendar events and student timetable on a signed-in phone | 🔍 phone required |
| Android | PW-1, FEE-7, G1/G2 | Reset code, dummy online payment link, OS PDF print/share sheet, fee reports | 🔍 phone required |
| Android | ND-S6, saved-first reads | Container language and saved/offline/refresh behavior across all migrated screens | 🔍 phone required |
| Android | Firebase R67/68 | First Crashlytics report and a console test push on the owner’s device | 🔍 owner console/device |
| Android | CAP-3 / Drift 6 | Real backend push delivery after sealed-token implementation | 🚫 backend capability not built |
| Android | OTP-1/2/3/4/7 | Both app OTP sign-in, session renewal, and real email delivery where applicable | 🔍 phone; SMTP delivery separately |
| Browser | WEB-1 / WID-1 | Live-server college sign-in and session handover in Chrome | 🔍 live server required |
| Browser | ND-S7 and prior web UI slices | Run the committed Playwright visual check for signed-in dashboard/module screenshots and review defects | 🔍 seeded DB + live browser required |
| Browser | Web saved reads / charts / visual slices | Loading, empty, error, success and chart states in a live browser | 🔍 seeded DB + live browser required |
| Tooling | ENV-3 | VS Code automatic task approval and `adb reverse` with a USB phone | 🔍 one-time owner/device action |
| Platform | iOS | Any iOS validation | 🚫 Xcode unavailable |

No item is considered complete from a build or unit test alone; the evidence column is the required
close-out proof. Rows marked 🚫 are explicit external blockers and should not be retried until the
named dependency changes.
