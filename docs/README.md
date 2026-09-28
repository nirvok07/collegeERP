# College ERP — Project Documentation

Multi-tenant college ERP serving a platform **Super Admin**, per-college **Admins**, **Teachers**
and **Students** across many colleges. One backend, one database, one authorization model, and
two first-class clients (AD-24, AD-54):

- **Web** — React, Vite and TypeScript, in `clients/web/`. The back office.
- **Mobile** — Flutter for Android and iOS, at the repository root. Students and faculty.
- There is no Flutter Web.

- App name: **College**
- Bundle / application id: `com.nirvok.collegeErp`, with Firebase re-registration pending
  ([Mobile Platform Configuration](12-mobile-platform-config.md))
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
| 12 | [Mobile Platform Configuration](12-mobile-platform-config.md) | App identity, Firebase registration, what device validation must confirm |
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
| B4 | [Scale, Performance and Deployment](blueprint/04-nfr-and-deployment.md) | Derived scale targets, load profile, performance budgets, tenancy and hosting |
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

## Working protocol and running notes

Moved here from the repository root (2026-09-21) so only the trackers named in `CLAUDE.md`
(`PROJECT_STATE.md`, `ARCHITECTURE_INDEX.md`, `MODULE_REGISTRY.md`, `requirements.md` inbox)
stay at the root.

## Tracker hierarchy

This README is the entry point for documents. The trackers below are intentionally not competing
copies: each owns one question, and a slice is not complete until its state is reflected in
`PROJECT_STATE.md` and its phase checklist.

| Question | Owner | Scope |
|---|---|---|
| What is true now, and what is the one next action? | [`PROJECT_STATE.md`](../PROJECT_STATE.md) | Compact current-state tracer and blockers |
| What should be built next? | [`EXECUTION-CHECKLIST.md`](EXECUTION-CHECKLIST.md) | Build map, phase gates and sequencing |
| What tasks close the current phase? | [`checklists/`](checklists/README.md) | Tickable P0–P7 task detail; P0 is the active phase |
| Is the architecture process or a drift/owner decision incomplete? | [`MASTER-CHECKLIST.md`](MASTER-CHECKLIST.md) | Architecture-process verification and drift register |
| What must the owner answer before gated domains begin? | [`OWNER-DECISION-BRIEF.md`](OWNER-DECISION-BRIEF.md) | Prepared questions and recommendations for OD-1, OD-4 and OD-ACC-1; not answers |
| What browser, device and tooling evidence is still missing? | [`validation-debt.md`](validation-debt.md) | Item-level validation debt, evidence requirements and named blockers |
| Can the methodology prompts be retired safely? | [`METHODOLOGY-RETIREMENT-AUDIT.md`](METHODOLOGY-RETIREMENT-AUDIT.md) | Crosswalk, folded gates and remaining retirement prerequisites |
| Why is the sequence or capability shaped this way? | [`MASTER-PLAN.md`](MASTER-PLAN.md) | Rationale, capability order and longer-range plan |
| What was already implemented and committed? | [`IMPLEMENTATION-CHECKPOINT.md`](IMPLEMENTATION-CHECKPOINT.md) | Append-only long-form history |
| What is the status of the new-design capability? | [`new-design/CHECKLIST.md`](new-design/CHECKLIST.md) | Capability-local evidence, reported upward to the current-state tracer |

Methodology documents are protocols, not status trackers: `prompt1.md` and `prompt2.md` remain
authoritative. Session entry, interruption recovery and module execution rules are folded into
[`ARCHITECTURE_INDEX.md`](../ARCHITECTURE_INDEX.md).

| File | What it is |
|---|---|
| [MASTER-CHECKLIST.md](MASTER-CHECKLIST.md) | Planning checklist above the methodology prompts; drift and blocker register (Drift 1–6, OD-*) |
| [`ARCHITECTURE_INDEX.md`](../ARCHITECTURE_INDEX.md#module-execution-protocol) | Module execution protocol, quality gates, Module Contract, Boundary Audit |
| [IMPLEMENTATION-CHECKPOINT.md](IMPLEMENTATION-CHECKPOINT.md) | Long-form slice history |
| [SERVER-RUNBOOK.md](SERVER-RUNBOOK.md) | Start/restart the dev server with a phone over USB |
| [new-design/](new-design/README.md) | Container and ratio language from `assets/new_design.jpeg` |
| [DESIGN_MOTION_SETUP_COMPLETE.md](DESIGN_MOTION_SETUP_COMPLETE.md), [DESIGN_ENHANCEMENTS.md](DESIGN_ENHANCEMENTS.md) | Motion and design enhancement notes |
