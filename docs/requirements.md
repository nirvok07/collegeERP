# Project Requirements

The living register of everything this project has been asked to be. One row per requirement,
never deleted, only moved between states. When a requirement changes, the old one is marked
superseded and the new one is added below it, so the reasoning stays readable.

## How this file is maintained

The `requirements.md` at the repository root is an **inbox**, not a record. Requirements are
written there in any form, formal or not. Once they are absorbed into this file and reflected in
the relevant documents, the inbox is cleared so it is always obvious what is new and unprocessed.

Every requirement below names where it is reflected, so a change to a requirement has an
immediate list of documents to update.

Status values: **Active** in force, **Superseded** replaced by a later requirement,
**Deferred** accepted but not in the current release, **Assumed** chosen without instruction
and open to being overruled.

---

## Platform and identity

| ID | Requirement | Status | Reflected in |
|---|---|---|---|
| R1 | App name is **College** | Active | [Roadmap](10-roadmap.md) Phase 0 |
| R2 | Bundle and application id is `com.nirvok.collegeErp` | Active: set on Android and iOS; Firebase re-registration pending | [Mobile Platform Configuration](12-mobile-platform-config.md), [Roadmap](10-roadmap.md) Phase 0 |
| R3 | Flutter application targeting Android and iOS. No web or desktop in release one | Superseded by R28 | — |

## Engineering priorities

Stated by the user as the priorities of the project, in their words: "Clean code architecture,
offline first, cubit, dio are my priorities."

| ID | Requirement | Status | Reflected in |
|---|---|---|---|
| R4 | Clean architecture with a strict layer separation | Active | [Architecture](02-architecture.md) 2.1, 2.2 |
| R5 | Offline first. The app must be fully usable without a network | Refined by R21 | [Offline First](03-offline-first.md) |
| R6 | Cubit for state management, not another solution | Active | [State Management](06-state-management.md) |
| R7 | Dio as the HTTP client | Active | [Architecture](02-architecture.md) 2.5, [API Contract](05-api-contract.md) |
| R8 | Premium UI and UX, not merely functional | Active | [Design System](07-design-system.md) |

## Roles and structure

Stated by the user: "ek super admin hoga jo ki main chalaunga, fir admin hoga college ka, fir
teachers and students honge."

| ID | Requirement | Status | Reflected in |
|---|---|---|---|
| R9 | Four roles in a hierarchy: Super Admin, College Admin, Teacher, Student | Superseded by R17 | — |
| R10 | Super Admin is the platform operator, run by the project owner, and works across all colleges | Active | [Product Overview](01-product-overview.md) 1.2 |
| R11 | Multi-tenant. Each college is a tenant and no data may cross tenants | Active | [Data Model](04-data-model.md) 4.1, [Security](08-security.md) 8.4 |

## Process

| ID | Requirement | Status | Reflected in |
|---|---|---|---|
| R12 | Documentation is written before implementation begins | Active | This documentation set |
| R13 | The whole project is planned end to end before building | Active | [Roadmap](10-roadmap.md) |
| R14 | After a piece of work is finished, clear the root `requirements.md` inbox and record its contents here | Active | This file, section "How this file is maintained" |

## Navigation

| ID | Requirement | Status | Reflected in |
|---|---|---|---|
| R15 | Routing uses a routing package with declarative guards | Superseded by R16 | — |
| R16 | No routing package. Use Flutter's `Navigator` with a central `onGenerateRoute` | Active | [Architecture](02-architecture.md) 2.4, [Decisions](11-decisions.md) D13 |

## Enterprise architecture brief

Instructed 2026-09-11. Design the complete blueprint of a production ERP as an architecture
team would, reasoning from domains, actors, workflows, rules, data, permissions and UX rather
than from a feature list.

| ID | Requirement | Status | Reflected in |
|---|---|---|---|
| R17 | Authority is role by scope by validity. "Admin" is not one role, and roughly thirty distinct actors exist | Active | [Blueprint 1](blueprint/01-actors.md), [ADR](blueprint/adr.md) AD-1 |
| R18 | The system must be modular, scalable, secure, maintainable, auditable and extensible, suitable for a real college supported for years | Active | [Blueprint 3](blueprint/03-modules.md) |
| R19 | UX is a first-class part of the architecture. The product must feel like a modern premium SaaS tool, not a traditional college ERP | Active | [Design System](07-design-system.md), Blueprint Phase 8 pending |
| R20 | Everything touching money, marks or attendance must be auditable to an external auditor's standard, and correction must be a workflow rather than a database edit | Active | [ADR](blueprint/adr.md) AD-13, P6 in [Blueprint 2](blueprint/02-domains.md) |
| R21 | Offline capability applies to field roles on mobile. Back-office work is online-first | Active | [ADR](blueprint/adr.md) AD-9 |
| R22 | Work progressively. Maintain an Architecture Decision Log and an Open Decisions list. Never silently assume an important requirement | Active | [ADR](blueprint/adr.md), [Blueprint 0](blueprint/00-assumptions.md) |
| R23 | Do not create modules because they sound useful. Justify every boundary, and merge what belongs together | Active | [Blueprint 3](blueprint/03-modules.md) 3.2 |
| R24 | Specify modules one at a time, to a depth another team could implement without guessing. Twenty-four sections from purpose through to decision-log updates | Active | [M1](blueprint/modules/m1-identity-and-access.md) |
| R25 | A master checklist sits above the three methodology files, orchestrating and verifying them rather than replacing them. Status is never marked complete on a mention | Active | [MASTER-CHECKLIST.md](../MASTER-CHECKLIST.md) |
| R26 | Architecture drift is reported as an issue with problem, existing decision, conflict, affected modules, impact and recommended resolution. Never silently normalized | Active | [MASTER-CHECKLIST.md](../MASTER-CHECKLIST.md) section 7 |
| R28 | Two clients on one API: a web console for back-office roles, and Flutter for students, faculty and guardians. One backend, one set of business rules, no client-side duplication | Active | [ADR](blueprint/adr.md) AD-24 |
| R29 | A user must never be unexpectedly signed out. Sessions persist across browser reload and app restart, renew automatically, and survive a temporary network failure. Only an unrenewable session, explicit sign-out or a revoked credential ends one | Active | [ADR](blueprint/adr.md) AD-25, AD-26 |
| R30 | Development runs against Supabase-hosted PostgreSQL over DATABASE_URL, with no Supabase SDK, so production is a configuration change | Superseded by R46 | [Blueprint 4](blueprint/04-nfr-and-deployment.md), `server/.env` |
| R27 | Creating a college and its initial College Admin is one onboarding flow, not two mandatory steps. The entities stay separate: college is the tenant, user is the identity, admin is an access assignment. The architecture must still support replacement, suspension and multiple administrators | Active | [M1](blueprint/modules/m1-identity-and-access.md) W0, BR-25, BR-26, [ADR](blueprint/adr.md) AD-20, AD-21 |
| R31 | Teacher-facing access is derived from authoritative assignments and scopes on the server. A client never tells the backend which sections it teaches, and no second teacher-permission system exists | Active | [ADR](blueprint/adr.md) AD-40, [M3 offering](blueprint/modules/m3-course-offering.md) §5 |
| R32 | Mobile shows a teacher their own teaching only, never an administrator's college-wide section list. Each client gets the surface its user actually works in | Active | [ADR](blueprint/adr.md) AD-43, `lib/features/teaching/` |
| R33 | Attendance requires a stable teaching occurrence first. A class session is modelled, identified and frozen once taught, so no later edit can move historical attendance to another occurrence | Active | [ADR](blueprint/adr.md) AD-45, [M4](blueprint/modules/m4-teaching-delivery.md) |
| R34 | Scheduling invariants live in the database: one room and one teacher per hour, inside the term, against teaching that still expects to happen. Frontend validation is guidance, never the guarantee | Active | [ADR](blueprint/adr.md) AD-48, `server/migrations/013_teaching_delivery.sql` |
| R35 | The roster of a class is resolved as of that class's own date. A student who left in week ten is still on week three's register, and one who joined in week six is not | Active | [ADR](blueprint/adr.md) AD-50, [M5/M6](blueprint/modules/m5-m6-attendance.md) |
| R36 | Attendance is recorded against a concrete class session, one state per student, and a submitted register is never edited: it is corrected, with a reason, by an authority the teacher does not hold | Active | [ADR](blueprint/adr.md) AD-51, AD-53 |
| R37 | A register is written as one batch under optimistic concurrency, so two people marking one class cannot overwrite each other. Offline capture is explicitly not promised until an outbox exists | Active | [ADR](blueprint/adr.md) AD-52 |
| R38 | An internal mark records what happened: a score, absent, or exempt. A zero never stands in for a missed assessment, and totals and grades belong to examinations | Active | [ADR](blueprint/adr.md) AD-56, [M7](blueprint/modules/m7-internal-assessment.md) |
| R39 | The department sets the assessment plan and verifies and corrects submitted marks; the teacher enters and submits. A submitted sheet is corrected with a reason, never reopened | Active | [ADR](blueprint/adr.md) AD-57 |
| R40 | A teacher's field write is safe to send twice. A resend of a write whose response was lost gets its first outcome back, and is never applied twice or refused as someone else's change | Active | [ADR](blueprint/adr.md) AD-58, [Outbox](blueprint/capabilities/offline-outbox.md) |
| R41 | A teacher's six field writes survive no network, an app restart and a crash: they are kept encrypted on the phone, sent in order when the server is reachable, and never discarded or overwritten without a person deciding | Active | [ADR](blueprint/adr.md) AD-59, [Outbox](blueprint/capabilities/offline-outbox.md) §7 |
| R42 | The platform suspends, reactivates and closes a college with a recorded reason; a suspended or closed college's users lose access immediately, closing is final, and a lost administrator invitation is reissued without reviving the old link | Active | [ADR](blueprint/adr.md) AD-60, [Platform administration](blueprint/capabilities/platform-administration.md) |
| R43 | The platform can review everything platform accounts did, across colleges, filtered by college, action and time, without seeing a college's own activity or any secret | Active | [ADR](blueprint/adr.md) AD-61, [Platform administration](blueprint/capabilities/platform-administration.md) |
| R44 | Platform accounts are created and managed in the application by Owners, with explicit Owner and Support roles; Support holds no Owner power, nobody changes their own account, and the platform always keeps an active Owner | Active | [ADR](blueprint/adr.md) AD-64, [Platform administration](blueprint/capabilities/platform-administration.md) |
| R45 | Every platform account signs in with a password and an authenticator code; no platform session exists without an enrolled authenticator, secrets are sealed at rest, and recovery forces re-enrolment and is audited | Active | [ADR](blueprint/adr.md) AD-62, AD-63 |
| R46 | Development runs against local PostgreSQL `college_erp_dev` over `DATABASE_URL`, with no vendor SDK; the npm scripts load `server/.env`, and production is a configuration change | Superseded by R49 | [ADR](blueprint/adr.md) AD-66 |
| R47 | A college's seat limit is enforced by the database: one seat per live college account, on every path and under concurrency; a lowered limit disables nobody and refuses new accounts | Active | [ADR](blueprint/adr.md) AD-65 |
| R48 | The mobile app follows the prototype images in `assets/`: a white theme only for now, no bottom navigation, and a dashboard home with real charts from which every surface is opened | Active | [ADR](blueprint/adr.md) AD-67, `lib/features/dashboard/` |
| R49 | Development and app testing run against Supabase-hosted PostgreSQL through the Node API, with no Supabase SDK; production runs the same Node server on our own PostgreSQL | Active | [ADR](blueprint/adr.md) AD-68 |
| R50 | The super admin creates each college with its College Admin; the College Admin onboards teachers and students one at a time; a student activates with enrolment number and a one-time code, and every student account takes a seat | Active | [ADR](blueprint/adr.md) AD-69 |
| R51 | The app opens on the college code; the college's name, logo and colour then appear on sign-in and inside the app. The super admin and the College Admin can both set them | Active | [ADR](blueprint/adr.md) AD-70, migration 024 |
| R52 | The super admin has a separate app with its own entry point; the platform is administered only from it (the web console's platform side retires once the app covers it) | Active | [ADR](blueprint/adr.md) AD-72, `lib/main_admin.dart` |
| R53 | API calls are logged for development through Dio interceptors, never in production and never showing a secret | Active | [ADR](blueprint/adr.md) AD-73 |
| R54 | The super admin account is the owner's real address, nirvokofficial@gmail.com; its login code comes from an authenticator app, not email | Active | [ADR](blueprint/adr.md) AD-74 |
| R55 | The super admin can suspend, reactivate and close a college; colleges are never deleted | Active | [ADR](blueprint/adr.md) AD-75 |
| R56 | A college can be set up by the super admin as a temporary administrator and handed over to its real administrator; nobody's password is ever generated or shared | Active | [ADR](blueprint/adr.md) AD-75 |
| R57 | An invited person accepts the invitation and sets their own password on the web console or in the mobile app | Active | [ADR](blueprint/adr.md) AD-75 |
| R58 | The College Admin appoints teachers and onboards students from the mobile app, as well as the web console | Active | [ADR](blueprint/adr.md) AD-76, `lib/features/onboarding/` |
| R59 | Every time the app is opened while signed in, it asks for the fingerprint or face (biometric) before showing anything | Active, built (BIO-1) | [ADR](blueprint/adr.md) AD-78 |
| R60 | The dashboard shows no greeting and none of the user's own details (name, email) | Active, built (UX-2) | [ADR](blueprint/adr.md) AD-77 |
| R61 | The user's own details are visible only in their Profile | Active, built (UX-2) | [ADR](blueprint/adr.md) AD-77 |
| R62 | Classes can be created from the app | Active, built: cohort sections (ADM-6) and timetable slots and classes (ADM-8) (OD-MOB-2 resolved under AD-81) | [ADR](blueprint/adr.md) AD-81 |
| R63 | "Will all modules be on mobile too?" | Answered by the owner 2026-09-14, "all modules for phone too": every module comes to the phone (AD-81), one slice at a time (ADM-3…ADM-11, SAM-2b, SAM-3); the web console stays | [ADR](blueprint/adr.md) AD-81, [PROJECT_STATE](../PROJECT_STATE.md) |
| R64 | The dashboard's app bar is a collapsing sliver app bar in the style of the prototype's attendance screen | Active, built (UX-2) | [ADR](blueprint/adr.md) AD-77, `assets/` |
| R65 | A college user changes their own password from the app's Profile | Active, built on mobile (ADM-1); web ❌ | [ADR](blueprint/adr.md) AD-79, `POST /v1/auth/password` |
| R66 | The College Admin's dashboard is the college's (its numbers and the modules it manages, where the admin creates things), not a teacher's | Active; ADM-1 built the dashboard; creating organisation, programs, sections, timetable and students on the phone is ADM-2…ADM-6 | [ADR](blueprint/adr.md) AD-79 |
| R67 | Firebase Crashlytics in the college app | Active, built earlier (initialisation verified on Android 2026-09-13); a first crash report in the Firebase console 🔍 | [Mobile Platform Configuration](12-mobile-platform-config.md) |
| R69 | "What will an admin do to recover a forgotten password?" | Active, built (PW-1): a one-time reset code, issued by an account manager in People (an administrator's only by another administrator) or by the Super Admin for a college administrator; redeemed in the app or on the web; option (a) of OD-PW-1, chosen on the owner's "forgot password flow" | [ADR](blueprint/adr.md) AD-80 |
| R70 | The College Admin creates, renames and archives campuses and departments from the phone | Active, built (ADM-2) | [ADR](blueprint/adr.md) AD-79 |
| R71 | Every module is on the phone too ("all modules for phone too") | Active; ADM-3 (programs, academic years, terms) and ADM-4 (courses, curriculum versions), ADM-5 (rooms), ADM-6 (sections, members), ADM-7 (offerings, teachers, enrolments) ADM-8 (timetable, classes, non-teaching days), ADM-9 (students), ADM-10 (access, college profile) and ADM-11 (registers, verification, corrections) built: every college module is on the phone; SAM-2b (plan, seats, branding) and SAM-3 (platform accounts, audit, invitation acceptance) built in the Super Admin app: every module is on the phone; restated by the owner 2026-09-14: "sub kuch phone pe bhi hoga, everything" | [ADR](blueprint/adr.md) AD-81 |
| R68 | "All the Firebase things" | Active, read as the approved set: Core, Crashlytics, Remote Config, Messaging, all built. Not Firebase Auth, Firestore or Storage (identity and data are the ERP's own). Open: console test push and crash report (owner), backend push delivery (Drift 6) | [Mobile Platform Configuration](12-mobile-platform-config.md) |

## Assumptions awaiting confirmation

These were chosen so work could proceed. Each can be overruled, and the cost of doing so is
stated in [Decisions](11-decisions.md).

| ID | Assumption | Status | Reflected in |
|---|---|---|---|
| A1 | The backend is a custom REST API behind an abstract contract | Assumed | [Decisions](11-decisions.md) D4, [API Contract](05-api-contract.md) |
| A2 | The local store is Drift over SQLite | Assumed | [Decisions](11-decisions.md) D3, [Data Model](04-data-model.md) |
| A9 | A program belongs to one department on one campus; campus variants are separate programs | Resolved, OD-M2-1 | [ADR](blueprint/adr.md) AD-37 |
| A3 | Release one ships Core, Academics and Communication. Fees and payments follow in release two | Assumed | [Decisions](11-decisions.md) D12, [Roadmap](10-roadmap.md) |
| A4 | English only in release one, with all strings externalized so languages can be added later | Assumed | [Product Overview](01-product-overview.md) 1.5 |
| A5 | Light and dark themes both ship in release one | Overruled for mobile, for now (AD-67): light only | [Decisions](11-decisions.md) D11 |
| A6 | Scale target of 20,000 students per tenant, 500 tenants, 20,000 peak concurrent at maturity | Resolved, derived not asserted | [Blueprint 4](blueprint/04-nfr-and-deployment.md) §4.1-4.3 |
| A7 | Shared PostgreSQL with row-level tenant isolation, partitioned, India region | Resolved | [ADR](blueprint/adr.md) AD-22 |
| A8 | Identity is per tenant. A person administering three colleges holds three logins | Open, OD-M1-5, recommendation carried | [M1](blueprint/modules/m1-identity-and-access.md) §22 |

## Deferred

| ID | Requirement | Status | Target |
|---|---|---|---|
| D1 | Fees, payments and gateway integration | Deferred | Release two |
| D2 | Analytics and custom report builder | Deferred | Release two |
| D3 | Library, hostel and transport modules | Deferred | Release three |
| D4 | Parent role | Deferred | Release three |
| D5 | Multi-language support | Deferred | Release three |
| D6 | Web admin console | Deferred | Release three |
