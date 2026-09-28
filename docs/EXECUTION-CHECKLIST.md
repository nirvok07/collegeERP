# Execution Checklist

The tickable implementation plan for the whole ERP. Created 2026-09-28.

**This is not the planning checklist.** `docs/MASTER-CHECKLIST.md` tracks the *architecture design
process* (phases 0–21: discovery, domain architecture, quality gates, the open-decision register).
This file tracks *building the software*. Both are current; they answer different questions.

| Ask | Read |
|---|---|
| Why is the project shaped this way? | `docs/MASTER-PLAN.md` |
| What does module X need? | `docs/blueprint/modules/README.md` → the module's doc |
| Is the architecture process complete? | `docs/MASTER-CHECKLIST.md` |
| **What do I build next?** | **This file** |
| What is built right now? | `PROJECT_STATE.md` |

## How to use this

- Work **one slice at a time** (`CLAUDE.md` §8). Do not start a phase in parallel with another.
- A slice is `✅ DONE` only with validation evidence. Code existing is not done (`CLAUDE.md` §3).
- A slice shipping on fewer surfaces than **AD-84** requires is `⚠️ PARTIAL`, never done — unless a
  parity exception is recorded in `MODULE_REGISTRY.md` with its reason.
- Surfaces: `S` server · `W` web · `F` Flutter · `D` docs/decision · `—` none.
- Tick items in place. When a slice lands: update `PROJECT_STATE.md` and `MODULE_REGISTRY.md`, then commit.

## Definition of done, applied to every slice below

- [ ] Server: migration with RLS FORCE, least-privilege GRANTs, invariants asserted in
      `migration-invariants.test.ts`
- [ ] Server: business invariants enforced in triggers, with tests asserting the **negative case**
      (see P0-0 — this is the lesson of the unenforced geo-fence)
- [ ] Server: unauthorised-access test per endpoint (`CLAUDE.md` §19)
- [ ] Server: optimistic concurrency (AD-52) and idempotency (AD-58) where writes are replayable
- [ ] Web and Flutter: built, or a parity exception recorded (AD-84)
- [ ] Clients: loading, empty, error and success states (`docs/07-design-system.md` §7.6)
- [ ] Permission gating matches the server exactly; UI visibility is not authorization
- [ ] Tests pass on all three tiers with **no known failures** (AD-92)
- [ ] Validated on a real device or a live browser, or explicitly marked `🔍 NEEDS VALIDATION`
- [ ] `PROJECT_STATE.md`, `MODULE_REGISTRY.md` updated; committed

---

# Phases

Each phase has its own task-level file under [checklists/](checklists/). **Those files are the
work**; what follows is the map and the gates.

| Phase | Theme | File | Blocking decisions |
|---|---|---|---|
| **P0** | Stabilise | [checklists/P0-stabilise.md](checklists/P0-stabilise.md) | OD-1, OD-4, OD-ACC-1, OD-LV-1 |
| **P1** | Parity debt and platform capabilities | [checklists/P1-capabilities.md](checklists/P1-capabilities.md) | — |
| **P2** | M4 Admissions and Student Lifecycle | [checklists/P2-admissions.md](checklists/P2-admissions.md) | guardian ADR (ADM-A14) |
| **P3** | M10 Examinations and Results | [checklists/P3-examinations.md](checklists/P3-examinations.md) | 🚫 AD-91 / OD-1 |
| **P4** | D7 People and HR | [checklists/P4-people-and-hr.md](checklists/P4-people-and-hr.md) | 🚫 OD-ACC-1 for M15 |
| **P5** | D9 Engagement | [checklists/P5-engagement.md](checklists/P5-engagement.md) | — |
| **P6** | D8 Campus Services | [checklists/P6-campus-services.md](checklists/P6-campus-services.md) | 🚫 OD-ACC-1 for M19 |
| **P7** | Cross-cutting and production hardening | [checklists/P7-hardening.md](checklists/P7-hardening.md) | — |

## Why this order

**P0 before anything.** A 70,000-line system with a known-red suite, live schema drift, an
unenforced security control and 42 unvalidated features should not grow a ninth domain. Owner
decision, 2026-09-28.

**P1 before any domain.** D3, D7, D8 and D9 each need approvals, notifications, documents,
reporting and scheduled work. Build them once, or build them four times.

**Within P1: P9 → P2 → P1 → P3 → P5 → P4.** P2's queue drain is a scheduled job; P1's escalation is
a scheduled job that sends notifications; P4 renders through P3 and is approved through P1.

**P2 before P3.** Examinations need students, and students arrive through admissions.

**M20 first within P5**, M16 first within P6 — each is the cheapest module in its phase and each
proves a primitive the rest reuse (audience targeting; resource allocation with a charge to M11).

## Phase exit gates

Each phase file ends with its own gate. Summarised:

| Phase | The gate, in one line |
|---|---|
| P0 | Suite green on a seeded database, fence resolved, drift root-caused, four decisions answered |
| P1 | A real push on a real phone; a job proven exactly-once; attendance correction running on P1 |
| P2 | An applicant becomes an enrolled student with an invoice, end to end |
| P3 | A published result is provably immutable and a student can see their own |
| P4 | Approved teaching leave never leaves a class unattended; nobody releases their own pay run |
| P5 | A grievance is unreadable to a College Admin who is not a party |
| P6 | Library, hostel and transport charges all land on one student ledger |
| P7 | The go-live gate, or written owner acceptance of each residual risk |

## Slice counts

| Phase | Slices | Tasks |
|---|---|---|
| P0 | 12 | 151 |
| P1 | 11 | 229 |
| P2 | 16 | 131 |
| P3 | 16 | 123 |
| P4 | 30 | 182 |
| P5 | 46 | 190 |
| P6 | 48 | 155 |
| P7 | 10 + gate | 120 |
| **Total** | **189** | **1,281** |

---|---|---|
| P0 | 12 | 150 |
| P1 | 11 | 220 |
| P2 | 16 | 130 |
| P3 | 16 | 120 |
| P4 | 30 | 220 |
| P5 | 46 | 250 |
| P6 | 48 | 190 |
| P7 | 10 + gate | 130 |

---

## Open decisions blocking work

| ID | Question | Blocks | Status |
|---|---|---|---|
| **OD-1** | Affiliating or autonomous | M10 entirely, P15.2, P20 | 🔴 open — AD-91 proposed (P0-5) |
| **OD-4** | Collect money or only record it | M11 online, P15.3 | 🔴 open (P0-6) |
| **OD-ACC-1** | General ledger or export to accounting | M15, M19, budgets | 🔴 **new** (P0-7) |
| **OD-LV-1** | Staff leave vs student excused absence | M14 | 🟡 recommendation in `leave-and-workload.md` §1 (P0-8) |
| — | Guardian authority scope | ADM-A14 | 🟡 ADR required before code |
| OD-2 | Campus scope | — | 🟡 safe default in force |
| OD-5 | Legacy systems inventory | Integrations | 🟡 default assumed |
| OD-M1-4 | Retention and erasure | X-6, P3 | 🟡 open |
| OD-BIO-1 | Biometric lock confirmation | — | 🟡 open |
| ~~OD-FEE-5~~ | ~~Fees on web~~ | — | ✅ resolved by AD-86 → PAR-1 |

## The seven things that must not be got wrong

Each is a database-enforced invariant with a negative test, not a convention:

1. **Over-admission** — seats cannot be exceeded (ADM-A1, ADM-A6, ADM-A7).
2. **Partial admission** — a student without an invoice, or an invoice without a student (ADM-A7).
3. **A published result changing** — immutable, revisions are new rows (M10-7).
4. **Self-approval** — of a request, a pay run, an indent, or a case about oneself (P1, PAY-6, MAT-6).
5. **Double allocation** — one bed, one holding, one seat (HOS-3, LIB-3, TRA-4).
6. **Money in two ledgers** — every charge lands on M11 (AD-6; LIB-5, HOS-5, TRA-5).
7. **A case readable by someone who is not a party** — including a College Admin (CAS-3).
