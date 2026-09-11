# Architecture Decision Log

Append-only. Each entry records the decision, the reason, the alternatives considered and the
impact. A superseded decision is marked, never deleted.

Earlier decisions D1 to D13 live in [../11-decisions.md](../11-decisions.md) and cover the client
application. The entries below cover the enterprise architecture.

---

**AD-1 — Authority is role × scope × validity, not a role column**

*Reason.* One person legitimately holds several roles at once, each over a different part of the
institution, each for a period. A professor is faculty for four courses, head of a department,
and a member of the exam committee. No single role value can express this.

*Alternatives.* A single role per user, rejected because it cannot model a real college. Role
plus department only, rejected because campus, program and academic year are also real scopes.
Pure attribute-based access control, rejected as too costly to administer for college staff.

*Impact.* Every permission check resolves assignments rather than reading a field. Supersedes
the four-role model in the existing product documentation.

---

**AD-2 — Campus is a first-class scope from day one**

*Reason.* Adding a scope dimension to a live authorization model means revisiting every query
and every policy. The cost of carrying it from the start is one column and one filter.

*Alternatives.* Add it later when a multi-campus customer appears, rejected on retrofit cost.
Model each campus as a separate tenant, rejected because staff, curricula and reporting are
shared across campuses in a single institution.

*Impact.* Schema and policy carry campus throughout. Single-campus tenants get one implicit
campus and never see it. Open under OD-2.

---

**AD-3 — Curriculum is versioned by regulation year and frozen once published**

*Reason.* Students follow the regulation they were admitted under for their whole degree. A
mutable curriculum silently rewrites the graduation requirements of students already part-way
through, which is unrecoverable and legally serious.

*Alternatives.* Program owns courses directly, rejected as unsound. Copy the curriculum per
batch, rejected as duplication that drifts.

*Impact.* Courses, credits and rules hang off a curriculum version. Amendments create a new
version. Every academic computation resolves through the student's regulation year.

---

**AD-4 — Enrolment, not section membership, is the unit of academic record**

*Reason.* Electives, repeats, backlogs and credit transfer all break a model where a student's
courses are implied by their section.

*Alternatives.* Section-implied courses, rejected. It is simpler and fails in the second year.

*Impact.* Marks, attendance and results key to an enrolment. Section remains, for timetabling.

---

**AD-5 — Nine domains and eight platform capabilities, not twenty-five modules**

*Reason.* Several entries in the conventional ERP module list are cross-cutting capabilities.
Building documents, notifications, approvals, audit, reporting and certificates inside each
consuming module produces several incompatible implementations of each and no audit trail.

*Alternatives.* One module per listed capability, rejected as fragmentation. A monolith with no
module boundaries, rejected as unmaintainable.

*Impact.* Platform capabilities are built early and shared. No "Reports module" exists.

---

**AD-6 — All money lives in one ledger, owned by Student Finance**

*Reason.* Library fines, hostel dues and transport charges tracked inside their service modules
would create four balances per student that must be reconciled by hand.

*Alternatives.* Per-service balances with periodic reconciliation, rejected. It is the most
common source of disputes in college systems.

*Impact.* Service modules emit a charge event. They never hold an amount owed.

---

**AD-7 — No derived academic value is stored**

*Reason.* Attendance percentage, credits earned and cumulative averages computed once and stored
go stale the moment a correction is approved, and the staleness is invisible.

*Alternatives.* Store and recompute on change, rejected because the change paths are too many to
enumerate safely. Materialize with a scheduled refresh, acceptable later purely as a performance
optimization behind the computed source.

*Impact.* Computation lives in the database as views or in the domain layer, never in the UI.

---

**AD-8 — External examination results are a read-only mirror**

*Reason.* Where a college is affiliated, the university owns the result. An ERP that lets staff
edit a mirrored university mark creates a second version of the truth that will be contradicted
at convocation.

*Alternatives.* Treat imported results as editable local records, rejected outright.

*Impact.* An import adapter per university format. The autonomous examination engine is a
separate, flag-gated capability. Open under OD-1.

---

**AD-9 — Offline-first applies to field roles on mobile, not to the whole system**

*Reason.* Teachers mark attendance in basements with no signal, and students check timetables on
trains. Admissions clerks, cashiers and payroll officers work at desks on a network, and their
workflows involve validation and approval that cannot be resolved locally.

*Alternatives.* System-wide offline, rejected as costing more than the modules it protects.
Online-only, rejected because it breaks the product's most frequent daily action.

*Impact.* Narrows the earlier commitment in the offline documentation. Attendance, timetable,
notices and a student's own records are offline-capable. Back-office modules are online-first
with graceful degradation.

---

**AD-10 — Modules integrate through domain events**

*Reason.* Direct cross-module reads create a cyclic dependency graph that cannot be released or
tested in parts.

*Alternatives.* Synchronous cross-module calls, rejected on coupling and deadlock risk. A shared
database with no boundaries, rejected because it makes ownership unenforceable.

*Impact.* Each module publishes events and subscribes to others. Ownership stays single, and a
module can be developed and released on its own.

---

**AD-11 — Academic year rollover is a first-class, rehearsable operation**

*Reason.* It touches every module at once, happens under time pressure, and a failure at a live
college is unrecoverable without a restore.

*Alternatives.* Treat it as an administrative script, which is what most college systems do and
is why most college systems dread June.

*Impact.* Rollover gets a specification, a dry-run against a copy, a pre-flight validation
report, a staged execution and a defined reversibility window.

---

**AD-12 — Every mutable record carries a version, and conflicts are surfaced**

*Reason.* Two clerks editing one student and two teachers marking one session are ordinary, not
exceptional. Last write wins loses work silently.

*Alternatives.* Pessimistic locking, rejected as unusable for staff working in parallel.
Last write wins, rejected as data loss.

*Impact.* Optimistic versioning platform-wide, with an explicit conflict surface. Consistent
with the client-side conflict policy already documented.

---

**AD-13 — Correction is a workflow, never a database edit**

*Reason.* Attendance typos, mark corrections and ledger adjustments happen constantly. A system
with no correction path trains staff to ask an administrator to edit the database, which
destroys the audit trail exactly where it matters most.

*Alternatives.* Immutable records with no correction, rejected as unusable. Free editing,
rejected as unauditable.

*Impact.* Every high-integrity record has a defined correction workflow with an approver, a
mandatory reason and a preserved original.
