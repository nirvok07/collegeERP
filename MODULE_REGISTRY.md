# Module Registry

Implementation numbers are a delivery stream mapped to blueprint modules (AD-44).

**Full module and capability index, including every unbuilt module: `docs/blueprint/modules/README.md`.**
What to build next, tickable: `docs/EXECUTION-CHECKLIST.md`. Audit and rationale: `docs/MASTER-PLAN.md`.

Per **AD-84** a slice is DONE only when it exists on server, web and Flutter, or a parity exception
is recorded in this file with its reason.

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
| — | Staff attendance (SA-A1…A5) | Punch in/out shipped (SA-ATT-1). **Geo-fence specified and NOT enforced — see P0-0.** Reports, corrections, reminders not built | ⚠️ | ⚠️ punch to withdraw | ⚠️ | `modules/staff-attendance.md` |
| M14 | Leave and Workload (LV-1) | Staff leave, balances, approval, substitution. OD-LV-1: student excused absence belongs to M7, not here | ❌ | ❌ | ❌ | `modules/leave-and-workload.md` |
| M4 | Admissions and Student Lifecycle | Enquiry → application → merit → offer → admission; lifecycle, clearance, certificates | ❌ | ❌ | ❌ | `modules/admissions.md` |
| M8 | Coursework and Feedback | Assignment handover only; marks hand to M9. Not an LMS | ❌ | ❌ | ❌ | `modules/coursework.md` |
| M12 | Scholarships | Schemes, eligibility, awards; effect is always an M11 concession or payment | ❌ | ❌ | ❌ | `modules/scholarships.md` |
| M13 | HR and Staff | Employee, employment periods, service record, workload, exit | ❌ | ❌ | ❌ | `modules/hr-and-staff.md` |
| M15 | Payroll | Structures, runs, payslips, statutory returns. Frozen runs, arrears never edits | ❌ | ❌ | ❌ | `modules/payroll.md` |
| M16 | Library | Catalogue/holding split, circulation, fines to M11 | ❌ | ❌ | ❌ | `modules/library.md` |
| M17 | Hostel | Bed-level allocation, mess, gate passes | ❌ | ❌ | ❌ | `modules/hostel.md` |
| M18 | Transport | Routes, vehicles with compliance grounding, passes | ❌ | ❌ | ❌ | `modules/transport.md` |
| M19 | Materials and Assets | Indent → purchase → GRN → issue; asset register and depreciation | ❌ | ❌ | ❌ | `modules/materials-and-assets.md` |
| M20 | Communication | Notices and circulars with audience targeting. **Closes a live student-facing gap** | ❌ | ❌ | ❌ | `modules/communication.md` |
| M21 | Cases | One primitive for grievance, discipline, helpdesk | ❌ | ❌ | ❌ | `modules/cases.md` |
| M22 | Events and Activities | Extends CAL-2 calendar events with registration and activity credit | ⚠️ calendar | ❌ | ⚠️ | `modules/events.md` |
| M23 | Placements | Recruiters, drives, computed eligibility, offers | ❌ | ❌ | ❌ | `modules/placements.md` |
| M24 | Alumni | Lifecycle tail of the student record; consent-first | ❌ | ❌ | ❌ | `modules/alumni.md` |
| — | Institutional Accounts | **Named gap, OD-ACC-1.** No general ledger exists; M11 is the student ledger only | ❌ | ❌ | ❌ | `modules/institutional-accounts.md` |
| — | Capabilities P1–P9 | Approvals, notifications, documents, certificates, reporting, audit, search, config, **scheduled work** | ⚠️ | ⚠️ | ⚠️ | `capabilities/p*.md` |
| M10 | Examinations and Results | Not started. AD-91 proposed: mirror now, engine behind a flag | 🚫 | 🚫 | 🚫 | `modules/examinations-and-results.md` |

Code locations: server `server/src/modules/{assessment, attendance, curriculum, delivery, enrolment, identity, institution, teaching}`; web
`clients/web/src/features/{assessment, attendance, auth, curriculum, delivery, institutions, organisation, people, shell, students, teaching}`; mobile `lib/features/{assessment, attendance, auth, delivery, organisation, people, teaching}`,
outbox in `lib/core/outbox/`.
