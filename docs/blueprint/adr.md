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

**AD-20 — Tenant provisioning runs as one transaction across M1 and M2**

*Status.* **Approved and active, 2026-09-12.** It narrows AD-10, which remains in force for every
other cross-module interaction. Binding on M2 and all future modules.

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

**AD-21 — No denormalized administrator pointer on the institution**

*Status.* **Approved and active, 2026-09-12.** Binding on M2 and all future modules.

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

---

**AD-22 — Shared PostgreSQL with row-level tenant isolation, partitioned on the two high-volume tables**

*Status.* Approved and active, 2026-09-12. Resolves OD-10.

*Reason.* At the target of 50 tenants, per-tenant databases would mean 50 migration runs per
release and 50 backup schedules, with no isolation benefit that row-level security does not
already give. Attendance and audit carry 95 percent of the volume and approach 9 billion rows
across the platform over five years, so partitioning is required regardless of the tenancy model.

*Alternatives.* A database per tenant, rejected on operational cost at this scale, though it
remains the escape hatch for one large or contractually isolated customer. A schema per tenant,
rejected because it has the migration cost of separate databases with weaker isolation. No
partitioning, rejected against the volume arithmetic in Blueprint 4 §4.2.

*Impact.* Every table carries `tenant_id`. Isolation is enforced twice, in the data access layer
and again at the database, so a single forgotten filter cannot leak across tenants. Tenant-to-
connection routing exists from the first release even while every tenant resolves to one cluster,
so moving a tenant out later is a data move rather than a redesign.

---

**AD-23 — A published result is the one permitted materialized academic value**

*Status.* Approved and active, 2026-09-12.

*Reason.* AD-7 forbids storing derived academic values, because they go stale invisibly. Result
publication is the exception that proves the rule: the value is frozen by the publication itself,
and the read spike it creates is the largest in the product.

*Alternatives.* Recompute per request, rejected because it makes the worst load moment also the
most expensive. Relax AD-7 generally, rejected outright.

*Impact.* Narrow and conditional. The snapshot is written by the publication workflow, is
immutable, is invalidated only by an approved correction under AD-13 which republishes it, and
carries the publication identifier so a stale snapshot is detectable rather than silent.

---

**AD-24 — The back office is a web console; Flutter serves students and faculty**

*Status.* Approved and active, 2026-09-12. Resolves OD-3. Taken by me under an
instruction not to wait, after the decision stood open across three sessions.

*Reason.* Admissions processing, fee counters, the exam cell and procurement are desktop work:
large tables, bulk selection, keyboard-driven entry. A phone cannot carry them. Students,
faculty and guardians are the opposite, and they are the offline-first roles under AD-9.

*Alternatives.* Mobile only, as requirement R3 originally stated, rejected because the
back-office workflows in M1 §11 are not expressible on a phone and the design already refuses to
shrink bulk operations onto one. Flutter web for the console, rejected because dense data grids,
keyboard operation and text selection are weaker there than in the platform the console
actually targets. One responsive Flutter app for everyone, rejected for both reasons together.

*Impact.* Supersedes R3. Two clients share one API and one set of design tokens, the tokens
being the reason the two surfaces will look like one product. The console is plain React with no
component framework, so the approved design system is implemented directly rather than fought.
Reversal is cheap today and expensive once the admissions and finance screens exist.

---

**AD-25 — Session lifetime and access-token lifetime are separate concerns**

*Status.* Approved and active, 2026-09-12.

*Reason.* A user must not be signed out while still working. Access tokens stay short, 15
minutes, because they travel on every request and cannot be revoked mid-life. The session is
long and sliding, because the person is still at their desk. Conflating the two produces either
an insecure long-lived access token or an ERP that signs a clerk out mid-admission.

*Alternatives.* Long-lived access tokens, rejected: unrevocable for their whole life. A fixed
session with no renewal, rejected: it is the behaviour being removed. Tokens that never expire,
rejected outright.

*Impact.* Refresh tokens rotate on every use, carry a family id, and slide their expiry forward
from the moment of renewal rather than from sign-in. Presenting an already-consumed token means
replay or theft, so the whole family is revoked and the event is audited. Renewal also re-checks
account status, which is how a suspension reaches an already-signed-in user.

---

**AD-26 — Web keeps the refresh token in an httpOnly cookie and the access token in memory**

*Status.* Approved and active, 2026-09-12.

*Reason.* The refresh token is the long-lived credential. Anything readable by JavaScript is
readable by an XSS bug, so it must not be in localStorage, sessionStorage or a JS-visible cookie.
httpOnly puts it beyond script entirely. The access token lives in memory only and is re-minted
on load, so nothing sensitive is persisted by the client at all.

*Alternatives.* Refresh token in localStorage, rejected: one XSS bug is a stolen session that
survives a password change. sessionStorage, rejected for the same reason and because it also
signs the user out per tab.

*Impact.* CORS carries credentials, which is safe only against the explicit origin allowlist
already in place. The cookie path is narrowed to the auth routes, so it is not attached to
ordinary API calls. A cold start costs one refresh request. Mobile does not use cookies: Flutter
receives the token in the response body and stores it in platform secure storage, exercising the
same endpoint and the same rotation rules.

---

**AD-27 — Archiving an organisational unit is refused while authority is scoped to it**

*Status.* Approved and active, 2026-09-12.

*Reason.* Blueprint 3 §3.5 proposed marking such assignments invalid and listing them for
remediation. Implementing M2 showed that hides the consequence at the moment the decision is
made: the archive succeeds, access silently stops working, and someone discovers it later.
Refusing, and naming the people who hold that access, forces the reorganisation into the right
order. Move them, then archive.

*Alternatives.* Invalid-scope state with a remediation list, rejected as above. Cascade the
revocation, rejected because removing someone's authority as a side effect of an unrelated
administrative action is exactly what AD-13 exists to prevent.

*Impact.* Supersedes the invalid-scope proposal in Blueprint 3 §3.5. The refusal message names
up to three holders, so it is actionable rather than a count. Archiving a campus is refused the
same way, and additionally while it still holds active departments.

---

**AD-28 — Cross-module scope questions go through a declared capability, not a shared read**

*Status.* Approved and active, 2026-09-12.

*Reason.* M2 must know whether anyone holds authority over a department before archiving it.
Querying `role_assignments` directly would make M2 a second reader of M1's table and therefore a
second interpretation of what "active authority" means, which drifts the moment either changes.

*Alternatives.* Direct query, rejected on ownership. A domain event after the fact, rejected
because the answer is needed before the decision, not after it.

*Impact.* M1 exposes `occupancyOfScope`, the same shape as the provisioning capability M2
already calls under AD-20. Any future module owning a scope target asks the same way.

---

**AD-29 — Organisational structure administration is web-only, by intent**

*Status.* Approved and active, 2026-09-12.

*Reason.* Creating campuses and departments is a rare administrative act performed by one or two
people, involving hierarchy and codes that other records reference permanently. It is desktop
work. Building it for touch would serve nobody and would cost a second set of screens to
maintain.

*Alternatives.* Both clients from the start, rejected as effort with no user. Mobile-first,
rejected outright for this capability.

*Impact.* The write surface is web-only. The read surface is deliberately not: the API returns
two flat lists and the client assembles the tree, so a phone can drill down one level at a time
rather than receiving a nested structure shaped for a desktop layout. Mobile will read the tree
as soon as it shows a teacher their department, and nothing here has to change for that.

---

**AD-30 — Firebase is platform infrastructure, three services only**

*Status.* Approved and active, 2026-09-12.

*Reason.* Mobile needs push delivery, a safe way to turn client behaviour off remotely, and
crash diagnostics. None of those are domain concerns, and all three are things a backend cannot
do from the server side alone.

*Approved.* Cloud Messaging for delivery only, with the backend deciding who is notified and
why. Remote Config for client flags, kill-switches and rollout. Crashlytics for diagnostics.

*Rejected.* Firebase Auth, because identity is ERP-owned and a second authentication system
would fork the authorization model. Firestore and Realtime Database, because PostgreSQL is the
source of truth. Firebase Storage, because media belongs to Cloudinary behind the storage port.
The generated `firebase_options.dart` carries a `storageBucket` field regardless; that is
generated output, not a decision.

*Impact.* Every Firebase import lives in `lib/core/platform/firebase_services.dart` and nothing
above it knows Firebase exists. Remote Config has compiled defaults and never blocks startup, so
the app works offline, during an outage, and on a device with no Play Services. Crashlytics
receives no credential and no personal data, and is not an audit mechanism: the backend audit
trail remains authoritative.

---

**AD-31 — Flutter implements the same motion principles with native mechanisms**

*Status.* Approved and active, 2026-09-12.

*Reason.* Copying CSS keyframes into Flutter would produce animation that fights the platform.
The principles transfer; the implementation should not.

*Impact.* The same four duration bands and curve roles live in `AppMotion`, expressed as Dart
constants and Flutter curves. Page transitions use a rise-and-fade builder on Android and the
platform transition on iOS. The stagger cap is the same eight items, and `MediaQuery`'s
`disableAnimations` removes travel while keeping indeterminate progress moving, matching the web
rule that a frozen spinner reads as hung.

---

**AD-32 — Mobile reads; the desktop console writes structure and authority**

*Status.* Approved and active, 2026-09-12.

*Reason.* Granting authority needs a scope picker over the organisation tree, and editing
structure is rare hierarchical work. Both are desktop tasks, per AD-29. A partial version on a
phone would invite mistakes rather than prevent them.

*Impact.* The mobile People and Organisation surfaces are read-only, and say so where a user
might look for the action. This is a deliberate, recorded split rather than unfinished work.
It is expected to change: attendance marking, the first genuinely mobile-first workflow under
AD-9, is a write surface and belongs on the phone rather than the desktop.

---

**AD-33 — Course identity is separate from curriculum placement**

*Status.* Approved and active, 2026-09-12. Implements AD-3.

*Reason.* A course is a catalogue entry; what it is worth and where it sits are properties of a
particular regulation. `CS301` may be 4 credits in semester 5 under the 2024 regulation and 3
credits in semester 4 under 2026. Storing credits on the course would make a 2024 student's
transcript change when the 2026 regulation was written, which is the exact failure AD-3 exists
to prevent.

*Alternatives.* Credits on the course, rejected as above. A join table with extra columns,
rejected as the same thing with a different name; `curriculum_entries` is a first-class entity
with its own identity and lifecycle.

*Impact.* `courses` carries no credits and no term. A course code is unique across every status
and can never be reused, because transcripts name it permanently. Titles may be corrected;
historical reads resolve credits through the entry, so a rename changes how an old transcript
reads a name and nothing about what it was worth.

---

**AD-34 — Published curriculum immutability is enforced by database trigger**

*Status.* Approved and active, 2026-09-12.

*Reason.* This is the invariant with the longest blast radius in the product: getting it wrong
rewrites graduation requirements for students already part-way through a degree, silently and
irreversibly. A rule of that weight should not depend on every future code path remembering it.

*Alternatives.* Application checks alone, rejected: correct today, one forgotten path from
failing. Withholding UPDATE at the grant level, rejected because superseding is a legitimate
transition that must remain possible.

*Impact.* Two triggers. One refuses any change to a published or superseded version except the
single transition to superseded. The other refuses insert, update and delete of entries whose
parent version is published, so adding a course to a published curriculum is as impossible as
editing one. A test bypasses the application entirely and confirms the database still refuses.

---

**AD-35 — Errata and amendments are different operations**

*Status.* Approved and active, 2026-09-12.

*Reason.* A typo in a published curriculum and a genuine change of requirements look similar and
behave oppositely. An erratum means the approving body's intent was always different, so affected
students move to the corrected version. An amendment means requirements changed, so existing
cohorts stay where they are. Letting one behave like the other is how requirements change under
people's feet.

*Alternatives.* A single "new version" operation, rejected because the system would have to guess
which of the two it was, and guessing wrong is unrecoverable.

*Impact.* A revision keeps the regulation year and increments the revision; an amendment is a new
regulation year. Both copy their predecessor's entries so the author starts from what exists. Both
require a reason, recorded in the audit trail under distinct actions, so a registrar can see years
later which kind of change occurred. Student rebinding on an erratum belongs to M5, which owns
the binding.

---

**AD-36 — Section scope belongs to M3 Teaching Operations, not the curriculum**

*Status.* Approved and active, 2026-09-12. Resolves an ownerless reference.

*Reason.* Section scope has been declarable and unresolvable since migration 001: it appears in
the `scope_type` constraint and in the Faculty role's allowed scopes, no table defines a section,
the resolver returns empty ancestry, and the web client already excludes those roles from grant.
A section is a teaching group, defined by a term and a timetable, not by a curriculum.

*Alternatives.* Defining sections in the curriculum slice, rejected: it would couple a permanent,
regulation-scoped document to a per-term operational grouping, and create a dependency from M2 on
an academic calendar M2 does not own.

*Impact.* No code changes in this slice. The reference now has a named owner. When M3 creates
sections, ancestry will be `section → program → department → campus`, which the existing resolver
already walks once rows exist, and the Faculty role becomes grantable at section scope with no
change to M1.

---

**AD-37 — A program belongs to one department; campus variants are separate programs**

*Status.* Approved and active, 2026-09-12. Resolves OD-M2-1.

*Reason.* Three approved artifacts already assume it: Blueprint 1's organisation tree places
`Program` under `Department`, the data model gives `programs` a `department_id` and no campus
column, and BR-14 states that department scope implies its programs. That last one decides it.
A program with two departmental parents has no single ancestor, so scope containment becomes
ambiguous and department-scoped authority stops resolving. This would not be a schema preference
but a break in an authorization rule that is already live and tested.

*Alternatives.* An institution-level program with delivery scoped per campus, rejected on the
containment break above. A program with an optional campus column, rejected as the same
ambiguity with a nullable field.

*Impact.* A college running one program on two campuses keeps two program records with distinct
codes. That matches how approvals and intake are actually granted, which is per campus. If a
customer later needs those presented as one, the answer is a grouping entity above programs
rather than re-parenting, because re-parenting is precisely the operation that would disturb
student bindings and which this model exists to make rare.

*Noted gap, not a blocker.* The scope resolver currently walks department ancestry only.
Program-scope ancestry is unimplemented, so program-scoped roles cannot yet be granted. Nothing
declares one today, and the fix is one branch in `ancestryOf` when a role needs it.

---

**AD-38 — A Section is a cohort of students within a program for one term, not a course offering**

*Status.* Approved and active, 2026-09-12. Implements AD-36.

*Reason.* Three approved artifacts already said so. Blueprint 1's tree places `Section / Batch`
under `Term`, annotated "the actual teaching group". Blueprint 2's entity list names both
`Section` and `CourseOffering (course × term × section)` as separate things. And M1's scope
contract has stated since migration 001 that a section target yields
`[section, program, department, campus]`, a chain a course-shaped section could not produce,
because a course has no department.

*Alternatives.* Section as an offering of one course, rejected on all three counts above, and
because a section studies eight courses in a term: that model would create eight sections where
a college sees one, and a class teacher's authority would need granting eight times.

*Impact.* `sections` carries program, academic year, term and label, and deliberately carries no
course and no instructor. Those belong to CourseOffering in the next slice. Section identity is
`(program, academic year, term number, label)`, frozen by trigger once the section is active,
because attendance and results will reference it by identity and re-pointing it would move
records between cohorts. Section ancestry is now implemented in `OrgTreeReader`, which is the
point at which the Faculty role's long-declared section scope became grantable.

---

**AD-39 — The academic calendar belongs to M2, not M3**

*Status.* Approved and active, 2026-09-12.

*Reason.* A section needs a term and neither academic years nor terms existed. Blueprint 2
assigns both to D2 Academic Structure, which is M2. Absorbing the calendar into M3 because M3
needed it first would have put the institution's yearly cycle under teaching operations, where
admissions, fees and examinations would then have to reach across a module boundary to read it.

*Impact.* Migration 010 adds `academic_years` and `terms` under M2. M3 references a term and
never defines one. Terminology is fixed: an **academic year** is the institution's yearly cycle
named as the institution names it, a **term** is a numbered division inside it, and there is no
third word. Exactly one academic year per institution is current, enforced by a partial unique
index, because every downstream module asks for it and two would make the answer arbitrary.
