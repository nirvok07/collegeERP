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
| — | Capability: offline outbox | Slice 1 idempotency (AD-58); slice 2 durable queue (AD-59), device validation blocked | ✅ | not used | ✅ | `capabilities/offline-outbox.md` |
| — | Platform administration | Provisioning and colleges list only (S1/S2); SA-1…SA-5 missing | 🟡 | 🟡 | none | `capabilities/platform-administration.md` |
| M10 | Examinations/results | Not started | — | — | — | Blocked on OD-1 |

Code locations: server `server/src/modules/{assessment, attendance, curriculum, delivery, enrolment, identity, institution, teaching}`; web
`clients/web/src/features/{assessment, attendance, auth, curriculum, delivery, institutions, organisation, people, shell, students, teaching}`; mobile `lib/features/{assessment, attendance, auth, delivery, organisation, people, teaching}`,
outbox in `lib/core/outbox/`.
