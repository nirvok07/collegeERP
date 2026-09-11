# 10. Roadmap

Sequenced so that each phase produces something demonstrable and so the riskiest work happens
early, while it is still cheap to change.

## Phase 0 — Foundation

No product features. This is the skeleton everything else is built on.

- Project configuration: bundle id `com.nirvok.collegeErp`, app name **College**, flavors for
  dev, staging and production, app icons and splash
- Package set installed, `build_runner` and lints configured, `analysis_options` tightened
- `core/` in place: design tokens, theme, `Result` and `Failure`, Dio client with all four
  interceptors, `get_it` wiring, `onGenerateRoute` with a role guard, `AppScaffold`
- Drift database with the sync columns, outbox and cursor tables, and a migration harness
- The component library from section 7.5, with golden tests
- CI running analyze, format check and tests

Done when a themed shell app navigates between placeholder role homes and the component gallery
renders correctly in both themes.

## Phase 1 — Auth, session and the sync engine

The highest-risk phase. It is built before any feature depends on it.

- Login, forgot password, accept invite, logout
- `SessionCubit`, secure token storage, refresh with concurrent-401 queuing
- Role-based routing and the permission model
- The full sync engine: outbox drain with ordering and backoff, delta pull with cursors,
  conflict policies, tombstones, pruning
- `SyncCubit`, the global offline banner, and the Sync Center screen
- Airplane-mode test matrix exercised end to end against a fake API

Done when a user logs in, goes offline, makes changes, comes back online, and every change lands
exactly once with conflicts surfaced correctly.

## Phase 2 — Super Admin and college onboarding

- Tenant list, create, suspend, and the first-admin invite
- Platform metrics dashboard
- Read-only impersonation with its persistent banner and audit trail

Done when a new college can be created and its admin can log in, with no manual backend work.

## Phase 3 — Academic structure and users

- Academic years, departments, programs, class sections, subjects
- Teacher and student creation, edit, deactivate
- CSV bulk import with progress and per-row error reporting
- Teaching assignments
- Profile screens for all roles

Done when a college is fully configured and every user can sign in and see a correct home.

## Phase 4 — Timetable

- Admin timetable builder with clash detection for both teacher and section
- Publishing, and effective-date handling for mid-term changes
- Teacher and student timetable views, day and week
- Today's classes on every dashboard

Done when a published timetable appears correctly for every affected user, offline.

## Phase 5 — Attendance

The flagship offline flow.

- Teacher session list for the day, derived from the timetable
- Roster marking with fast interaction: tap to toggle, mark-all-present default, bulk actions
- Draft and submit, fully offline, with pending indicators
- Student attendance summary per subject, with a shortfall warning
- Admin attendance reports by section, subject and date range

Done when a teacher completes a week of marking in airplane mode and everything reconciles.

## Phase 6 — Exams and results

- Exam and assessment setup
- Teacher marks entry with validation against maximum marks, draft and submit
- Publication control, and student visibility gated on it
- Student results view and report card
- Admin result analytics per section and subject

Done when results publish atomically and no unpublished mark is ever visible to a student.

## Phase 7 — Notices and push

- Notice composition with audience targeting
- FCM integration, content-free payloads, and targeted sync on receipt
- Notice inbox with read receipts and unread counts
- Notification preferences per user

Done when a targeted notice reaches exactly the intended audience and no one else.

## Phase 8 — Release one hardening

- Performance pass: frame timings on a low-end device, list scrolling, cold start
- Full accessibility audit at 200 percent text scale
- Security checklist from section 8.9
- Store listings, privacy policy, account deletion flow
- Beta with one real college

## Release two and beyond

Fees and payments with server-verified, idempotent webhooks. Analytics and custom reports.
Library, hostel and transport. Parent role. Multi-language. Web admin console.

## Sequencing rules

- No feature phase begins before the sync engine passes its offline test matrix, because
  retrofitting offline behaviour into finished features is the most expensive mistake available
  here.
- Every phase ships all five screen states, both themes, and its tests. A phase is not done
  when the happy path works.
