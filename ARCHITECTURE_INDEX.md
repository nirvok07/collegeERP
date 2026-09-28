# Architecture Index

Pointers, not content. Read the linked file for the decision itself.

## Where things are decided

| Topic | Source of truth |
|---|---|
| **Documentation entry point and tracker ownership** | `docs/README.md` |
| Decisions (AD-1…AD-93) | `docs/blueprint/adr.md` |
| Requirements register (R1…R80) | `docs/requirements.md` (root `requirements.md` is an inbox, kept empty) |
| **Module & capability index (start here)** | `docs/blueprint/modules/README.md` |
| Blueprint module designs | `docs/blueprint/modules/*.md` |
| Platform capabilities P1–P9 | `docs/blueprint/capabilities/p*.md` |
| Shared capabilities | `docs/blueprint/capabilities/offline-outbox.md` |
| Platform administration readiness | `docs/blueprint/capabilities/platform-administration.md` |
| Offline model | `docs/03-offline-first.md` |
| Security rules | `docs/08-security.md` |
| Mobile platform, Firebase, device evidence | `docs/12-mobile-platform-config.md` |
| Drift and blocker register | `docs/MASTER-CHECKLIST.md` (Drift 1–6, OD-*) |
| Long-form slice history | `docs/IMPLEMENTATION-CHECKPOINT.md` |
| Audit, coverage gaps, rationale | `docs/MASTER-PLAN.md` (2026-09-28) |
| **What to build next (map and gates)** | `docs/EXECUTION-CHECKLIST.md` |
| **Task-level build plan, per phase** | `docs/checklists/P0…P7` (1,281 tasks) |

## Stack (locked)

Server `server/`: Node 24, Fastify 5, `pg` without ORM, zod, node:test. Web `clients/web/`: React 19,
Vite, TypeScript, Vitest (AD-54). Mobile at repo root `lib/`: Flutter, Cubit, Dio, get_it,
Navigator `onGenerateRoute`, Drift over SQLite3MultipleCiphers (AD-59). No Flutter Web. Two Android
apps: flavor `college` (`lib/main.dart`, default) and `admin` (`lib/main_admin.dart`, `lib/admin/`,
AD-72). API logs: one redacting Dio interceptor, debug only (AD-73).
Firebase: FCM, Remote Config, Crashlytics only.

## Development environment (AD-68, AD-66)

Supabase PostgreSQL for development and app testing, as plain PostgreSQL through its session pooler;
the Node API is unchanged and production runs it on our own PostgreSQL. `npm run db:supabase:rebuild`
(guarded, owner-run) builds the Supabase schema from the migrations and switches `server/.env`,
keeping local values as `LOCAL_*`. Local `college_erp_test` for `npm test`, which sets its own
configuration. The npm scripts load `server/.env` (`--env-file-if-exists`); `server/.env.example`
shows its shape.

## Load-bearing patterns

- Tenant row-level security with FORCE; least-privilege `erp_app`; DELETE only on declared tables.
- Invariants in triggers; PL/pgSQL variables prefixed `v_`.
- Role grants permission, instructor assignment limits reach (AD-40). Platform: role assignment to permission matrix (AD-64).
- Optimistic concurrency by `version` (AD-52) plus idempotency keys (AD-58).
- Crossing tenant isolation only through narrow SECURITY DEFINER functions (migrations 005, 020, 022).
- Secrets the server must read back are sealed with AES-256-GCM (AD-63); everything else is hashed.
- Growing lists page by keyset cursor (AD-61); short lists stay capped by `limit`.
- Correction rows apply changes; correction tables are INSERT and SELECT only.
- Dates are calendar strings end to end (AD-49); rosters resolve as of the class date (AD-50).
- An unauthenticated read answers identically for unknown and unusable subjects (AD-70, like sign-in).

## ADR index

| ADR | Decision | Status |
|---|---|---|
| AD-1 | Authority is role × scope × validity, not a role column | Active |
| AD-2 | Campus is a first-class scope from day one | Active |
| AD-3 | Curriculum is versioned by regulation year and frozen once published | Active |
| AD-4 | Enrolment, not section membership, is the unit of academic record | Active |
| AD-5 | Nine domains and eight platform capabilities, not twenty-five modules | Active |
| AD-6 | All money lives in one ledger, owned by Student Finance | Active |
| AD-7 | No derived academic value is stored | Active |
| AD-8 | External examination results are a read-only mirror | Active |
| AD-9 | Offline-first applies to field roles on mobile, not to the whole system; amended 2026-09-14: reads are cache-first on every mobile screen, writes unchanged | Active, amended |
| AD-10 | Modules integrate through domain events | Active |
| AD-11 | Academic year rollover is a first-class, rehearsable operation | Active |
| AD-12 | Every mutable record carries a version, and conflicts are surfaced | Active |
| AD-13 | Correction is a workflow, never a database edit | Active |
| AD-14 | Person and UserAccount are separate entities | Active |
| AD-15 | Committee membership is a role assignment scoped to the committee | Active |
| AD-16 | Permissions resolve at request time, with bounded-staleness caching | Active |
| AD-17 | Delegation cannot be chained, exceeded, or outlive its source | Active |
| AD-18 | Deny by default, and no-access is a designed state | Active |
| AD-19 | Impersonation is read-only, institution-approved, time-boxed and fully audited | Active |
| AD-20 | Tenant provisioning runs as one transaction across M1 and M2 | Active |
| AD-21 | No denormalized administrator pointer on the institution | Active |
| AD-22 | Shared PostgreSQL with row-level tenant isolation, partitioned on the two high-volume tables | Active |
| AD-23 | A published result is the one permitted materialized academic value | Active |
| AD-24 | The back office is a web console; Flutter serves students and faculty | Active |
| AD-25 | Session lifetime and access-token lifetime are separate concerns | Active |
| AD-26 | Web keeps the refresh token in an httpOnly cookie and the access token in memory | Active |
| AD-27 | Archiving an organisational unit is refused while authority is scoped to it | Active |
| AD-28 | Cross-module scope questions go through a declared capability, not a shared read | Active |
| AD-29 | Organisational structure administration is web-only, by intent | Active |
| AD-30 | Firebase is platform infrastructure, three services only | Active |
| AD-31 | Flutter implements the same motion principles with native mechanisms | Active |
| AD-32 | Mobile reads; the desktop console writes structure and authority | Active |
| AD-33 | Course identity is separate from curriculum placement | Active |
| AD-34 | Published curriculum immutability is enforced by database trigger | Active |
| AD-35 | Errata and amendments are different operations | Active |
| AD-36 | Section scope belongs to M3 Teaching Operations, not the curriculum | Active |
| AD-37 | A program belongs to one department; campus variants are separate programs | Active |
| AD-38 | A Section is a cohort of students within a program for one term, not a course offering | Active |
| AD-39 | The academic calendar belongs to M2, not M3 | Active |
| AD-40 | A role assignment is a permission; an instructor assignment is a reach constraint | Active |
| AD-41 | Offering identity is (section, course, component), and the term is deliberately absent | Active |
| AD-46 | M4 owns the room, and the boundary to a future facilities domain is stated now | Active |
| AD-49 | A DATE column is read as a calendar date, never as an instant | Active |
| AD-50 | M5's roster arrives with attendance, under M5's name, and is resolved as of a date | Active |
| AD-52 | One register is written as a batch under optimistic concurrency | Active |
| AD-53 | Correcting a submitted register is the head of department's authority, not the teacher's | Active |
| AD-54 | The React client lives in `clients/web/`; the repository has no Flutter Web | Active |
| AD-55 | Internal assessment is built now; examinations wait for OD-1 | Active |
| AD-56 | A mark records what happened, not what it is worth | Active |
| AD-58 | Field writes are made replay-safe by an idempotency key, layered over version pinning | Active |
| AD-59 | The mobile local store is Drift over SQLite3MultipleCiphers, keyed from the platform keystore | Active |
| AD-60 | A suspended or closed college's users are refused entirely, at every request and at renewal | Active |
| AD-61 | The platform reads only the events it caused, through one narrow definer function, newest first by keyset | Active |
| AD-62 | The platform's second factor is a TOTP authenticator app | Active |
| AD-63 | Platform secret protection (AES-256-GCM, dedicated key) and sole-Owner break-glass | Active |
| AD-64 | Platform authority is an Owner or Support role assignment, resolved per request | Active |
| AD-65 | A seat is a live college account; a lowered limit blocks new accounts and disables none | Active (023 on Supabase by hand; the rebuild tracks it) |
| AD-66 | Development runs on local PostgreSQL `college_erp_dev`; the npm scripts load `server/.env` | Database superseded by AD-68 |
| AD-67 | Mobile home is a dashboard, not bottom navigation; light theme only for now | Active |
| AD-68 | Development and app testing on Supabase PostgreSQL; production on our own Node and PostgreSQL | Active; Supabase rebuilt 2026-09-14 |
| AD-69 | Onboarding one person at a time; students activate with enrolment number and a one-time code | Active |
| AD-70 | College code first; the college's name, logo and colour dress the app; public lookup answers alike for unusable colleges | Active |
| AD-71 | An operator may set a platform account's password, in development only | Active |
| AD-72 | The super admin has its own Flutter app (flavor `admin`); the web platform console retires at parity | Active (SAM-1) |
| AD-73 | API logs in development only, through one redacting Dio interceptor | Active |
| AD-74 | Real Owner nirvokofficial@gmail.com; authenticator app kept; dev operator create-owner and disable | Active |
| AD-75 | No college deletion; handover through a temporary administrator; invitations accepted on web and phone | Active |
| AD-76 | College Admin onboards teachers and students from the phone too (amends AD-32 for onboarding) | Active |
| AD-77 | Dashboard carries the college and the day, never the person; Profile carries the person | Active |
| AD-78 | The phone's own lock guards every open of a signed-in app (both apps) | Active; OD-BIO-1 to confirm |
| AD-79 | College Admin's own dashboard and modules on the phone (amends AD-32); change password | Active; ADM-1, ADM-2 built; ADM-3…6 next |
| AD-80 | Forgotten password: one-time reset code from an account manager or the Super Admin; no email | Active; PW-1 built |
| AD-81 | Every module on the phone too (supersedes AD-32); back-office writes online only | Active; complete: college app ADM-1…11, Super Admin app SAM-2b, SAM-3 |
| AD-82 | Sign-in by one-time code to email or mobile, for everyone; no passwords (supersedes AD-62, AD-80, AD-69's code) | Approved 2026-09-14; OTP-1…5 to build; fixed code 123456 until go-live (risk accepted by owner) |
| AD-83 | Staff attendance: geo-fenced punch in/out per campus, online only, coordinates checked then discarded; corrections are approved requests; reminders local | Approved 2026-09-15; SA-A1…A5 to build |
| AD-84 | Parity is a definition of done; missing surfaces require a named exception | Adopted 2026-09-28; active |
| AD-85 | Generate client contracts from server OpenAPI/zod schemas | Adopted 2026-09-28; capability pending |
| AD-86 | Fees reach the web console | Adopted 2026-09-28; PAR-1 pending |
| AD-87 | Notification delivery is one centrally owned platform capability | Adopted 2026-09-28; CAP-2 pending |
| AD-88 | Scheduled work is one centrally owned P9 job capability | Adopted 2026-09-28; CAP-3 pending |
| AD-89 | Document storage is one centrally owned, permissioned platform capability | Adopted 2026-09-28; CAP-4 pending |
| AD-90 | Reports are declared contracts rendered by generic client surfaces | Adopted 2026-09-28; CAP-5 pending |
| AD-92 | Known-failing tests are blockers, not notes | Adopted 2026-09-28; active |
| AD-93 | Staff leave is M14; student excused absence is M7 | OD-LV-1 resolved 2026-09-15; implementation deferred to the owning slices |

- `docs/new-design/` — container and ratio language derived from `assets/new_design.jpeg` (extends `docs/07-design-system.md`); slices ND-S1…ND-S7
