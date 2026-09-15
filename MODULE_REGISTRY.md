# Module Registry

Implementation numbers are a delivery stream mapped to blueprint modules (AD-44).

| Impl | Blueprint | Scope built | Server | Web | Flutter | Design |
|---|---|---|---|---|---|---|
| M1 | M1 Identity & Access | People, roles, authority, devices, sessions | ✅ | ✅ | ✅ read | `modules/m1-identity-and-access.md` |
| M2 | M2 Academic Structure | Campus to term, calendar, curriculum | ✅ | ✅ | ✅ read | `modules/m2-*.md` |
| M3 | M3 Teaching Ops | Section; offering and instructor assignment | ✅ | ✅ | ✅ read | `modules/m3-*.md` |
| M4 | M6 Timetable | Room, slot, class session, taught | ✅ | ✅ | ✅ | `modules/m4-teaching-delivery.md` |
| M5 | M5 Student Records | Minimum only: student, membership, enrolment | ✅ | ✅ | none | `modules/m5-m6-attendance.md` |
| M6 | M7 Attendance | Sheet, record, correction | ✅ | ✅ | ✅ | `modules/m5-m6-attendance.md` |
| M7 | M9 Internal Assessment | Plan, mark sheet, verify, correct | ✅ | ✅ | ✅ | `modules/m7-internal-assessment.md` |
| — | Capability: offline outbox | Slice 1 idempotency (AD-58); slice 2 durable queue (AD-59), Android-verified 2026-09-13 | ✅ | not used | ✅ | `capabilities/offline-outbox.md` |
| — | Platform administration | Provisioning (S1/S2), lifecycle (SA-1), audit view (SA-2), accounts, roles and TOTP (SA-3), plan and seats (SA-4a), dev operator password (OPS-1); SA-5 missing; super admin app SAM-1 (sign-in, colleges, add college; AD-72) and SAM-2a (suspend, reactivate, close, reissue; AD-75) | ⚠️ | ⚠️ | ⚠️ admin app | `capabilities/platform-administration.md` |
| — | Mobile dashboard (MUX-1) | Home dashboard replacing bottom nav, light theme only, native charts (AD-67) | none | none | ✅ | `docs/blueprint/adr.md` AD-67 |
| — | College Admin onboarding (ONB-1) | Appoint a teacher (Faculty/HoD in a department, invitation to share) and admit a student into a program, on the phone (AD-76) | existing | existing | ✅ | `docs/blueprint/adr.md` AD-76 |
| — | College branding (BR-1) | Public lookup by code; logo URL and colour set by the platform and the College Admin; college-code-first app (AD-70) | ✅ | ✅ | ✅ | `docs/blueprint/adr.md` AD-70 |
| — | Academic calendar (CAL-1, CAL-2) | Holidays (no classes; M2's `non_teaching_days`, AD-39/46) and events (announced, classes go on; `calendar_events`, full day or timed) in one screen for everyone incl. students, not tied to terms; the College Admin adds, changes and removes (term.manage) | ✅ `GET /v1/calendar`, range add, `/v1/calendar/events` | none | ✅ | `docs/blueprint/adr.md` AD-39, AD-46 |
| — | Settings (SET-1) | Where the dashboard's profile icon was: profile, app lock and sign-in (informational), unsent changes, sign out | none | none | ✅ | — |
| — | Staff attendance (SA-A1…A5) | Geo-fenced punch in/out per campus, reports with charts, forgotten-punch requests, local reminders | ❌ | ❌ | ❌ | `docs/blueprint/adr.md` AD-83 |
| — | Leave management (LV-1) | Teachers and students apply (sick, short, half day) with a reason; approval | ❌ | ❌ | ❌ | OD-LV-1 open |
| M10 | Examinations/results | Not started | — | — | — | Blocked on OD-1 |

Code locations: server `server/src/modules/{assessment, attendance, curriculum, delivery, enrolment, identity, institution, teaching}`; web
`clients/web/src/features/{assessment, attendance, auth, curriculum, delivery, institutions, organisation, people, shell, students, teaching}`; mobile `lib/features/{assessment, attendance, auth, delivery, organisation, people, teaching}`,
outbox in `lib/core/outbox/`.
