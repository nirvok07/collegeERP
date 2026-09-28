# M21 — Cases (Grievance, Discipline, Helpdesk)

Blueprint module M21, domain D9. **Status: ❌ not built.**

`02-domains.md` groups grievances, disciplinary matters and helpdesk tickets because **three of them
are the same case primitive**: something is raised about a person or a thing, someone is
responsible, it moves through states with evidence, and it ends in a decision that can be appealed.

## 1. One primitive, three policies

The temptation is three modules. The reality is one entity and three configurations:

| | Grievance | Discipline | Helpdesk |
|---|---|---|---|
| Raised by | The aggrieved, possibly anonymously | Staff, against a person | Anyone |
| Subject | An issue or a person | **Always a person** | A thing |
| Decided by | Committee (AD-15) | Committee, with a hearing | Assignee |
| Appeal | Yes | **Yes, and statutory** | No |
| Sensitivity | High | **Highest** | Low |
| Anonymity | Supported | No | No |

What differs is policy — who may see it, whether anonymity is allowed, whether a hearing is
required, what the appeal route is. That is configuration on `case_type`, not three codebases.

## 2. What this module owns

Raising, triage, assignment, investigation, evidence, hearing, resolution, sanction, appeal and
closure. It owns the confidentiality boundary around all of them.

It does **not** own: the sanction's *effect* (a hostel expulsion is M17's allocation change, a
result withheld is M10's state, a suspension is M13's employment state — M21 decides, the owning
module applies), notification delivery (P2), or documents (P3).

## 3. Confidentiality is the architecture, not a feature

This is the most sensitive module in the system, and access rules cannot be bolted on afterwards.

- A case is visible to: the raiser, the subject (with exceptions, §4), assigned handlers, the
  committee, and nobody else. **Not to a College Admin by virtue of being an admin.** This is the
  one place where "the admin sees everything" is wrong, and the permission model must say so.
- Every read of a case is a **sensitive read and is audited** (P6 §3). The audit is not a deterrent
  detail; it is the reason a grievance system is trusted enough to be used.
- Evidence documents inherit case visibility and use one-time signed URLs (P3 §5).
- A closed case's visibility narrows further: to the parties and the committee, by default.

## 4. The two rules that make a grievance system credible

**A grievance about the person who would normally handle it must route elsewhere.**
`02-domains.md` names this edge case, and P1 §6 implements it once: if resolution produces the
subject or the raiser, that assignee is skipped and the step escalates. A grievance against a HoD
does not land in that HoD's inbox.

**Anonymity is real until investigation requires identity.** An anonymous grievance stores the
raiser's identity **sealed** (AD-63's mechanism), not absent. Unsealing is a deliberate,
permissioned, reasoned, audited act by the committee — not a side effect of opening the case.
Storing nothing makes follow-up impossible; storing it in the clear makes anonymity a lie.

## 5. Permissions

```
case.raise          normal     Raise a case
case.read.own       normal     Own cases, as raiser or subject
case.triage         sensitive  Categorise, assign, set priority
case.investigate    sensitive  Add findings and evidence
case.resolve        sensitive  Decide and close
case.appeal.decide  critical   Decide an appeal
case.identity.unseal critical  Unseal an anonymous raiser. MFA, reason required
case.configure      sensitive  Types, committees, SLAs, appeal routes
```

## 6. Entities

```
case_type        tenant, key, name, category(grievance|discipline|helpdesk), allows_anonymous,
                 requires_hearing, appeal_route, sla_hours, committee_role, confidentiality, version
case             tenant, type, case_no, raised_by|sealed_identity, subject_person, subject_ref,
                 title, description, priority, state, assigned_to, opened_at, due_at, version
case_event       case, kind(comment|assignment|evidence|finding|hearing|status), body,
                 actor, visibility(parties|handlers|committee), at   -- INSERT only
case_evidence    case, document_id (P3), added_by, description, at
hearing          case, scheduled_at, venue, attendees[], minutes, outcome, conducted_by
resolution       case, outcome, reasoning, sanction_kind, sanction_detail, decided_by,
                 decided_at, effective_from                          -- INSERT only
sanction         resolution, target_module, target_ref, applied_at, applied_by, state
appeal           resolution, raised_by, grounds, state, decided_by, outcome, at
case_watcher     case, person, reason
```

`case_no` is gapless per tenant per type per year (M11's numbering rule). A case number is what a
complainant is given as a reference, and a hole in the series is a question nobody wants to answer.

## 7. Lifecycle

```
case:  raised → acknowledged → triaged → assigned → investigating
             → { hearing_scheduled → heard } → resolved → closed
             ↘ rejected(not_admissible)  ↘ withdrawn  ↘ escalated

appeal: raised → admitted → { heard } → decided → closed
               ↘ rejected(out_of_time | no_grounds)
```

**Acknowledgement is a separate state and it is time-bound.** A complainant who hears nothing
assumes nothing happened. `sla_hours` starts at `raised`, and acknowledgement within it is the
first thing P9 chases.

## 8. Invariants

- `case_event`, `resolution` and `sanction` are INSERT only (AD-13).
- The subject of a case can never be its handler, decider or appeal decider (P1 §6).
- A case requiring a hearing cannot reach `resolved` without a `hearing` row with minutes.
- An appeal is decided by a **different** person and at a higher level than the original resolution.
- Unsealing an anonymous identity requires `case.identity.unseal`, MFA, a reason, and writes an
  audit row before the identity is returned.
- A sanction is applied by its owning module and records the reference; M21 never writes into M17's
  allocations or M10's results directly (AD-28).
- Appeal windows are calendar-date computed (AD-49) from `decided_at`.
- Tenant RLS with FORCE, plus per-case visibility enforced in the read path — **RLS alone is not
  enough here**, because every row is same-tenant.

## 9. Sanctions cross module boundaries

A disciplinary outcome has an effect somewhere else:

| Sanction | Applied by | Effect |
|---|---|---|
| Warning, reprimand | M21 | Recorded only |
| Fine | M11 | Charge on the ledger (AD-6) |
| Hostel expulsion | M17 | Allocation terminated |
| Result withheld | M10 | Result state (§10 edge cases) |
| Exam debarment | M10 | Eligibility refused |
| Suspension (student) | M5 | Lifecycle event |
| Suspension (employee) | M13 | Employment state |
| Rustication | M4 | Exit lifecycle event |

M21 emits `sanction.ordered`; the owning module applies it inside its own transaction and confirms.
A sanction ordered but not confirmed is a visible, alerted inconsistency — never a silent one.

## 10. Anti-ragging: a statutory obligation, not a category

Indian higher education mandates an anti-ragging committee, a complaint mechanism, and an annual
statutory return. This is a `case_type` with a dedicated committee, a short SLA, mandatory
acknowledgement, and a report (§12) shaped to the return. It is named here because it is a legal
requirement that must not be discovered late.

## 11. Approvals (P1), notifications (P2), scheduled work (P9)

**Approvals:** admissibility for contested cases, sanctions above a threshold, appeal admission,
identity unsealing, closure of a grievance (by the committee, never by the person complained about —
`02-domains.md` states this explicitly).

**Notifications:** raiser — acknowledged with a reference number, status changed, hearing scheduled,
resolved, appeal outcome. Subject — case raised, hearing scheduled (with notice period), resolution.
Handler — assigned, SLA approaching, overdue. Committee — hearing scheduled, decision required.
All are `action required` or `security` urgency; **case notifications never go to a digest.**

**Jobs:** acknowledgement SLA chase, **escalation on deadline breach** (D9's named automation),
hearing reminders, appeal window expiry, sanction-application confirmation chase, ageing reports.

## 12. Reports (P5)

Case ageing by category, type and handler. Resolution time against SLA. **Repeat complaints** —
by subject and by raiser, both of which are signals. Escalation and breach rate. Appeal rate and
overturn rate; a high overturn rate names a decision process that is wrong. Sanction register.
**Anti-ragging statutory return** (§10). Helpdesk volume by category, which drives what to fix.

All case reports are `sensitive` and scope-limited; an aggregate must never be drillable into a case
the runner may not read (P5 §3).

## 13. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| **Raise a case** | ✅ | ✅ **primary — a student raising a grievance uses a phone** |
| Anonymous raise | ✅ | ✅ |
| My cases and status | ✅ | ✅ **primary** |
| Triage queue | ✅ **primary** | ✅ |
| Investigation, evidence, findings | ✅ **primary** | ✅ + camera evidence (P3) |
| Hearing scheduling and minutes | ✅ **primary** | ✅ read |
| Resolution and sanction | ✅ **primary** | ✅ |
| Appeal | ✅ | ✅ |
| Committee inbox | ✅ | ✅ (P1) |
| Reports | ✅ primary | ✅ via P5 |

Raising on a phone, privately, is the point. A grievance mechanism that requires walking into an
office and asking for a form is a grievance mechanism people do not use — which is exactly the
failure the statutory requirement exists to prevent.

## 14. Edge cases

- Anonymous case needing identity → sealed, unsealed deliberately (§4).
- Grievance against the normal handler → alternative route (§4).
- Case about a person who then leaves → proceeds; the record is the institution's.
- **Disciplinary case overlapping a police matter** → named in `02-domains.md`. The case is marked
  as having an external proceeding and can be stayed; the ERP does not adjudicate, it records.
- Raiser withdraws but the institution must proceed (safety, ragging) → withdrawal of the complaint
  does not close the case; the type decides.
- Two cases about one incident → linked, decided together, both numbered.
- Sanction ordered but the target module refuses (student already exited) → visible inconsistency,
  handled, not silent (§9).
- Appeal filed after the window → rejected `out_of_time`, with the dates shown.
- Evidence withdrawn → superseded, never deleted (P3 §6).
- Minor involved → guardian notification is mandatory for the type (needs M4's ADM-A14 guardian
  accounts for the full path).
- Committee member is related to a party → declared conflict, recused, recorded.

## 15. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| CAS-1 | Case types, committees, SLAs, appeal routes | S, W, F | M1, AD-15 |
| CAS-2 | **Case primitive**: raise, number, acknowledge, timeline | S, W, F | — |
| CAS-3 | **Confidentiality in the read path** (§3) + P6 read audit | S | P6 |
| CAS-4 | Triage, assignment, priority | S, W, F | — |
| CAS-5 | Evidence via P3, camera capture | S, W, F | P3 |
| CAS-6 | Anonymous raise with sealed identity + unsealing | S, W, F | AD-63 |
| CAS-7 | Grievance policy, committee decision | S, W, F | P1 |
| CAS-8 | Discipline: hearing, minutes, sanction | S, W, F | P1 |
| CAS-9 | **Sanction application across modules** (§9) | S | AD-28 |
| CAS-10 | Appeals | S, W, F | P1 |
| CAS-11 | Helpdesk policy, lightweight queue | S, W, F | — |
| CAS-12 | SLA chase and escalation | S | P9 |
| CAS-13 | Anti-ragging type and statutory return | S, W, F | P5 |
| CAS-14 | Reports | S, W, F | P5 |

CAS-3 before anything sensitive is raised. Building the confidentiality boundary after cases exist
means a window in which grievances are readable by people who should never have seen them, and
that window cannot be undone.

## 16. Cross-module impact

Subjects come from M5 (students) and M13 (employees). Sanctions apply into M11, M17, M10, M5, M13,
M4 (§9). Blocks P4's conduct certificate and feeds M4's exit clearance. Incidents arrive from M17
(hostel) and M18 (transport). Depends on P1, P2, P3, P5, P6, P9, AD-63.
