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

---

**AD-14 — Person and UserAccount are separate entities**

*Reason.* Guardians who never sign in, rejected applicants and long-departed staff are all people
the institution must know about without an account. Conflating the two forces fake accounts for
people who will never authenticate.

*Alternatives.* One user table for everyone, rejected because it fills the directory with
unusable records and makes "active user" meaningless. A separate contact table for non-users,
rejected because a contact becomes a student and the identity would have to be recreated.

*Impact.* Person is the identity, account is one optional way to reach the system. One active
account per person, enforced by a partial unique index.

---

**AD-15 — Committee membership is a role assignment scoped to the committee**

*Reason.* Committees hold authority that no job title carries. An ordinary faculty member on the
exam committee can approve a mark correction. Modelling that as a second authority mechanism
would mean two places to check before every sensitive action.

*Alternatives.* A committee_member table with its own permission logic, rejected as a parallel
authorization system. Special-casing committee permissions inside each consuming module,
rejected as unreviewable.

*Impact.* Supersedes the implied membership entity in Blueprint 2 D1. M2 owns a committee's
existence and remit. M1 owns who sits on it and what that permits. One authorization path.

---

**AD-16 — Permissions resolve at request time, with bounded-staleness caching**

*Reason.* Authority changes mid-session, and a stale permission set is a security failure rather
than a performance question.

*Alternatives.* Permissions embedded in the token, rejected because revocation would wait for
token expiry. Uncached resolution on every request, rejected on cost at the hottest path in the
system.

*Impact.* Cached per person with a generation counter, invalidated on any assignment, delegation,
role or scope change, and capped at fifteen minutes so a lost invalidation self-heals. Session
validity is checked before permissions, so revocation is always immediate.

---

**AD-17 — Delegation cannot be chained, exceeded, or outlive its source**

*Reason.* Sub-delegation launders authority until nobody can say who actually holds it. A
delegation that outlives the delegator's own assignment grants authority its source no longer has.

*Alternatives.* Unrestricted delegation, rejected. Approval-gated sub-delegation, rejected as
complexity serving a case that does not arise in a college.

*Impact.* One hop only. Delegated acts are recorded in both names. Deactivating the delegator
ends the delegation immediately.

---

**AD-18 — Deny by default, and no-access is a designed state**

*Reason.* A user with no assignment is normal on their first day, not an error. Showing an error
or a blank screen generates a support call at the worst possible moment.

*Alternatives.* Grant a default role on account creation, rejected because an implicit grant is
an unreviewable one.

*Impact.* Authentication and authorization are separate. Signing in always succeeds or fails on
identity alone. What a user may then do is a separate answer, and "nothing yet" is a designed
screen naming who to contact.

---

**AD-19 — Impersonation is read-only, institution-approved, time-boxed and fully audited**

*Reason.* Support access to a live tenant is the largest standing privilege in a multi-tenant
product, and the institution rather than the vendor must control it.

*Alternatives.* Vendor-side impersonation without tenant approval, rejected outright. No
impersonation at all, rejected because support then asks staff for their credentials, which is
worse.

*Impact.* Read-only at the policy layer rather than in the interface. Maximum sixty minutes with
no extension. A persistent banner. Every record read is audited, not merely the session. The
Principal sees requested, used and unused grants alike.

---

**AD-20 — PROPOSED, NOT YET APPROVED. Tenant provisioning runs as one transaction across M1 and M2**

*Status.* Proposed on 2026-09-12. It narrows AD-10, which is approved architecture, so it is not
in force until explicitly approved.

*Reason.* Creating a college and its first administrator is one business act. Splitting it across
an event boundary permits a college to exist with no administrator, which is not a degraded state
but an unusable one, recoverable only by support. There are also no consumers to be eventually
consistent with, because the tenant did not exist a moment earlier.

*Alternatives.* Event-driven provisioning per AD-10, rejected because the failure mode is an
orphaned tenant. A saga with compensation, rejected as machinery that costs more than the
single transaction it replaces, for one operation that runs a few times a month. Requiring the
administrator to be created in a second step, rejected by the stated requirement.

*Scope of the exception, deliberately narrow.* A shared transaction is permitted only for
bootstrap provisioning of a new tenant, only between M2 as orchestrator and M1's provisioning
capability, and only before the tenant has any users. Every other cross-module interaction
remains event-driven under AD-10. M2 calls a declared M1 capability. It does not write M1's
tables, so the ownership rule in Blueprint 3 §3.3 is untouched.

*Impact.* One documented exception to AD-10. Notification delivery stays outside the transaction,
since email cannot be transactional. If approved, M2's specification inherits this as a
constraint rather than rediscovering it.

---

**AD-21 — PROPOSED, NOT YET APPROVED. No denormalized administrator pointer on the institution**

*Status.* Proposed on 2026-09-12, alongside AD-20.

*Reason.* The obvious implementation of "a college has an admin" is a column on the institution,
or an `is_primary_admin` flag on the assignment. Either creates a second source of truth for
authority, contradicting AD-1, and each breaks the moment a college has two administrators or
replaces one.

*Alternatives.* `institution.admin_user_id`, rejected. It answers "who is the admin" with a
different mechanism from every other authority question in the system. An `is_primary` flag,
rejected for the same reason, and because primacy has no meaning in the permission model.

*Impact.* "Who administers this college" is answered by querying active assignments for the
College Administrator role at institution scope, exactly as every other authority question is
answered. Replacement, suspension and multiple administrators work with no new mechanism. The
onboarding screen shows the current administrators from that query, not from a stored pointer.
