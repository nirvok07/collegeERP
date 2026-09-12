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
| R2 | Bundle and application id is `com.nirvok.collegeErp` | Active | [Roadmap](10-roadmap.md) Phase 0 |
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
| R30 | Development runs against Supabase-hosted PostgreSQL over DATABASE_URL, with no Supabase SDK, so production is a configuration change | Active | [Blueprint 4](blueprint/04-nfr-and-deployment.md), `server/.env` |
| R27 | Creating a college and its initial College Admin is one onboarding flow, not two mandatory steps. The entities stay separate: college is the tenant, user is the identity, admin is an access assignment. The architecture must still support replacement, suspension and multiple administrators | Active | [M1](blueprint/modules/m1-identity-and-access.md) W0, BR-25, BR-26, [ADR](blueprint/adr.md) AD-20, AD-21 |
| R31 | Teacher-facing access is derived from authoritative assignments and scopes on the server. A client never tells the backend which sections it teaches, and no second teacher-permission system exists | Active | [ADR](blueprint/adr.md) AD-40, [M3 offering](blueprint/modules/m3-course-offering.md) §5 |
| R32 | Mobile shows a teacher their own teaching only, never an administrator's college-wide section list. Each client gets the surface its user actually works in | Active | [ADR](blueprint/adr.md) AD-43, `lib/features/teaching/` |

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
| A5 | Light and dark themes both ship in release one | Assumed | [Decisions](11-decisions.md) D11 |
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
