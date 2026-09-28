# Module and Capability Index

Every module and platform capability, its document, and its real state. **This is the linking
index**: start here, follow one link, do not read the whole blueprint.

Numbering follows `docs/blueprint/03-modules.md` §3.1 (the subject map). Implementation slice
numbers are a separate delivery stream mapped by AD-44 — see `MODULE_REGISTRY.md`. Drift 4 in
`docs/MASTER-CHECKLIST.md` explains why both exist; new documents here are named by **subject**
rather than number to avoid adding to that collision.

## Status legend

✅ built · ⚠️ partial · ❌ not built · 🚫 blocked · 🔍 needs validation

## Modules

| # | Module | Domain | Doc | Server | Web | Flutter |
|---|---|---|---|---|---|---|
| M1 | Identity and Access | D1 | [m1-identity-and-access.md](m1-identity-and-access.md) | ✅ | ✅ | ✅ |
| M2 | Institution Setup | D1 | [m2-curriculum-spine.md](m2-curriculum-spine.md) | ✅ | ✅ | ✅ |
| M3 | Academic Structure | D2 | [m2-curriculum-spine.md](m2-curriculum-spine.md), [m3-course-offering.md](m3-course-offering.md), [m3-teaching-operations.md](m3-teaching-operations.md) | ✅ | ✅ | ✅ |
| **M4** | **Admissions and Student Lifecycle** | D3 | [admissions.md](admissions.md) | ❌ | ❌ | ❌ |
| M5 | Student Records | D3 | [m5-m6-attendance.md](m5-m6-attendance.md) | ⚠️ roster only | ⚠️ | ⚠️ |
| M6 | Timetable | D4 | [m4-teaching-delivery.md](m4-teaching-delivery.md) | ✅ | ✅ | ✅ |
| M7 | Attendance | D4 | [m5-m6-attendance.md](m5-m6-attendance.md) | ✅ | ✅ | ✅ |
| **M8** | **Coursework and Feedback** | D4 | [coursework.md](coursework.md) | ❌ | ❌ | ❌ |
| M9 | Internal Assessment | D5 | [m7-internal-assessment.md](m7-internal-assessment.md) | ✅ | ✅ | ✅ |
| **M10** | **Examinations and Results** | D5 | [examinations-and-results.md](examinations-and-results.md) | 🚫 OD-1 | 🚫 | 🚫 |
| M11 | Student Finance | D6 | [m11-student-finance.md](m11-student-finance.md) | ✅ | ❌ **parity gap** | ✅ |
| **M12** | **Scholarships** | D6 | [scholarships.md](scholarships.md) | ❌ | ❌ | ❌ |
| **M13** | **HR and Staff** | D7 | [hr-and-staff.md](hr-and-staff.md) | ❌ | ❌ | ❌ |
| **M14** | **Leave and Workload** | D7 | [leave-and-workload.md](leave-and-workload.md) | ❌ | ❌ | ❌ |
| — | **Staff Attendance** (AD-83) | D7 | [staff-attendance.md](staff-attendance.md) | ⚠️ **fence unenforced** | ⚠️ | ⚠️ |
| **M15** | **Payroll** | D7 | [payroll.md](payroll.md) | ❌ | ❌ | ❌ |
| **M16** | **Library** | D8 | [library.md](library.md) | ❌ | ❌ | ❌ |
| **M17** | **Hostel** | D8 | [hostel.md](hostel.md) | ❌ | ❌ | ❌ |
| **M18** | **Transport** | D8 | [transport.md](transport.md) | ❌ | ❌ | ❌ |
| **M19** | **Materials and Assets** | D8 | [materials-and-assets.md](materials-and-assets.md) | ❌ | ❌ | ❌ |
| **M20** | **Communication** | D9 | [communication.md](communication.md) | ❌ | ❌ | ❌ |
| **M21** | **Cases** (grievance, discipline, helpdesk) | D9 | [cases.md](cases.md) | ❌ | ❌ | ❌ |
| **M22** | **Events and Activities** | D9 | [events.md](events.md) | ⚠️ calendar only | ❌ | ⚠️ |
| **M23** | **Placements** | D9 | [placements.md](placements.md) | ❌ | ❌ | ❌ |
| **M24** | **Alumni** | D9 | [alumni.md](alumni.md) | ❌ | ❌ | ❌ |
| — | **Institutional Accounts** — named gap, OD-ACC-1 | D6 | [institutional-accounts.md](institutional-accounts.md) | ❌ | ❌ | ❌ |

## Platform capabilities

| ID | Capability | Doc | State |
|---|---|---|---|
| P1 | Workflow and Approvals | [../capabilities/p1-approvals.md](../capabilities/p1-approvals.md) | ❌ |
| P2 | Notifications | [../capabilities/p2-notifications.md](../capabilities/p2-notifications.md) | ⚠️ **Drift 6: tokens hash-only** |
| P3 | Documents and Files | [../capabilities/p3-documents.md](../capabilities/p3-documents.md) | ⚠️ syllabus one-off |
| P4 | Certificates and Letters | [../capabilities/p4-certificates.md](../capabilities/p4-certificates.md) | ❌ |
| P5 | Reporting and Analytics | [../capabilities/p5-reporting.md](../capabilities/p5-reporting.md) | ⚠️ fee reports only |
| P6 | Audit and Compliance | [../capabilities/p6-audit.md](../capabilities/p6-audit.md) | ✅ writes · ❌ sensitive reads |
| P7 | Search and Command | [../capabilities/p7-search-and-command.md](../capabilities/p7-search-and-command.md) | ❌ |
| P8 | Configuration and Integration | [../capabilities/p8-configuration-and-integration.md](../capabilities/p8-configuration-and-integration.md) | ⚠️ fragments |
| **P9** | **Scheduled Work** (new, AD-88) | [../capabilities/p9-scheduled-work.md](../capabilities/p9-scheduled-work.md) | ❌ |
| — | Offline Outbox | [../capabilities/offline-outbox.md](../capabilities/offline-outbox.md) | ✅ device-verified |
| — | Platform Administration | [../capabilities/platform-administration.md](../capabilities/platform-administration.md) | ⚠️ SA-5 missing |

## Build order

Capabilities before domains. Four unbuilt domains each depend on P1, P2, P3, P5 and P9; building any
domain first means building those five privately, four times over.

```
P9 → P2 → P1 → P3 → P5 → P4
              ↓
M4 Admissions ──────► M11 (invoice on admission)
     └──► M12 Scholarships
M10 Examinations  (gated on OD-1 → AD-91)
M13 HR ──► M14 Leave ──► M15 Payroll
     └──► staff-attendance (currently orphaned)
M20 Communication ──► M21 Cases ──► M22 Events ──► M23 Placements ──► M24 Alumni
M16 Library ──► M17 Hostel ──► M18 Transport ──► M19 Materials
     └──► all charge M11 (AD-6); all answer M4's clearance capability
```

Full phasing and the tickable task list: **[../EXECUTION-CHECKLIST.md](../../EXECUTION-CHECKLIST.md)**.
Audit and rationale: **[../MASTER-PLAN.md](../../MASTER-PLAN.md)**.

## Conventions every module doc follows

Each document states: what the module owns **and does not own**; roles and permission keys;
entities; lifecycle; invariants the database enforces; approvals via P1; the money boundary to M11
(AD-6); notifications (P2); scheduled work (P9); documents (P3) and certificates (P4); reports (P5);
clients on **both** surfaces with parity exceptions recorded (AD-84); edge cases; build slices; and
cross-module impact.

Four rules recur because they are load-bearing across the system:

1. **No module holds a monetary balance except M11** (AD-6, `03-modules.md` §3.3).
2. **No module stores a derived academic value** (AD-7). The declared exceptions are a published
   result (AD-23), M4's frozen merit ranking, M15's frozen payslip, and three materialised balances
   with nightly reconciliation jobs (M14 leave, M19 stock).
3. **Correction is a workflow, never an edit** (AD-13). Correction tables are INSERT and SELECT only.
4. **Cross-module questions go through a declared capability**, not a shared read (AD-28).
