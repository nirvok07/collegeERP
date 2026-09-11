# College ERP — Project Documentation

Multi-tenant college ERP built with Flutter. One codebase serves four roles across many
colleges: a platform **Super Admin**, a per-college **Admin**, **Teachers**, and **Students**.

- App name: **College**
- Bundle / application id: `com.nirvok.collegeErp`
- Priorities: clean architecture, offline-first, Cubit, Dio, premium UI/UX.

## Read in this order

| # | Document | What it settles |
|---|---|---|
| 1 | [Product Overview](01-product-overview.md) | Roles, tenancy, modules, release scope |
| 2 | [Architecture](02-architecture.md) | Layers, folder structure, DI, routing, errors |
| 3 | [Offline First](03-offline-first.md) | Local source of truth, sync engine, conflicts |
| 4 | [Data Model](04-data-model.md) | Entities, relationships, local schema |
| 5 | [API Contract](05-api-contract.md) | REST conventions, auth, sync endpoints |
| 6 | [State Management](06-state-management.md) | Cubit conventions and state shape |
| 7 | [Design System](07-design-system.md) | Tokens, components, motion, responsiveness |
| 8 | [Security](08-security.md) | Auth, token storage, RBAC, tenant isolation |
| 9 | [Testing](09-testing.md) | What is tested and how |
| 10 | [Roadmap](10-roadmap.md) | Phased delivery plan and milestones |
| 11 | [Decisions](11-decisions.md) | Chosen options, rejected options, and why |
| — | [Requirements](requirements.md) | The living register of what was asked for, and where each requirement lives |

## Enterprise blueprint

The documents above describe the client application. The blueprint below designs the ERP as an
enterprise system. It is in progress and awaiting approval before deep module specifications.

| # | Document | What it settles |
|---|---|---|
| B0 | [Assumptions and Open Decisions](blueprint/00-assumptions.md) | What is assumed, and the eight questions that change the architecture |
| B1 | [Actors and Organization](blueprint/01-actors.md) | The college as a real organization, every actor, the authority model |
| B2 | [Business Domains](blueprint/02-domains.md) | Nine domains and eight platform capabilities, in full |
| B3 | [Module Architecture](blueprint/03-modules.md) | Twenty-four modules, boundary reasoning, data ownership, events |
| — | [Architecture Decision Log](blueprint/adr.md) | Every enterprise decision with alternatives and impact |

### Module specifications

| Module | Phase | Status |
|---|---|---|
| [M1 Identity and Access](blueprint/modules/m1-identity-and-access.md) | 0 | Specified, awaiting review |

## Assumptions in force

These were chosen so planning could proceed. Each is isolated in
[Decisions](11-decisions.md), so overruling one does not invalidate the others.

1. The backend is a **custom REST API** with JWT auth. All Flutter code talks to it through
   an abstract contract, so swapping in Supabase or another backend changes only the
   `data/remote` layer.
2. The local store is **Drift** over SQLite.
3. Release one ships Core, Academics and Communication. Fees and payments land in release two.
