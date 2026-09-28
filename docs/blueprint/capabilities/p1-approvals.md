# P1 — Workflow and Approvals

Blueprint capability P1 (`docs/blueprint/02-domains.md`). **Status: ❌ not built, not previously
specified.** `PROJECT_STATE.md` carries it as "Approvals capability (P1): ❌ not specified".
This document is that specification.

Four unbuilt domains depend on it. Built without it, D3 admissions, D7 leave, D8 purchase and D9
cases each grow a private approval mechanism, and the institution ends up with four inboxes and no
single answer to "what is waiting on me?".

## 1. What this capability owns

The *shape* of a decision: who must decide, in what order, within what time, what happens when they
do not, and what the record of it is. It owns the chain, the pending queue, the decision record and
the escalation clock.

It does **not** own what is being decided. A leave request is M14's entity; P1 only knows that a
thing of kind `leave_request` needs two approvals and who they are. The module keeps its own state
machine and listens for P1's outcome. This boundary is what stops P1 from becoming a god-module
that needs changing every time a domain adds a field.

## 2. Why one engine and not per-module approvals

Three reasons, in order of weight.

**One inbox.** A head of department has leave to approve, marks to verify, a concession request and
an indent. Without P1 those are four screens. With P1 they are one list, sorted by age, and the HoD
can clear it in one sitting. This is the single biggest usability difference between an ERP people
use and one they avoid.

**Delegation obeys AD-17 once.** Delegation cannot be chained, exceeded, or outlive its source. That
rule is subtle and easy to get wrong. Implementing it once in P1 means a module cannot get it wrong.

**Escalation needs a clock.** A request that nobody answers must escalate rather than sit forever.
That requires scheduled work (P9) and a uniform notion of "overdue", which no single module should own.

## 3. Entities

```
approval_definition   tenant, kind, version, active, steps[]   -- the chain, per tenant, versioned
approval_step         definition, sequence, mode, resolver, sla_hours, escalates_to
approval_request      tenant, kind, subject_id, subject_version, requested_by, state, opened_at
approval_assignment   request, step, assignee_person_id, state, due_at, delegated_from
approval_decision     assignment, decision, reason, decided_at, decided_by   -- INSERT only
```

`approval_definition` is **versioned and frozen on use**, exactly as curriculum is (AD-3, AD-34). A
request captures the definition version it opened under, so changing the chain tomorrow never
rewrites what happened yesterday. This is the same discipline AD-34 enforces by trigger for
published curriculum, and it applies here for the same reason.

`approval_decision` is INSERT and SELECT only, like every correction table in this system (AD-13).

## 4. Step modes

| Mode | Meaning | Example |
|---|---|---|
| `all` | Every assignee must approve | Purchase above a threshold: committee and Principal |
| `any` | The first decision settles the step | Any one of three counsellors verifies a document |
| `quorum(n)` | n of the assignees must approve | Grievance committee, 2 of 3 |

A rejection at any step ends the request immediately. There is no "rejected but continue": a
decision that does not stop the flow is not an approval, it is a notification, and it belongs in P2.

## 5. Resolving who decides

A step names a **resolver**, not a person. Naming people in a chain means the chain breaks the day
someone leaves — a failure mode every ERP hits in year two.

| Resolver | Resolves to |
|---|---|
| `role_in_scope(role, scope)` | Whoever holds that role in that scope now (AD-1) |
| `head_of(subject_department)` | The HoD of the subject's own department |
| `reporting_manager(requester)` | From M13's employment record |
| `named_committee(committee)` | Committee membership, which is a scoped role assignment (AD-15) |
| `fixed(person)` | A named person. Allowed, discouraged, and warned about in the UI |

Resolution happens **when the step opens**, not when the definition is written, and the resolved
assignees are stored on `approval_assignment`. So a later role change does not silently move a
request that is already in flight.

## 6. The rule that prevents the worst failure

**Nobody approves their own request, and nobody approves a case about themselves.** If resolution
produces the requester, that assignee is skipped and the step escalates to the resolver's own
escalation target. If the step would then be empty, the request escalates to the institution's
configured fallback approver rather than auto-approving.

D9's grievance requirement — *a grievance about the person who would normally handle it needs an
alternative route* — is the same rule. It is implemented once, here.

## 7. Escalation and the clock

Each step carries `sla_hours`. A scheduled job (P9) sweeps overdue assignments and:

1. at 50% of the SLA, reminds the assignee (P2);
2. at 100%, notifies the assignee and their escalation target;
3. at 150%, reassigns to the escalation target, recording the reassignment as an event.

Escalation **never auto-approves**. An unanswered request is an unanswered request; silently
approving it would make the whole capability worthless as an audit control.

## 8. Invariants the database enforces

- A decision cannot be recorded against an assignment that is not `pending` (trigger).
- A decision cannot be recorded by a person who is not the assignment's assignee or a valid
  delegate of theirs (trigger, checked against delegation validity per AD-17).
- `approval_decision` rejects UPDATE and DELETE (trigger, per AD-13).
- A request's `subject_version` is checked against the subject's current `version` before the
  outcome is applied (AD-52). If the subject changed under the approver, the outcome is refused and
  the request is returned to the requester. **Approving a stale thing is approving something nobody read.**
- Tenant RLS with FORCE on every table; `erp_app` least-privilege; DELETE granted on none of them.

## 9. Integration: how a module uses P1

Modules integrate through domain events (AD-10), never by calling each other:

```
module → P1   approval.requested   { kind, subject_id, subject_version, requester, context }
P1 → module   approval.granted     { request_id, subject_id, subject_version, decisions[] }
P1 → module   approval.rejected    { request_id, subject_id, reason }
P1 → module   approval.withdrawn   { request_id, subject_id }
```

The module applies the outcome **inside its own transaction**, re-checking `subject_version`. P1
never writes into a module's tables. This is AD-28 (cross-module questions go through a declared
capability) applied to decisions.

## 10. Notifications (P2)

Assigned, reminded at 50% SLA, overdue, escalated, decided (to the requester), withdrawn. All
through P2 with per-person channel preferences; an approval assignment is "action required now" in
P2's urgency matrix, so it goes to push, in-app and email.

## 11. Reports (P5)

Pending by assignee and age. Decision turnaround by kind and by approver. Escalation rate — a high
rate names a chain that is wrong, not a person who is slow. Rejection reasons by kind. Delegation
usage. Every one of these is a P5 descriptor, not a bespoke screen (AD-90).

## 12. Clients (AD-84 parity: web and Flutter)

**Approval inbox**, both surfaces: grouped by kind, sorted by age, with the subject summarised
inline so the approver does not have to open each one to triage. Bulk approve for same-kind
requests where the module declares it safe — leave, yes; payroll release, never.

**Request detail**: the subject rendered by the owning module, the chain with its current position,
every decision so far with reasons, and the actions available to this person.

**Requester view**: where my request is, who has it, how long it has been there.

Mobile matters here: a HoD approving leave from a corridor is the single most common real use of
this capability, which is why it is not web-only.

## 13. Edge cases

- The subject changes while a request is open → refuse the outcome, return to requester (§8).
- The assignee leaves the institution mid-request → resolver re-resolution on escalation only,
  never silently.
- A chain is edited while requests are open → in-flight requests keep their captured version (§3).
- A module is disabled with requests open → requests are withdrawn, not orphaned.
- Delegation expires mid-request → the delegate's pending assignments revert to the delegator (AD-17).
- Two steps resolve to the same person → they decide once; the second step auto-passes with a
  recorded reason, because asking the same human twice is theatre, not control.

## 14. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P1-1 | Migration, entities, RLS, GRANTs, invariant triggers | S |
| P1-2 | Definition CRUD, versioning, resolver implementations | S |
| P1-3 | Request lifecycle, step advance, decision recording | S |
| P1-4 | Escalation job (needs P9), SLA sweep | S |
| P1-5 | Approval inbox, request detail, requester view | W, F |
| P1-6 | Retro-fit attendance corrections and mark verification onto P1 | S, W, F |
| P1-7 | Reports via P5 | S, W, F |

**P1-6 is the proof.** Two approval-shaped flows already exist in shipped code (attendance
correction per AD-53, mark verification per M7). If P1 cannot absorb them without distorting either,
the design is wrong and should be corrected before D3/D7/D8/D9 build on it.

## 15. Cross-module impact

Consumed by M4 admissions (document verification, offer), M11 finance (concession, waiver, fine —
which already has this exact shape in `m11-student-finance.md` §5 and should migrate onto P1),
M13/M14 HR and leave, M15 payroll release, M19 indent and purchase, M21 cases, M7 attendance
correction, M9 mark verification. Depends on P2 notifications, P9 scheduled work, P6 audit, and
M1's authority model.
