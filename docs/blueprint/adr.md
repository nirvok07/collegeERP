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

---

**AD-40 — A role assignment is a permission; an instructor assignment is a reach constraint**

*Status.* Approved and active, 2026-09-12. Narrows a line in Blueprint 2 without changing AD-1.

*Problem.* Blueprint 2 describes `teaching_assignments` as "the authorization source for every
teacher action". Read literally that contradicts AD-1, under which role assignments are the sole
source of authority and `can()` is the only decision point. Two sources of authorization would be
exactly the second permission system this slice was told not to build.

*Decision.* They answer different questions, and the split is recorded rather than resolved by
picking a winner.

| Question | Answered by | Owner |
|---|---|---|
| May this person do it at all? | The role assignment, through `can()` | M1 |
| Which offerings does that reach? | The active instructor assignment | M3 |

*Consequences.* `GET /v1/me/teaching` introduces no permission: reading your own teaching is
self-scoped, and the set is derived from the token subject, never from anything the client sends.
Administrative reads use `offering.read` at institution scope, as sections do. Write paths that
arrive later, attendance first, will require both conditions, combined in one place rather than
as identity checks scattered through controllers.

*Rejected.* Treating an instructor assignment as a grant, which would mean a teacher's authority
lived in two tables and revoking a role would not revoke their reach.

---

**AD-41 — Offering identity is (section, course, component), and the term is deliberately absent**

*Status.* Approved and active, 2026-09-12.

*Reason.* A section already carries its term. Restating the term in the offering key would permit
an offering whose term contradicts its section's, which is a class of bug worth making
unrepresentable rather than validating.

*Component* is `lecture`, `lab` or `tutorial`. Indian engineering colleges routinely staff a lab
separately from the lecture that shares its course code, in a different room and often with
different faculty. Without the column the same course could not be offered twice to one cohort,
and colleges would work around it with duplicate course codes, which would corrupt transcripts.
One column buys the correct model.

*Impact.* A partial unique index over non-cancelled offerings enforces the key. Section and
course are frozen by trigger once an offering is active, for the same reason Section freezes:
attendance will reference the offering by identity, and re-pointing it would move records between
cohorts. Cross-listing one offering to two sections is not modelled; no requirement asks for it
and it would complicate attendance for a case that may never arrive.

---

**AD-42 — Instructor assignment is a validity-bounded record, never a column, and ending one
requires a reason**

*Status.* Approved and active, 2026-09-12.

*Reason.* Teachers change mid-term. Attendance taken in week three was taken by whoever was
teaching in week three, and a column on the offering would overwrite that fact. A table with
`valid_from` and `valid_to` keeps "who was teaching on 14 August" answerable for as long as the
records that depend on it exist.

*Impact.* Assignments are never deleted. Reassignment ends the current record and opens the next.
A partial unique index admits one live `lead` per offering, because co-teaching is real but
ambiguity about who owns a class is not, and a second index admits one live assignment per person
per offering so the same teacher cannot be both lead and co. Ending an assignment requires a
reason, because an end date alone explains nothing to whoever reads the term later. A completed
or cancelled offering accepts no assignment changes at all: its teaching record stands as it was.

---

**AD-43 — Mobile navigation is built from server-resolved authority, not from a role held on the
device**

*Status.* Approved and active, 2026-09-12. Extends AD-18 and AD-24 to the mobile shell.

*Reason.* The first teacher surface made the question unavoidable: the app previously showed the
same three tabs to everyone, which would have shown a faculty member an administrator's People
and Organisation screens. Authority is role × scope × validity and only the server can resolve
it, so the shell reads `/v1/auth/me` once per session and builds its destinations from the
permission set.

*Impact.* A surface the user has no authority for is absent, not disabled, matching the web
console. A person with no grants at all gets the designed no-access state with a way to sign out,
not an empty list. A failed authority read leaves the tabs unresolved and offers a retry rather
than guessing wide, so nothing is ever shown that the server would refuse. The client-side
decision shapes the interface only; every request is checked again server-side.

---

**AD-44 — Implementation module numbers are a delivery stream, separate from the blueprint
registry**

*Status.* Approved and active, 2026-09-12. Records existing divergence rather than creating it.

*Problem.* Blueprint 3's registry numbers modules by subject: M4 is Admissions, M6 Timetable, M7
Attendance. The implementation has been numbering by delivery order since migration 001, and the
two have already diverged: implementation M2 absorbed the blueprint's M2 Institution Setup and M3
Academic Structure, and implementation M3 Teaching Operations has no blueprint number at all. The
`permissions.module` column holds the implementation numbers in shipped rows.

*Decision.* Keep both, and state the mapping. Renumbering would rewrite shipped data and every
migration comment for no gain in clarity.

| Implementation | Owns | Blueprint registry |
|---|---|---|
| M1 | Identity, roles, permissions, authority | M1 Identity and Access |
| M2 | Institution setup, academic structure, curriculum, calendar | M2 + M3 |
| M3 | Section, CourseOffering, instructor assignment | part of M3's entity list |
| **M4** | **Room, TimetableSlot, ClassSession** | **M6 Timetable** |
| **M5** | **Student, SectionMembership, OfferingEnrolment** | **M5 Student Records** (its roster part) |
| **M6** | **Attendance sheet, record and correction** | **M7 Attendance** |
| **M7** | **Internal assessment: components, marks, corrections** | **M9 Internal Assessment** |

*Consequences.* An implementation module number means the delivery slice, never the registry row.
The blueprint registry stays the subject map for planning. Any document that says "M4" without
qualification means the implementation stream, because that is what the code and the database say.

---

**AD-45 — A class session is a separate entity from its timetable slot, identified by
(offering, date, start), and frozen once taught**

*Status.* Approved and active, 2026-09-12.

*Reason.* A slot is a recurring intention and gets edited; a session is one occurrence and is a
fact. One row serving both would mean that correcting next week's timetable rewrote the record of
last week's class, and attendance taken under the old time would describe a lesson that now claims
to have happened elsewhere. The slot is the plan, the session is the fact, and facts do not move
when plans change.

*Identity.* `(offering, session_date, starts_at)`, unique among non-cancelled sessions. The
offering already binds section, course and component, so none is restated. The generating slot is
recorded as provenance only: deleting a pattern must not orphan the record of a class that was
taught, and an ad-hoc make-up class has no slot at all.

*Freezing.* Editable while `scheduled`, immutable once `completed`. Rescheduling moves the row in
place and keeps where it came from, because no attendance can exist for a class that has not been
taught. After teaching, the same operation is refused by trigger rather than accepted and audited.

*Terminology.* Blueprint 2 D4 calls this a `SessionOccurrence`. It is a **class session** here and
in the code, renamed once, with no third word.

*Also decided.* `planned` and `in_progress` are not session states. A generated session is
scheduled, with no earlier condition to be in; and a state with no consequence is speculation
until attendance capture exists. Unmarked is derived, never stored: a fourth status would need a
background job and would be wrong for as long as that job lagged. The blueprint's
`TimetableVersion`, with publication approved by the head of department, is deferred: attendance
does not need it, approvals are a platform capability that does not exist, and a draft-versus-
published timetable doubles every read path.

---

**AD-46 — M4 owns the room, and the boundary to a future facilities domain is stated now**

*Status.* Approved and active, 2026-09-12.

*Reason.* Two classes must not occupy one room at one time, and that check needs an identity to
hold a lock against; a free-text room name cannot be compared reliably, because `Room 204`, `204`
and `LH-204` are three strings and one room. Teaching delivery is the only thing that needs a room
today, and the alternative is worse: putting rooms in institution setup invites capacity planning,
maintenance, asset tags and non-teaching bookings into a module whose job is organisational
structure.

*Scope.* Exactly four facts: campus, code, seats, kind. Capacity is compared against cohort size
as a **warning, never a refusal**, because colleges routinely teach sixty-five students in a
sixty-seat room and a system that refuses to schedule that is a system people work around.

*Boundary.* If a facilities domain arrives (blueprint M19), rooms move there and M4 keeps only the
reference. M4 owns *when a room is used for teaching*, never the room's existence, condition or
non-teaching use.

---

**AD-47 — Non-teaching days belong to M2, and are the negative subset of the blueprint's
CalendarDay**

*Status.* Approved and active, 2026-09-12. Follows AD-39 exactly.

*Reason.* Session generation must skip holidays, and generating fifteen weeks of classes without
them puts classes on Diwali, which corrupts every later unmarked-session and attendance report.
The institution's calendar is academic structure: examinations, admissions and payroll will all
ask about holidays. Absorbing the holiday list into M4 because M4 needed it first would put it
under teaching operations.

*Shape.* Explicit non-teaching dates with a label, and nothing else. There is no weekly working
pattern, because the weekly pattern is already expressed by which days carry timetable slots: a
college closed on Sunday has no Sunday slots. The table is named `non_teaching_days` rather than
`calendar_days` because it stores only the negative case; the blueprint's fuller CalendarDay can
arrive later without a rename of what exists.

*Consequence.* Removing a holiday does not retroactively create the classes it prevented.
Generation is idempotent, so running it again is the fix, and a hidden side effect is not.

*Where the code sits.* The table, repository and routes live in the delivery module beside their
only consumer, guarded by M2's `term.manage`. That follows AD-39's own precedent: academic years
and terms are attributed to M2 while `PgTermRepository` sits in the teaching module. Attribution
decides who owns the concept and which permission guards it, not which folder holds one table.

---

**AD-48 — Scheduling conflicts are enforced by trigger with an advisory lock, not by an exclusion
constraint**

*Status.* Approved and active, 2026-09-12.

*Reason.* `EXCLUDE USING gist` over a time range is the textbook answer and would be better, but
comparing the room identity inside it needs `btree_gist`, and `CREATE EXTENSION` requires an
ownership the least-privilege migration role does not hold on managed PostgreSQL. This is the same
constraint that removed `citext` in migration 001.

*Mechanism.* The trigger takes `pg_advisory_xact_lock` on the room, and separately on the
effective instructor, before it looks for an overlap. Two concurrent inserts into one room
therefore serialise instead of racing, and the lock costs nothing in the normal case where a
coordinator is the only writer. Overlap is half-open, so a class ending at 10:00 does not conflict
with one starting at 10:00: back-to-back periods are how every timetable in the country is built.

*Upgrade path.* On a deployment where the migration role owns its database, the same invariant can
move to an exclusion constraint without changing any application code, because nothing outside the
database depends on how the refusal is produced.

---

**AD-49 — A DATE column is read as a calendar date, never as an instant**

*Status.* Approved and active, 2026-09-12. Fixes shipped behaviour.

*Problem.* The `pg` driver parses a DATE column into a JavaScript `Date` at **local** midnight, so
`'2026-09-12'` read in India became `2026-09-11T18:30:00Z`. Anything that then formatted it
through `toISOString`, which is the only safe way to format a `Date`, reported the previous day.
Academic year, term and class session dates were all exposed to that, and the error was invisible
in any timezone at or west of UTC.

*Decision.* The driver is configured once, where it is created, to hand DATE (oid 1082) back as
the text PostgreSQL sent, which is already ISO `YYYY-MM-DD`. Timestamps are untouched, because an
instant genuinely is one.

*Consequence.* Calendar dates stay strings end to end: in the repositories, in the API envelope, in
both clients, and in the arithmetic that expands a weekly pattern across a term. Date maths in the
web and Flutter clients is done in UTC on those strings for the same reason, so no daylight-saving
boundary can move a class by a day.


---

**AD-50 — M5's roster arrives with attendance, under M5's name, and is resolved as of a date**

*Status.* Approved and active, 2026-09-12. Follows AD-39 and AD-47.

*Problem.* Attendance answers: for this class session, which enrolled students were accounted for?
Every word of that existed except *enrolled students*. There was no student record, no enrolment
and no cohort membership anywhere: only `persons.person_type = 'student'`, and `sections.capacity`
as a number that counted nobody. Attendance could not be built on top of nothing.

*Decision.* Add the minimum roster under M5's name and have M6 consume it, rather than letting
attendance grow its own student model. Blueprint 2 D3 makes M5 the owner of `Student` and
`Enrolment`, and that ownership is recorded here even though the code arrived with the module that
needed it. Same move as the academic calendar (AD-39) and non-teaching days (AD-47).

*What M5 got:* a student record keyed to an M1 person, validity-bounded cohort membership, and
validity-bounded enrolment in a course offering. *What it did not get:* enquiries, applications,
merit lists, seat allocation, admission offers, fee linkage, status history beyond the current
status, transfers, re-admission, no-dues clearance, guardians, alumni. Those are M5's real surface.

*Two bindings, not one.* Cohort membership says which section a student belongs to; enrolment says
which of its courses they take. Both exist because an elective splits a cohort: twenty of sixty
students take it, and a roster built from membership alone would show the teacher sixty names and
invite forty wrong absences. That corrupts the academic record, which is the one thing the slice
exists to prevent. Enrolment is created in bulk when a student is placed, never typed course by
course.

*The rule that makes history safe.* **The roster of a class session is every student whose
enrolment was live on the session's own date, never today.** A student who withdrew in week ten
still appears on week three's sheet; a student who joined in week six does not. Without it,
correcting a historical sheet would silently change who was expected in the room. Both bindings
therefore carry `date` validity rather than timestamps, so no timezone can move a student in or out
of a class.

*Rejected.* Deriving the roster from cohort membership alone, which breaks electives; and an
exception-only model recording just drops and adds, which would have to be replaced when M5 arrives
properly.

---

**AD-51 — Attendance is a sheet per class session and a record per student, with two states and no
unlock**

*Status.* Approved and active, 2026-09-12.

*Shape.* One `attendance_sheet` per class session, holding the state of the act of marking, and one
`attendance_record` per student on it, holding one state. The sheet is a separate table from
`class_sessions` because M4 owns the teaching occurrence and M6 owns what was recorded about it; a
column on M4's table would put attendance state inside the teaching-delivery boundary. The sheet is
created by the first mark rather than by scheduling, so a term of classes does not carry a term of
empty registers.

*States.* `present`, `absent`, `late`, `excused`. Late is recorded because colleges record it.
Excused covers sanctioned absence, which Blueprint 2 D4 names as a workflow ("record a duty leave
exemption") and which would otherwise be faked as `present`, making the register wrong. Deliberately
not states: `medical` (a reason for excused), `holiday` (a property of the day, owned by M4),
`cancelled` (a property of the session), and `not marked`, which is the absence of a row and is
represented that way. **No percentage is computed anywhere in this slice**: how late and excused
count toward eligibility is a rule that belongs with examinations, and deciding it now would bake
one college's policy into the schema.

*Lifecycle.* `draft` then `submitted`, and **there is no unlock**. A submitted register stays
submitted; changing a mark afterwards is a correction that records the old state, the new state, who
changed it and why. An unlock is an invitation to edit history quietly and a correction is a
statement that history was wrong: only one of those is auditable. A term-level lock after results
would need a locking authority and an examination module, and is recorded as deferred rather than
guessed.

*The correction is the mechanism, not a note about one.* Inserting the correction row is what
changes the mark: a database trigger applies it, having first checked that the register is submitted
and that the stated previous state is the one actually there. Skipping the paper trail would mean
not making the change at all. `attendance_corrections` is granted INSERT and SELECT only, like the
audit log, so no code path holds the privilege to rewrite a mark's history.

*Enforced in the database.* One state per student per session. A mark's student must have been
enrolled in that course **on the class's own date**, which is AD-50's rule doing its work. A
cancelled class takes no attendance. A submitted register accepts no new marks and no direct edits.
A submitted register never returns to draft. Every correction states a reason.

*One cross-module effect.* Submitting a register records the class as taught, because submitting is
evidence that the class happened and leaving the session merely `scheduled` would leave the two
records contradicting each other. That write belongs to M4 and is performed by an M4 function inside
M6's transaction, not by reaching into M4's table.

---

**AD-52 — One register is written as a batch under optimistic concurrency**

*Status.* Approved and active, 2026-09-12.

*Reason.* Two teachers can hold the same register: a lead and a co-instructor, or a teacher and the
office entering a paper sheet. Silently overwriting each other would produce a register nobody
recognises. A pessimistic lock is worse: a lock held across a classroom is abandoned the moment
somebody walks out of the room.

*Mechanism.* The sheet carries a `version`. Marking sends the version the client last read; if it no
longer matches, the write is refused and the message says somebody else changed the register, so the
client re-reads instead of clobbering. Submission takes the version too, so nobody submits a
register that changed under them. Zero means no register exists yet, which is how the first mark
opens one.

*Batch.* The whole set of marks is one request and one transaction: fifty marks either all land or
none do, and a classroom of sixty is never sixty requests. The triggers still fire per row, so one
ineligible student fails the whole statement, which is the correct outcome for a register.

*Client side.* Every tap lands in a local draft and nothing is sent until the teacher saves, because
a classroom is exactly where the network is worst and a lost tap is a wrong academic record. A
failed save keeps every mark on screen. Only what changed is sent, so a save cannot overwrite a mark
somebody else made in the meantime. This is **not** offline support: nothing survives the app being
killed, and the screen says so. Durable capture needs an outbox and a replay policy, and promising
it without those is how attendance data goes missing.

---

**AD-53 — Correcting a submitted register is the head of department's authority, not the teacher's**

*Status.* Approved and active, 2026-09-12.

*Reason.* Blueprint 2 D4 is explicit: "Every attendance correction after submission by the HOD or
Class Advisor, with a reason." A teacher who can quietly change their own submitted register is the
single fastest way to make an attendance record untrustworthy, which is the one thing this module
exists to prevent.

*Decision.* Faculty hold `attendance.read`, `attendance.mark` and `attendance.submit`. They do not
hold `attendance.correct`, which sits with the head of department and the college administrator.
Until then a teacher asks, which is a real cost and the right one.

*What is deferred.* The blueprint's authority is an **approval**, not a permission: a teacher
requests a correction and the head of department approves it. Approvals are a platform capability
that does not exist. When it arrives, the request path is added and this permission does not move.

*How the two questions stay separate.* AD-40 is untouched. `attendance.mark` says a person may
record attendance; M3's instructor assignment says which classes that reaches, checked by the same
reader `session.deliver` uses. Acting administratively is decided by **scope breadth**, not by a
second permission: holding the permission institution-wide is what lets a coordinator enter a paper
register for a teacher who cannot, and anything narrower must be teaching the course. A faculty
member granted over section A therefore cannot reach section B whatever their assignments say,
because the permission is evaluated against the class's own cohort.

---

**AD-54 — The React client lives in `clients/web/`; the repository has no Flutter Web**

*Status.* Approved and active, 2026-09-13. Enforces AD-24 in the repository layout.

*Problem.* The Flutter project is the repository root, and Flutter treats `<project>/web/` as its
web target. The React console lived at exactly that path. This was tested, not assumed:
`flutter build web` run against the repository **succeeded**. It used React's `index.html` as its
host page, copied the whole React directory into the output, including 71 `node_modules` entries,
for 151 MB, and pulled five web-only plugins into the dependency graph, one of which failed the
WebAssembly check. The React sources were not modified, but the project was configured as a
Flutter Web app that AD-24 had rejected, and the analyzer needed a `web/**` exclusion to stay
quiet about it.

*Decision.* Move the React client to `clients/web/`. Nothing else moves.

*Why this direction.* The React move touched almost nothing: its Vite and Vitest configuration is
path-relative, there is no CI, and neither the IDE configuration nor the server refers to the
path. Moving Flutter instead would have relocated `android/`, `ios/`, `lib/`, `test/`, the
pubspec and every Firebase output path, for the same result and far more risk. The asymmetry, a
`clients/` directory holding only the web client while Flutter stays at the root, is accepted;
moving Flutter to `clients/mobile/` later is available and unforced.

*Rejected.* Keeping `web/` and excluding it from Flutter, which leaves Flutter believing the
project targets the web. Adding a real Flutter Web scaffold beside React to satisfy the tooling,
which creates the duplicate web client AD-24 forbids.

*Consequence.* Flutter no longer finds a web target and no directory named `web/` exists at the
root. The `web/**` analyzer exclusion was first removed as unnecessary, then deliberately kept by
the project owner as a guard: it matches nothing today, and it stops a stray `web/` from being
analyzed if one is ever recreated. It does not make Flutter treat the project as a web app; only a
`web/index.html` does that.


---

**AD-55 — Internal assessment is built now; examinations wait for OD-1**

*Status.* Approved and active, 2026-09-13.

*Reason.* Roadmap Phase 6, Exams and results, is next after Attendance, and it mixes two modules
the blueprint keeps apart. Blueprint 3 gives *internal assessment marks* to M9 and the
`marks.published` event, the moment a mark becomes visible to a student, to M10. OD-1,
affiliating or autonomous, is still open and decides almost everything about M10. It decides
nothing about M9: assumption S4 makes the college the authority for internal assessment in both
cases.

*Decision.* Build M9 as implementation module M7 (AD-44), and stop at its boundary.

*Not built, each for a reason.* Students seeing marks and report cards: no student role exists on
any client, and publication is M10's event. Internal totals, grades, pass or fail: how absent and
exempt count is examination policy, and the grading scheme it needs does not exist. Eligibility
from attendance: M10, and it needs counting rules this project has not decided. End examinations
and the university result mirror: OD-1.

*Drift recorded, not acted on.* The roadmap says no feature phase begins before the offline sync
engine passes its test matrix. Every slice since M3 has proceeded without it, under AD-9's
narrowing of offline to field roles and the owner's slice-by-slice direction. See Drift 5 in the
master checklist.

---

**AD-56 — A mark records what happened, not what it is worth**

*Status.* Approved and active, 2026-09-13.

*Decision.* Every mark carries a status as well as a score: `scored` with a score from zero to the
component's maximum, `absent` with none, or `exempt` with none. Zero is a score and is distinct
from absent; absent is distinct from exempt; a student with no row has no result yet, which is
distinct from all three.

*Reason.* Storing a missed test as 0 has already decided that it counts against the student, and
that is examination policy, not a fact about the test. Recording what happened keeps the record
true whichever policy M10 adopts. The same reasoning kept `null` apart from `absent` in
attendance (AD-51).

*Consequences.* Scores allow two decimal places, because half marks are routine. Weights are
percentages whose sum per course may not exceed 100, enforced by the database under an advisory
lock so two concurrent additions cannot together pass it; they need not equal 100 while a plan is
built, and how they combine into a total is M10's. No total is computed anywhere in M7.

---

**AD-57 — The plan is the department's, the marks are the teacher's, and a submitted sheet is
corrected, never reopened**

*Status.* Approved and active, 2026-09-13.

*Decision.* Heads of department and administrators define the plan, on the web, holding
`assessment.plan`: in Indian colleges the internal scheme is fixed per course by regulation or
department, and Blueprint 2 D5 says "define an assessment plan per course from the grading
scheme". Teachers record when a component was held, enter results and submit, on Flutter (AD-24),
holding `assessment.mark` and `assessment.submit` bounded by instructor assignment exactly as
AD-40 requires. Heads of department verify and correct, holding `assessment.verify` and
`assessment.correct`.

*Lifecycle.* `draft`, `submitted`, `verified`, or `cancelled` from draft when never held. There is
no return to draft: a head of department who finds an error corrects it with a reason, applied by
the correction row's own trigger, which is AD-51's rule applied again. Verification is a
permission-gated transition because the approvals capability P1 does not exist; when it does,
verification becomes its step and the permission does not move.

*What freezes.* Maximum marks, weight and the date held freeze once the first mark exists: a 45
out of 50 must not become 45 out of 40, and the roster is taken as of the date held (AD-50), so
moving the date would change who was expected. A component cannot take marks until it has a
date, because a test that has not been given a date has not happened.

---

**AD-58 — Field writes are made replay-safe by an idempotency key, layered over version pinning**

*Status.* Approved and active, 2026-09-13. Slice one of the offline outbox; Drift 5 stays open.

*Problem.* Attendance and marks writes are pinned to a version (AD-52), which correctly stops two
different writes from overwriting each other. It cannot tell the same write arriving twice from a
different one. So a write whose response was lost, and which is sent again, is refused as
"somebody else changed this" although it committed. That is a false conflict today on any flaky
network, and it would make an offline queue unusable, since a queue resends by design.

*Decision.* Each field write carries an `Idempotency-Key`. The server stores the outcome against
the key, scoped to the calling person in their college and bound to a hash of the method, address
and body, and returns the stored outcome to a resend instead of applying or refusing it. Six
routes opt in: attendance save and submit, recording a class as taught, and an assessment's date,
marks and submission. Every other route ignores the header, so no response carrying a secret is
ever stored.

*Rules.* Successes and client errors are kept for 24 hours and replayed exactly. A server error
releases the key. A key reused for a different request is refused. A concurrent duplicate is told
to try again; a reservation running longer than two minutes is treated as abandoned and taken
over.

*Why not inside the write's transaction.* That would thread idempotency through every use case.
Reserving before and completing after, each in its own transaction, leaves one gap: a crash
between the write committing and its outcome being recorded. Every covered write is already
version-pinned or state-guarded, so a resend there reports an honest conflict and is never
applied twice.

*Consequences.* The version and the key answer different questions and both stay. The Flutter
client reuses a key only while retrying the identical save. The web client does not send keys yet;
its writes are unaffected. The queue itself, slice two, still needs a durable local store and the
decision that goes with it. See docs/blueprint/capabilities/offline-outbox.md.

---

**AD-59 — The mobile local store is Drift over SQLite3MultipleCiphers, keyed from the platform keystore**

*Status.* Approved by the owner and implemented, 2026-09-13. Drift 5 closes only after device verification.

*Decision.* Drift over `package:sqlite3` 3.x, with its build hook selecting SQLite3MultipleCiphers.
A random 256-bit key lives in `flutter_secure_storage`, which means the Android Keystore and the iOS
Keychain with this-device-only access. The database is excluded from backup. An unreadable key means
the database is recreated and the loss is stated; it is never silently worked around.

*Why.* Queued registers and marks are students' personal data, so plaintext SQLite is not
acceptable. The legacy `sqlcipher_flutter_libs` package is end-of-life. SQLite3MultipleCiphers is
built by the same maintainer, avoids OpenSSL on Android, and ships a newer SQLite than the
SQLCipher build.

*Adds.* `drift` and `sqlite3` as dependencies; `drift_dev` and `build_runner` for development only.
See docs/blueprint/capabilities/offline-outbox.md §7.

---

**AD-60 — A suspended or closed college's users are refused entirely, at every request and at renewal**

*Status.* Approved and implemented, 2026-09-13. Resolves OD-SA-1.

*Decision.* Suspension and closure refuse a college's users outright; there is no read-only mode.
The rule is one function in the institution domain (`accessDenial`). It is applied at the two
boundaries every session passes: the bearer-token request hook, and session renewal, which carries
no bearer token. Platform actors carry no college and are never affected. Signing out stays
possible. Reactivation restores existing sessions; nothing is revoked.

*Why.* M1 W2 already names "tenant suspended" as a sign-in failure, and sign-in already refused
suspended and closed colleges. Nothing in the architecture describes read-only access, and
checking only at sign-in let a suspended college keep working until tokens lapsed.

*Lifecycle.* Enforced by trigger (migration 019): trial or active to suspended; suspended back to
the status it was suspended from; anything to closed; closed is final. Every transition needs a
reason, is version-pinned, and is audited. Closing requires the college code typed back.

*Consequences.* Status is cached per process for at most 15 seconds and cleared at once on a
change made in that process. Queued mobile writes of a suspended college fail as refusals and
wait for a person (AD-59). What closing means for data stays open as OD-SA-2.

---

**AD-61 — The platform reads only the events it caused, through one narrow definer function, newest first by keyset**

*Status.* Approved and implemented, 2026-09-13 (SA-2, migration 020).

*Problem.* `audit_events` is isolated per college by row-level security. Platform events are spread
across every college, and some have no college at all (platform sign-in and sign-out). No query
under the normal tenant context can see them together.

*Decision.* `platform_audit_events(...)`, SECURITY DEFINER and read-only, following
`auth_resolve_refresh_token` (migration 005). It returns only rows with `actor_type = 'platform'`.
Events a college's users caused are never returned, so audit ownership is unchanged and matches
the M1 matrix ("Platform Owner: V of platform events"). `ip_hash` is not returned. The platform
guard admits platform accounts only; college users are told the endpoint does not exist.

*Pagination.* Keyset on `(at, id)`, newest first, 50 by default, 100 at most, with an opaque
cursor that carries the database's full-precision timestamp. Offset paging was rejected: events
arriving while someone pages would shift pages. This is the API's first paginated list; the
existing lists stay capped by `limit`.

*Also.* A partial index serves exactly this read. Payload keys that look sensitive are redacted on
the server and dropped again in the web client, although no writer stores secrets today. Reading
the trail is not itself audited: no policy asks for it.

---

**AD-62 — The platform's second factor is a TOTP authenticator app**

*Status.* Decided by the owner, 2026-09-13; resolves OD-SA-3. **Implemented 2026-09-13** (SA-3b, migration 022).

*Decision.* Platform accounts use RFC 6238 TOTP from an authenticator app, through a maintained
library. No SMS, no email one-time codes, no custom cryptography, and no MFA for college roles in
this decision.

*Why it is blocked.* Verifying a TOTP code needs the enrolment secret itself, so it must be stored
recoverably. The server has no mechanism for that: every secret at rest is a one-way hash
(scrypt passwords, SHA-256 tokens). Storing TOTP secrets in plaintext is refused. OD-SA-5 decides
the missing capability.

---

**AD-63 — Platform secret protection and sole-Owner break-glass recovery**

*Status.* Decided by the owner, 2026-09-13; resolves OD-SA-5. **Implemented 2026-09-13** (SA-3b, migration 022).

*Decision.*
1. Secrets the server must read back are sealed with AES-256-GCM from Node's built-in crypto:
   standard authenticated encryption, no custom cryptography. The key comes from a dedicated
   configuration secret, separate from the JWT, cookie and other authentication secrets, and never
   from the database. Each sealed value carries a key identifier so the key can be rotated.
   Production refuses to start when the key is missing or invalid. Plaintext secrets, keys and
   decrypted material are never logged.
2. TOTP comes from a maintained library such as otplib, never a hand-written algorithm. TOTP
   secrets are sealed at rest with (1), and no normal API returns them.
3. When the only Owner loses their authenticator, an operator command resets it: audited,
   invalidating the old secret, forcing re-enrolment. There is no general "disable MFA" switch and
   no permanent MFA-off state.

*Consequence.* The same sealing capability is the prerequisite for resolving Drift 6 (push tokens
stored hash-only), though that is not part of SA-3b.

---

**AD-64 — Platform authority is an Owner or Support role assignment, resolved per request**

*Status.* Approved and implemented, 2026-09-13 (SA-3a, migration 021).

*Decision.* A platform role is an assignment with history, one active per account, in
`platform_role_assignments`, because AD-1 forbids a role column. Code asks for a permission from
the matrix in `identity/domain/platform-authority.ts`, never compares a role name:

| Permission | Owner | Support |
|---|---|---|
| platform.colleges.read | ✓ | ✓ |
| platform.colleges.manage | ✓ | |
| platform.audit.read | ✓ | |
| platform.accounts.read | ✓ | |
| platform.accounts.manage | ✓ | |
| platform.roles.manage | ✓ | |

Status and role are read live on every platform request, so disabling an account or changing a
role takes effect on the next request. W0 names the Owner as the only provisioning actor and the
M1 matrix gives platform audit to the Owner, which is why Support holds read access to colleges
only until SA-5 adds its impersonation permission.

*Accounts.* Created by an Owner through the application, never by SQL. A new account is `invited`
with no credential and cannot sign in until SA-3b issues its invitation together with
authenticator enrolment, so no account is ever usable without a second factor after SA-3b.
Existing accounts became Owners in migration 021. Bootstrapping the first Owner stays an operator
action; the SA-3b break-glass command covers recovery.

*Safety.* Nobody changes their own account. Every change takes one platform-wide advisory lock and
re-reads the actor's authority inside it, and an Owner who is the only active one cannot be
disabled or demoted. Two Owners racing to demote or disable each other leave exactly one.

---

**AD-62 and AD-63 as implemented (SA-3b, 2026-09-13)**

*Sealing.* `infrastructure/crypto/secret-sealer.ts`. Format `s1.<keyId>.<iv>.<tag>.<ciphertext>`,
base64url fields, 12-byte IV, 16-byte tag. Authenticated data is `s1.<keyId>.<context>`, where the
context names the purpose and the account (`platform_totp:<id>`), so a sealed value moved to
another row does not open. Every failure is one `SealError` carrying no key, plaintext or
ciphertext. Settings: `SECRET_SEALING_KEY` (32 bytes, base64), `SECRET_SEALING_KEY_ID` (default
`k1`), `SECRET_SEALING_RETIRED_KEYS` (`id:base64,…`, open-only). Production refuses to start
without a valid key; elsewhere a publicly known development key with id `dev-insecure` is used
and announced, and production can never open what it sealed.

*TOTP.* otplib 13.5 through `infrastructure/crypto/totp.ts`; parameters only in
`identity/domain/totp-policy.ts`: SHA-1, six digits, thirty-second steps, one step of drift either
way, and a code's step must be later than the last accepted one, so no code works twice.

*Sign-in.* The password step returns a challenge, never tokens: `second_factor`, or `enrolment`
for an account without an authenticator. Challenges are 256-bit opaque tokens stored as SHA-256
hashes like every other authentication token, single use, five minutes (fifteen for enrolment),
one live per account, five wrong codes each. Wrong codes count toward the existing account lockout
and a correct password no longer clears it. The platform guard, session renewal and `/auth/me`
all require an enrolled authenticator, so sessions from before enrolment was mandatory, or after
a reset, stop on their next request.

*Enrolment and recovery.* A new account's invitation uses the one invitation table
(`platform_account_id`, no college). The secret is generated on the server, sealed as pending,
returned once in the enrolment response, and becomes active only after a correct code. An Owner
resets another account's authenticator with a reason; the operator command
`npm run platform:break-glass` clears only a sole Owner's, needs an exact confirmation phrase,
and is refused whenever another enrolled Owner exists. Both force re-enrolment; nothing switches
MFA off.

*Amends AD-61.* The platform audit read also returns system events whose subject is a platform
account, so Owners see the break-glass reset. College events stay invisible.

---

**AD-65 — A seat is a live college account; a lowered limit blocks new accounts and disables none**

*Status.* Decided by the owner, 2026-09-13; resolves OD-SA-4. **Implemented 2026-09-13** (SA-4a, migration 023, not yet applied).

*Decision.*
1. One live college account is one seat. Live means `invited`, `active`, `locked` or `suspended`,
   the definition the database already uses for one account per person. Deactivated and archived
   accounts hold no seat.
2. One person counts once, however many roles or assignments they hold. Roles and assignments
   never count.
3. Platform accounts never count.
4. The rule names no person type. Any person who can hold a live college account counts, so
   student logins, when they arrive, count automatically; guardians, applicants and external
   people count only if they can actually hold a live account.
5. The limit may be lowered below current use. Existing accounts stay as they are: nothing is
   suspended, deactivated, deleted or revoked because of a lower limit. While use is at or above
   the limit, every path that would create a live account is refused, invitations included and
   the first college administrator included.
6. Plan and seat-limit changes are audited with actor, college, old and new values and reason,
   and the over-limit state is shown to platform administrators.

*Enforcement.* At the source of truth: a database trigger on `user_accounts` for inserts and for
any change into a live status, under a per-college advisory lock, so concurrent invitations cannot
both pass on a stale count and no application path can bypass it.

---

**AD-66 — Development runs on local PostgreSQL `college_erp_dev`; the npm scripts load `server/.env`**

*Status.* Decided by the owner, 2026-09-13; resolves OD-ENV-1. Supersedes R30. Its choice of
database for development is superseded by AD-68; the configuration mechanism stands.

*Decision.* Local PostgreSQL `college_erp_dev` is development's source of truth: local commands,
migrations, the dev server and device validation all use it. Tests keep their own
`college_erp_test`. Production stays environment-specific and unchanged, and the code stays
provider-neutral PostgreSQL over `DATABASE_URL`; nothing is coupled to local PostgreSQL. Supabase
remains a possible managed environment and is not the active development database; no migration
was applied there.

*Why.* R30 named Supabase, but its pooler was unreachable from development and every migration,
test and device check already ran locally, while `server/.env` mixed both.

*Configuration.* The server reads only its process environment, so the npm scripts that run it
(`dev`, `start`, `migrate`, `db:bootstrap`, `seed:device-test`, `platform:break-glass`) load
`server/.env` with Node's `--env-file-if-exists`; a missing file is tolerated, and `npm test` sets
its own values. `server/.env` names the local database for both roles; the Supabase pooler address
is kept there as `SUPABASE_POOLER_DATABASE_URL`, read by nothing. `server/.env.example` documents
the shape with placeholders only.

---

**AD-67 — Mobile home is a dashboard, not bottom navigation; the app ships light only for now**

*Status.* Decided by the owner, 2026-09-13, from the prototype images in `assets/`. Overrides D11
and assumption A5 for mobile, for now.

*Decision.* The Flutter app opens on a dashboard: greeting, headline numbers, the class now and
next, classes waiting to be marked, a four-week teaching-record ring, a week-ahead bar chart and the
person's courses. Every other surface (schedule, courses, people, organisation, account) is pushed
from it through `AppRouter`; there is no bottom navigation. The app runs the light theme only:
a white page with neutral cool-grey panels. `AppTheme.dark()` still builds and is simply not wired.

*Unchanged.* Authority: a dashboard section or shortcut exists only when the server grants the
permission behind it, exactly as tabs did (AD-18). No new endpoint: the dashboard reads
`/me/sessions` (28 days back, 7 ahead) and `/me/teaching`, and derives every number on the device
without storing it (AD-7). Charts are native `CustomPaint`/widgets; no charting package.

*Not in scope.* The prototype's student screens (own attendance %, fees due, circulars) need a
student role, M5 beyond the minimum, fees (D1) and a communication module; none exists yet.

---

**AD-68 — Development and app testing run on Supabase PostgreSQL; production runs our own Node and PostgreSQL**

*Status.* Decided by the owner, 2026-09-13. Supersedes AD-66's choice of database for development
(its configuration mechanism stands) and R46.

*Decision.* Supabase is the database for development and app testing, used only as standard
PostgreSQL through its session pooler (port 5432, user `<role>.<project-ref>`). The Node API,
authentication, sessions, permissions, row-level security and the migration chain are unchanged:
no Supabase SDK, Auth, PostgREST, Storage or Edge Functions, and migration 006 keeps the data-API
roles revoked. Production runs the same Node server on PostgreSQL we operate; moving is a
configuration change.

*Automated tests.* `npm test` keeps its own local `college_erp_test`: it recreates data freely and
must depend on neither a network nor shared data. Assumption; the owner may overrule.

*Rebuild.* The Supabase schema found on 2026-09-13 was untracked: no `schema_migrations`, 022's
table missing, 39 empty tables and 3 seeded role definitions. `npm run db:supabase:rebuild --
--confirm "REBUILD <project-ref>"` drops and rebuilds it from the migrations and switches
`server/.env`, keeping the local values as `LOCAL_*`. It refuses in production, without the exact
phrase, and whenever any table holds data beyond what the migrations seed. Destructive against an
external service, so the owner runs or approves it.

---

**AD-69 — Onboarding: one person at a time; a student activates with enrolment number and a one-time code**

*Status.* Decided by the owner, 2026-09-13; resolves OD-ST-1.

*Decision.*
1. The platform (super admin) creates each college with its first College Admin (W0, built).
2. The College Admin onboards teachers and students one at a time, through a single form each. No
   bulk import.
3. Teachers keep the existing path: a people invitation by email, then a role grant.
4. A student's account is issued by the College Admin from the student's record. The server issues
   a one-time activation code, shown once and printable, stored hash-only, expiring. The student
   activates with college code, enrolment number and code, and sets a password; afterwards they
   sign in with college code, enrolment number and password. No email is required.
5. A student account is a live college account and takes a seat (AD-65, unchanged).

*For ST-1's design.* Code lifetime and attempt limits; reissue revokes the previous code; the
student role grants only self-scoped reads.

---

**AD-70 — The app starts with the college code; the college's name, logo and colour dress everything after it**

*Status.* Decided by the owner, 2026-09-13. Built as BR-1 (migration 024).

*Decision.*
1. First launch shows only a college code field. `GET /v1/public/colleges/:code`, unauthenticated,
   returns the college's code, name, logo URL and colour. Unknown, malformed, suspended and closed
   codes all get one identical 404, so the endpoint says nothing about a college nobody can use.
   The app remembers the college, refreshes it at each launch, and "Not your college? Change it"
   on the sign-in screen forgets it.
2. Branding is three fields of the institution: the existing name, `logo_url` (https only, at most
   500 characters; a link until the storage port exists, after which uploads keep the column's
   meaning) and `brand_color` (`#RRGGBB`, stored upper-case). Checked in the domain and by database
   constraints.
3. The platform sets them at provisioning and on the college's page (`POST
   /institutions/:id/branding`, `platform.colleges.manage`); the College Admin changes them on the
   College page (`GET`/`POST /college/profile`, `institution.read`/`institution.manage`), always for
   the session's own college, never an id from the client. Version-pinned; audited as
   `institution.branding_changed` with before and after.
4. The app uses the colour as its accent only when white text on it keeps 4.5:1 contrast;
   otherwise the product's indigo stays.

*Risk accepted for now.* The API has no request rate limiting anywhere, so active colleges' names
can be found by guessing codes. A college's name is public information; rate limiting is a
platform-wide gap to close before production.

---

**AD-71 — An operator may set a platform account's password, in development only**

*Status.* Decided 2026-09-13 at the owner's request (a known login for `owner@nirvok.com`). OPS-1.

*Decision.* `PLATFORM_PASSWORD=… npm run platform:set-password -- --email … --reason … --operator …
--confirm "SET PASSWORD <email>"` sets an active platform account's password. The password
policy applies; the password is read from the environment, never an argument; the act is audited
as the system with the operator named; the authenticator is untouched, so a password alone still
opens no platform session (AD-62). The command refuses when `NODE_ENV=production`: there, a lost
password is an Owner reissuing the invitation (SA-3a). It creates no accounts.

---

**AD-72 — The super admin has its own Flutter app; the platform is administered only from it once it reaches parity**

*Status.* Decided by the owner, 2026-09-14 ("super admin ka alag main; super admin sirf isi se
khulega"), choosing a separate Flutter app over a separate web console. Amends AD-24 and AD-32 for
the platform: platform administration moves from the web console to this app. SAM-1 built.

*Decision.*
1. One codebase, two Android apps: flavor `college` (canonical id `com.nirvok.collegeErp`, entry
   `lib/main.dart`, the default flavor) and flavor `admin` (`com.nirvok.collegeErp.admin`, entry
   `lib/main_admin.dart`, named "Super Admin"). Admin code lives under `lib/admin/` and is reachable
   only from its entry, so the college app never contains platform screens.
2. The admin app has no Firebase: no client is registered for its id and it needs no push; its
   Gradle variants skip the google-services and Crashlytics tasks.
3. Sign-in is the platform's own, unchanged on the server: password, then an authenticator code, or
   setting one up (the key is shown with a copy button; on a phone the authenticator is usually on
   the same device). The resulting session is kept, renewed and ended by the shared
   `SessionManager` (refresh token in platform secure storage, AD-25). A session whose
   `/v1/auth/me` is not a platform actor is signed out: a college account never opens this app.
4. The web console's platform side stays until the app covers everything it does (SAM-2: lifecycle,
   plan and seats, branding, reissue; SAM-3: audit, accounts and roles), then its platform sign-in
   is removed. Until then both work; after, the super admin opens only in the app.

*Not in this decision.* iOS flavors (no Xcode). An app lock (biometric) for a phone holding an
Owner session is recommended before production; recorded as a risk.

---

**AD-73 — API logs in development only, through one redacting Dio interceptor**

*Status.* Decided by the owner, 2026-09-14 ("use dio interceptors for api logs").

*Decision.* Every client builds its Dio through `withApiLogs` (`lib/core/network/api_log_interceptor.dart`),
which adds `ApiLogInterceptor` only in debug, non-production builds. It prints method, path, status,
time and a truncated body. Headers are never printed (they carry the bearer token), and passwords,
access, refresh, invitation and challenge tokens, authenticator keys and push tokens are masked
wherever they sit in a body; on the platform sign-in endpoints `code` (the authenticator code) is
masked too. A Dio passed in by a test is left alone. Dio's own `LogInterceptor` is not used, because
it prints headers and bodies unredacted.

---

**AD-74 — The real Owner is nirvokofficial@gmail.com; operators may create an Owner and disable an account in development**

*Status.* Decided by the owner, 2026-09-14: `owner@nirvok.com` is not a real address; the super admin
account is `nirvokofficial@gmail.com`. The owner kept the authenticator app (AD-62) over emailed codes.
Extends AD-71 (OPS-2).

*Decision.*
1. The second factor stays an authenticator app. No email code is sent anywhere: the server has
   no email delivery, and an emailed code would make the Gmail inbox a key to the whole platform.
2. Two more development-only operator commands, beside `platform:set-password`:
   `platform:create-owner` (an active Owner with a policy-checked password from the environment,
   granted by nobody as migration 021's operator bootstrap, authenticator set up at first sign-in)
   and `platform:disable-account` (never the last active Owner). Both need an exact phrase, refuse in
   production, and are audited as the system with the operator named.
3. They also give a fresh database (Supabase after its rebuild) its first Owner.

---

**AD-75 — No deletion of colleges; handover through a temporary administrator; invitations accepted on web and phone**

*Status.* Decided by the owner, 2026-09-14. Built as SAM-2a, WEB-1 and ACC-1.

*Decision.*
1. **No deletion.** The platform suspends (reversible: everyone refused at once, nothing deleted),
   reactivates, and closes (final, confirmed by typing the code, records kept). A college is never
   deleted, so the audit trail stays complete (R20); OD-SA-2 still governs closed colleges' data.
   The Super Admin app now offers all three, version-pinned and with a reason (SA-1 unchanged).
2. **Handover.** No password is ever generated or known by anyone but its owner. To set a college up
   before its real administrator takes over, the super admin names themselves as the first
   administrator, accepts, sets the college up, invites the real administrator with the
   `college_admin` role, and the real administrator revokes the temporary one (nobody revokes their
   own authority, and the last administrator is protected: BR-8). A lost invitation is reissued from
   the app; the old one stops working.
3. **Accepting an invitation, in both clients.** The web console signs in college accounts by
   default (college code, email, password) and has `/accept-invite?college=&token=`; the platform
   sign-in stays behind a link until AD-72 retires it. The college app's sign-in has "I have an
   invitation" (the college from the first screen, the invitation code, a new password).
4. **Invitations are not emailed.** The super admin sends the college code and invitation code
   themselves; the app offers one message to copy and says plainly that the invitation is not an
   authenticator key.

*Known gap.* A college account cannot be deactivated yet, so the temporary administrator keeps
using one seat (AD-65) after handover, with no access.

---

**AD-76 — The College Admin onboards teachers and students from the phone too**

*Status.* Decided by the owner, 2026-09-14. Amends AD-32 ("mobile reads; the desktop console
writes") for onboarding only. Built as ONB-1.

*Decision.* The college app's dashboard has an Onboarding shortcut for whoever may invite
(`account.manage` with `role.assign`) or admit (`student.manage`); each action is present only
with its permission and the server checks again. "Appoint a teacher" invites a staff person with
the Faculty role, or Head of Department, in one department (the role's own allowed scope);
"Onboard a student" admits the person and the student record into a program. Both call the
endpoints the web console uses; no server change. A teacher's invitation is handed over as one
copyable message (AD-75). Departments, programs and curriculum are still set up on the web.

*Next.* A student's sign-in, by one-time activation code (AD-69), is ST-1.

---

**AD-77 — The dashboard carries the college and the day, never the person; the Profile carries the person**

*Status.* Decided by the owner, 2026-09-14 (R60, R61, R64). Built as UX-2.

*Decision.* The dashboard's header is a collapsing sliver app bar in the style of the prototype's
attendance screen: a navy panel with the college's logo and name, the teaching-record ring with
Taught / Not marked / Scheduled, an inner card with today, the next seven days and the person's
courses, and a pill when classes wait to be marked. It collapses to the college's name. There is no
greeting, name or email on the dashboard; a Profile action opens the person's own details (name,
sign-in email, college, roles). `/v1/auth/me` now also returns the signed-in person's own
`full_name` and `login_identifier`, and nobody else's.

---

**AD-78 — The phone's own lock guards every open of a signed-in app**

*Status.* Decided by the owner, 2026-09-14 (R59). Built as BIO-1.

*Decision.* In both apps, while a session exists, every screen sits behind a lock that asks for the
phone's fingerprint, face or screen lock (`local_auth` 3; the operating system decides who passes and
the app stores nothing). It asks when the app opens on a saved session and every time it returns from
the background; not right after the person typed their password, and not for a notification shade
or a call. A failed or cancelled prompt stays locked, with "Unlock" and "Sign out". The session is
unchanged: this is a gate, not a second sign-in.

*Assumptions for the owner to confirm (OD-BIO-1).* A phone with no screen lock at all is let
through rather than locking the person out of their work. "Sign out" on the lock screen ends the
session without deleting unsent offline changes, which stay encrypted on the phone until the same
person signs in again (the lock sits above the app's screens, so it cannot ask first).

*Android.* `MainActivity` is a `FlutterFragmentActivity`, and the manifest declares `USE_BIOMETRIC`.

---

**AD-79 — The College Admin runs the college from the phone: its own dashboard, its own password**

*Status.* Decided by the owner, 2026-09-14 (R65, R66, R70). Amends AD-32 for the College Admin's
modules, one slice at a time; AD-76 was the first. Built so far as ADM-1 (dashboard, password) and
ADM-2 (campuses and departments: add, rename, archive with a reason, on the web's endpoints).

*Decision.* Whoever holds `institution.manage` gets the college's dashboard, not a teacher's: the
navy header shows staff, students, departments, programs, sections and courses from
`GET /v1/college/overview` (counts only, `institution.read`, one college under row-level security)
and a pill for invitations not yet accepted; below it, "Manage your college" is a grid of the
modules the admin may use, each present only with its permission. The teaching parts stay only for
an admin who also teaches. Creating departments, programs, sections and courses (with their
teachers), the timetable and the student list come to the phone as ADM-2…ADM-6, on the endpoints
the web already uses; until then a line on the dashboard says they are on the web.

*Change password.* `POST /v1/auth/password` (`current_password`, `new_password`), for a signed-in
college account only. The current password must be right, the new one meets the password policy
and differs from it. Every session of the account ends, this one included; audited
`account.password_changed`. The app's Profile has "Change password" and signs the phone out after.

---

**AD-80 — A forgotten password comes back with a one-time reset code, not an email**

*Status.* OD-PW-1, option (a), taken on the owner's request for a forgot-password flow,
2026-09-14 (R69). Built as PW-1. An emailed link (option b) waits for an email provider.

*Decision.* Someone who may manage accounts (`account.manage`) issues a code from People for another
person's account: `POST /v1/people/:id/password-reset`. Never for themselves (that is Change
password), and for someone holding College Administrator only if they hold it too, because
whoever holds the code can set the password. The Super Admin issues one for any administrator of
a college, by sign-in email: `POST /v1/institutions/:id/administrator-reset`; one answer for "no
such account" and "not an administrator". The code is an `invitation_tokens` row, single use,
hash only, 24 hours, and issuing one revokes any earlier code; an account still waiting on its
invitation gets a fresh invitation instead. Issuing changes nothing; the old password works until
the code is redeemed through `/v1/auth/accept-invite` (the app's "Forgot password?" or "I have an
invitation", or the web page), which sets the new password, lifts a lockout and ends every
session. Suspended, deactivated and archived accounts cannot be brought back this way. Audited
`account.password_reset_issued` (person or platform) and `account.password_reset`. No migration.
