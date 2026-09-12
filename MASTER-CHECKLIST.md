# Master ERP Planning Checklist

```
STATUS  2026-09-12
Phase:    P18 module execution (1/24)
Blocked:  OD-1, OD-4
Gate:     NOT READY - 2 critical blockers (was 5)
Next:     S3 M1 write surface (invite, assign role, revoke)
Drift:    3 open (see section 7)
```

The control system above `prompt1.md`, `prompt2.md` and `module-controller.md`. It does not
replace them and does not repeat their methodology. It verifies that they were actually run,
in the right order, on every part of the system, and that the seams between modules hold.

**What each source of truth owns**

| Source | Owns | This checklist's role |
|---|---|---|
| `prompt1.md` | System-level architecture methodology, Phases 1 to 13 | Verify each phase produced its artifact and passed validation |
| `prompt2.md` | Per-module design methodology, 24 sections | Verify every planned module ran it fully |
| `module-controller.md` | Module execution, quality gates, Module Contract, Registry, drift control | Verify every module has a contract, passed Boundary Audit, and is registered |
| `docs/blueprint/adr.md` | Architecture Decision Log | Verify every decision here is recorded there, not in prose |
| `docs/requirements.md` | Requirements register | Verify every checklist item traces to a requirement or a decision |

**Status vocabulary.** ⬜ not started · 🟡 in progress · ✅ complete · ⚠️ needs review ·
🔴 blocked · ⛔ not applicable.

An item is ✅ only when its artifact exists **and** its validation passed. Mentioning a topic is
not completion. An item whose upstream dependency is unresolved is 🔴, never 🟡, because
progress made on a wrong foundation is worse than no progress.

**Legend for the Depends column.** `P<n>.<m>` refers to a phase item below. `OD-<n>` refers to an
open decision in `docs/blueprint/00-assumptions.md`. `AD-<n>` refers to the decision log.

---

## PHASE 0 — Project Foundation

| # | Item | Why it matters | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 0.1 | Methodology files fixed and versioned | Three prompts drive every downstream artifact. If they drift, everything built from them drifts | — | `prompt1.md`, `prompt2.md`, `module-controller.md` | Files exist, are referenced not re-pasted | ✅ |
| 0.2 | Requirements register live, inbox cleared each task | Requirements arrive informally and get lost. Unprocessed requirements build the wrong system | — | `docs/requirements.md` | Every requirement has an ID, status and a document it drives | ✅ |
| 0.3 | Architecture Decision Log live | A decision not written down is re-litigated every month and silently reversed | — | `docs/blueprint/adr.md` | Each entry has reason, alternatives, impact | ✅ |
| 0.4 | Canonical glossary | "Course" and "Subject" used interchangeably becomes two tables and two screens | — | Glossary document | Every domain noun has one agreed term, and the term is used in code, UI and docs | ⬜ |
| 0.5 | Canonical status vocabulary | Five modules inventing five words for the same state makes the UI incoherent and reports impossible | 0.4 | Status vocabulary | Every state machine's names drawn from it | ⬜ |
| 0.6 | Naming conventions for entities, events, permissions | Event and permission keys are a public API between modules. Renaming later breaks consumers | 0.4 | Convention document | New module contracts conform | ⬜ |
| 0.7 | Scale and shape targets stated as numbers | Every technical decision from database to pagination depends on whether a tenant has 800 students or 40,000 | — | Blueprint 4 §4.1-4.3 | Numbers agreed, not adjectives | ✅ OD-9 resolved |
| 0.8 | Hosting, data residency and tenancy isolation model | Indian student data has residency expectations, and shared versus isolated databases is unreversible after launch | 0.7 | AD-22, Blueprint 4 §4.6 | Recorded as an ADR | ✅ OD-10 resolved |

## PHASE 1 — Business and Organization Discovery

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 1.1 | Institution structure modelled to the level of section and enrolment | The org tree is the scope of every permission and the join of every report | — | Blueprint 1 §1.1 | Handles a real college's exceptions, not an idealized one | ✅ |
| 1.2 | Campus as a scope dimension settled | Retrofitting a scope level means revisiting every query and policy | 1.1 | AD-2 | Decision recorded, default carried | ⚠️ default in force, OD-2 unconfirmed |
| 1.3 | Curriculum versioning by regulation year | Without it, a regulation change silently rewrites graduation requirements for students mid-degree | 1.1 | AD-3 | Every academic computation resolves through the student's regulation | ✅ |
| 1.4 | Academic calendar and term model | Every date in the product derives from it | 1.1 | Blueprint 2 D2 | Supports semester and annual, and two campuses on different calendars | ✅ |
| 1.5 | Affiliating versus autonomous settled | Decides whether the ERP owns examinations or mirrors them. Roughly triples one module | 1.1 | OD-1 | Answered by the customer | 🔴 **blocking** |
| 1.6 | Statutory and accreditation reporting obligations identified | NAAC, NBA and AICTE returns shape what data must be captured from day one, not derived later | 1.1 | Compliance inventory | Each return maps to fields that exist | ⬜ |
| 1.7 | Institution's current systems and data inventoried | Migration usually costs more than the module it feeds | — | OD-5 | Answered | 🟡 default assumed |

## PHASE 2 — Actors, Roles and Responsibilities

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 2.1 | Full actor inventory, not a role list | "Admin" is a dozen jobs. Designing for one produces a system nobody can use safely | 1.1 | Blueprint 1 §1.2 | Every actor has responsibilities, data needs and explicit exclusions | ✅ |
| 2.2 | Authority model defined as role × scope × validity | One person holds several roles at once. A role column cannot express a real college | 2.1 | AD-1 | Expresses a professor who heads a department and sits on a committee | ✅ |
| 2.3 | Committee authority modelled | Committees hold power no job title carries | 2.2 | AD-15 | One authorization path, not two | ✅ |
| 2.4 | Delegation and its limits | Absence is routine. Undelegated authority stalls the institution | 2.2 | AD-17 | No chaining, cannot outlive its source | ✅ |
| 2.5 | Separation of duties identified | The same person approving and raising a payment is the classic fraud path | 2.2 | SoD matrix | Every sensitive workflow names incompatible role pairs | ⬜ |
| 2.6 | Actor-to-module access map | Prevents a module designing navigation for a role that should never see it | 2.1, P4 | Access map | Each module's permission matrix agrees with it | 🟡 M1 only |

## PHASE 3 — Business Domain Architecture

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 3.1 | Domains derived from the business, not copied from a module list | A generic ERP list produces modules nobody asked for and misses what this college needs | P1, P2 | Blueprint 2 | Nine domains, each with owner, workflows, edge cases | ✅ |
| 3.2 | Cross-cutting capabilities separated from domains | Building documents, notifications, approvals and audit per module gives several incompatible implementations and no audit trail | 3.1 | Blueprint 2, P1 to P8 | No module reimplements a platform capability | ✅ |
| 3.3 | Domain ownership assigned to a business owner | A domain with no human owner gets designed by whoever shouts loudest | 3.1 | Blueprint 2 | Every domain names an owner role | ✅ |
| 3.4 | Out-of-scope domains explicitly rejected | Unstated exclusions get built | 3.1 | Blueprint 3 §3.2 | Rejections listed with reasons | ✅ |

## PHASE 4 — ERP Module Architecture

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 4.1 | Domains converted to modules with justified boundaries | Modules are what gets built, released and owned. Wrong boundaries are the most expensive mistake available | P3 | Blueprint 3 §3.1 | Every module states why it deserves to exist separately | ✅ |
| 4.2 | Merges and splits argued, not assumed | Splitting examinations from results gives two owners of one number | 4.1 | Blueprint 3 §3.2 | Each merge and split has a stated reason | ✅ |
| 4.3 | Module sequencing by dependency and risk | Building features before the foundation means retrofitting, which is where projects die | 4.1 | Blueprint 3, roadmap | No module scheduled before its dependencies | ✅ |
| 4.4 | Module Registry initialized | Cross-module reasoning needs a compact index, not a re-read of every spec | 4.1 | Registry per `module-controller.md` | Every planned module has a row, even unstarted ones | ⬜ **gap: registry file does not exist yet** |

## PHASE 5 — Cross-Module Architecture

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 5.1 | Domain event catalogue | Events are a public API between modules. Ad-hoc events become undocumented coupling | P4 | Blueprint 3 §3.4 | Each event names producer, consumers, payload shape, failure handling | 🟡 list exists, payloads do not |
| 5.2 | Circular dependency check | A cycle means neither module can be built, tested or released independently | 5.1 | Dependency graph | Graph is acyclic, or each cycle is broken by an event and documented | ✅ two cycles identified and resolved |
| 5.3 | Synchronous call inventory | Every synchronous cross-module call is a shared failure mode | 5.1 | Call list | Each one justified. Currently only permission resolution | ✅ |
| 5.4 | Cross-module mutation rules | A module writing another's data destroys ownership | 5.1 | Blueprint 3 §3.3 | No module writes data it does not own | 🟡 stated, not yet enforced per module |
| 5.5 | Event delivery guarantees and failure handling | An event lost in transit silently corrupts state across modules | 5.1 | Delivery policy | At-least-once with idempotent consumers, and a reconciliation job per critical event | ⬜ |
| 5.6 | Shared reference data strategy | Academic year, department and program are read by everything. Copying them creates drift | 5.1 | Reference policy | Read from the owner, never duplicated | 🟡 |

## PHASE 6 — Core Entity and Data Ownership

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 6.1 | System-wide entity inventory | The same concept modelled twice under two names is the most common ERP data failure | P4 | Entity index | Every entity appears once, owned by one module | 🟡 M1 only |
| 6.2 | Source of truth per entity | Two sources of truth means the system contradicts itself and nobody can say which is right | 6.1 | Blueprint 3 §3.3 | Every entity names exactly one authoritative owner | 🟡 module-level done for M1 |
| 6.3 | Duplicate entity risk check | "Subject" in one module and "Course" in another is two tables for one thing | 6.1, 0.4 | Drift report | Run at each module approval | ⚠️ **drift found, see §7** |
| 6.4 | Derived data rules | A stored aggregate is a bug with a delay fuse | 6.1 | AD-7 | No derived academic or financial value stored as truth | ✅ |
| 6.5 | Monetary ownership | Four balances per student cannot be reconciled by hand | 6.1 | AD-6 | Only M11 holds an amount owed | ✅ |
| 6.6 | Historical and temporal requirements | Marks, fees and approvals must remain explicable years later under the rules that existed then | 6.1 | Retention and history policy | Every entity states whether it is versioned, soft-deleted or append-only | 🟡 |
| 6.7 | Soft delete and tombstone policy | A hard delete breaks audit and breaks offline sync | 6.6 | AD-8 in client docs | Consistent across modules | ✅ |
| 6.8 | Concurrency and versioning policy | Two clerks editing one record is ordinary, not exceptional | 6.1 | AD-12 | Optimistic versioning platform-wide with a conflict surface | ✅ |
| 6.9 | Data classification and sensitivity | You cannot protect what you have not labelled | 6.1 | Classification | Every field marked normal, sensitive or critical | 🟡 M1 only |

## PHASE 7 — Workflow and State Architecture

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 7.1 | Every module's workflows cover exception paths | Happy-path-only systems are abandoned in month two | P6 | Per-module §5 | Rejection, cancellation, correction, reversal, expiry, duplicate, partial failure all present | 🟡 M1 only |
| 7.2 | State machines with terminal and irreversible states named | An irreversible transition discovered in production is a disaster | 7.1 | Per-module §6 | Each entity's states, triggers, actors and automatic transitions defined | 🟡 M1 only |
| 7.3 | Correction and reversal mechanism per high-integrity entity | Without one, staff ask an administrator to edit the database, which destroys the audit trail exactly where it matters | 7.2 | AD-13 | Attendance, marks, ledger and role assignments each have an approved correction path | 🟡 M1 done, others pending |
| 7.4 | Approval chains defined and configurable | Colleges differ on who approves what. Hard-coded chains are rewritten within a year | 7.1, P2 | P1 approval engine spec | Every approval in every module runs on one engine | ⬜ **gap: P1 not yet specified** |
| 7.5 | Academic year rollover specified as a first-class operation | It touches every module at once, under time pressure, and a failure is unrecoverable without a restore | 7.1, P6 | AD-11, rollover spec | Dry run, pre-flight report, staged execution, reversibility window | ⬜ **highest operational risk in the product** |
| 7.6 | Long-running and partial-failure operations defined | A bulk job failing at row 220 of 400 with a generic error is an incident | 7.1 | Job policy | Preview, per-row results, partial success, retry of the failed subset | 🟡 pattern set in M1 |

## PHASE 8 — Authorization and Security

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 8.1 | Authorization model implemented in one place | Permission logic in each module means each module has a different bug | P2 | M1 spec | One resolution path, deny by default | ✅ |
| 8.2 | Permission catalogue platform-owned | Tenant-invented permissions enforce nothing | 8.1 | M1 data model | Permissions seeded, roles composed from them | ✅ |
| 8.3 | Record-level and scope restrictions defined per module | Role alone cannot express "their own department only" | 8.1 | Per-module §10 | Each module's matrix names scope, campus, year and record-level rules | 🟡 M1 only |
| 8.4 | Sensitive operations inventory | Export, bulk, delete, reverse and impersonate carry different risk from edit | 8.3 | Sensitive operations list | Each is a distinct permission, not implied by edit | 🟡 |
| 8.5 | Tenant isolation verified, not assumed | One college seeing another's data ends the product | P0 | Isolation test plan | Enforced in the data access layer, tested adversarially | 🟡 stated, untested |
| 8.6 | Authentication controls | Shared logins destroy every audit requirement downstream | 8.1 | M1 §17 | Lockout, second factor for sensitive roles, no enumeration, rate limits | ✅ |
| 8.7 | Sensitive data handling and masking | A directory of dates of birth in one screenshot is a breach | 6.9 | M1 §9 | Masked in lists, reveal audited, excluded from exports by default | ✅ pattern set |
| 8.8 | Threat model for the whole system | Module-level security without a system view misses the seams | 8.1 to 8.7 | Threat model | Reviewed against the OWASP top ten and multi-tenant specifics | ⬜ |

## PHASE 9 — UI/UX Architecture

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 9.1 | Client surfaces settled: web console, mobile, or both | Admissions and accounts on a phone is not viable. This decides every screen spec downstream | P0 | AD-24 | Answered | ✅ |
| 9.2 | Global navigation architecture | Twenty-four modules cannot each invent their own navigation | 9.1, P4 | Global IA | One navigation model, role-driven, no disabled items | ⬜ |
| 9.3 | Role-based navigation rules | Disabled menu items advertise capabilities a user will never have and generate support calls | 9.2, P2 | Navigation map | Absent, not disabled | ✅ principle set in M1 |
| 9.4 | Command palette and global search | At this scale navigation by menu is too slow for daily operators | 9.2 | P7 spec | Cross-module, permission-scoped | 🟡 principle set |
| 9.5 | Shared screen archetypes | Twenty-four modules each inventing a table is twenty-four inconsistent tables | 9.2 | Archetype library: list, detail, drawer, wizard, approval queue, report | Every module's screens map to an archetype or justify a new one | 🟡 M1 established the first five |
| 9.6 | Page versus drawer versus modal policy | Everything-is-a-modal is the signature of a bad enterprise UI | 9.5 | Interaction policy | Pages for work, drawers for context, modals for confirmation only | ✅ |
| 9.7 | Large-dataset usability | ERP users work with tens of thousands of rows. A grid of cards fails at that scale | 9.5 | Table spec | Density, saved views, cursor pagination, bulk selection across pages | ✅ pattern set |
| 9.8 | The five screen states everywhere | A default spinner and a generic error is how enterprise software feels cheap | 9.5 | Design system §7.6 | Loading, refreshing, success, empty, error designed per screen | ✅ |
| 9.9 | Terminology consistency in the interface | The UI is where glossary drift becomes visible to users | 0.4 | Glossary applied | Same noun everywhere | ⬜ |

## PHASE 10 — Design System

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 10.1 | Tokens: colour, type, spacing, radius, elevation | Without tokens every screen invents values and the product looks assembled by strangers | — | `docs/07-design-system.md` | No raw values in any screen spec | ✅ |
| 10.2 | Semantic status colours fixed system-wide | A status shown green in one module and amber in another is worse than no colour | 10.1, 0.5 | Design system §7.2 | One mapping, used by every module | ✅ |
| 10.3 | Component inventory | Reuse is real only if the component exists before the fifth module needs it | 10.1 | Design system §7.5 | Built once, with golden tests | ✅ specified |
| 10.4 | Data-dense components for desktop | The current system is phone-oriented. Tables, filter rails and approval queues need specification | 9.1, 10.3 | `clients/web/src/components` | Table, states, drawer, chip, toast built; filter rail, saved views and command palette pending | 🟡 |
| 10.5 | Motion policy | Decorative animation in an ERP slows down the people who use it all day | 10.1 | Design system §7.7 | Durations, curves, and reduced-motion collapse | ✅ |
| 10.6 | Accessibility baseline | Retrofitting accessibility across twenty-four modules is not economically possible | 10.1 | Design system §7.8 | Contrast, keyboard, semantics, 200 percent text scaling | ✅ |

## PHASE 11 — Notifications and Communication

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 11.1 | One notification capability, not one per module | Five notification systems means five preference screens and no delivery tracking | P3 | P2 spec | Every module triggers, none delivers | ⬜ |
| 11.2 | Channel policy per notification class | Sending credentials over consumer messaging is a risk with no matching benefit | 11.1 | Channel matrix | Each class names allowed channels with a reason | 🟡 M1 done |
| 11.3 | Anti-spam rules | A bulk operation producing four hundred messages trains users to mute the product | 11.1 | Digest and throttle policy | One notification per event, digests for informational, quiet hours except security | ✅ pattern set |
| 11.4 | Delivery tracking and failure visibility | An invitation assumed delivered but never sent stalls onboarding invisibly | 11.1 | Delivery status | Sender sees status, not just "sent" | 🟡 |
| 11.5 | Guardian and student notification boundaries | Sending a student's marks to a guardian without consent is a privacy failure | 11.1, P2 | Consent-aware targeting | Respects the consent record | ✅ modelled in M1 |

## PHASE 12 — Reports and Analytics

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 12.1 | Reporting as a platform capability, not a module | A reports module becomes a dumping ground disconnected from the data it reports on | P3 | P5 spec | Every module contributes reports to one layer | ⬜ |
| 12.2 | Each metric has a stated calculation and source | Two dashboards showing different attendance percentages destroys trust in the whole system | 12.1, 6.4 | Metric definitions | Every KPI names its formula and source entity | 🟡 |
| 12.3 | Statutory and accreditation reports identified early | These dictate what must be captured, and cannot be derived from data never collected | 1.6 | Compliance report list | Each maps to existing fields | ⬜ |
| 12.4 | Export permissions and audit | Exports are how data leaves the building | 8.4 | Export policy | Separate permission, row count and reason audited | ✅ pattern set |
| 12.5 | Real-time versus scheduled decided per report | Running heavy aggregates live at scale degrades the operational system | 12.1, 0.7 | Blueprint 4 §4.4 | Rule set: anything over three seconds becomes scheduled | ✅ rule set, per-report classification pending |

## PHASE 13 — Automation and Background Processes

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 13.1 | Automation inventory: rule, event, scheduled | Automation invented per module is invisible and unmaintainable | P7 | Automation catalogue | Each has trigger, logic, action, failure handling, audit | 🟡 per-module only |
| 13.2 | Scheduled job catalogue with ownership | Unowned cron jobs are how data silently corrupts at 2am | 13.1 | Job registry | Each job names owner, schedule, idempotency, alerting | ⬜ |
| 13.3 | Idempotency of every automated action | A retried job that is not idempotent duplicates invoices and attendance | 13.1 | Idempotency policy | Every job and event consumer is idempotent | ⬜ |
| 13.4 | Failure alerting and dead-letter handling | A failing job that alerts nobody is worse than no job | 13.2 | Alerting policy | Every failure reaches a human with context | ⬜ |
| 13.5 | AI-assisted features justified individually | AI added because it sounds modern adds cost, risk and support burden | 13.1 | AI inventory | Each use states the workflow it improves, and none is on a critical integrity path | ⬜ |

## PHASE 14 — Audit and Compliance

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 14.1 | Audit as a platform capability | Audit a module can opt out of is not audit | P3 | P6 spec | No module writes its own audit store | ⬜ |
| 14.2 | Audited event inventory per module | What is not listed is not captured, and gaps are found only during an investigation | 14.1 | Per-module §17 | Money, marks, attendance and authority changes all covered | 🟡 M1 only |
| 14.3 | Before and after values for mutations | "Someone changed it" is not an audit trail | 14.2 | Audit schema | Mutations carry both states and a reason where required | ✅ pattern set |
| 14.4 | Sensitive read auditing | Knowing who looked at a student's records matters as much as who changed them | 14.2 | Read audit policy | Sensitive reveals, exports and impersonated reads audited | ✅ pattern set |
| 14.5 | Tamper evidence | An audit trail an administrator can edit proves nothing | 14.1 | Integrity design | Append-only, no update or delete path in the application | ⬜ |
| 14.6 | Retention schedule per data class | Keeping everything forever is a liability. Deleting too early breaks statutory obligations | 6.6 | Retention schedule | Every class has a period and a legal basis | 🟡 M1 only |
| 14.7 | Data protection obligations | Personal data of students, some of them minors, carries real duties | 6.9 | Privacy assessment | Consent, access, correction and deletion paths exist | 🟡 consent modelled, rest pending |

## PHASE 15 — Integrations

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 15.1 | Integration inventory | Integrations usually cost more than the module they feed, and surprise late | 1.7 | Integration list | University portal, payment gateway, accounting, biometric, SMS, email, push | 🔴 depends on OD-1, OD-4, OD-5 |
| 15.2 | University result import adapter | Where affiliated, the university owns results and the format differs per university | 1.5 | AD-8 | Mirror is read-only, adapter per format | 🔴 OD-1 |
| 15.3 | Payment gateway and reconciliation | Webhooks that are not idempotent create duplicate payments | OD-4 | Payment design | Server-verified, idempotent, reconciled | 🔴 OD-4 |
| 15.4 | Import pipeline with dry run | Bulk import is the most destructive surface in an ERP | 1.7 | Import spec | Validation, dry run, per-row results, reversible as a unit | 🟡 pattern set in M1 |
| 15.5 | Integration failure handling | An external system being down must degrade, not break, the ERP | 15.1 | Degradation policy | Each integration states its offline behaviour | ⬜ |

## PHASE 16 — Non-Functional Requirements

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 16.1 | Scale targets as numbers | Every technical choice depends on them, and adjectives decide nothing | 0.7 | Blueprint 4 §4.1, §4.2 | Students per tenant, tenants, peak concurrent users, retention volume | ✅ |
| 16.2 | Performance budgets per surface | "Fast" is unfalsifiable. A budget can fail a build | 16.1 | Blueprint 4 §4.4 | Thirteen budgets, each measurable in CI | ✅ |
| 16.3 | Peak load profile | Colleges are extremely peaky. Result day and fee deadline are the load, not the average | 16.1 | Blueprint 4 §4.3 | Five peaks profiled, two design requirements derived | ✅ |
| 16.4 | Availability target and degradation modes | A hard target nobody agreed cannot be engineered toward | 16.1 | Blueprint 4 §4.5 | 99.5 percent, protected windows, degradation priority order | ✅ |
| 16.5 | Backup, restore and recovery objectives | A botched rollover in June is recoverable only from a tested restore | 16.1 | Blueprint 4 §4.6 | RPO 5 min, RTO 1 hour, quarterly rehearsal, mandatory before June | ✅ |
| 16.6 | Observability | An ERP you cannot see inside is an ERP you cannot support | 16.2 | Blueprint 4 §4.7 | Seven signals, three alerting unconditionally | ✅ |
| 16.7 | Localisation readiness | Retrofitting language after twenty-four modules is not economic | — | Externalized strings | No hardcoded user-facing strings | 🟡 assumed, unverified |

## PHASE 17 — Technical Architecture Readiness

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 17.1 | Backend platform decided | Currently an assumption. Everything from authorization to sync depends on it | OD-1, OD-3, OD-4, 16.1 | Backend ADR | Decided, not assumed | 🔴 **blocking, A1 still an assumption** |
| 17.2 | API contract conventions | The contract is the seam between every client and every module | 17.1 | `docs/05-api-contract.md` | Envelope, errors, pagination, versioning, idempotency | ✅ drafted, backend-agnostic |
| 17.3 | Sync protocol for offline clients | The highest-risk code in the product | 17.2, AD-9 | `docs/03-offline-first.md` | Push, pull, cursors, conflicts, tombstones | ✅ specified |
| 17.4 | Client architecture | Already decided for mobile. Web console architecture is undecided | OD-3 | `docs/02-architecture.md` | Layers, DI, routing, error model | ✅ mobile · 🔴 web |
| 17.5 | Database strategy and tenancy isolation | Shared versus isolated is effectively irreversible after launch | 0.8, 17.1 | AD-22 | Shared with row-level security, partitioned, documented escape hatch | ✅ |
| 17.6 | Event infrastructure | AD-10 requires events. Nothing yet says how they are delivered | 5.5, 17.1 | Event transport ADR | Guarantees, ordering, retries, dead letters | ⬜ |
| 17.7 | Environments and release pipeline | Shipping to a live college needs staging that mirrors production | 17.1 | CI and environments | Dev, staging, production, with migration gates | 🟡 CI planned in Phase 0 of the roadmap |
| 17.8 | Migration and rollback strategy | A failed migration on a live tenant during admissions is the worst day of the year | 17.5 | Migration policy | Forward-only with tested rollback, rehearsed on a copy | ⬜ |

## PHASE 18 — Module-by-Module Execution

Driven by `module-controller.md`. This checklist verifies, it does not duplicate.

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 18.1 | Every planned module processed through `prompt2.md` | A module skipped here is a module designed ad hoc during implementation | P4 | Per-module spec | 24 sections each, none marked complete on a mention | 🟡 **1 of 24** |
| 18.2 | Every module has a Module Contract | The contract is what future modules reason against | 18.1 | Contract per module | Derived from the actual design, not written by hand | ⬜ **gap: M1 spec approved-pending, contract not yet derived** |
| 18.3 | Every module passed Boundary Audit | Boundary violations found after implementation are rewrites | 18.2 | Audit result | Twelve checks per `module-controller.md` | ⬜ |
| 18.4 | Every module in the Module Registry | Without it, each new module re-reads everything | 18.2 | Registry | One row per module, kept current | ⬜ |
| 18.5 | Dependencies and ownership recorded per module | Undocumented dependencies are discovered at integration | 18.2 | Registry fields | Consistent with Phase 5 and 6 | 🟡 |
| 18.6 | Approved modules protected from silent change | Silent redesign of an approved module invalidates everything built on it | 18.2 | Change protocol | Any change raises ARCHITECTURE CHANGE REQUIRED | ✅ protocol defined |
| 18.7 | Cross-module impact analysis run per module | The cost of a module is mostly in what it touches | 18.3 | Impact result | Twelve checks, affected modules only | 🟡 M1 done |

**Module progress.** M1 Identity and Access: specification complete, awaiting approval, contract
not yet derived. M2 to M24: not started.

## PHASE 19 — System-Wide Consistency Review

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 19.1 | Terminology consistency sweep | Two words for one concept becomes two tables and two screens | 0.4, P18 | Drift report | Zero unresolved terminology conflicts | ⚠️ **conflicts found** |
| 19.2 | Status vocabulary sweep | Inconsistent state names make cross-module reporting impossible | 0.5, 7.2 | Drift report | Every state machine uses canonical names | ⚠️ |
| 19.3 | Duplicate entity and ownership sweep | The classic ERP failure | 6.1, 6.3 | Drift report | One owner per entity, no duplicates | ⚠️ |
| 19.4 | Permission consistency sweep | The same action permitted in one module and forbidden in another | 8.3 | Drift report | Consistent permission keys and semantics | ⬜ |
| 19.5 | UX pattern consistency sweep | Modules that feel like different products | 9.5 | Drift report | Every screen maps to an archetype | ⬜ |
| 19.6 | Decision contradiction sweep | Later decisions quietly reversing earlier ones | 0.3 | ADR review | No two active decisions conflict | ⚠️ **see §7** |
| 19.7 | Dependency graph re-verified after all modules | Cycles appear when the last module closes a loop | 5.2, P18 | Final graph | Acyclic | ⬜ |

## PHASE 20 — MVP and Release Planning

| # | Item | Why | Depends | Output | Validation | Status |
|---|---|---|---|---|---|---|
| 20.1 | Release scope defined by dependency and risk, not enthusiasm | Shipping features before the foundation means retrofitting | P18 | `docs/10-roadmap.md` | Each phase has a done condition | ⚠️ **needs revision after the enterprise scope change** |
| 20.2 | MVP is genuinely operable by a real college | A partial ERP that cannot run a term is not an MVP, it is a demo | 20.1 | MVP definition | A college can complete one full term end to end | ⬜ |
| 20.3 | Highest-risk work scheduled earliest | Sync and rollover are cheap to change now and ruinous later | 20.1 | Sequencing | Sync engine before feature modules | ✅ |
| 20.4 | Pilot plan with one real college | Architecture is validated by contact with a real institution, not by review | 20.2 | Pilot plan | Named college, defined success criteria, exit plan | ⬜ |
| 20.5 | Data migration plan for the pilot | The pilot fails on day one if their existing data cannot come in | 15.4, 20.4 | Migration plan | Dry run against real data | ⬜ |
| 20.6 | Deferred scope explicitly listed | Unstated deferrals get built | 20.1 | Requirements register | Every deferred item has an ID and a target | ✅ |

## PHASE 21 — Final ERP Architecture Approval

See §5, Final Readiness Gate.

---

## 2. Phase dependency map

```
P0 Foundation ──┬──────────────────────────────────────────────────┐
                │                                                  │
                ▼                                                  ▼
P1 Discovery ──▶ P2 Actors ──▶ P3 Domains ──▶ P4 Modules ──▶ P5 Cross-module
                    │                             │                │
                    │                             ▼                ▼
                    │                        P6 Data ─────────▶ P7 Workflow
                    │                             │                │
                    └────────────▶ P8 Authorization ◀──────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              P9 UI/UX            P11 Notify          P13 Automation
                    │             P12 Reports          P14 Audit
                    ▼                   │                   │
              P10 Design system         └─────────┬─────────┘
                    │                             │
                    └──────────┬──────────────────┘
                               ▼
              P15 Integrations ── P16 NFR ── P17 Technical readiness
                               │
                               ▼
                      P18 Module execution  ◀── module-controller.md
                               │
                               ▼
                      P19 Consistency review
                               │
                               ▼
                      P20 Release planning
                               │
                               ▼
                      P21 Final approval gate
```

**Hard ordering rules.**

- P4 cannot be finalized while P3 is open. Module boundaries drawn over unsettled domains get
  redrawn.
- P18 cannot start on a module whose dependencies in P5 and P6 are unresolved. This is why M1
  was first.
- P17 cannot complete while OD-1, OD-3, OD-4 or the two new open decisions stand.
- P19 can only run after P18 completes. It is a sweep over finished work, not a running check.
- ~~P16 is the weakest phase and blocks P17.~~ **Resolved 2026-09-12.** P16 is complete and P17
  is now blocked only by OD-3, which decides the web client, and by OD-1 and OD-4 through the
  modules they shape.

**Safe to defer.** P13 automation beyond the per-module level. P15 integrations other than the
import pipeline. P12 statutory reports until P1.6 completes. Deferring these does not invalidate
upstream work.

**Cannot be deferred.** Anything in P0, P6, P7.5, P8 and P16. Each of them is a foundation whose
retrofit cost exceeds the cost of the modules built on it.

---

## 3. Critical blocking decisions

A blocker is critical when proceeding without it produces work that must be thrown away.

| ID | Decision | Blocks | Why it is critical | Recommended default if you will not decide now |
|---|---|---|---|---|
| **OD-1** | Affiliating or autonomous | P1.5, M10, P15.2, P20 | Decides whether the ERP owns examinations or mirrors them. Roughly triples one module and changes the degree-issuing responsibility | Support both. Mirror external results read-only, build the autonomous engine behind a capability flag |
| ~~OD-3~~ | ~~Client surface~~ | — | **Resolved 2026-09-12.** AD-24: web console for back office, Flutter for students and faculty | — |
| **OD-4** | Collect money or only record it | M11, P15.3, P14 compliance scope | Online collection brings settlement, refunds, chargebacks and a much heavier compliance surface | Record first, collect second, with the ledger designed so collection is an added channel |
| ~~OD-9~~ | ~~Scale targets~~ | — | **Resolved 2026-09-12.** Derived in Blueprint 4 §4.1-4.3 rather than asserted | — |
| ~~OD-10~~ | ~~Hosting and tenancy isolation~~ | — | **Resolved 2026-09-12.** AD-22, shared cluster with row-level security and partitioning | — |

**Non-blocking but should be answered soon.** OD-2 campus scope, safe default already carried.
OD-5 legacy systems. OD-6 buyer versus operator. OD-7 attendance granularity. OD-8 configurable
approval chains. Each has a recorded default and none invalidates upstream work.

---

## 4. System-wide quality gates

Run at P19, after all modules complete. Each gate is pass or fail, not a score.

### Business
- Every major workflow in every module has an exception path, not only a happy path
- Every high-integrity record has a correction or reversal mechanism, per AD-13
- Every business rule is explicit and numbered, not buried in prose
- Every actor's responsibilities map to permissions that actually exist
- No workflow requires a step no role is permitted to perform

### Architecture
- Every entity has exactly one owning module
- No two modules claim source of truth for the same fact
- The dependency graph is acyclic
- No module reads or writes another module's tables directly
- Every cross-module interaction is an event or a declared capability
- Every state machine is owned by exactly one module

### Data
- Every entity states its lifecycle, history and retention
- No derived academic or financial value is stored as truth
- Every mutable record carries a version
- Soft delete and tombstones are consistent across modules
- Every sensitive field is classified and masked by default
- Referential integrity holds across module boundaries without foreign keys between them

### UX
- Navigation is one model, role-driven, with absent rather than disabled items
- Terminology matches the glossary on every screen
- Status names and colours are identical across modules
- The most frequent action in each module is reachable in at most two interactions
- Every list works at the scale in OD-9, with saved views and bulk actions
- Every screen implements the five states
- Responsive behaviour is defined, and screens unsuitable for a phone are refused rather than shrunk
- Keyboard operation covers every high-frequency workflow
- Accessibility baseline met at 200 percent text scaling

### Security
- Authorization resolves in one place, deny by default
- Tenant isolation tested adversarially, not assumed
- Every sensitive operation is a distinct permission
- Every export is permissioned, audited and row-counted
- No client-side check is the only enforcement of anything
- Audit is append-only with no application path to edit it

### Engineering
- API boundaries versioned, with a documented deprecation path
- Every background job has an owner, idempotency and failure alerting
- Every event consumer is idempotent
- Caching exists only where justified, with explicit invalidation and bounded staleness
- Observability covers sync health, job failures, permission denials and slow queries
- Performance budgets defined and measured against the peak profile, not the average
- Backup restore rehearsed, not merely configured
- Migration rollback tested on a production-shaped copy

---

## 5. Final ERP readiness gate

**The question.** Is this architecture complete and internally consistent enough for a large
engineering team to implement without repeatedly guessing what the product should do?

**Not a percentage.** One unresolved critical decision blocks approval regardless of how much
else is finished. An architecture that is ninety percent complete in the wrong direction is
worth less than one that is sixty percent complete and correct.

### Critical blockers — any one prevents approval
1. Any open decision in §3 marked critical still unanswered — currently OD-1, OD-3, OD-4
2. An entity with two claimed owners, or a fact with two sources of truth
3. A cycle in the module dependency graph
4. A module without a Module Contract that passed Boundary Audit
5. An approved architecture decision contradicted by a later one, unreconciled
6. Authorization not resolvable in one place, or tenant isolation unverified
7. ~~No stated scale target~~ — cleared 2026-09-12
8. Academic year rollover unspecified
9. No tested restore path

### Major blockers — approval is conditional, with a dated remediation plan
1. A module missing exception paths or correction mechanisms
2. Missing audit coverage on money, marks, attendance or authority
3. Undefined retention for a sensitive data class
4. Undefined event delivery guarantees
5. Reporting metrics without stated calculations
6. Undefined degradation behaviour for a critical integration
7. No pilot or migration plan

### Minor issues — do not block
Terminology inconsistencies with an agreed fix. Incomplete automation inventory beyond
module level. Deferred modules in later phases. Reports beyond the statutory set.

### Acceptable technical debt
Recorded explicitly, each with a trigger that forces repayment.
- The autonomous examination engine deferred behind a flag, until a customer requires it
- Analytics beyond fixed reports, until the pilot names what management actually reads
- Localisation deferred while strings stay externalized
- A single shared database, until a customer's isolation requirement triggers the split

### Approval criteria
Approval requires all of: zero critical blockers, every major blocker carrying a dated
remediation plan with an owner, every deferred item recorded in the requirements register with
a target phase, the Module Registry complete for every planned module, and a named person
accountable for each domain. Approval is recorded as an ADR entry, with a date and the
architecture version it applies to.

---

## 6. Lightweight tracking format

The checklist is a control system. Tracking must cost minutes per week, not hours.

**One status line, updated at the end of each working session, at the top of this file:**

```
STATUS  2026-09-12
Phase:    P18 module execution (1/24)
Blocked:  OD-1, OD-4, OD-9, OD-10
Gate:     NOT READY — 5 critical blockers
Next:     M2 Institution Setup
Drift:    3 open (see §7)
```

**Per module, one line in the registry** rather than a document:

```
M1  Identity and Access | SPEC COMPLETE | contract: pending | boundary audit: pending
    owns: person, account, role assignment, delegation, consent, session
    depends: M2 (scope tree), M13 (employment period)
    events: assignment.changed, account.deactivated
    open: OD-M1-1 SSO, OD-M1-2 MFA scope, OD-M1-3 who creates, OD-M1-4 retention
```

**Rules that keep it cheap.** Never reprint the full checklist in a conversation, reference the
item number. Update status only when an item actually changes state. Record decisions in the ADR
and requirements in the register, never in this file. This file holds status and gates, nothing
else.

---

## 7. Architecture drift — initial scan

⚠️ **ARCHITECTURE DRIFT DETECTED.** Three conflicts between the client documentation written
before the enterprise brief and the blueprint written after it. Not silently resolved.

### Drift 1 — Role model contradiction

- **Problem.** `docs/04-data-model.md` §4.3 defines `users.role` as an enum of superAdmin,
  collegeAdmin, teacher, student.
- **Existing decision.** That data model, approved earlier.
- **New conflicting decision.** AD-1, authority is role × scope × validity, and M1's data model
  which has no role column and forbids one.
- **Affected.** Every module. The client data model, the API contract, and every permission check.
- **Impact.** High. Two incompatible authorization models are documented as current. An engineer
  reading only the client docs would build the wrong one.
- **Recommended resolution.** Rewrite `docs/04-data-model.md` §4.3 and the permission sections of
  `docs/01-product-overview.md` and `docs/08-security.md` to reference M1. Mark R9 superseded,
  which is already done in the register but not in the documents themselves.
- **Approval required.** Yes, it changes an approved document.

### Drift 2 — Terminology, Subject versus Course

- **Problem.** `docs/04-data-model.md` uses `subjects`. Blueprint 2 and 3 use Course, with
  CourseOffering described as course × term × section.
- **Impact.** Medium. Left unresolved this becomes two tables and two screens for one concept.
- **Resolution, applied 2026-09-12.** **Course** is the entity, built as `courses` in migration
  009, and **Subject** is a display synonym for tenants that prefer it. The blueprint's
  "course × term × section" was also narrowed while building: offering identity is
  **(section, course, component)** and the term is deliberately absent, because a section already
  carries its term and restating it would allow an offering that contradicts its own cohort. See
  AD-41. `docs/04-data-model.md` still says `subjects` and remains the stale document.
- **Approval required.** Low risk, recorded.

### Drift 3 — Phase numbering collision

- **Problem.** `docs/10-roadmap.md` defines Phases 0 to 8 for client delivery. Blueprint 3 and
  this checklist use Phases 0 to 4 for ERP capability, and Phases 0 to 21 for planning.
  Three different meanings of "Phase 2" are now in circulation.
- **Impact.** Medium and entirely avoidable. It will cause miscommunication in every standup.
- **Recommended resolution.** Rename: planning phases stay **P0 to P21**, delivery becomes
  **Release 1 to 5**, module phases become **Tier 0 to 4**. One word each, used consistently.
- **Approval required.** No, but do it before more documents are written.

### Drift 4 — Module numbering collision

- **Problem.** Blueprint 3's registry numbers modules by subject: M4 is Admissions, M6 Timetable,
  M7 Attendance. The implementation numbers by delivery order, and the two had already diverged
  before this was noticed: implementation M2 absorbed the blueprint's M2 and M3, implementation M3
  Teaching Operations has no registry row, and the `permissions.module` column holds the
  implementation numbers in shipped rows.
- **Impact.** High for communication, zero for correctness. "M4" meant two different modules in
  two documents that are both current.
- **Resolution, applied 2026-09-12.** Both numbering schemes are kept and the mapping is recorded
  in AD-44. An implementation module number means the delivery slice; the registry stays the
  subject map for planning. Renumbering was rejected: it would rewrite shipped database rows and
  every migration comment for no gain in clarity.
- **Approval required.** No. It records divergence that already existed rather than creating it.

### Drift 5 — Feature phases have outrun the sync engine

- **Problem.** `docs/10-roadmap.md` says no feature phase begins before the sync engine passes its
  offline test matrix, because retrofitting offline behaviour is the most expensive mistake
  available. The sync engine has not been built, and M3 through M7 have shipped regardless.
- **Why it happened.** AD-9 narrowed offline capability to field roles on mobile, and each slice was
  directed by the owner explicitly. Attendance, the one field workflow, deliberately promises no
  offline capture and keeps unsent marks on screen instead (AD-52).
- **Impact.** Medium and growing. Every mobile write added since, attendance and assessment marks
  among them, is another path the outbox will have to cover when it arrives.
- **Recommended resolution.** Either retire the sequencing rule in favour of AD-9, or schedule the
  outbox for attendance and marks as the next mobile slice. The owner's call; recorded so it is a
  decision rather than a slide.
- **Progress, 2026-09-13.** Slice one landed: field writes are replay-safe (AD-58), which the queue
  needs and which fixes false conflicts on flaky networks today. Slice two, the durable queue,
  waits on the local-store decision. **Not closed.**
- **Drift 6, 2026-09-13: push tokens are stored hash-only.** The M1 design names the device field
  `push_token_ref`. The built `devices` table keeps a SHA-256 of the token, so the backend can
  match a device but can never send it a push. The owner is the notifications slice. It needs a
  recoverable token, encrypted with a server-held key and kept apart from the lookup hash. Until
  then, push delivery can only be tested from the Firebase console.
- **Approval required.** Yes.

### Also noted, not drift but gaps created by the scope change

- `docs/03-offline-first.md` commits to system-wide offline. AD-9 narrowed it to field roles on
  mobile. The document has not been updated, and the register records the refinement but the
  document still reads as the old commitment.
- `docs/07-design-system.md` is phone-oriented. The enterprise scope needs data-dense desktop
  components, tracked as P10.4.
