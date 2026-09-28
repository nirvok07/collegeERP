# Implementation Checkpoint

```
UPDATED   2026-09-29
Slices    S1 backend foundation — COMPLETE
          S2 Super Admin console — COMPLETE
Stack     Node 24 / Fastify / PostgreSQL 16 (pg, no ORM)
          React 19 / Vite / TypeScript, no component framework, in clients/web/
          Flutter for Android and iOS at the repository root; no Flutter Web
Tests     Current verified totals: 519 server + 203 web + 330 Flutter; historical totals below
State     Current state: PROJECT_STATE.md. This file is slice history.

P0 STABILISATION CHECKPOINT — 2026-09-28/29
  7925f06  Enforce the AD-83 staff-attendance geo-fence; coordinates are checked then discarded,
           desktop punching is withdrawn, and physical-phone GPS verification remains external.
  f3cfe90  Record the P0-0 invariant-enforcement sweep (93 focused tests).
  6af1254  Reconcile project state with idempotent seed evidence.
  626f5cc  Stabilise the seeded browser visual capture (admin, teacher and student flows).
  188efe0  Close verified checklist residue and preserve explicit blockers.
  3c716db  Record browser persona validation (admin 11, teacher 3, student 2 sections).
  e8ea7c8  Reconcile geo-fence checklist status and preserve the physical-device blocker.
  b5f8099  Add platform-auth mode to the standing visual-check script.
  9527766  Record platform and top-level browser screen coverage (3 platform sections).
  23ef8d3  Record the forced browser-state validation blocker.
  d4aa224  Record AD-84…AD-90 and AD-92; resolve OD-FEE-5.
  85d540a  Record AD-93, separating staff leave from student excused absence.
  Post-checkpoint close-out:
  6486213  Clarify the documentation tracker hierarchy and active entry points.
  ea1e7e9  Consolidate session and interruption recovery protocols into the architecture index.
  502235c  Retire the ignored generated Flutter log.
  9fa5570  Make device-test seed recovery validate existing credentials and database state.
  bc7ff7f  Stabilise browser state probes and verify local teacher loading skeleton evidence.
  0908c89  Reconcile the evidence-backed P0 exit-gate lines.
  00c809d  Reconcile the validation-debt inventory counts and current grouped tracer wording.
  c6a9c19  Record local `erp_app` versus `erp_migrator` account visibility evidence.
  12e66a9  Fold the module execution protocol into `ARCHITECTURE_INDEX.md` and remove its duplicate.
  d80576d  Preserve the open prompt-methodology retirement blocker with its evidence.
  c1b3cd4  Complete M1–M24 registry identifier coverage, including the M11 row.
  f94da2c  Clarify that seed and signed-in API evidence is historical until the approved target is restored.
  Current open validation: collection-backed empty browser states, physical Android checks, and
  managed-target fresh authentication; local device-test loading, forced-error and student no-access
  empty captures are verified.

P0 FOLLOW-UP — DOCUMENTATION, PROBE HARDENING AND BLOCKER RECONCILIATION — 2026-09-29
  267b167 / d88bc99  Add the bounded empty-state probe and verify local forced-error browser states.
  31ca481 / 7cb2779 / b80983a  Reconcile the web-console decision, owner preparation and migration-gate wording.
  9945354 / d6aaf13 / f94da2c  Refresh the master tracer, checkpoint history and historical seed evidence.
  47922ce / b2d51ea  Document visual probe modes and reconcile project-state browser evidence.
  f9809f6 / 4c3e765  Harden probe envelopes and expand bounded collection endpoints.
  e3f7624 / 055d627 / 403422c / cc7c985 / 8ec86ae  Add shell diagnostics and stabilize controlled OTP input.
  f6adf2c / adb0d6e  Report auth failures directly and record the local fixed-OTP blocker.
  a841b86  Record the ADB/Flutter-cache tooling blocker for physical Android validation.
  ee5b76e / 3d656a8 / 3e236f2 / eadd5c9  Audit methodology retirement, map destinations, and fold
           the module contract and architecture close-out gates into the canonical index.
  014bc7f / 7489d43  Refresh tracer line counts and add named validation-debt defect references.
  219d5b4 / cb05940  Prepare the owner decision brief and link the new P0 trackers from the docs entry point.
  Current open validation remains collection-backed empty browser states, fixed-OTP challenge-bucket
  access for further local retries, managed-target seed/bootstrap access, physical Android evidence,
  and the three owner decisions. None of these external blockers is marked complete.

OFFLINE OUTBOX, SLICE ONE: REPLAY-SAFE FIELD WRITES — BACKEND + FLUTTER
  Chosen by the platform readiness review as the highest-value unblocked
  capability. Every teacher field write can now be sent twice safely: an
  Idempotency-Key makes the server return the first outcome to a resend,
  instead of refusing it as "somebody else changed this" (AD-58). That false
  conflict could happen today on any flaky classroom network, offline or not.
  Six routes opt in: attendance save and submit, recording a class as taught,
  and an assessment's date, marks and submission. No other route stores a
  response. Keys belong to one person in one college and are bound to the
  exact request.
  Flutter reuses a key only while the identical save is retried, including
  across its renew-and-resend on an expired token. The web client does not
  send keys yet; its writes behave exactly as before.
  NOT built: the queue itself (slice two), its Sync Center, and offline
  reads. Drift 5 stays open.
  NOT VERIFIED on a device: the retry paths need a signed-in dev account
  on the phone. iOS needs Xcode.

M7 INTERNAL ASSESSMENT: BACKEND COMPLETE / WEB COMPLETE / FLUTTER COMPLETE
  Blueprint M9, the half of roadmap Phase 6 that OD-1 does not touch (AD-55).
  The department plans each course's components and weights on the web; the
  teacher records when one was held, enters results and submits on Flutter;
  the head of department verifies and corrects with a reason (AD-57). A mark
  is scored, absent or exempt, and absent is never zero (AD-56).
  NOT built: students seeing marks (no student role exists; publication is
  M10's), totals, grades, pass or fail, attendance eligibility, and end
  examinations. Each is recorded with its reason.

CLIENT HARDENING: DONE. FIREBASE REGISTERED FOR com.nirvok.collegeErp (2026-09-13)
  Android debug build on a physical phone: launch, API on port 3000, Firebase,
  Crashlytics and Remote Config VERIFIED. FCM NOT VERIFIED: needs a signed-in
  dev account. The backend cannot send a push (Drift 6). iOS BLOCKED: no Xcode.
  Evidence in docs/12-mobile-platform-config.md.

M6 ATTENDANCE: BACKEND COMPLETE / WEB COMPLETE / FLUTTER COMPLETE
  A register per class session, a mark per student, and corrections. Two states,
  draft and submitted, and no unlock: a submitted register changes only by a
  correction that records who changed what and why, and the corrections table is
  append-only by privilege as well as by design.
  Flutter is the primary surface here, which is the first slice where that is
  literally true: all present in one tap, four states per row, one batch write,
  and an unsaved count that never lies. Web is the administrative and corrective
  surface.
  NOT built: attendance percentage, eligibility, detention, defaulter lists, a
  correction request-and-approve workflow, a term-level lock, and offline
  capture. Each is recorded with its reason.

M5 STUDENT RECORDS: MINIMUM ONLY, BACKEND + WEB
  Student, cohort membership and enrolment in a course offering, added under M5's
  own ownership because attendance needed a roster and none existed (AD-50).
  Admissions, status history, transfers, guardians and alumni are M5's real
  surface and are not built. Flutter gets no student register: that is an
  administrator's screen, and the roster reaches mobile inside attendance.

M4 TEACHING DELIVERY: BACKEND COMPLETE / WEB COMPLETE / FLUTTER COMPLETE
  Room, timetable slot and class session are built on all three sides. The web
  console gets the coordinator's day and week, with conflict and unmarked
  indicators and scheduling that previews before it writes. Flutter gets the
  teacher's own schedule: what is waiting on them, today, then the fortnight
  ahead, with one write, recording a class as taught.
  Module numbering: this M4 is the delivery slice, not the blueprint registry's
  M4 Admissions. The mapping is AD-44.
  Attendance is NOT built. It is the next module, and nothing here pretends to
  record who was present.

M3 TEACHING OPERATIONS: BACKEND COMPLETE / WEB COMPLETE / FLUTTER COMPLETE
  Section, CourseOffering and instructor assignment are built on all three
  sides. The web console gets the administrator's workspace: cohort, the courses
  taught to it, and who teaches each, with assignment in place. Flutter gets the
  teacher's own teaching and nothing else, derived server-side from the token
  subject. Attendance is M4 and is not built.
  Timetable, rooms and class sessions landed in M4, which is what M3 owed.

CURRICULUM: BACKEND COMPLETE / WEB COMPLETE / FLUTTER DEFERRED
  Flutter deferral is deliberate and recorded, not forgotten. Authoring is a
  hierarchical, low-frequency desktop workflow under AD-29. Flutter gets
  curriculum READ when a reader needs it: a student viewing their own
  requirements, which needs M5 to own the student-to-version binding first.
  A mobile curriculum browser today would be a screen with no user. The read
  endpoints are already shaped for it: terms come grouped and `editable` is
  stated by the server rather than inferred, so mobile needs no new contract.

PLATFORM RUNTIME VALIDATION: DEFERRED
  Android build, iOS build, Firebase platform config, notification
  permissions, signing and provisioning, emulator networking and
  physical-device testing are a dedicated later phase. Nothing here claims
  Android or iOS production readiness. Static analysis, unit tests,
  typechecks and API verification are what currently stand behind the
  mobile client.
  Emulator note for that phase: localhost does not reach the Mac host, so
  pass --dart-define=API_BASE_URL=http://10.0.2.2:3000
Blocked   OD-1 affiliating vs autonomous, OD-4 money
Note      Supabase session pooler URI still REQUIRED. The direct host is
          IPv6-only and unreachable here; local PostgreSQL stays active.
```

## Completed slices

### S1 — Backend foundation (M1 identity, M2 provisioning)

Super Admin authenticates, provisions a college with its initial administrator in
one transaction, that administrator activates and signs in, and their authority
resolves from scoped assignments. Tenant isolation is enforced and proven.

**Runs.** `npm run db:setup && npm run migrate && npm start`, verified against a
real PostgreSQL instance. Provisioning exercised over HTTP end to end.

**Layering.** Dependencies point inward throughout.

| Layer | Contents | Knows about |
|---|---|---|
| `modules/*/domain` | Scope containment, authority resolution, account policy | Nothing. No framework, no database |
| `modules/*/application` | Ports and use cases | Domain and its own ports only |
| `modules/*/infrastructure` | PostgreSQL repositories | pg, and the ports it implements |
| `modules/*/presentation` | HTTP routes | Fastify, use cases |
| `infrastructure/` | Pool, unit of work, audit writer, crypto, Cloudinary | Vendors |
| `container.ts` | The only place adapters meet ports | Everything |

No `pg`, `fastify`, `jsonwebtoken` or Cloudinary import exists in any domain or
application file. Cloudinary sits behind `MediaStorage` and is swapped for an
in-memory adapter when unconfigured, so no application code branches on it.

**Architecture decisions honoured.** AD-1 role by scope by validity, with no role
column anywhere. AD-2 campus scope from day one, one implicit default campus.
AD-14 person and account separate. AD-16 permissions resolved per request, never
carried in the token, cached with a fifteen minute ceiling. AD-18 deny by
default, with no-access as a designed response. AD-20 one transaction for
provisioning. AD-21 no administrator pointer, asserted by a test that inspects
the schema. AD-22 isolation enforced twice.

**Database roles, deliberately separated.** `erp_migrator` owns the schema and
may bypass row level security. `erp_app` is `NOSUPERUSER` and `NOBYPASSRLS`, so
the isolation guarantee is real rather than assumed. The application holds no
`DELETE` grant anywhere, and only `INSERT` and `SELECT` on audit tables, so
append-only audit is enforced by the database rather than by the absence of a
method.

**Tests, 45.** Eight adversarial isolation tests attack row level security
directly, bypassing the application, including reading another tenant's row by
its exact primary key. Nineteen pure domain tests cover scope containment and
authority. Twelve cover authentication including identifier enumeration and
lockout. Six cover provisioning including atomicity and the audit trail.

**Two bugs caught during the slice.** Provisioning was initially split across two
transactions, which would have allowed exactly the orphaned tenant AD-20 exists
to prevent. Audit writes initially opened their own transaction, so an action
could commit while its audit record rolled back.

### S2 — Super Admin console (`clients/web/`)

Sign in, see every college, add one, receive the invitation once. Verified against
the running backend: sign-in, empty state, provisioning, duplicate refusal,
invitation acceptance, administrator sign-in with 11 resolved permissions, and
the administrator correctly refused at the platform endpoint.

**Resolves OD-3 as AD-24.** Web console for back-office roles, Flutter for
students and faculty. Taken under an instruction not to wait, after the question
stood open across three sessions. Supersedes R3.

**Design system implemented, not improvised.** `clients/web/src/design/tokens.css` is
docs/07-design-system.md §7.2 to §7.7 expressed as custom properties: the same
indigo primary, 4pt spacing, 8/12/16 radii, and motion durations. Light and dark
both ship, dark under the system preference and an explicit override. Reduced
motion collapses every transition.

**Screen states are real.** Loading with nothing shows skeleton rows carrying the
real column widths. Refreshing with data shows a 2px bar and keeps content
interactive. Two distinct empty states, one for no colleges and one for a search
that matched nothing, because conflating them is the common mistake. A refresh
failure keeps the data on screen and offers retry; only a cold load surrenders
the surface.

**Accessibility.** Real labels rather than placeholders, one focus treatment
meeting contrast in both themes, focus trapped and restored in the drawer,
Escape closes, status never carried by colour alone, and a table with proper
headers and scope attributes.

**Keyboard.** `/` focuses search, `n` opens the create drawer, `Esc` closes it.

**CORS.** An explicit origin allowlist, never a wildcard. Credentials off, since
the console sends a bearer token and no cookie crosses the origin.

**Not built.** Pagination, not needed at 50 rows. Saved views, filter rail and
command palette, which belong with the people list in S3.

### S2b — Persistent sessions (AD-25, AD-26)

The user is no longer signed out while still working.

**Backend.** Refresh tokens rotate on every use and carry a family id. Expiry
slides forward from the renewal, not from sign-in, so an active user is never
asked to sign in again. Replaying a consumed token revokes the whole family and
writes an audit event. Renewal re-checks account status, which is how a
suspension reaches someone already signed in. Two narrow SECURITY DEFINER
functions resolve and revoke by token hash, because the tenant is unknown until
the row is found and row level security needs the tenant to find it.

**Web.** Access token in memory only, refresh token in an httpOnly cookie.
Nothing sensitive is in localStorage or sessionStorage, asserted by a test.
Startup calls refresh, so a browser reload restores the session silently.
Renewal fires 60 seconds before expiry, is single-flight so ten concurrent 401s
cause one renewal, and retries with backoff on transient failure while keeping
the user signed in. A dropped network shows a banner saying the session is
intact; only a server refusal ends it.

**Mobile contract.** Flutter posts the refresh token in the request body and
stores it in platform secure storage. Same endpoint, same rotation, same reuse
detection. No business logic is duplicated per client.

Verified against the running server: cookie is HttpOnly, a reload restores with
no credentials, ten consecutive renewals succeed, a replayed token is refused,
and sign-out makes the token unusable.

### S3a — M1 write surface (backend)

Invite a person, grant authority with scope and validity, revoke it with a
reason, list people and active assignments. 15 tests.

**Rules that actually enforce the model**, rather than being hidden by the UI:
nobody may change their own authority, including an administrator, since that is
the one role positioned to escalate itself. A duplicate grant at the same scope
is refused by a partial unique index, not by a check that can race. Revocation
requires a reason, so no audit entry is ever blank, and is conditional on the row
still being active, so two concurrent revocations cannot both succeed. A college
cannot be left with no administrator, protected by two independent rules.

Granting authority is a separate permission from inviting someone, so an
account manager cannot quietly hand out roles.

The people list aggregates roles in one query rather than N+1, because it is the
screen an administrator lives in.

Every grant and revocation invalidates that person's authority cache, so a
change reaches their next request instead of waiting out the 15-minute ceiling.

### Database role provisioning (fixed)

`003_grants.sql` failed with `role "erp_app" does not exist` when the migration
chain was run against a database whose roles had not been provisioned. The
diagnosis, and what changed:

- **Roles are cluster-level; migrations are database-level.** A migration cannot
  create the role it runs as, so role creation legitimately sits outside the
  chain. The defect was that the dependency was undeclared and lived in a shell
  script, so running migrations alone failed with an unhelpful error.
- **`bootstrap/001_roles.sql`** now provisions roles idempotently through an
  administrative connection, and `npm run migrate` runs it first whenever
  `BOOTSTRAP_DATABASE_URL` is set. Names and passwords arrive as session
  settings from the environment; nothing is hard-coded.
- **`scripts/setup-db.sh` no longer creates roles.** It creates databases only,
  so there is one place that decides privileges rather than two that drift.
- **Grants resolve the role name at migration time** and fail with an
  instruction rather than `role does not exist`.
- **A pre-flight check refuses to start** when the application role is absent,
  so a database is never left half-migrated. Verified: zero tables created.
- **`npm run db:bootstrap`** provisions roles without applying migrations. It
  reuses the same bootstrap file, so there is one role-creation path, and error
  messages now name a command that exists.
- **No default privileges, deliberately.** A blanket grant would give a future
  table an undeclared privilege set, and would hand an audit-shaped table INSERT
  and UPDATE, dissolving append-only. Every table declares its runtime
  privileges in the migration that creates it, and
  `tests/migration-invariants.test.ts` fails when a table appears without a
  declared decision or when an existing table's privileges widen.
- **The chain no longer requires BYPASSRLS.** Migration 002 seeds platform role
  templates by having the table owner lift `FORCE ROW LEVEL SECURITY` for the
  length of its transaction. This matters because BYPASSRLS can only be granted
  by a superuser, and managed PostgreSQL, Supabase included, does not grant
  superuser. Verified by running the whole chain with a migrator role that has
  no BYPASSRLS.

**Verified on a clean database with no roles present:** bootstrap then six
migrations apply; the application role holds no DELETE on any table; audit
tables grant INSERT and SELECT only, and an UPDATE against them is refused;
neither role has superuser or BYPASSRLS; PUBLIC holds nothing. The application
then signs in, provisions a college, invites a person and lists people.

### S3b — People screen and role-driven shell (`clients/web/`)

The M1 write surface now has an interface. Verified against the running backend,
not only in tests: roles endpoint, invite with a role in one request, the list as
rendered, self-grant refused with 403, revoke without a reason refused with 422,
revoke with a reason accepted.

**Navigation follows permissions, not actor kind.** `AppShell` builds its
sections from the permission set returned by `/v1/auth/me`, so a section is
absent rather than disabled. A person with no assignment gets the designed
"No access yet" screen from AD-18, which is normal on a first day.

**Plain language over permission lists.** The server returns a one-sentence
summary per role and both drawers show it, because nobody reads eleven
permission keys and predicts the effect. The invite drawer states what the
person will be able to do before the button is pressed.

**Revocation asks for a reason** because the server requires one, so no audit
entry can read "someone removed this". The confirmation states that access
disappears on the person's next action rather than at their next sign-in.

**Scope is deliberately limited to institution level.** Department-scoped roles
are listed but not grantable, because granting one needs a scope picker over an
organisational tree that M2 owns and which does not exist yet. Offering a picker
with nothing in it would be worse than omitting it.

**Keyboard:** `/` focuses search, `i` invites, number keys switch sections,
`Esc` closes a drawer.

### M7 — Internal assessment

Designed before any table, in `docs/blueprint/modules/m7-internal-assessment.md`.

**Where the slice stops, and why.** Roadmap Phase 6 mixes blueprint M9 and M10.
The blueprint's ownership table gives internal marks to M9 and publication to
M10, and OD-1 decides M10 while assumption S4 leaves M9 untouched. So M7 is M9
and nothing more (AD-55).

**The component is the mark sheet.** One component, such as Test 1, carries its
maximum, its weight, the date it was held, and the state of the act of marking.
Attendance needed a separate sheet table only because M4 owns the session; M7
owns the component outright.

**Absent is not zero** (AD-56). A mark is scored, absent or exempt. Storing a
missed test as 0 would already have decided that it counts against the student,
which is examination policy.

**The roster is taken on the day it was held** (AD-50 again). A component takes
no marks until it has a date, and the date, maximum and weight all freeze once
the first mark exists.

**Weights never exceed 100.** Enforced by the database under an advisory lock, so
two components added at once cannot each see 60 and together make 120. They need
not equal 100 while a plan is built.

**Two checks moved up from the database to the application.** PostgreSQL renders
numeric values with their scale, so a refusal left to a trigger told users a
course's weights "would total 110.00" and that a score of "60.00" was too high.
The weight total and a corrected score's maximum are now said in words first; the
triggers remain the guarantee.

**Every PL/pgSQL variable is prefixed.** Migration 016 exists because a variable
named like a column broke every attendance write at runtime; migration 017 was
written so that cannot recur.

### Client hardening: canonical identity and the web directory collision

**Identity.** Both platforms had drifted to the Flutter template's placeholder
identifiers. Android and iOS now declare `com.nirvok.collegeErp`, and
`MainActivity` moved to the matching Kotlin package, because the manifest names
the activity relative to the namespace. Firebase was deliberately not touched:
editing the package name inside the generated files would fake a registration
that does not exist. The Android build therefore fails at Google Services until
the new apps are registered, and says why at that line.

**The collision was real, and was tested rather than assumed.** Flutter treats
`<project>/web/` as its web target and the React app lived there. Run against
the repository, `flutter build web` succeeded: it used React's `index.html` as
its host page, copied the whole React directory into the output including
`node_modules`, and pulled five web-only plugins into the dependency graph. After
moving React to `clients/web/`, the same command refuses. Moving React rather
than Flutter touched almost nothing, since the Vite and Vitest configuration is
path-relative and nothing else referred to the path.

**Two things caught in verification.** A parallel check changed the shared
working directory, so three results briefly came from the wrong place and looked
clean because they found nothing; they were re-run from the root. And a first
reference sweep only read Markdown, JSON, TypeScript and YAML, so it missed a
stale path in a Dart comment; a sweep over every tracked file type found it.

### M6 — Attendance, on M5's minimum roster

Designed before any table, in `docs/blueprint/modules/m5-m6-attendance.md`.

**The dependency decided the shape.** Attendance answers which enrolled students
were accounted for, and every word of that existed except *enrolled students*.
So the slice added the minimum M5 roster first, under M5's own ownership
(AD-50), and attendance consumes it. Two bindings, because an elective splits a
cohort: a roster built from membership alone would show a teacher sixty names
and invite forty wrong absences.

**The rule the whole thing turns on.** A class session's roster is every student
whose enrolment was live **on that class's own date**, never today. A student who
withdrew in week ten is still on week three's register; one who joined in week
six is not. The database checks enrolment the same way before it accepts a mark.

**Two states, and no unlock** (AD-51). A submitted register stays submitted, and
a change is a correction recording the old state, the new state, who and why.
Inserting the correction is what applies it: a trigger does the update, having
checked that the register is submitted and that the stated previous state is the
one actually there. `attendance_corrections` holds INSERT and SELECT only, so no
code path can rewrite a mark's history.

**Four states, each earning its place.** present, absent, late, excused. No
percentage anywhere: how late and excused count toward eligibility belongs with
examinations, and deciding it here would bake one college's policy into the
schema.

**One batch, optimistic concurrency** (AD-52). The sheet carries a version; a
stale write is refused and says somebody else changed the register. Fifty marks
are one transaction, and a sixty-student class is never sixty requests.

**Corrections are the head of department's authority** (AD-53), which is
Blueprint 2 D4's own rule. Faculty mark and submit; they do not correct. The
approval workflow that would let a teacher request one needs the approvals
capability, so until then a teacher asks.

**Flutter is the primary client, literally.** Marking is a phone task performed
standing in front of sixty people. All present in one tap, four states per row
reachable without a menu, one batch write, an unsaved count that never lies, and
a confirm before leaving with unsent marks. Offline is not promised: a failed
save keeps every tap on screen, and the screen says nothing survives the app
being killed. The first `onGenerateRoute` router arrived with it, since this is
the app's first pushed screen.

**Submitting a register records the class as taught**, through an M4 function
inside M6's transaction, because submitting is evidence the class happened and
two records disagreeing about that is worse than a small cross-module call.

**Two defects found while building.** A PL/pgSQL variable named `offering_id`
shadowed the column of the same name, so every attendance write failed at
runtime with an ambiguous-reference error; migration 016 replaces the function
forward rather than editing an applied migration. And the batch reported a
version one ahead of reality on the request that creates a register, which made
the next write look stale.

### M4 — Teaching Delivery: room, timetable slot and class session

Designed before any table, in `docs/blueprint/modules/m4-teaching-delivery.md`.

**Four entities, not one.** The slot is a recurring intention and gets edited;
the session is one occurrence and is a fact. One row for both would mean that
correcting next week's timetable rewrote the record of last week's class. The
room is a row rather than a string because two classes must not share it and a
free-text name cannot be compared: `Room 204`, `204` and `LH-204` are three
strings and one room (AD-45, AD-46).

**A taught class does not move.** Editable while scheduled, immutable once
completed, by trigger. Rescheduling moves the row in place and keeps where it
came from, because no attendance can exist for a class that has not happened.
After teaching, the same operation is refused rather than accepted and audited.

**`completed` means the teaching occurred**, recorded by somebody, never
inferred from the clock. A class on the timetable is not evidence that a class
happened. Unmarked is derived from status and date, never stored: a fourth
status would need a background job and would be wrong for as long as it lagged.

**Conflicts are enforced in the database** (AD-48). One room and one teacher per
hour, inside the term, against teaching that still expects to happen. The
textbook answer is an exclusion constraint, which needs `btree_gist` and an
ownership the migration role does not hold on managed PostgreSQL, so the trigger
takes an advisory lock on the room and on the effective teacher before it looks
for an overlap. Overlap is half-open, because back-to-back periods are how every
timetable in the country is built.

**Non-teaching days went to M2** (AD-47), following AD-39 exactly. Generating
fifteen weeks without them puts classes on Diwali, which corrupts every later
attendance report. Only the negative case is stored; the weekly pattern is
already expressed by which days carry slots.

**Authorization did not change** (AD-40 intact). `session.deliver` says a person
may record teaching; M3's assignment says which classes that reaches, checked in
one place. A teacher's permission is resolved against the session's own cohort
scope, so faculty granted over one section cannot record teaching in another.
`GET /v1/me/sessions` needs no permission at all, exactly as `/me/teaching`.

**Web: the coordinator's day.** Day and week are both lists, not a seven-column
grid: a wall cannot carry a room, a teacher and a state in every cell and stay
readable. Scheduling previews first and reports every clash before writing,
because generation is all or nothing and discovering a clash on the fortieth row
is not an answer. The weekly pattern is edited from the course itself in the
teaching workspace, since that is what it belongs to.

**Flutter: the teacher's own schedule.** What is waiting on them first, then
today, then the fortnight ahead. One write: I taught this class. No scheduling
grid, no rooms, no college-wide timetable.

**One pre-existing defect found and fixed** (AD-49): the driver parsed every
DATE as a local-midnight `Date`, so `'2026-09-12'` read in India formatted back
as `2026-09-11`. Academic year, term and every date the API had returned were
one day early, invisibly, in any timezone east of UTC. Dates are now calendar
strings end to end, and both clients do date arithmetic in UTC.

### M3 — Teaching Operations, slice two: CourseOffering and instructor assignment

Designed before any table, in `docs/blueprint/modules/m3-course-offering.md`.

**Two questions, not one authorization system** (AD-40). Blueprint 2 called
`teaching_assignments` "the authorization source for every teacher action",
which read literally contradicts AD-1. The conflict was flagged rather than
resolved by preference: a role assignment answers whether a person may act at
all, and an instructor assignment answers which offerings that reaches. So
`GET /v1/me/teaching` adds no permission, derives its set from the token
subject, and accepts nothing from the client that could widen it.

**Identity excludes the term and includes the component** (AD-41). A section
already carries its term, so restating it would allow an offering that
contradicts its own cohort. `component` exists because colleges staff a lab
separately from the lecture sharing its course code; without it they would fake
the case with duplicate course codes and corrupt transcripts.

**Assignment is a record, not a column** (AD-42). Attendance taken in week three
was taken by whoever taught in week three. Reassignment ends one row and opens
the next, ending requires a reason, and nothing is ever deleted.

**The section lifecycle meets the offering lifecycle asymmetrically.**
Completing a section completes its active offerings in the same transaction,
each audited individually so the cascade is visible. Cancelling a section is
refused while any offering is active, naming them, because cancellation claims
the teaching should not have happened and that deserves a decision per offering.

**Web: one screen answers the whole relationship.** Cohort, then the courses
taught to it, then who teaches each, with the instructor assigned from the row
rather than from a separate screen. The blocking reason is written out, not left
to a disabled button and a tooltip a keyboard user would never see. The course
picker offers what the published curriculum expects for that cohort's term
first, and the catalogue second, so departing from the regulation is a visible
choice. Four CSS patterns that three features now share moved into the shared
stylesheet, so no feature imports another feature's CSS to lay out its own page.

**Flutter: the teacher's own teaching, and nothing else.** Grouped by the class
they walk into, with finished terms kept out of the way but never lost. State is
shown in a teacher's words: "not started", not `planned`. The shell became
permission-aware in the process (AD-43): it reads `/v1/auth/me` once and builds
its tabs from the resolved permission set, so a faculty member no longer sees an
administrator's People and Organisation screens. `TeachingRepository` is a
domain port, so the cubit is tested without a server.

**Two defects found and fixed while building**, both mine, both in the test
reset: the delete order violated `course_offerings_course_id_fkey` by clearing
curriculum before the offerings referencing it, and the section transition query
left `$4` unreferenced on one branch, which PostgreSQL rejects outright.

### M3 — Teaching Operations, slice one: Section

Designed before any table, in `docs/blueprint/modules/m3-teaching-operations.md`.

**A section is a cohort, not a course offering** (AD-38). Three approved
artifacts already said so, and M1's scope contract decided it: a section yields
`[section, program, department, campus]`, which a course-shaped section could
not produce because a course has no department.

**The academic calendar went to M2, not M3** (AD-39), even though M3 needed it
first. Putting the institution's yearly cycle under teaching operations would
make admissions, fees and examinations reach across a boundary to read it.

**Section scope now resolves**, which was the point of the slice. It had been
declarable and unresolvable since migration 001. `OrgTreeReader` gained section
and program ancestry, so the Faculty role's long-declared section scope is
finally grantable, and the authorization decision stayed in M1.

**Identity freezes when teaching begins**, by trigger. Attendance and results
will reference a section by identity, so re-pointing one would move records
between cohorts. Terminal states are terminal for the same reason.

**Three defects found and fixed while building**, all pre-existing:
the error translator discarded trigger messages, so a trigger that said "term 9
is beyond this program, which runs 8 terms" surfaced as "that value is not
allowed"; the test reset used `TRUNCATE CASCADE`, which destroyed platform role
templates through the institution foreign key and silently undid every
migration that amends one; and migration 011's template update needed the
`NO FORCE` pattern to run on managed PostgreSQL without BYPASSRLS.

### M2 — curriculum web workspace

Three panes, because the question has three levels: which program, which
regulation, what does it require. A flat table would make an administrator
rebuild that hierarchy in their head on every visit.

**Context is never inferred.** Department, program, regulation year, revision,
status, term and credit totals appear at the level they apply to.

**Read-only state is explained, not enforced by hiding buttons.** A published
version states that students admitted under it follow exactly these
requirements, so correcting it means a new version. Someone who cannot find the
edit action will otherwise look for a way around it.

**Revision and amendment are two distinct choices**, each saying what happens to
existing students, because they look similar and behave oppositely. The screen
never offers a generic "edit curriculum".

**The catalogue is searchable, not a dropdown.** Setting credits while placing a
course, with the hint that they apply to this regulation only, is where a user
learns that a course is not its placement. A course already in the version shows
disabled rather than failing on a constraint.

**Publication is gated in the interface as well as the backend.** Empty terms
are named and the publish button stays disabled, because publication cannot be
undone.

### M2 — curriculum spine (programs, versions, courses)

Designed before any table, in `docs/blueprint/modules/m2-curriculum-spine.md`,
because AD-3 fixed the principle and not the model.

**Four entities, deliberately not three.** Program, curriculum version, course,
and the entry that places a course inside a version. Collapsing the last two is
the classic failure here: credits on a course would make a 2024 transcript
change when the 2026 regulation was written (AD-33).

**Immutability is a trigger, not a convention** (AD-34). One refuses any change
to a published version except superseding; the other refuses insert, update and
delete of its entries. A test bypasses the application and confirms the database
still refuses, because this rule should not depend on every future code path
remembering it.

**Errata and amendments are separate operations** (AD-35). A revision keeps the
regulation year, an amendment starts a new one, both copy their predecessor's
entries, both require a reason, and the audit trail records which kind occurred.
Only an erratum rebinds students, and that binding belongs to M5.

**Publication validates the whole document** because it cannot be undone: an
empty curriculum is refused, and an empty term is refused by number.

**Section scope now has an owner** (AD-36): M3 Teaching Operations. It has been
declarable and unresolvable since migration 001. No code changed; the reference
stopped being ownerless.

**One open assumption**, OD-M2-1: a curriculum version belongs to a program, and
a program to one department on one campus. A campus running its own variant gets
its own program record.

### Push device registration (M1 + Flutter)

Closes a gap the bootstrap introduced: Flutter fetched an FCM token and dropped
it, so the approved push decision could not deliver anything.

Migration 008 adds `devices`. The push token is stored **hashed**, because a
push token is a capability rather than an identifier: anyone holding it can
notify that device, so a database leak must not hand an attacker the ability to
push to every user. The token never appears in the audit trail either, which a
test asserts.

Re-registering the same handset updates the row rather than adding one, and
re-points it at whoever is signed in now. That is what stops a shared device
delivering the previous user's notifications. Signing out revokes it, which the
security documentation already required and nothing implemented.

The invariant suite caught the new table before any of this was wired, which is
the privilege model working as intended.

### Flutter client bootstrap (`lib/`)

The counter demo is gone. Flutter is now a real client on the same backend, the
same domain and the same authorization model, with no business rule duplicated
from web.

**Structure** mirrors the backend and the approved architecture: `core/` for
config, errors, network, session, design, platform and the composition root;
`features/` split into data, domain and presentation. Cubit for state, Dio for
HTTP, get_it for wiring, exactly as the architecture fixed.

**Session** reuses the existing model rather than inventing one. The refresh
token lives in platform secure storage, Keychain or Keystore, and travels in the
request body because a mobile app has no cookie jar worth relying on. The
backend already accepted that transport. A stored token means no sign-in screen
on launch however long the app was closed, renewal is single-flight sixty
seconds before expiry, and a dropped connection shows a banner rather than
signing anyone out.

**Firebase** (AD-30) is confined to one file. Cloud Messaging, Remote Config and
Crashlytics only. No Auth, no Firestore, no Storage. Remote Config has compiled
defaults and never blocks startup, so the app works offline and on a device with
no Play Services.

**Motion** (AD-31) uses the same bands and curve roles expressed natively rather
than copied from CSS. Stagger capped at the same eight items, and the platform
reduced-motion setting removes travel while indeterminate progress keeps moving.

**Read-only by intent** (AD-32). Granting authority needs a scope picker over the
organisation tree, which is desktop work under AD-29. The person sheet says so
where a user would look for the action. Attendance, the first mobile-first write
surface, will change this.

### M2 — organisational tree (campuses and departments)

The structure M1 scopes authority against. Campuses and departments existed in
migration 001 with tenant isolation; what was missing was lifecycle, an
application layer and a surface. All three now exist, and department-scoped role
grants work as a result.

**Migration 007** adds status, archived_at and archived_by to both units. Codes
are unique among active units only, so archiving frees a code for reuse rather
than reserving it forever. A partial index enforces exactly one default campus.

**Archiving is refused while authority is scoped to the unit** (AD-27), and the
refusal names up to three of the people holding it. The earlier blueprint
proposal to mark such assignments invalid was rejected during implementation: it
hides the consequence at the moment of the decision.

**M2 asks M1 through a declared capability** (AD-28) rather than reading
role_assignments, so there is one interpretation of active authority.

**Web-only by intent** (AD-29), recorded rather than assumed. The read API stays
two flat lists which the client assembles, so a phone can drill down one level
at a time instead of receiving a desktop-shaped tree.

**Department scope is now real in the UI.** The assign drawer offers
department-scoped roles only when departments exist, so there is never an empty
picker, and roles whose only scope the tree cannot yet express stay hidden.

### Motion system (`clients/web/src/design/motion.css`, `motion.ts`)

Every animated value in the product now comes from one file. Four duration bands
chosen by interaction complexity, four easing curves, and eight presets covering
rise, fade, pop, drawer, bottom sheet, capped stagger, changed-row highlight and
press feedback. Documented in [design system 7.7](docs/07-design-system.md).

**Feedback outranks everything.** Pressed states use the shortest band and the
sharpest curve, so a click is never queued behind a larger transition. Section
changes animate one wrapper element rather than each row of their content, so a
page change costs one compositor layer regardless of what it contains.

**Performance is enforced, not intended.** A test parses the stylesheet and fails
on any keyframe property that can trigger layout, so only transform, opacity and
colour are animated. Table rows change background on hover and never transform.
Row actions reserve their space and fade rather than reflowing the row. Stagger
is capped at eight rows in CSS and dropped entirely above twenty-four in
`motion.ts`, because past that it explains nothing and only costs frames.

**Reduced motion keeps meaning.** Durations collapse and travel goes to zero,
positional entrances become fades so arrival is still signalled, and
indeterminate progress keeps looping because a frozen spinner reads as hung.

**GSAP was considered and rejected.** Every motion here is a transform or opacity
change on a single element, which CSS runs on the compositor with no library.
The reasoning is recorded in the design system so it is not revisited by accident.

### Supabase readiness

`migrations/006` closes a real exposure found while preparing for Supabase. Its
Data API publishes the `public` schema to anyone holding the publishable key.
Most tables are safe because their RLS policies key off a setting PostgREST never
provides, but `institutions` and `platform_accounts` carry no tenant column and
had no policy, and the latter holds emails and credential hashes. The migration
revokes the `anon` and `authenticated` roles, revokes PUBLIC, sets default
privileges for future tables, and gives both tables deny-by-default policies. It
is a no-op on a plain PostgreSQL instance.

## Deviations from specification, recorded

**Platform actors live in `platform_accounts`, not in `persons`.** M1's data
model had `person.tenant_id` nullable for the Super Admin. A separate table makes
the boundary in M1 section 2 structural rather than dependent on a nullable
column, and it means no platform row can ever be returned by a tenant-scoped
query. Small, contained, and it strengthens the stated boundary rather than
weakening it.

**No `citext`.** The extension needs elevated privilege. Identifiers are
normalised to lowercase at the application boundary and a `CHECK` constraint
enforces it, which keeps the schema portable across Supabase and managed
PostgreSQL with no extension dependency.

## Not built, and why

Administrative UI. OD-3 decides whether the back office is web or Flutter, and
building screens now risks discarding them. The backend is identical either way,
which is why this slice was chosen.

## Next slice options

- **S2a, blocked on OD-3.** Application shell, sign-in, and the Super Admin
  institution list and provisioning form.
- **S2b, unblocked.** Complete M1's write surface: invite a user, assign a role
  with scope, revoke, and the access register. Extends the backend without
  needing the client decision.

## PRE-COMPACTION PROJECT_STATE ARCHIVE

The following snapshot is retained verbatim from the 2026-09-29 compaction commit so historical
status notes and their commit context remain recoverable while `PROJECT_STATE.md` stays compact.

# Project State

Updated 2026-09-29. Current slice: P0-4 browser persona validation; P0-0 physical-device check remains.

## CURRENT OBJECTIVE

P0-0 is implemented and committed (`7925f06`); its physical-phone GPS verification remains external.
P0-1 live audit found migration 036's syllabus table compliant;
P0-2 removed all ten debug-only `zz-*` server tests after classifying them:
seven logged and asserted `true`, two were probes, and one tested a private duplicate parser.
P0-1 found migration 036's syllabus table compliant:
RLS is enabled/forced and all expected grants exist. The historical incident cannot be root-caused
because the migration ledger has no checksum or execution log; no corrective migration is needed.

## VALIDATION

- ✅ Server production code typecheck; the former `zz-err6` debug test is removed.
- ✅ Read-only dev-DB audit: syllabus and all 55 public tables checked; permissions is the expected
  non-tenant reference-table exception.
- ✅ Web typecheck and 203 tests pass.
- ✅ Server suite passes `519/519` with 0 failures, 0 cancellations and 0 skips against the local
  PostgreSQL test database; syllabus is 8/8 and migration invariants are 9/9.
- ✅ Flutter location permission/timeout/mock refusal and coordinate payload implemented; widget
  tests updated with injected location fix.
- ✅ Full Flutter suite passes `330/330`; real-phone GPS, permissions, offline behavior and flavor
  installation remain physical-device validation items.
- ✅ The previously flaky outbox ordering test passed five consecutive isolated runs; no code
  change was required.
- 🔍 NEEDS VALIDATION: physical phone inside/outside a real fence; this is an explicit external
  verification blocker, not claimed complete.

## BLOCKERS

- 🚫 Physical-device GPS verification requires an attached phone.
- ✅ The local PostgreSQL verification blocker is cleared; remaining validation blockers are
  external device and live-browser checks.
- ✅ P0-4 validation debt is inventoried in `docs/validation-debt.md`, grouped by Android, browser,
  server, tooling, and explicit external blockers.
- ✅ P0-3 now has canonical `server/scripts/seed-dev.ts` and runbook entry; it was executed against
  the local `device-test` college with a known admin password and development OTP `123456`.
  Two consecutive reruns completed with `0 created, 129 already there`; the generated timetable
  produced no new duplicate sessions.
- ✅ Seed code includes branding, prior-year/calendar fixtures, course offerings and instructor assignments,
  a four-week timetable, attendance/correction/cancellation examples, assessment marks, and a
  mixed tuition ledger. The seeded API reports five departments, four programs, one published
  curriculum version, and three draft versions.
- ✅ Seed code now verifies one scored/absent assessment and leaves a second assessment unmarked;
  assessment correction fixtures remain open.
- ✅ P0-4 standing web visual-check script is committed at `clients/web/scripts/visual-check.mjs`;
  signed-in OTP login passed for all seeded personas: admin (11 navigation captures), teacher
  (3 permission-filtered captures), student (2 permission-filtered captures), and platform (3
  platform captures). Review found historical duplicate cancelled Calculus rows from pre-idempotence
  seed runs, which are preserved as a named fixture-data defect; loading/empty/error-state review
  remains.
- ✅ `.github/workflows/quality.yml` now provisions PostgreSQL, applies migrations, and runs the
  server typecheck/tests; its TAP guard rejects unannotated skips. Web typecheck/tests are also
  blocking CI checks, while the visual check remains a non-blocking artifact.
- ✅ The seeded API now returns 41 staff and 403 students across the fixture's programs/sections;
  branding and the curriculum-version shape are also verified (five departments, four programs,
  one published version and three drafts).
- ✅ Seed code creates a fine, requests and approves a full waiver, and records the resulting waived
  invoice state; the local run completed this path.
- ✅ Seed code marks/submits one attendance register, applies a correction, and cancels another
  generated class when available; remaining browser/device validation is external.
- ✅ P0-0 invariant sweep passed 93/93 focused tests across curriculum freeze, archive refusal,
  suspended-tenant refusal, seat limits, and gapless receipts; no implemented schema/check gap was
  found. AD-17 delegation remains unimplemented with P1 approvals and is recorded as future scope.
- ✅ P0-1's remaining corrective-migration item is N/A: migration 036 and the wider RLS/GRANT audit
  are compliant, so applied migration history remains unchanged.
- ✅ P0-0 server-enforced geo-fence behavior and its negative/positive test matrix are recorded in
  `docs/checklists/P0-stabilise.md`; desktop punching is withdrawn and the phone-only parity
  exception is recorded in `MODULE_REGISTRY.md` and AD-83.
- ✅ Browser captures were reviewed and the historical duplicate-cancelled-class fixture defect was
  recorded; College Admin top-level (11), teacher (3 permission-filtered), student (2
  permission-filtered), and platform (3) captures passed. Loading/empty/error-state coverage
  remains open: the committed forced-state probes currently exit before the authenticated shell in
  the headless runner, so no state capture is claimed.

Updated 2026-09-13. Compact, repository-oriented. Details live in the files named here.

## TRACER

### SYSTEM STATUS
- Foundation (S1): ✅
- Identity & Authority (M1): ✅
- Academic Structure and Curriculum (M2): ✅
- Section, Offering, Instructor assignment (M3): ✅
- Teaching Delivery (M4): ✅
- Student Records (M5): ⚠️ minimum roster only; no admissions, no student accounts
- Attendance (M6): ✅ corrections by permission; approval workflow ❌
- Internal Assessment (M7): ✅ verify and correct by permission; approval workflow ❌
- Offline Outbox slice 1, idempotency (AD-58): ✅
- Offline Outbox slice 2, durable queue (AD-59): ✅ code, ✅ unit tests, ✅ Android real-device replay and conflict, 2026-09-13
- Android runtime: ✅ build, launch, API, Firebase, Crashlytics init, Remote Config, FCM registration and revocation (2026-09-13); push delivery 🔍 console, 🚫 backend (Drift 6)
- Platform Administration: ⚠️ PARTIAL. S1/S2 ✅; SA-1 ✅; SA-2 ✅; SA-3 ✅; SA-4a ✅; SAM-2b ✅, SAM-3 ✅ (all in the Super Admin app); SA-5 (impersonation) ❌
- Approvals capability (P1): ❌ not specified
- Mobile dashboard + light theme (MUX-1, AD-67): ✅ code, ✅ tests, ✅ APK builds; 🔍 visual check on the phone
- Dev database on Supabase (ENV-2, AD-68): ✅ rebuilt 2026-09-14 (all 24 migrations, tracked); `server/.env` points at Supabase; Owner `nirvokofficial@gmail.com` created there
- Web visual QA (2026-09-24): ✅ Playwright + Chromium installed as a `clients/web` dev dependency —
  this dev machine has no browser otherwise, so every prior web CSS/chart change had been unverified.
  The committed visual-check script now has seeded College Admin, teacher, student, and platform
  captures for the reachable top-level sections; loading/empty/error-state review remains open. The
  empty-database note was historical context from 2026-09-24.
- Dev server starts by itself (ENV-3, 2026-09-15): ✅ `scripts/dev-up.sh` (idempotent: starts `npm run dev` detached if `/health` is silent, then `adb reverse` when a phone is on USB; log `server/dev-server.log`), `scripts/dev-down.sh`; VS Code runs it on folder open and as `preLaunchTask` of both app launches (`.vscode/`). Owner asked for Supabase-as-backend instead; not done: it would move all server logic into Edge Functions (AD-68 / docs/11-decisions keep the Node API); production hosting stays for go-live. Tested: start / rerun / stop on a spare port. 🔍 NEEDS VALIDATION: auto-run on VS Code open (needs one-time "Allow automatic tasks") and adb reverse with a phone attached.
- College branding + college-code-first app (BR-1, AD-70): ✅ server, ✅ web, ✅ Flutter, ✅ tests, ✅ APK builds; 🔍 on the phone
- Operator password for platform accounts, dev only (OPS-1, AD-71): ✅; `owner@nirvok.com` set on local
- Super admin app, flavor `admin` (SAM-1, AD-72): ✅ sign-in with authenticator, colleges list and detail, add college; ✅ tests; ✅ both APKs build; 🔍 on the phone; SAM-2a ✅ suspend/reactivate/close/reissue; SAM-2b (plan, branding) and SAM-3 (audit, accounts) ❌
- API logs via Dio interceptor (LOG-1, AD-73): ✅ debug only, secrets masked, tested
- Real super admin account (OPS-2, AD-74): ✅ `nirvokofficial@gmail.com` Owner on local; `owner@nirvok.com` disabled; authenticator app kept
- College sign-in and invitation acceptance (WEB-1 web, ACC-1 mobile, AD-75): ✅ code, ✅ tests, ✅ end-to-end handover test; 🔍 on the phone and in a browser. WID-1 (2026-09-22): web college sign-in moved off password onto the OTP flow (AD-82), matching mobile — college code + email/mobile → six-digit code, `AuthSession.requestCollegeCode`/`verifyCollegeCode` against `/v1/auth/otp/*`. Platform (Super Admin) sign-in unchanged: password + authenticator (SA-3b) on both clients. ✅ tsc clean, ✅ 202 web tests pass, ✅ seen in headless Chrome, 🔍 not seen with a live server
- College Admin onboarding on the phone (ONB-1, AD-76): ✅ appoint teacher, admit student; ✅ tests; ✅ APK builds; 🔍 on the phone; student sign-in ❌ (ST-1)
- Dashboard sliver header and Profile (UX-2, AD-77): ✅ code, ✅ tests; 🔍 on the phone
- Biometric lock on every open (BIO-1, R59, AD-78): ✅ code, ✅ tests, ✅ both APKs build; 🔍 on the phone. Owner feedback fix (2026-09-22, feedbackchanges.md #3): `AppLockPreference.settled` — the phone was asked before the saved on/off choice had even loaded (optimistic default), so a person who turned the lock off could still be asked on the next cold open. `_lockWhenSignedIn` now waits for `settled` before asking anything; `AppLockLoading` is the safe placeholder shown meanwhile. ✅ 3 new tests, ✅ 316 total pass; 🔍 on the phone
- College Admin on the phone (ADM, R66, AD-79): ADM-1 ✅ admin dashboard and change password; ADM-2 ✅ campuses and departments (add, rename, archive); ADM-3 ✅ programs, academic years and terms; ADM-4 ✅ courses and curriculum versions; ADM-5 ✅ rooms; ADM-6 ✅ sections and members; ADM-7 ✅ course offerings, teachers, enrolments; ADM-8 ✅ timetable, classes, non-teaching days; ADM-9 ✅ students; ADM-10 ✅ access and college profile; ADM-11 ✅ registers and mark verification, corrections; ✅ tests; 🔍 on the phone. Every college module is on the phone (AD-81); Super Admin app SAM-2b ✅ plan, seats, branding; SAM-3 ✅ platform accounts, audit, invitation acceptance. Every module is on the phone
- Forgotten password (PW-1, R69, AD-80): ✅ reset codes from People (app) and from the Super Admin app; redeemed in the app and on the web; ✅ tests; 🔍 on the phone; web People has no reset button yet
- Firebase (R67, R68): Core, Crashlytics, Remote Config, Messaging built and initialised on Android; 🔍 first crash report and a console test push (owner); backend push 🚫 Drift 6
- Student sign-in and "My attendance" (ST-1, AD-69, R72): ✅ server, ✅ app, ✅ tests; 🔍 on the phone; fees (D1) and circulars (no module) ❌. Student timetable (2026-09-24): ✅ `GET /v1/me/timetable`
  (self-scoped, reuses `listSessions`/`SessionFilter.sectionId`, no new repository method; `whoAmI` now
  also returns `sectionId`), ✅ mobile `MyTimetableScreen` (grouped by date, cancelled classes struck
  through with reason, read-only — reuses the teacher's `ClassSession` model as-is), tile on student
  home. ✅ server 2 new tests (student-access.test.ts, 7/7 in that file; attendance/session/delivery/
  enrolment suites individually green, only the documented pre-existing zz-err6/zz-syldebug drift
  fails); ✅ Flutter analyze clean, full suite 329/329 (2 new). 🔍 NEEDS VALIDATION on the phone.
  Student marks self-scoped read: 🚫 not built — migration 017's own header reserves "publication to
  students, totals, grades and pass or fail" for M10, which OD-1 leaves open; building it now would
  pre-empt that undecided architecture rather than extend it. Needs OD-1 resolved first, or an explicit
  owner decision to expose marks ahead of M10.
- Owner feedback (feedbackchanges.md, 2026-09-22) #2/#4 — saved-first reads: `fromSaved` (AD-9 amended) already covered dashboard, schedule, my-fees, my-teaching, and both onboarding forms (REF-1, confirming #4 "appoint-teacher loads the whole page" was already fixed). Extended to the remaining list/reference screens that used to call the network on every open: academic, organisation, people, rooms, all 5 fee screens (heads, requests, structures, structure detail, student fees), sections, curriculum, students, and a section's course offerings — 13 more cubits. Every post-write reload and every pull-to-refresh across them now passes `refresh: true` explicitly (`onRefresh: cubit.load` tear-offs, which silently defaulted to the cache path, were the same bug in 4 fee screens; fixed). Deliberately excluded: attendance and mark-sheet marking (live, per-session data — caching it risks marking against a stale roster) and the timetable/offering/section/version/student *detail* screens (not yet migrated; a real follow-up slice, not urgent). ✅ analyze clean, ✅ 317 tests (1 new e2e), 🔍 NEEDS VALIDATION on the phone
- Owner feedback #1 — Fee module A-Z: plan `docs/plan-fee-a-to-z-2026-09-22.md`. FEE-7 online payment ✅ built 2026-09-22 with a **dummy gateway** (owner: "razorpay abhi k liye dummy kar lo") — migration 037 (`fee_online_intents`, `payments.method` gains 'online', `received_by` nullable exactly for it); server `POST /v1/me/fees/online`, `GET /v1/me/fees/online/:id`, and the dummy provider's own hosted checkout page + `complete`/`fail` routes standing in for a signed webhook (module doc §6 shape unchanged); mobile `MyFeesScreen` gets a "Pay ... online" button (`url_launcher` added). Swapping to real Razorpay later only touches the checkout-page rendering and the two provider routes. ✅ server 5 new tests (24/24 fees.test.ts pass), ✅ Flutter analyze clean, ✅ 318 tests (1 new), 🔍 not tried on a phone. **G1 (receipt/statement PDF) ✅ built 2026-09-23** — client-render only, no new server work beyond the receipt fields already denormalized onto `payments` (§10-adjacent); `FeeDocument` (`lib/features/fees/domain/fee_document.dart`) builds a receipt (per payment, CANCELLED banner when reversed) or a statement (full invoice/payment ledger, running balance) to PDF via `pdf`; `ReceiptButton`/`StatementAction` (`fee_document_actions.dart`) hand it to the OS view/print/share sheet via `printing`; wired into `StudentFeeScreen` (Cashier/Accountant) and `MyFeesScreen` (student). ✅ Flutter analyze clean, ✅ 320 tests (2 new: Cashier and student side), ✅ server fees.test.ts unaffected/passing (full suite's only 2 failures are pre-existing, unrelated `zz-err6`/`zz-syldebug` debug tests). 🔍 NEEDS VALIDATION: OS print/share sheet on a real phone (cannot be unit-tested). Committed `d78fd90`. **G2 (reports) ✅ built 2026-09-23** — 4 read-only reports against the existing ledger (`payments`, `payment_allocations`, `invoices`, `fee_requests`), no new tables: `GET /v1/fees/reports/{collection,outstanding,defaulters,requests-register}`, behind `fee.read`. Collection groups by day/cashier/method with a reversal as its own negative line, never netted; outstanding/defaulters share one query (net of partial payments, days overdue); register joins requester/decider names. Dates UTC-normalized throughout (`AT TIME ZONE 'UTC'` explicit in the collection query — this caught a real bug where the report returned nothing near local midnight, since DB session timezone ≠ UTC). Mobile: one `FeeReportsScreen`, 4 segmented tabs, each reads its own report only when selected; dashboard tile behind `fee.read` in both tile-grid layouts. Also fixed a pre-existing gap: `migration-invariants.test.ts`'s `EXPECTED_PRIVILEGES` was missing `fee_online_intents` (left over from FEE-7, 2026-09-22) — its migration already granted correctly, only the test's declaration was stale. ✅ server 3 new tests (27/27 fees.test.ts pass), ✅ Flutter analyze clean, ✅ 323 tests (3 new). Committed `1ccb820` (server), `54f9f48` (mobile). This completes the plan's G1/G2 queue. **Discovered, not fixed (out of scope for this slice):** the dev DB has drifted from `migrations/036_syllabus.sql` — the `syllabus` table has no RLS/GRANTs applied even though the migrations table shows it as applied, breaking `syllabus.test.ts` (11 tests) and 2 migration-invariants checks; unrelated to fees, needs its own slice (re-running `npm run migrate` reports "up to date", so this needs an actual DB-state investigation, not a migration edit). FEE-7 stays on the dummy gateway (Razorpay credentials still pending). Open decision OD-FEE-5 (fees on web) unchanged: not yet
- Examinations, Results (M10): 🚫 OD-1
- iOS validation: 🚫 Xcode not installed
- Backend push delivery: 🚫 Drift 6, tokens stored hash-only
- New design container language (ND, `docs/new-design/`): ✅ spec, ✅ S1 tokens, ✅ S2 containers, ✅ S5 admin dashboard, ✅ S6 mobile rollout in code: light theme ground is neutral-50, every screen's `ListTile` rows are card rows (`AppListTile`), dashboard panels are `AppCard`, attendance/marks rosters are one card. ✅ analyze clean, ✅ 313 tests (twice), ✅ dashboards and rooms checked in test screenshots; 🔍 NEEDS VALIDATION on the phone for every screen; ✅ ND-S4 `AppSheet`: forms (`showSubmitDialog`, organisation, academic) are bottom sheets on a phone and a centred dialog from 600dp, sheet/dialog radius 24; confirmations stay dialogs; the 8 hand-built bottom sheets only got the radius; ✅ ND-S7 web parity: `--nd-*` tokens named like the Flutter `AppGeometry`; every card surface (dashboard, tables, cohorts, panes, terms, campuses, days, register rows) is borderless with the soft ND shadow at radius 16; module tiles are rows; the drawer is a 480 side panel with the 24 radius; sign-in card 24; web tests 202 pass, typecheck and build pass, sign-in seen in headless Chrome, the signed-in screens not (they need a session); other web screens keep their own layouts and the dashboard's information architecture is unchanged (ND-O3); the outbox timing test `a write waits behind an earlier one` failed once in a full run and passed on rerun (not from ND, flaky)

### MASTER PLAN (2026-09-28)

Owner-directed re-audit: `docs/MASTER-PLAN.md`. Audit + coverage map + tickable execution plan,
extending `docs/blueprint/` rather than replacing it. Owner decisions taken in that session:
full parity on both surfaces (AD-81 reaffirmed → AD-84/AD-86), stabilise before any new domain.

Verified in that audit, needing action:
- ✅ **AD-83 geo-fence is enforced.** Migration 029 stores the campus fence and the admin UI
  configures it; the server checks phone coordinates for both punch directions, discards them after
  checking, and refuses missing/outside/fenceless punches. Physical-phone GPS verification remains
  an explicit P0-0 external blocker.
- ⚠️ Web has **no fee code at all** (mobile: 2,766 lines); calendar management is mobile-only.
  OD-FEE-5 resolved to yes by AD-86. → PAR-1, PAR-2.
- ✅ Web `PunchCard.tsx` retains read-only attendance status/history and explains that punching is
  phone-only; it no longer attempts a coordinate-free punch.
- D3 Admissions, D7 People/HR, D8 Campus Services, D9 Engagement: ❌ unbuilt. All four depend on
  notifications, scheduled jobs and document storage, which are ❌ → capabilities sequenced first.
- Proposed AD-84…AD-92, to be written into `adr.md` (P0-9). AD-91 (OD-1 default) needs the owner.

### BLUEPRINT COMPLETED (2026-09-28)

Every module and capability now has its own document, cross-linked from
`docs/blueprint/modules/README.md` (start there). Tickable build plan:
`docs/EXECUTION-CHECKLIST.md`, phases P0–P7 with exit gates.

New: M4 admissions, M8 coursework, M10 exams, M12 scholarships, M13 HR, M14 leave,
M15 payroll, M16 library, M17 hostel, M18 transport, M19 materials, M20 communication,
M21 cases, M22 events, M23 placements, M24 alumni, staff attendance, institutional
accounts; capabilities P1–P8 plus **P9 Scheduled Work** (new, AD-88 — every unbuilt
domain's automation needs it and the original P1–P8 list had no entry).

Two further open decisions raised while writing them:
- 🚫 **OD-ACC-1** — no general ledger exists and none is assigned a module number.
  M15 payroll and M19 payables have nowhere to post. Must be answered before either.
  Recommended: export to Tally + a thin budget/commitment ledger.
- ✅ **OD-LV-1 / AD-93 resolved** — "teachers and students apply" is two features. Staff leave
  draws a balance (M14); student excused absence is an attendance record (M7).

### BUILD PLAN (2026-09-28)

`docs/checklists/P0…P7` — **1,281 tasks across 189 slices**, task-level: migrations with their
tables and triggers, endpoints, screens per client, jobs, and the negative test each invariant
needs. `docs/EXECUTION-CHECKLIST.md` is the map and the gate list.

| Phase | Tasks | Gate |
|---|---|---|
| P0 stabilise | 151 | suite green on a seeded DB, fence resolved, drift root-caused, 4 decisions answered |
| P1 capabilities | 229 | real push on a real phone; job exactly-once; corrections on P1 |
| P2 admissions | 131 | applicant → enrolled student with an invoice, end to end |
| P3 examinations | 123 | a published result provably immutable; students see their own |
| P4 people and HR | 182 | leave never leaves a class unattended; nobody releases their own pay run |
| P5 engagement | 190 | a grievance unreadable to a College Admin who is not a party |
| P6 campus services | 155 | library, hostel and transport charges on one student ledger |
| P7 hardening | 120 | go-live gate |

**Correction to the 2026-09-28 audit:** `server/tests` holds **ten** `zz-*` debug files, not two —
nearly a quarter of the 46 server test files. Only `zz-err6` and `zz-syldebug` were documented as
red; the rest were never triaged. P0-2 covers all ten.

### CURRENT SLICE
Owner feedback, 2026-09-14 (`feedbackchanges.md`):
- FB-1 ✅ `151ec7c` People does not list the signed-in person. Flutter test.
- FB-2 ✅ `28a4060` Edit + archive for programs, academic years and terms (migration 027, applied
  to Supabase). Archive = removal (no DELETE by design); name/sequence freed for reuse. Rules: year
  dates must hold its terms; term dates fixed once a section uses it; current year / year with terms
  / anything a section uses cannot be archived; program code, department, length fixed. Server +7
  tests (incl. 403 for a teacher), Flutter +2. 🔍 NEEDS VALIDATION on the phone.
- FB-3 ✅ (2026-09-15) Sign out did nothing: Account is a pushed route and stayed above the sign-in
  screen, and sign-out waited up to 45 s for the server. Now both apps pop to home on SignedOut, the
  server revoke is not awaited, and every sign-out button (Account, No access, Super Admin colleges)
  asks "Sign out?" first (`core/widgets/confirm_sign_out.dart`; unsent writes still named). Lock-screen
  sign-out stays unconfirmed (it sits above the Navigator). Appoint teacher no longer shows an
  invitation code: "Appoint", then a message with the college code saying a sign-in code comes;
  dashboard says "N people have not signed in yet". Server still issues the unused invitation (OTP-5).
  Flutter 277/277 (+4). 🔍 NEEDS VALIDATION on the phone.
- FB-4 ✅ (2026-09-15) the sign-in code is six boxes in both apps (`core/widgets/otp_code_field.dart`:
  one invisible field over the boxes, so autofill/paste/backspace work); the last digit signs in, the
  button stays. Flutter 277/277 (sign-in test types into the boxes, checks one auto-submit).
  🔍 NEEDS VALIDATION on the phone (keyboard, SMS/email autofill).
- FB-5 ✅ (2026-09-15) a teacher's dashboard opens on the admin's two-column tile grid ("Your work":
  Schedule "N to mark", Courses "N courses", People/Organisation with person.read, Verify marks for a
  HoD, Onboarding when allowed, Profile), replacing the icon row; today's classes, week and courses
  stay below. One `_ModuleGrid` draws both dashboards and both skeletons. Admin tiles no longer
  mention passwords. Flutter 277/277. 🔍 NEEDS VALIDATION on the phone.

Owner requests, 2026-09-15 (in order of build):
- CAL-1 ✅ Academic calendar module: years, terms and holidays in one screen, managed by the College
  Admin (term.manage), read by everyone signed in to the college incl. students. Reuses
  `non_teaching_days` (AD-39/AD-46); no new table. Server ✅: `GET /v1/calendar?from&to` (college
  session only, no permission), `POST /v1/non-teaching-days` takes `to_date` (range ≤ 60 days, all or
  none, clashing day named). Flutter ✅ `features/calendar/`: month grid (holidays, term tint, today),
  "In <month>" and "Coming up" (a break of several days is one entry, with a countdown), terms; the
  College Admin adds a day or range and removes a whole break (confirmed). Tile on both dashboards,
  card on the student home. Server 468/468 (+6), Flutter 281/281 (+4). The Timetable's Holidays tab
  still edits the same rows (one source of truth; the tab may later just link here).
  🔍 NEEDS VALIDATION on the phone.
- CAL-2 ✅ (owner, 2026-09-15) the calendar is not tied to semesters, and carries events. Migration
  030 `calendar_events` (title, date, optional start/end time = full day when absent, note; removed is
  marked, never deleted; RLS; applied to Supabase). `POST|PATCH|DELETE /v1/calendar/events` (term.manage,
  audited `calendar.event_added|changed|removed`); `GET /v1/calendar` returns `events` (server still
  returns `periods`, the phone ignores them). An event does not close the day (classes still
  generated). Phone: term tint, term line and Terms list removed; events drawn as a dot, listed with
  "All day" or "11 AM – 2 PM"; "Add" sheet chooses Holiday or Event; tapping an event edits it.
  Server 475/475 (+4), Flutter 287/287.
- SET-1 ✅ Settings where the profile icon was (dashboard header, student home): Profile, App lock
  and Sign-in (informational: AD-78 lock always on, AD-82 codes), changes waiting to send, Sign out
  (confirmed). Flutter test +1. 🔍 NEEDS VALIDATION on the phone for both.
  - SET-1a ✅ (owner, 2026-09-15) the admin and teacher dashboards no longer keep their own Profile
    tile: Settings is the one door to it everywhere. `_profileTile` and its `_tileCount` entry
    removed from `dashboard_screen.dart`; dashboard test updated to assert the tile's absence.
    Flutter 288/288 (net +1 test file: `test/app/account_screen_test.dart`).
  - SET-1b ✅ (owner, 2026-09-15) Profile (`account_screen.dart`) no longer refreshes itself on
    every open, unlike the rest of AD-9 amended: it reads `/v1/auth/me` once, saves it (the existing
    saved-reads mechanism), and every later open answers from that — a pull to refresh is the one
    thing that asks again. The saved copy is cleared the same way every saved read is, at sign-in
    and sign-out (`SavedReads.clear`), so nothing of it survives a logout. New test:
    `test/app/account_screen_test.dart` (first open asks once, a second open does not, a pull does).
    🔍 NEEDS VALIDATION on the phone.
  - ONB-2 ✅ (owner, 2026-09-15) the Onboarding hub screen is gone: the admin and teacher dashboards
    show **Appoint a teacher** and **Onboard a student** as their own tiles (each present only with
    its own permission), opening `Routes.appointTeacher` / `Routes.admitStudent` directly.
    `onboarding_screen.dart` and `Routes.onboarding` removed; nothing else referenced them.
    Flutter 287/287 (the hub's own widget test removed, its permission-gating already covered by
    the dashboard tests). 🔍 NEEDS VALIDATION on the phone.
- Staff attendance (AD-83): SA-A1 ✅ campus attendance area: migration 029 (fence lat/long/radius on
  `campuses`, all three or none, radius 25–2000 m); `PATCH|DELETE /v1/campuses/:id/fence` (campus.manage,
  audited `campus.fence_set|cleared`; 0,0 and out-of-range refused); `GET /v1/campuses` returns
  `fence`. Flutter: Organisation → campus menu → "Attendance area" sheet ("Use my location" via
  `geolocator`, typed lat/long, radius slider, remove); list shows "Attendance area 200 m";
  `core/platform/current_location.dart` shared with punching; Android fine/coarse location, iOS
  when-in-use text. Server 471/471 (+3), Flutter 284/284 (+3). 🔍 NEEDS VALIDATION on the phone
  (real GPS fix, permission prompts). Migration 029 applied to Supabase 2026-09-15 (owner approved). SA-A2 ❌ punch
  in/out (online, server time, distance check, mock refused); SA-A3 ❌ my report with charts + admin
  view; SA-A4 ❌ forgotten punch → reason + time → admin approves/rejects; SA-A5 ❌ reminders as local
  notifications (backend push blocked, Drift 6).
- LV-1 ❌ Leave management for teachers and students (sick, short leave, half day; reason; apply →
  approve). OD-LV-1 / AD-93 ✅ resolved by the owner 2026-09-15: a
  teacher's leave is approved by their HoD (College Admin when there is none), a student's by their
  section's teacher; the College Admin can approve any; teachers have a yearly quota per type set by
  the admin (balance shown), students none; a student's approved leave pre-fills their classes as
  Excused on the register (teacher can still change it).
- AD-83 note: `institutions.timezone` already exists (default Asia/Kolkata); the college day and the
  late time use it, so AD-83's timezone assumption is not needed.
- OTP sign-in 🟡 AD-82 approved (everyone incl. Super Admin; no passwords; fixed code 123456 on every
  server until go-live, risk accepted by owner). Slices, in order:
  - OTP-1 ✅ `adf1fe5` server: `/v1/auth/otp/request|verify` (college: email, mobile, enrolment no.)
    and `/v1/auth/platform/otp/*`; 5-min single-use hashed codes, 5 tries, 5 requests / 15 min, decoy
    for unknown identifiers (no existence disclosure); invited → active on first code; sender port
    (fixed-code sender; unconfigured sender refuses all alike); startup warning. AD-62 superseded:
    guard, /auth/me, renewal and account actions no longer need an authenticator. Migration 028
    (applied to Supabase). Server 449/449 (+10 OTP tests, platform tests rewritten).
  - OTP-2 ✅ `77975e5` college app: identifier → code (Change, Send a new code); removed the
    invitation, student-activation and change-password screens/routes, Profile's Change password,
    People's Reset password; student "Give app access" confirms access, shows no code. Flutter 269/269.
  - OTP-3 ✅ `f3152d0` Super Admin app: email → code; password, authenticator setup and invitation
    form removed. Flutter 269/269.
  - 🔍 NEEDS VALIDATION on the phone: both apps sign in with 123456; a session renews.
  - OTP-4 ✅ `265e9be` students can be admitted with a mobile (server stores it on the person);
    admit form asks for a mobile or email; appoint form says the email/mobile is where the code
    goes. Server 450/450, Flutter 270/270. Runbook 09 steps 7, 8 and 13 describe code sign-in.
    Platform accounts have no phone column: the Super Admin signs in by email only.
    **Superseded by AD-85** (owner, 2026-09-15): a student's mobile-only path is retired; email is
    now mandatory at admission and is what the sign-in code goes to. Server: `admitBody.email`
    required (was optional); `admitStudent` takes a non-null `email`. The OTP-4 mobile-only test
    replaced with one asserting admission without an email is refused (422) and sign-in is by
    email. Every server test admitting a student without an email updated to give one
    (`enrolment.test.ts`, `attendance.test.ts`, `assessment.test.ts`, `idempotency.test.ts`,
    `student-access.test.ts`). Mobile stays as an optional extra contact field, still sent and
    stored, just not a sign-in path of its own for a student. Flutter: `StudentInput`/
    `studentFormError` require a valid email; `admit_student_screen.dart` asks for email before
    the now-optional mobile. Runbook 06 and 09 updated. Server 475/475, Flutter 288/288.
    🔍 NEEDS VALIDATION on the phone.
  - OTP-5 ❌ web console to codes; remove password endpoints; real WhatsApp / SMS senders.
  - OTP-7 ✅ `488d6b2` real email codes over SMTP (nodemailer; Gmail app password / Brevo / SES / Resend by
    config: `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`). With SMTP set, email (college + Super Admin) gets a
    random code, sent, and 123456 does not open it; WhatsApp/SMS have no provider (owner's decision
    2026-09-15) and keep the fixed code, nothing sent. No SMTP → every channel fixed, as before. Send
    failures logged without code/address; answer unchanged (no existence disclosure). Server 462/462
    (+5, `tests/otp-email.test.ts`). 🔍 NEEDS VALIDATION: a real email arriving via a real SMTP account.
  - OTP-6 ✅ `9b0199b` change a person's email or mobile: `PATCH /v1/people/:id/contact`
    (account.manage), from People and from a student's record. New address works at once, old one
    stops (staff sign-in name moves with the email; live codes cancelled); duplicates refused (mobile
    by last ten digits); an account keeps an email or mobile, staff keep an email; audited. People
    list and student records carry the mobile. Server 457/457 (+7), Flutter 273/273 (+3).
  - Docs ✅ runbook START-HERE, 01, 06 and 09 describe code sign-in; 04 (web console) still passwords
    until OTP-5.
- WEB-POLISH-1 ✅ (web dark-mode toggle + branded sign-in + token hygiene) `669c779`: the console
  now has a theme toggle in the header (persists via localStorage, follows the OS until a choice);
  a remembered theme applies from first paint (main.tsx init); sign-in is a token-driven split
  panel (indigo brand hero left, the existing form card right; hero hides under 720px); raw
  #6b7280/#fff in sign-in.css tokenised. 3 new theme tests. 192 passing; build clean. 🔍 browser.
- WEB-POLISH-2 ✅ (shared page-header hierarchy + per-screen eyebrows) `45c35cd`: page titles move to
  the display scale with an optional group eyebrow (People & access / Academic / College / Platform);
  .page__head gets a bottom rule; table rows highlight on :focus-within. All 12 pages adopt it.
  192 passing; build clean. 🔍 browser.
- WID-2 ✅ (web dashboard arrangement; owner asked why the web console "isn't arranged well, unlike
  mobile"; root cause: no web home landing — the shell landed on the first nav tab) `fd5e671`:
  the web console is now dashboard-first. Home is the first signed-in tab for a college person;
  `DashboardPage` mirrors the mobile dashboard — an admin stat band from `/v1/college/overview`
  (staff, students, departments, teaching setup, pending-invitations chip), a teacher week panel
  from `/me/sessions` + `/me/teaching` (today's classes, a week-ahead sequential-bar chart using
  the new data-viz palette, my courses), and a permission-gated module grid whose gate mirrors
  `sectionsFor()` exactly. `AppShell` exposes a `ShellNav` context so a tile switches the active
  tab without threading callbacks. Data-viz palette (sequential + diverging, light + dark) added
  to `design/tokens.css`. Wired in the pre-staged `motion-one.ts` by typing its bezier easing as a
  tuple and using motion 13's `EffectTransition`, so the whole `tsc` build is green. No server
  change. Web tests 189 (+7: module-grid gate contract, overview/courses/week read mapping);
  `tsc -b` + `vite build` clean. 🔍 NEEDS VALIDATION in a browser (sign in as College Admin and as a
  teacher; tiles switch sections).
- WEB-PREMIUM-1 ✅ (web left sidebar nav, owner asked to move modules to a side panel) `a515963`:
  the module list moves from centred top tabs to a left sidebar. `.shell` becomes a 252px/1fr grid;
  a sticky sidebar holds the brand header (gradient mark + product + scope) and grouped vertical nav
  ("Modules" for a college person, "Platform" for platform items) with inline 20px stroke icons and
  section eyebrows. Active item is never colour alone (§7.8): a 3px `--primary` accent bar + filled
  fill + number kbd all persist. Responsive: ≥1024px pinned sidebar; 720–1024px collapses to a 64px
  icon rail (labels hidden, aria-label kept); <720px becomes an off-canvas drawer toggled by a
  hamburger with a scrim. Number-key switching, `ShellNav` context and dashboard `.go()` tiles
  unchanged (they call `setActive`). `shell.css` gains `--surface-side` (chrome surface) and the
  drawer exit work. `tsc -b` clean.
- WEB-PREMIUM-2 ✅ (turn on the global motion system on the shared Drawer) `722fa38`: the shared
  Drawer now closes with a brief slide back out the edge it entered from instead of an instant
  unmount (its `leaving` state was declared but unwired; the exit keyframe didn't exist). Adds
  `m-slide-out-end`, the `.drawer--exit` CSS and the JS exit phase (slide out, then unmount).
  Reduced motion collapses it to a fade via motion.css's global override. The shell section entrance
  (head rises, body staggers) already shipped in WEB-PREMIUM-1's shell.css. A `reveal.ts` JS wrapper
  was proposed in the plan but skipped — the CSS already achieves the choreography on the global
  system; a wrapper would be over-engineering (§17). Build + tests green.
- WEB-PREMIUM-3 ✅ (premium colour & depth tokens) `6bc186e`: adds `--gradient-primary`(indigo→violet)
  and `--chrome-gradient`(whisper tint) in light + both dark blocks, and defines `--shadow-elevate`
  in light too (the sidebar already referenced it but it only elevated in dark). Sidebar brand mark
  renders the gradient token; the rail layers the chrome tint over its solid surface; the dashboard
  hero figure gets a gradient text fill guarded by `@supports` (falls back to solid primary). Now no
  raw `linear-gradient` lives in components — gradients come from tokens. Build green; 192 passing
  (only known pre-existing `motion.test.ts` jsdom `node:` failure remains). 🔍 NEEDS VALIDATION in a
  browser: sidebar + motion + gradients in both themes at all breakpoints.
- WEB-POLISH-3 ✅ (sidebar items visible again + collapse/expand toggle) `afff5c6`: owner hit the
  real page and reported (a) sidebar modules not showing and (b) no way to collapse/expand. Root
  cause of (a): college module items had no `icon`/`section`, so the width-driven 64px rail showed
  only blank squares. Fixed: every college item now carries `MODULE_ICONS.*` + `section:'Modules'`.
  Root cause of (b): a 1024px breakpoint auto-collapsed the sidebar with no control. Replaced with
  an explicit persisted chevron toggle (localStorage `shell:collapsed`); the full sidebar keeps
  labels at all desktop widths; only a deliberate toggle or a ≤768px off-canvas drawer hides them.
  Active accent uses `--gradient-primary`. Build green; 192 tests pass.
- WEB-POLISH-4 ✅ (web: one premium light theme; dark toggle removed) `14831da`: owner asked to drop
  the light/dark concept and ship one premium light look. Deletes the theme system (theme.ts + test),
  the toggle, sun/moon icons and the main.tsx remembered-theme init; strips both dark token blocks so
  the palette is always light regardless of OS; base.css forces `color-scheme: light`. Palette reworked
  premium: white cards on a soft blue-violet canvas (#f5f6fb), cooler rails, deep indigo-black text
  (#1b1c2b), indigo-tinted shadows. Build green; 189 tests.
- WEB-POLISH-5 ✅ (web: always-visible collapse toggle, sidebar motion, tighter type) `7d28f02`:
  owner reported the collapse toggle wasn't discoverable, the sidebar felt unanimated and the type
  oversized. Collapse control moved from the sidebar footer into the top bar (always visible on
  desktop); small screens keep the off-canvas drawer and hide the redundant control. Sidebar mounts
  with the global stagger (`m-stagger`), and collapsing animates the grid columns (`--dur-panel`)
  instead of snap-jumping. Type scale reined in: display 32→28, headline 24→20, title-lg 20→17,
  title 16→15, label 14→13 (body stays 14). Build green; 189 tests.
- 🚫 GO-LIVE BLOCKER (AD-82): no WhatsApp/SMS senders; `OTP_FIXED_CODE=123456` lets anyone who knows
  a mobile number sign in as that person (and anyone, by email too, when SMTP is unset). Must be
  removed before any real college uses the system.

From `feedbackchanges.md` (owner, 2026-09-15), building in order: LK-1 → CR-1 → REF-1 → FEE-0…FEE-8.
- LK-1 ✅ (2026-09-15) App lock off/on in Settings (default on). Amends AD-78 ("always on").
  `AppLockPreference` (`ValueNotifier<bool>`, `core/security/app_lock_preference.dart`) backed by a
  new `SessionStore` key (`app_lock_enabled`, default true when absent); `SessionStore.clear()`
  deletes it too, so OD-LK-1 (sign-out puts it back on) holds even across a restart. `app.dart`
  wraps `AppLockGate` in a `ValueListenableBuilder` and skips it entirely when off; the `SignedOut`
  event also calls `resetOnSignOut()` so the in-memory value flips at once, not just on next read.
  Settings' static "App lock" row is now a `SwitchListTile`: turning it off asks the phone's own
  check first (`DeviceUnlock.unlock`) since disabling the lock must sit behind the lock it removes;
  turning it back on needs no check; a phone with no lock (`isAvailable() == false`) turns off
  without asking, consistent with AppLockGate's own "no lock, no lock-out" rule. Found and fixed:
  the preference's constructor read the store asynchronously and could silently overwrite an
  explicit disable()/resetOnSignOut() that happened first — fixed with a `_settled` latch so the
  first explicit value wins. Scope: the college app only; the Super Admin app's lock stays always-on
  (no Settings surface exists there to add a switch to). Flutter 292/292 (+5: `AppLockPreference`
  unit tests, two Settings widget tests for the switch). `flutter analyze` clean.
  🔍 NEEDS VALIDATION on the phone (the biometric prompt on toggle, and that a phone with a broken
  keystore still degrades to "on" rather than crashing).
- CR-1a ✅ (2026-09-15) the behaviour change, on the screens AD-9's saved-first mechanism already
  covers: dashboard, my teaching, my schedule, student home ("My attendance"), the academic
  calendar, and Profile (already done as SET-1b). Each `load({refresh})` used to show the saved
  answer and then quietly ask the network anyway; now it asks only when nothing was saved, on an
  explicit refresh (pull, or a caller passing `refresh: true` after its own write), or never for a
  plain saved-only open. Student home and the calendar had no `refresh` parameter at all (`load()`
  always hit the network); both gained one, and their `RefreshIndicator`s now pass `refresh: true`.
  Fixed while at it: `saved_reads_test.dart`'s two "a screen" tests were asserting the very
  behaviour just removed (a background refresh after a saved hit, and a plain open failing when
  offline) — rewritten to assert CR-1's rule instead. Flutter 292/292, `flutter analyze` clean.
  🔍 NEEDS VALIDATION on the phone.
- CR-1b ✅ (2026-09-15) OD-CR-1's "Updated 2 h ago" freshness line. `ApiClient.savedAt(path)`
  reads a saved entry's timestamp without touching the network; `SavedFreshness`
  (`core/widgets/saved_freshness.dart`) is the shared "Updated …" widget, `freshnessLabel` its pure
  formatter (just now / N m / N h / yesterday / N d / a date), unit-tested directly. Each of the 5
  single-read screens gained a `lastSaved`-style method on its repository (`myTeachingSavedAt`,
  `mySessionsSavedAt`, `readSavedAt`, `myAttendanceSavedAt`, `mineSavedAt` on `AuthorityApi`) and an
  `updatedAt` field on its state, set after every successful read (saved-hit or live) and shown at
  the top of the list. Every fake implementing these interfaces across the test suite updated to
  match (additive methods only, no existing signature changed). The dashboard is excluded on
  purpose: it combines three concurrent reads (sessions, teaching, overview) with no single
  freshness to show honestly; giving it one needs its own design, not a bolt-on. Flutter 294/294
  (+1: `saved_freshness_test.dart`), `flutter analyze` clean. 🔍 NEEDS VALIDATION on the phone.
- CR-1c ❌ NOT BUILT — OF-R2 (the back-office screens: people, organisation, students, sections,
  offerings, rooms, timetable, access, college profile, review lists, platform screens) currently
  have no saved-reads wiring at all, not even the old background-refresh version; giving them CR-1's
  behaviour means building AD-9's saved-first mechanism into each for the first time, not just
  changing one line in an existing `load()`. Larger than CR-1a; its own slice.
- REF-1 ✅ (2026-09-15) Appoint a teacher and Onboard a student, the two forms the owner named,
  stop reloading their picker (departments / programs) on every visit. Scope narrowed from the
  original sketch: no new `GET /v1/reference` aggregate endpoint. The existing per-resource
  endpoints (`/v1/departments`, `/v1/programs`, …) already run through `ApiClient.get`, which
  already saves every read (AD-9); a combined endpoint would need its own cross-module read model
  (institution + curriculum + teaching + delivery, like `PgCollegeOverviewReader`) and its own
  per-field permission logic, since departments need `person.read` and programs need a different
  permission — real cost for no gain when CR-1's own mechanism already solves the actual complaint.
  `AppointTeacherCubit.load`/`AdmitStudentCubit.load` gained a `refresh` parameter and the CR-1
  saved-first pattern; a failed refresh keeps the form and its list, showing the inline warning
  instead of replacing the screen. Both screens wrapped in `RefreshIndicator`. New test in
  `saved_reads_test.dart` (opens on saved departments, only a pull asks again). Flutter 293/293,
  `flutter analyze` clean. 🔍 NEEDS VALIDATION on the phone.
  NOT in this slice: campuses, rooms, academic years/terms and sections, and every other picker
  across the back-office screens — same CR-1c / OF-R2 boundary as before, since those screens have
  no saved-reads wiring at all yet.
- FEE (M11 Student Finance, D6). Pulled forward from Release two (docs/requirements.md D1).
  Online-only (AD-9: desk roles). Owner decisions 2026-09-15 (record as ADRs in FEE-0):
  - OD-FEE-1 ✅ two new college roles (migration seeding them like 002): **Accountant** (fee heads,
    structures, invoices, fines, concession/waiver requests, reports) and **Cashier** (record
    counter payments, issue/cancel receipts only). College Admin appoints them; approves requests.
  - OD-FEE-3 ✅ one structure per program + academic year; no category/quota in v1.
  - OD-FEE-4 ✅ concessions: Accountant requests, College Admin approves/rejects; only an approved
    one reduces dues. Fee-owned request state machine (requested → approved | rejected |
    withdrawn), audited; not a general approvals engine (P1 stays unspecified).
  - Late fee ✅ optional flat amount per structure, charged once an instalment is overdue.
  - Fines ✅ Accountant raises a fine on a student (amount, reason). Late fees and fines can be
    waived through the same request → Admin approval; a waiver is a credit entry, never a delete.
  - OD-FEE-2 ✅ design decided, build 🚫 BLOCKED (no Razorpay merchant account / API keys yet,
    owner 2026-09-15): paid in a web page, not in-app billing — the app opens the payment page in
    the browser (`url_launcher`); server creates the Razorpay order/payment link; the payment counts
    only on the signed webhook (server verifies), which records payment + receipt; the app
    refreshes on return. Assumption: Razorpay Payment Links (hosted page) unless the owner wants
    our own checkout page. FEE-7 stays a ❌ NOT BUILT TODO until the owner has the keys; every other
    slice does not depend on it (counter payments cover collection without it).
  Slices:
  - FEE-0 ✅ (2026-09-15) module contract, no code:
    `docs/blueprint/modules/m11-student-finance.md` — roles, ledger invariants (append-only,
    integer paise, gapless per-college receipt numbers, a mistake is a reversal), fee structure
    scope, the shared concession/waiver/fine approval state machine, and the FEE-7 payment design.
    FEE-1 builds directly on it.
  - FEE-1 ✅ (2026-09-15) roles, fee heads, fee structures. Migration 031: permissions
    (`fee.read`, `fee.manage`, `fee.collect`, `fee.approve`); **Accountant** and **Cashier** system
    role templates seeded the same way `college_admin`/`department_head`/`faculty` were (002);
    `college_admin` granted every `fee.*` permission (same move as 014 did for `student.*`);
    `fee_heads`, `fee_structures` (draft/published/superseded/discarded, one live per
    program+year), `fee_structure_instalments` (seq, due date, optional flat late fee),
    `fee_structure_lines` (head × amount within an instalment) — the same tenant-isolation RLS and
    no-DELETE pattern as every other tenant-owned table. Server: `modules/fees/` (ports,
    `manage-fees.ts`, Pg repositories, `fee-routes.ts`); `GET/POST /v1/fees/heads`,
    `DELETE /v1/fees/heads/:id`, `GET/POST /v1/fees/structures`, `GET /v1/fees/structures/:id`,
    `POST .../instalments`, `POST /v1/fees/instalments/:id/lines`,
    `POST /v1/fees/structures/:id/publish` (refuses with no instalments, or an instalment with no
    lines; irreversible once complete — same shape as curriculum's `publishVersion`). No invoices,
    payments or money yet — FEE-2 and FEE-4. Server 478/478 (+3 in `tests/fees.test.ts`: an
    Accountant manages heads and a duplicate code is refused, a Cashier reads but cannot manage
    and a teacher can do neither, a draft is refused an incomplete publish then published once
    complete and is immutable after). `npm run typecheck` clean.
  - FEE-2 ✅ (2026-09-15) invoices generated from a published structure. Migration 032:
    `invoices` (student × instalment, unique so regenerating never duplicates; `due`/`paid`/
    `cancelled`; UPDATE allowed unlike the append-only ledger proper, since FEE-4's payments and
    receipts are the actual money ledger and an invoice is only a receivable — same reasoning as
    `fee_structures` itself and `curriculum_versions`). `POST /v1/fees/structures/:id/invoices`
    (`fee.manage`) invoices every currently *enrolled* student of the structure's program — v1's
    scope is program + year only (§4), so it does not filter by year-of-study — one invoice per
    student per instalment, amount summed from that instalment's lines; idempotent (`{generated,
    skipped}`), so a later admission is picked up by running it again without touching existing
    invoices. Refuses a draft structure (422). `GET /v1/fees/structures/:id/invoices` and
    `GET /v1/fees/students/:id/invoices` (`fee.read`, so a Cashier reads but cannot generate).
    Server 481/481 (+3 in `tests/fees.test.ts`). `npm run typecheck` clean.
  - FEE-3 ✅ (2026-09-15) concession requests + College Admin approval. Migration 033:
    `fee_requests` (`kind` 'concession' now, 'waiver' from FEE-5 reusing the same table and state
    machine per the module doc §5; requested → approved | rejected | withdrawn; a decision writes
    `decided_by`/`decided_at` once, checked by constraint; at most one open request per invoice —
    `fee_requests_one_open_uq`). `POST /v1/fees/concessions` (`fee.manage`: Accountant or College
    Admin) refuses one over the invoice's remaining amount (422) or a second open request on the
    same invoice (409). `POST /v1/fees/requests/:id/{approve,reject}` needs `fee.approve` —
    **the College Admin alone**, not the Accountant who requested it, even though `college_admin`
    also holds `fee.manage`; an approval reduces the invoice's `amount_paise`
    (`InvoiceRepository.reduceAmount`, guarded by `status='due' AND amount_paise >= reduction` so a
    stale request can't push it negative) and is irreversible; a rejection leaves the invoice
    untouched. `POST /v1/fees/requests/:id/withdraw` (the Accountant, only their own, only while
    `requested`) frees the invoice for a new request. `GET /v1/fees/requests` (`fee.read`,
    optional `student_id`/`status` filter). Server 484/484 (+3). `npm run typecheck` clean.
  - FEE-4 ✅ (2026-09-15) counter payments, allocation, receipts — the actual money ledger the
    module doc's §3 invariants are about. Migration 034: `payments` (INSERT+SELECT only, no
    UPDATE grant at all — the same enforcement as `audit_events`; `kind` 'payment' or 'reversal',
    a reversal names what it reverses and why, amount always positive so a stray SUM never nets
    two rows that were never meant to cancel out); `payment_allocations` (append-only, how a
    payment or its reversal splits across invoices); `receipts` (status issued/cancelled, never
    deleted, number never reissued); `fee_receipt_counters` (one gapless `bigint` sequence per
    college, a number taken only when `POST /v1/fees/payments` actually issues a receipt, via one
    `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` that serializes concurrent Cashiers on that
    row). `recordPayment` allocates oldest-due-first (`InvoiceRepository.listDueByStudent`),
    marking an invoice `paid` only once fully covered — partial payments are accepted and simply
    leave it `due`; refuses (422) a student with nothing due, or an amount over their total current
    dues (v1 boundary: no advance/credit balance concept yet). `cancelPayment` inserts a reversal
    mirroring the original's allocations (never edits or deletes the original), moves any invoice
    the payment had fully paid back to `due`, and flips the receipt to `cancelled` — its number is
    never reused, a fresh payment gets the next one. `fee.collect` (Cashier or College Admin, not
    the Accountant) records and cancels; `fee.read` lists. Server 487/487 (+3 in `tests/fees.test.ts`:
    oldest-first allocation across a partial then a completing payment with gapless receipt numbers,
    cancelling reverses and un-pays without touching the receipt row and the next payment still gets
    the next number, an Accountant cannot collect and a teacher cannot even read). `npm run
    typecheck` clean. Flutter UI followed once FEE-1..5 were all in place — see below.
  - FEE-5 ✅ (2026-09-15) fines, late fees, and waiving either. Migration 035 generalises
    `invoices` to carry a `kind` ('instalment' | 'fine' | 'late_fee'), makes `fee_structure_id`/
    `instalment_id` nullable, adds `reason`, and replaces the old (student, instalment) uniqueness
    with one index per kind so an instalment and its late fee can share an `instalment_id` without
    colliding; also relaxes `amount_paise` from `> 0` to `>= 0` (found while testing: a full
    waiver/concession reducing an invoice to nothing owed hit the old constraint with a raw 500).
    `POST /v1/fees/students/:id/fines` (`fee.manage`) charges a fine directly — no approval to
    *raise* one, only to waive it (module doc §5). `POST /v1/fees/instalments/:id/late-fees`
    charges the instalment's flat late fee on every student still owing past its due date,
    idempotent like `generateInvoices`; refuses one not yet overdue or with no late fee configured.
    **v1 boundary, recorded rather than solved**: this codebase has no scheduler, so a late fee is
    triggered by the Accountant, not applied automatically at midnight. `POST /v1/fees/waivers`
    reuses FEE-3's `fee_requests` with `kind='waiver'`, restricted to a `fine`/`late_fee` invoice
    (an instalment takes a concession instead, 422) and always for the *whole* charge — no partial
    waiver in v1; approving now marks the invoice `paid` once it reaches exactly zero (also fixed
    generically for concessions, so a 100% concession does the same). Server 492/492 (+5). `npm run
    typecheck` clean. The dev/test databases needed a real rebuild for the relaxed CHECK
    constraint to take effect (`dropdb`/`createdb` + `npm run db:bootstrap`, since `migrate()`
    tracks applied filenames, not content) — noted here in case a similar edit-an-applied-migration
    situation recurs before this reaches Supabase.
  - Fee-scoped student search ✅ (2026-09-15): `GET /v1/fees/students?q=` (`fee.read`) — neither
    Cashier nor Accountant holds `student.read`, so recording a payment or raising a fine had no
    way to find who it was for. Returns only id/name/enrolment number/program. Server 493/493 (+1).
  - **Flutter, Accountant/Cashier screens ✅ (2026-09-15)**, owner asked for mobile alongside the
    server (`lib/features/fees/`): `FeesRepository`/`FeesApi` cover every FEE-1..5 endpoint plus the
    student search. `FeeHeadsScreen` (`fee.manage` adds/archives). `FeeStructuresScreen` → create a
    draft for a program + year, `FeeStructureDetailScreen` composes it (instalments, fees, optional
    late fee), publishes it (irreversible, fixed after), generates invoices, charges an overdue
    instalment's late fee. `FeeRequestsScreen` — `fee.approve` (College Admin, never the requesting
    Accountant) decides concessions and waivers. `FeeStudentSearchScreen` (the fee-scoped search
    above) → `StudentFeeScreen`: dues, invoices, payments; `fee.collect` records a payment
    (server allocates oldest-due-first) and cancels one; `fee.manage` raises a fine and requests a
    concession (an instalment) or a waiver (a fine/late fee). Dashboard tiles in both
    `_AdminModules` and `_TeacherModules` (Accountant/Cashier aren't `institution.manage`, so they
    land in the "your work" grid, which already hosts every non-admin permission-gated tile):
    **Fee heads** (`fee.manage`), **Fee structures** (`fee.read`), **Concessions & waivers**
    (`fee.approve` or `fee.manage`), **Student fees** (`fee.collect` or `fee.manage`) — a Cashier
    sees only the last; an Accountant sees all four. `FakeFeesRepository`
    (`test/features/fees/fee_test_support.dart`) implements the whole interface once, faithfully
    enough to allocate a payment oldest-due-first itself, for every fee screen's test to share.
    Flutter 311/311 (+18), `flutter analyze` clean.
  - FEE-6 ⚠️ PARTIAL, corrected 2026-09-22 (was stated ❌, verified against the repository):
    student's own dues/invoices/payments view is ✅ built (`GET /v1/me/fees`, `MyFeesCubit`,
    `MyFeesScreen`, saved-first). Receipt/statement PDF (view/print/share; new `pdf`/`printing`
    packages, mobile only) is ❌ NOT BUILT — planned as G1 in `docs/plan-fee-a-to-z-2026-09-22.md`.
    FEE-7 🚫 BLOCKED — Razorpay web payment + webhook, TODO until the owner supplies a merchant
    account and API keys. FEE-8 ❌ reports (daily collection by cashier/mode, outstanding,
    defaulters, concession/waiver register), server + mobile — does not need FEE-7; planned as G2
    in `docs/plan-fee-a-to-z-2026-09-22.md`. Full A-to-Z plan, with an open decision on whether fees
    ever reach the web console (OD-FEE-5): `docs/plan-fee-a-to-z-2026-09-22.md`.

Saved reads first (AD-9 amended 2026-09-14, owner's decision): every mobile screen opens on the data
it last received and refreshes in the background; writes unchanged.

OF-R1 ✅ (2026-09-14) the mechanism, and the screens opened first.
- `lib/core/saved_reads/`: its own encrypted Drift file (`saved_reads.sqlite`, AD-59 handling via
  the now-shared `openEncryptedDatabase`, own key `saved_reads_key`); one row per account + read;
  cleared at every sign-in and sign-out (a generation counter drops a late write from before).
- `ApiClient.get` saves every successful read's `data`; inside `fromSaved(...)` answers from the
  phone only (a miss throws `NotSaved`, ending that pass quietly); 403/404 drops the entry, offline
  keeps it. `saveAs:` names date-window reads (`/v1/me/sessions?days=N`) so a new day still hits.
- Saved-first: dashboard, my schedule, my teaching, student home, and `/v1/auth/me` (so the shell
  opens at once; a failed refresh keeps the saved permissions, the server still enforces). College
  and Super Admin apps both wired. `fromSaved` declines when no store exists (open failed, fakes).
- Tests: 11 new (store, encryption at rest, ApiClient save/replay/miss/refusal/scope/window, a
  screen saved → fresh, offline stays on saved). Flutter 268/268. 🔍 NEEDS VALIDATION on the phone.

NOT IN OF-R1, next in order:
- OF-R2: the remaining back-office screens (people, organisation, academic, curriculum, sections,
  offerings, students, rooms, timetable, access, college profile, review lists, platform screens):
  the same two-line `load` each.
- OF-R1b: open fully offline. Today a launch waits for renewal (AD-25) and nothing is shown until
  the network answers; showing saved data while renewal retries needs the actor kept on the phone
  and changes AD-25's "wait" — record as an AD-25 amendment first.
- OF-R3: attendance and mark sheets. A background refresh must never overwrite marks being typed;
  needs its own design against the outbox (§7.2 roster cache).
- A "Saved 2 h ago" freshness line (design system §7.6).

Just done (2026-09-14): UX-3 ✅ skeletons match the real layouts. A skeleton kit
(`lib/core/widgets/skeleton.dart`: one shimmer clock per screen, ListTile-true rows with the real
leading/trailing, filters, tabs, detail header, day/cohort cards, register rows at 40-pt targets,
forms) replaces the one avatar-row list every screen used. The dashboard draws its real navy header
(college name and logo) with placeholder numbers, then the admin tile grid or the teacher's
shortcuts/today/week/courses in place. All 31 loading states mapped. Flutter 257/257 (13 new:
every preset at 320 wide, one "Loading" announcement, tap-target sizes, admin and teacher dashboard
while loading). 🔍 NEEDS VALIDATION: seen on the phone.

Fixed on the phone test (2026-09-14): college users were signed out ~15 minutes after sign-in
("Your session has ended"). Not the design (AD-25 sliding 30-day renewal is intact): the same
Supabase cause as 025. `auth_resolve_refresh_token` and `auth_revoke_token_family` (005) are
SECURITY DEFINER, owned by the migrator; `refresh_tokens` forces row-level security, so without
BYPASSRLS they saw only platform rows. The first renewal of every college session failed, and
sign-out/replay revoked nothing. Migration 026 adds `migrator_resolves` (SELECT) and
`migrator_revokes` (UPDATE) policies; applied to Supabase. New session test removes the migrator's
BYPASSRLS and proves renew + sign-out (failed with 401 before 026, passes after). Server 432/432.
🔍 NEEDS VALIDATION: a college user on the phone still signed in after 15+ minutes.
Session length (2026-09-14, user request): refresh window 30 → 365 days, still sliding (AD-25
amended): anyone who opens the app within a year of last use never signs in again. Sign-out,
suspension, deactivation and replay still end a session. Applies to platform sessions too.
UX (2026-09-14, user request): "Add program" on the phone opens as a bottom sheet instead of a
dialog (drag handle, lifts above the keyboard, full-width Cancel / Add program). Same fields,
validation and cubit call. Widget test asserts the sheet; Flutter 244/244. Other add forms
(year, term, department) are still dialogs; not changed.
Follow-up (not this slice): `platform_audit_events` (020/022) is migrator-owned SECURITY DEFINER over
forced-RLS `audit_events`; on Supabase it likely misses platform events that carry a college.

Earlier (2026-09-14): adding a college on Supabase failed with "using all 0 of its
seats". The seat check (023) runs as its owner, the migrator; `institutions` forces row-level
security with only `app_role_only`; on Supabase the migrator has no BYPASSRLS (locally it does, so
tests passed), so the check saw no college. Migration 025 adds a read-only `migrator_reads` policy;
applied to Supabase and confirmed. The Super Admin app's add-college form now has a Seats field
(default 500). Server 431/431, Flutter 244/244, admin APK rebuilt and installed on the phone.

Just done (2026-09-14): ST-1 ✅ (AD-69, R72; `688696b`). Students on the phone. Server: `POST
/v1/students/:id/access` issues a one-time code (12 characters, 7 days; a reset for an active student,
24 hours), creating the student's account on first issue (a seat); `POST /v1/auth/student-activate`
redeems it only with that student's enrolment number; `/auth/me` carries `student`; `GET
/v1/me/attendance` counts submitted registers only (`identity/application/student-access.ts`,
`enrolment/infrastructure/student-self.ts`, `tests/student-access.test.ts`). App: Students → a student
→ "App access code" (message to print or send); sign-in → "Student? Activate your account"; a
student's home is "My attendance" by course with a 75% warning (`lib/features/student/`). Tested:
server 431/431 plus the new 4 (435 in the next full run), Flutter 244/244, analyze clean, both APKs
build. Not tested: on the phone.

Also (2026-09-14): the runbook, `docs/runbook/` (prerequisites, database, server, web console,
mobile apps, first college end to end, tests and builds, troubleshooting), asked for by the owner;
the root README points to it. Found and fixed: `server/.env.example` held a real Supabase database
URL with its password since `ff0f91d` (not on any remote branch in this clone). The file now holds a
placeholder; the password stays in local history, so the owner should reset the Supabase database
password before pushing.

Just done (2026-09-14): SAM-3 ✅ (AD-72, AD-81; `c549779`). The Super Admin app now has "Platform accounts"
(list; Owners invite Owner or Support and hand over a one-time code; an account's screen offers only
the server's actions: disable, enable, change role pinned to the role shown, reset authenticator,
new invitation, each with a reason; nothing on your own account; refusals such as "the platform must
always keep an active Owner" stay in the form) and "Platform audit" (newest first, by college,
pages by cursor, before and after in a sheet). Its sign-in has "I have an invitation", which sets
the password and goes straight to setting up the authenticator, so no platform person needs the
web. `lib/admin/platform/`. No server change. With this, every module is on the phone (AD-81).
Tested: Flutter full suite, analyze clean, admin APK builds. Not tested: on the phone.

Just done (2026-09-14): SAM-2b ✅ (AD-72, AD-81; `258940a`). The Super Admin app's college detail changes the
plan label and seat limit (a reason required, recorded in the platform audit; only what changed is
sent; a warning when the limit is below the seats in use) and the college's branding (name, logo
link with a preview, colour, the same checks as the college's own profile), both pinned to the
version on screen and showing the server's updated college. Hidden for closed colleges and without
`platform.colleges.manage`. No server change. Tested: Flutter 237/237, analyze clean, admin APK
builds. Not tested: on the phone.

Just done (2026-09-14): ADM-11 ✅ (AD-81; `4cee78c`). Review on the phone (`lib/features/review/`, a repository of
its own so the teacher's offline-queued repositories and their fakes stay as they are):
"Registers" shows a day's classes across the college with each register's state and counts, and a
submitted register opens for correcting one student's mark with a reason (`attendance.correct`);
"Verify marks" lists submitted (or verified) mark sheets within reach, verifies one pinned to the
version read (`assessment.verify`) and corrects a closed sheet's result with a reason, the score
checked against the maximum (`assessment.correct`). The dashboard's "coming next" note is gone:
every college module is now on the phone. No server change. Tested: Flutter 234/234, analyze
clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-10 ✅ (AD-81; `d558b20`). Access on the phone (`lib/features/access/`): People →
a person → "Manage access" lists their roles and scopes (needs `audit.read`, as the list is the
college's assignments); with `role.assign`, give a college-wide role not already held or a
department role in a chosen department, and remove one with a reason; the server's refusals (own
access, last administrator) stay in the form. The sheet's "managed from the web console" line is
gone. "College profile" (`lib/features/college/college_profile.dart`): name, logo link with a
preview, colour, the web's checks (AD-70), saved pinned to the version read; the app's header shows
the new brand when the college is next opened. No server change. Tested: Flutter 232/232, analyze
clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-9 ✅ (AD-81; `e956717`). "Students" on the phone (`lib/features/students/`): the
list opens on enrolled students; search, status, program and "not in a section" filters are the
server's (`/v1/students?…`, first 200); "Admit student" reuses the ONB-1 form; a student's screen
shows the record, "Change status" (reason required for on leave and withdrawn; a warning that
withdrawn and graduated end section and course places) and the section history, named when
sections can be read. `student.read` / `student.manage`. No server change. Tested: Flutter
227/227, analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-8 ✅ (AD-81; `4103271`). The timetable on the phone (`lib/features/timetable/`):
a course's screen has "Weekly timetable" (add a slot: day, start, end, room; remove it) and
"Generate the term's classes", which previews first (classes, skipped non-teaching days) and
refuses on clashes, listing them; a "Timetable" screen shows the college's classes a week at a
time (move: date, times, room kept unless changed, reason; cancel with a reason) and non-teaching
days (add, remove). `session.read` / `session.manage` / `term.manage`. `ClassSession` now carries
`room_id`, so moving a class keeps its room (the server treats a missing room as none). No server
change. Tested: Flutter 224/224, analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-7 ✅ (AD-81; `080a2fa`; the owner again: "sub kuch phone pe bhi hoga, everything").
Course offerings on the phone (`lib/features/offerings/`), inside a section's screen ("Courses
taught": add a course as lecture, lab or tutorial) and on their own screen: the server's
transitions ("Start teaching" disabled with the reason until a teacher is assigned and the section
is active; cancel needs a reason), teachers (assign from staff as lead, co or assistant; end with a
reason), roster (enrol the whole section in one step, choose students of the section, drop with a
reason). `offering.manage`, `instructor.assign`, `enrolment.manage`. No server change. Tested:
Flutter 219/219, analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-6 ✅ (AD-81; `a35dd2f`). "Sections" on the phone (`lib/features/sections/`): the
term that contains today by default (or all terms); add a section (program, academic term, term of
the program, next free label suggested, capacity); a section's screen shows the server's allowed
transitions as buttons (cancel needs a reason; refusals such as enrolled students stay in the form),
capacity, and members: `enrolment.manage` adds unplaced enrolled students of the program (search,
choose several) and takes a student out with a reason. `section.read` to see (with `person.read` for
programs), `section.manage` to change, `student.read` for members. No server change. Answers
OD-MOB-2 for cohort sections. Tested: Flutter 216/216, analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-5 ✅ (AD-81; `6650b8f`). "Rooms" on the phone (`lib/features/rooms/`): rooms by
campus with type, seats and timetable use; add (campus, permanent code sent in capitals, name,
type, seats), edit (name, type, seats), archive with a warning when the timetable uses it and
the server's refusal kept in the form. Read with `session.read`, write with `room.manage`;
campuses read only for managers. Dashboard tile "Rooms". No server change. Tested: Flutter full
suite (one unrelated failure in one run, none on two reruns: the known SQLCipher flake under
load), analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-4 ✅ (AD-81; `5746d1e`). "Curriculum" on the phone (`lib/features/curriculum/`):
Regulations (one program at a time; new draft with this year and the program's term count by
default; version screen term by term: add course with credits and core/elective/audit, remove,
publish with the empty-term warning; published versions offer "New version": revision or new
regulation year, with a reason) and Courses (search, add with a permanent code, rename).
`department.manage`; read with `person.read`. Shared `lib/core/widgets/submit_dialog.dart`
(`showSubmitDialog`, `invalidInput`) and `ApiClient.delete`. No server change.
- Found and fixed: dialogs disposed their text controllers while still closing (crash on
  the exit animation). The shared dialog now owns and disposes them; the Super Admin app's
  "Reset an administrator's password" (PW-1) moved onto it and keeps a server refusal in the form.
- Tested: Flutter full suite, analyze clean, both APKs build. Not tested: on the phone.

Just done (2026-09-14): AD-81 recorded (owner: "all modules for phone too"; OD-MOB-1 resolved) and
ADM-3 ✅ (`3f0b740`): "Academic setup" on the phone (`lib/features/academic/`), Programs tab (by department; add
with department, code, award, duration, semesters/annual; archive) and Calendar tab (years with
terms; add year June–May by default, add the next term by default); `department.manage` /
`term.manage`; calendar read only with `section.read`. Dashboard tile "Academic setup". No server
change. Tested: Flutter 206/206 (found and fixed a crash sorting a constant list when the calendar
is not readable), analyze clean, APK builds. Not tested: on the phone.

Just done (2026-09-14): ADM-2 ✅ and PW-1 ✅ (AD-79, AD-80; R69, R70; `2f6852b`).
- ADM-2: Organisation on the phone adds campuses (FAB), opens every campus (even empty) to add
  departments, renames and archives with a reason; each action only with `campus.manage` /
  `department.manage`; server refusals shown on the field. `lib/features/organisation/`,
  `ApiClient.patch`. People and Organisation now receive `ManageArgs` (authority, college).
- PW-1 (OD-PW-1 → option a): `identity/application/password-reset.ts`; `accept-invitation.ts`
  redeems reset codes (ends sessions, lifts lockout, refuses shut accounts). App: People sheet →
  "Reset password" / "Send a new invitation" → one-time message; sign-in "Forgot password?"; Super
  Admin app college detail → "Reset an administrator's password". Web accept page takes reset codes.
- Tested: server 427/427 (`password-reset.test.ts` 6), web 195/195, Flutter all pass, analyze
  clean, both APKs build. Not tested: on the phone; web People reset button not built.

Just done (2026-09-14): ADM-1 ✅ (AD-79; R65, R66; `a74d340`). The owner found the College Admin's dashboard
was a teacher's, and no way to change a password.
- Server: `GET /v1/college/overview` (counts under RLS, `institution.read`;
  `modules/institution/infrastructure/overview.ts`) and `POST /v1/auth/password`
  (`identity/application/change-password.ts`; ends every session, audited). Tests
  `college-overview.test.ts`, `change-password.test.ts`.
- App: an admin (`institution.manage`) sees the college's numbers in the header, a pill for
  unaccepted invitations, and "Manage your college" (Onboarding, People, Organisation, Profile);
  teaching parts only if they teach. Profile → Change password (`lib/features/account/`).
- Tested: server 421/421, Flutter 193/193 (the SQLCipher smoke test failed once under load and
  passed on rerun), analyze clean. Not tested: on the phone; web change password not built.
- Inbox absorbed: Firebase Crashlytics and "all Firebase things" as R67, R68 (already built; console
  checks remain for the owner).

Just done (2026-09-14): ENV-2 ✅. The owner ran the rebuild: Supabase now holds all 24 migrations,
tracked. Its last step failed with 28P01 because Supabase's pooler keeps a role's old password for a
while after bootstrap re-sets it; finished by hand (new migrator password, logins retried, `.env`
switched with `LOCAL_*` kept, `BOOTSTRAP_DATABASE_URL` left empty so `npm run migrate` no longer
re-sets passwords). The rebuild now retries through that delay. Supabase has no colleges yet; the
Owner signs in there with the same password and sets up a new authenticator (a new account).

Before that, BIO-1 ✅ (AD-78, R59; `1de03b6`). Both apps ask for the phone's fingerprint, face or
screen lock when opened on a saved session and on every return from the background (not right
after typing the password); `lib/core/security/`. `local_auth` 3.0.2; `MainActivity` is a
`FlutterFragmentActivity`; `USE_BIOMETRIC` declared.

Before that, UX-2 ✅ (AD-77; R60, R61, R64; `47ace6c`). The dashboard's header is a collapsing navy
sliver app bar after the prototype's attendance screen (college, teaching-record ring, your week,
waiting pill); no greeting or personal details on the dashboard; Profile shows name, sign-in email,
college and roles, read from `/v1/auth/me`, which now returns the person's own name and login.
The owner's inbox (6 items) is absorbed as R59–R64 and the inbox cleared.

Before that, ONB-1 ✅ (AD-76, R58; `09e79c2`) — the college app's dashboard has "Onboarding" for the
College Admin: appoint a teacher (name, email, department, Faculty or Head of Department → one
invitation message to copy) and onboard a student (name, enrolment number, program, admission date).
Same endpoints as the web; no server change. A new college needs departments and programs first,
still added on the web; the forms say so.

Before that, the college flow, end to end (AD-75, R55–R57; `0e19d41`).
- **SAM-2a:** the Super Admin app suspends, reactivates and closes a college (reason; close needs
  the code typed; version-pinned), and reissues an administrator's invitation. The invitation
  screen says who it is for, offers one message to copy, and warns it is not an authenticator key
  (the owner had entered it into Google Authenticator).
- **WEB-1:** the web console signs in college accounts by default and has `/accept-invite`; the
  platform sign-in sits behind a link until AD-72 retires it.
- **ACC-1:** the college app's sign-in has "I have an invitation".
- **Proved end to end** (`server/tests/e2e-college-handover.test.ts`): create with the super admin
  as temporary admin → accept → set up → invite the real admin → real admin accepts and revokes the
  temporary one (who loses access) → suspend (sessions stop, lookup 404) → reactivate → close.
- No deletion, by the owner's choice; handover via a temporary administrator; nothing emailed.

Earlier today: OPS-2 ✅ (`f9303c0`) — `npm run platform:create-owner` and `platform:disable-account`
(dev only, exact phrase, audited as the system). Used on local: Owner `nirvokofficial@gmail.com`
created (authenticator set up at first sign-in), `owner@nirvok.com` disabled (AD-74).
Before that: SAM-1 ✅ (`4474abd`) and LOG-1 ✅ (`ff0f91d`). ENV-2 🟡 still awaits the owner's rebuild.
- **SAM-1 (R52, AD-72):** `lib/main_admin.dart` + `lib/admin/`, Android flavor `admin`
  (`com.nirvok.collegeErp.admin`, "Super Admin", no Firebase). Platform sign-in (password → code,
  or authenticator setup by key), colleges list with totals, college detail (seats, administrator,
  branding), add college with a one-time invitation screen (code + token, copyable). Server
  unchanged. Web platform console kept until SAM-2/SAM-3 reach parity, then retired.
- **LOG-1 (R53, AD-73):** `CustomLogInterceptor` on `ApiClient`'s own Dio, debug
  non-production only; authorization is masked and passwords, tokens, keys and platform auth
  codes are redacted.

Earlier, 2026-09-13: BR-1 ✅ (`817eb5e`) and OPS-1 ✅ (`5c98d42`). ENV-2 🟡 below still awaits the owner's rebuild.
- **BR-1 (R51, AD-70, migration 024):** the app opens on the college code
  (`lib/features/auth/presentation/college_code_screen.dart`); `GET /v1/public/colleges/:code`
  returns name, logo URL and colour, one identical 404 for unknown/suspended/closed; sign-in and the
  dashboard show the college's logo and name; its colour becomes the accent only at 4.5:1 with
  white. Set by the platform (provisioning, college drawer "Branding") and the College Admin (web
  "College" page, `/v1/college/profile`), version-pinned, audited `institution.branding_changed`.
- **OPS-1 (AD-71):** `npm run platform:set-password` (dev only, policy-checked, audited, password
  from the environment, authenticator untouched). Used for `owner@nirvok.com` on local.

ENV-2 ✅ (2026-09-14) — Supabase as the development and app-testing database (R49, AD-68; tooling `5772603`). Node API unchanged;
production stays on our own Node + PostgreSQL; `npm test` stays on local `college_erp_test`.
- Found 2026-09-13: Supabase reachable through its pooler; its `public` schema is untracked (no
  `schema_migrations`, 022's table missing), 39 empty tables plus 3 seeded role definitions.
  Backup of that data and inventory: session scratchpad `supabase-backup-2026-09-13/`.
- Built: `npm run db:supabase:rebuild -- --confirm "REBUILD <ref>"`
  (`server/scripts/supabase-dev-rebuild.ts`, helpers `src/infrastructure/db/supabase-dev.ts`).
  Refuses in production, without the phrase, or if any table holds non-seed data; clears public,
  provisions roles, migrates, checks the app role connects, rewrites `server/.env` (`LOCAL_*` kept).
- Done 2026-09-14 by the owner, finished as described under CURRENT SLICE. `server/.env` now names
  Supabase for the app and migrator roles; local values are `LOCAL_*` for switching back.
- Test data on Supabase: none yet. `seed:device-test` still holds local credentials in
  `.device-test.local.json`; move it aside before seeding Supabase.

Previous: MUX-1 ✅ DONE (R48, AD-67, commit `649a45b`): the mobile home is a dashboard in the prototype's
style (`assets/*.jpeg`); bottom navigation removed; light theme only.
- `lib/features/dashboard/`: greeting, headline numbers, the class now and next, a "waiting on you"
  card for unmarked classes, a four-week teaching-record ring, a week-ahead bar chart, courses.
- Charts are native (`lib/core/widgets/charts.dart`), with screen-reader labels; no new package.
- Schedule, courses, people, organisation and account are pushed routes, each shown only with its
  permission. The offline banner moved to `MaterialApp.builder` so it shows over every route.
- No server change: `/me/sessions` and `/me/teaching` only. Earlier: SA-4a (`05a34d3`); the owner
  ran `023_seat_limits.sql` on Supabase (2026-09-13), which the rebuild re-applies, tracked.

### Owner feedback, 2026-09-24 (feedbackchanges.md)
- WID-2 ✅ web sign-in/second-factor code field is now six boxes over one invisible input
  (`OtpField`, `clients/web/src/components/index.tsx`), matching mobile's `otp_code_field.dart`;
  sixth digit auto-submits. Wired into both `SignInPage.tsx` code steps. tsc clean, 202/202 web
  tests pass. Committed `ab07f9a`.
- Module visibility by permission ("jiske pass access nahi wo module nahi dikhega"): mobile ✅
  confirmed already correct — `dashboard_screen.dart`'s `_AdminModules`/`_TeacherModules` gate every
  tile with `if (authority.can('...'))` (~15 tiles); Academic calendar is the one unconditional tile,
  by design. **Web was wrong** — first assessed "already fine" here, which was an error found later
  the same day: web's sidebar/dashboard gated whole-college tiles (People, Sections, Students,
  Timetable, the Attendance overview...) on the flat permission set, but most of those routes require
  the permission at institution scope exactly (`institutionScope()`), which a department/section-
  scoped grant — any teacher's — does not satisfy. A teacher (sonam@gmail.com) saw the tile, opened
  it, and got "You do not have access to do that." ✅ Fixed same day — see below.
- Timetable for everyone ("sub k pass"): ⚠️ PARTIAL. Teachers already have a "Schedule" tile
  (`session.read` → `/me/sessions`, instructor-assignment based). Students have no timetable/schedule
  view at all — `/me/sessions` only returns classes where the caller teaches, so a student-scoped
  equivalent (their enrolled section's slots/sessions) does not exist server- or client-side yet.
  Needs its own small slice: a self-scoped `GET /v1/me/timetable`-style read (enrolment → section →
  slots/sessions, mirroring the `/me/sessions` self-scope pattern) plus a tile on
  `student_home_screen.dart`. Not started.
- Teacher/student "apna attendance dekh payen" (own attendance): student side ✅ already built
  (ST-1). Teacher side ✅ **SA-ATT-1 built 2026-09-24** — owner decision (OD-STAFF-ATT-1 resolved):
  self-service punch in/out, not marked by HoD/Admin. Migration 038 `staff_attendance` (one row per
  person per day, unique on tenant+person+work_date, immutable INSERT+SELECT+UPDATE only — a punch is
  never deleted, only closed). Server: `POST /v1/me/staff-attendance/punch-in`, `POST
  /v1/me/staff-attendance/punch-out`, `GET /v1/me/staff-attendance?from&to` (self-scoped, no
  permission, mirrors `/v1/me/sessions`; distinct from the student's `/v1/me/attendance` and from a
  teacher marking a class roster). Refuses a double punch-in and a punch-out with nothing open.
  Mobile: `lib/features/staff_attendance/` (API, cubit, screen) — a "My attendance" tile on both
  admin and teacher dashboards, one button that reads "Punch in" / "Punch out" / "Done for today",
  history below. ✅ server 3 new tests (39/39 attendance.test.ts, 509/523 full suite — 14 failures are
  the pre-existing syllabus/debug drift, unrelated), ✅ Flutter analyze clean, 327/327 tests (2 new).
  Seeded 60 days of realistic history for `sonam@gmail.com` (weekday, ~92% present) so the UI is not
  empty. 🔍 NEEDS VALIDATION on the phone. Committed `5c33971`. Owner feedback 2026-09-24 ("punchin
  punchout dashboard pe hoga"): `PunchCard` (web) / `punch_card.dart` (mobile) now sit at the top of
  the dashboard itself, self-scoped, same tier as week/courses; Profile keeps only the history list.
  Owner also confirmed "my attendance" should exist for everyone (already true: self-scoped, no
  permission) and asked whether a teacher can mark their own students' attendance — that's a distinct,
  already-built capability (M6, `AttendanceScreen`/`Routes.attendance`, opened from a class session),
  not part of SA-ATT-1; no gap found. ✅ web tsc clean, 203/203 tests; ✅ Flutter analyze clean,
  dashboard_test.dart 17/17. Committed `109eada`. Owner feedback 2026-09-24 (round 2): confirmed
  punch-out already has no time restriction anywhere (self-scoped, no permission, server allows it any
  time the day is still open) — no change needed. Dashboard punch button made compact on both clients.
  Punch record now has a visual form: an hours-worked bar chart, oldest-to-newest over the last 7
  recorded days, reusing the existing chart pattern (`.dash__chart` on web, `core/widgets/charts.dart`
  `BarChart` on mobile) — no new charting dependency. Web: Profile's attendance history; mobile: the
  full "My attendance" screen. ✅ web tsc clean, 203/203; ✅ Flutter analyze clean, dashboard_test.dart
  17/17, staff_attendance_test.dart 2/2. Committed `0ffe3c4`. Owner feedback 2026-09-24 (round 3): "sari
  details profile se hata k dashboard pe" — web's `PunchCard` now owns the whole attendance record
  (status, button, hours chart, recent history); Profile dropped its attendance section and the
  `/v1/me/staff-attendance` read entirely. Mobile already had this split right (dashboard punch card +
  a separate "My attendance" screen, nothing on Account/Profile), so only web changed. ✅ tsc clean,
  203/203 tests. Committed `4175a21`. Owner feedback 2026-09-24 (round 4): "animated graph k through...
  smoothly", plus a "smart donut chart" for the month — days present, absent, on holiday, remaining.
  Web `PunchCard`: hours-worked bars now grow in (CSS `height` transition, not a snap); new `MonthDonut`
  — hand-drawn SVG ring (animated `stroke-dasharray` per arc, no charting library), classifying every
  day of the current month using the existing self-scoped `GET /v1/calendar` (CAL-1/CAL-2) for
  holidays, no new endpoint. Mobile: `staff_attendance/domain/month_counts.dart` (shared classification:
  present = a punch exists; absent = a past working day with none, incl. today until punched in;
  holiday = academic calendar; remaining = future) + `presentation/month_donut.dart` drawing it with
  the existing `RingChart` (`core/widgets/charts.dart`, already animated) and a count legend, wired into
  the full "My attendance" screen (dashboard's punch card stays the compact link to it, unchanged).
  ✅ web tsc clean, 203/203; ✅ Flutter analyze clean, full suite 327/327 (staff_attendance_test.dart
  updated with a fake CalendarRepository). Committed `5b464bb`. Owner feedback 2026-09-24 (round 5):
  "aise time mat dikhao" (the raw "2026-09-10: 9:20 – 18:28" list) — the chart should be the whole
  record, covering the whole month, not the last 7 days. Web `HoursChart`/mobile `_HoursChart` redrawn
  one bar per day of the current month (labels thin to every 5th day + day 1 + today, today
  highlighted); exact times moved to the web bar's hover title/accessible name; mobile's "Recent days"
  raw list removed outright. Then a UI/UX pass (ui-ux-pro-max skill): the punch/attendance block was
  three loose pieces in the page flow, unlike the dashboard's own card language (`.dash__band`); it is
  now one `.dash__band` ("Attendance") with "This month"/"Hours worked" as h3 subheads (same pattern as
  TeacherPanel), a real loading skeleton instead of rendering nothing, 8px donut-legend spacing, and
  `role="alert"` on the punch error — no new colors, every value an existing token. ✅ web tsc clean,
  203/203; ✅ Flutter analyze clean, full suite 327/327. Committed `31313b9`, `704ebcc`. Owner feedback 2026-09-24 (round 6, web-only): polish the donut's
  interactivity without changing its data or layout — hovering an arc (or its linked legend row) now
  thickens it, dims the rest, swaps the centre readout to that segment, and opens a small tooltip
  (name, value, %, "of N days in <Month>") anchored to the arc's midpoint on the ring, computed from the
  same cumulative-angle math already drawing the arcs. Every value an existing token; reduced-motion
  respected. ✅ tsc clean, 203/203 tests. Committed `a4cb823`. Owner feedback 2026-09-24 (round 7): donut moved below the hours chart instead of
  beside it (`.dash__punch-detail` one column now, chart first); mobile app forced to 12-hour time
  everywhere (`app.dart` MaterialApp `builder` wraps the tree in
  `MediaQuery(...copyWith(alwaysUse24HourFormat: false))`, covering `TimeOfDay.format`/`showTimePicker`
  app-wide, not just the hand-rolled `_time()` helpers already used for punch times). ✅ web tsc clean,
  203/203; ✅ Flutter analyze clean, full suite 327/327. Committed `fe5d393`. Owner feedback 2026-09-24 (round 8, web-only): the hours-vs-date chart should give
  every precise detail in one glance. The native `title` tooltip is now a floating tooltip matching the
  donut's (date, exact hours, punch in-out times, or "No punch"/"Not reached yet"), anchored above the
  hovered bar; the hovered bar highlights and the rest dim; every bar is keyboard-focusable with its own
  accessible name (not mouse-only). No new colors. ✅ tsc clean, 203/203 tests. Committed `fabf2bb`. Owner feedback 2026-09-24 (round 9, web-only): shared reference images (glowing
  gradient curve chart; sculpted 3D-look donut) and asked for that visual quality; confirmed via
  AskUserQuestion to keep the app's existing light theme/tokens rather than a dark theme for just these
  charts. `HoursChart` is now a smooth gradient curve (Catmull-Rom-to-Bezier through each day's hours,
  blue→teal stroke via `--info`/`--primary`/`--success`, soft glow, fading area fill) replacing the
  ~30-bar chart; hover tooltip/accessible labels unchanged in behavior. `MonthDonut` got a subtle
  top-left gloss and per-arc drop-shadow for a lightly sculpted ring; data/layout/tooltip unchanged. No
  new colors — reused tokens throughout (including `--primary`'s RGB the same way `--chrome-gradient`
  already does). Removed now-dead `--month` bar-chart CSS. ✅ tsc clean, 203/203 tests. Committed
  `0c20002`. Owner feedback 2026-09-24 (round 10, web-only): shared a bar+line combo reference with
  value labels at standout points, asked for "is type ka bar chart". Added translucent bars behind the
  curve (same per-day scale as the line) and a direct amber-marked label on the month's best day
  ("8.5h"), so the standout figure reads without hovering. Found and fixed a real bug while doing this:
  the SVG's `preserveAspectRatio="none"` non-uniformly stretches everything drawn inside it, so the
  existing hover/today dot circles were actually rendering as ellipses (and any text would squash) —
  moved every dot and the new peak label out of the SVG into percentage-positioned HTML (same technique
  the tooltip already used), leaving only paths/rects (curve, area, bars) in SVG since those have no
  circular/text symmetry to break. ✅ tsc clean, 203/203 tests. Committed `9d737e2`. Owner feedback 2026-09-24 (round 11, web-only): "donut chart jaisa screenshot diya
  tha waisa hi chahiye" — the earlier subtle gloss wasn't enough; needed the actual extruded-3D-puck
  shape from the reference. Each segment now has a small rounded gap from its neighbours and is drawn
  twice (a darkened `brightness(0.72)`-filtered "side" copy 3.5px lower, behind a true-colour "top"
  copy), thicker ring (20px), still every existing token — no new colors, light theme kept per the
  earlier decision. Data/hover/tooltip/legend unchanged. ✅ tsc clean, 203/203 tests. Committed
  `0d8d6cf`. Owner feedback 2026-09-24 (round 12, web-only): reverted both. "Hours worked chart me se
  wo line jo rope jaisi hai wo hata do, side me hours marker hongey aur neeche date" — HoursChart is
  back to a plain bar chart (the `--month` variant CSS restored), plus a 3-tick hour axis (0/half/max)
  down the left; hover tooltip unchanged. "Donut chart 2D me hi karo par accha se" — reverted the
  extruded-puck treatment (no gap, no darkened side layer, back to touching butt-cap segments), kept
  the gloss highlight and per-arc shadow so it stays polished-looking, just flat. ✅ tsc clean, 203/203
  tests. Committed `d419503`. Owner feedback 2026-09-24 (round 13, web-only): shared an ascending-glowing-bars
  reference, confirmed no line on top — just bars, hour/date axes as the indicators (already in place).
  Hours-chart bars (`.dash__chart--month`, scoped so the plain week-ahead chart is untouched) now use a
  vertical gradient (`--viz-seq-4` → `--primary`) with a soft glow (box-shadow on `--primary`'s RGB, same
  technique `--chrome-gradient` already uses); today's/hovered bar glow brighter. No new colors, no
  structural change. ✅ tsc clean, 203/203 tests. Committed `18311f2`. Owner feedback 2026-09-24 (round 14, web-only): "waisa hi kar do" pushed toward an
  exact match of the dark-background reference — flagged the conflict (AD-67 "light only," the
  light/dark toggle was removed app-wide, no dark CSS exists anywhere in the web client) via
  AskUserQuestion; owner confirmed: stay light, push the glow further instead. Bars now use a 3-stop
  gradient (`--viz-seq-5` → `--viz-seq-4` → `--primary`, brightest at the tip) with a bright tip
  highlight and a stronger two-layer glow shadow; today's/hovered bar glows further still. Still every
  value an existing token or documented token-RGB (the `--chrome-gradient` technique) — no new colours,
  AD-67 intact. ✅ tsc clean, 203/203 tests. Committed `4e2ed87`. Owner feedback 2026-09-24 (round 15, web-only): "chart stylish nahi lag raha,
  indicators sahi se nahi lage" — every prior round of chart CSS had been written blind, no browser
  available in this sandbox. Installed Playwright + Chromium as a clients/web dev dependency (owner
  approved) and rendered the actual card for the first time (a static preview: real base.css/
  components.css/dashboard.css loaded directly against sample month data, screenshotted with
  Playwright — not the full signed-in app, since the dev DB currently has 0 persons/institutions to
  sign in as). Found and fixed a real bug: the hour axis and the bar plot were two independently-sized
  boxes that only approximately matched height, so "0h" landed nowhere near the bars' baseline.
  Restructured into one CSS grid with axis+plot sharing identical padding-top/height math (pixel-
  aligned), added dashed gridlines at the three ticks, moved date labels to their own row under the
  plot only (previously double-counted, contributing to the misalignment), gave empty days a 3px stub
  instead of literally nothing (matching the mobile app's own BarChart convention), and widened the
  tooltip's reserved headroom 52px→64px after seeing it graze the tallest bars. Screenshot-verified
  before and after. ✅ tsc clean, 203/203 tests. Committed `226a579`. Owner feedback 2026-09-24 (round 16, web-only): fixed 0/4/8/12h axis (was
  rescaling to the busiest day) and "donut chart ko smart karo" — centre now defaults to the
  attendance rate (present ÷ days reached so far) instead of a raw present count, plus a status chip
  below the legend (On track/Watch this/Needs attention at 90%/75%, existing `StatusChip` component).
  Screenshot-verified with the same Playwright setup. ✅ tsc clean, 203/203 tests. Committed `c8f5d17`.
  Owner feedback 2026-09-24 (round 17): "donut chart ko center me kar do aur indicators uske side me kar
  do" — `.dash__donut` is a centered row now (ring, then legend+status) instead of a left-leaning
  column; falls back to a centered column under 420px. Screenshot-verified. ✅ tsc clean, 203/203 tests.
  Committed `b0193af`. 🔍 NEEDS VALIDATION on the phone and against the real signed-in app in a browser (every preview so far
  used sample data, not live app state — the dev DB was empty at that time; it now has a seeded
  signed-in admin fixture).
- "Your roles" said "Faculty for a department" with no department name (owner: "exact kis department
  me hai... sub cheez"). ✅ Fixed 2026-09-24 — `/v1/auth/me` resolves each assignment's `scope_ref_id`
  to a real name (department/section/program/campus, one lookup per distinct id) and returns
  `scope_name`; both clients show it in place of the generic scope-type label. The existing "Your
  teaching" section (subjects/classes/department per offering, from `/v1/me/teaching`) already covers
  "subjects kya hain, classes kaun c hain" — unchanged, just confirmed still correct.
- Web sidebar/dashboard showed tiles a person could not open (owner: "jis cheez ka access hi nahi hai
  wo module dikhao hi mat karo"). ✅ Fixed 2026-09-24 — `/v1/auth/me` now also returns
  `institution_permissions` (`institutionPermissionKeys`, `domain/authority.ts`): the subset of a
  person's permissions actually held at institution scope, distinct from the flat `permissions` set
  which includes narrower department/section grants that most whole-college list routes refuse.
  `sectionsFor()` (App.tsx) and `buildTiles()` (DashboardPage.tsx, reused by ProfilePage) gate People,
  Organisation, Curriculum, College, Teaching, Students, Timetable and the Attendance overview on
  `institution_permissions` instead; `assessment.verify` stays on the flat set since the server
  already narrows the verification queue to the reader's own cohort (correctly designed, not
  affected). Also added punch in/out to web Profile (mobile had it from SA-ATT-1, web didn't). ✅ tsc
  clean, 203/203 web tests pass (+2 new); server 15/15 people.test.ts (+2 new asserting a
  department-scoped grant is excluded from `institution_permissions` while the granting admin's is
  included); full suite 509/523 (pre-existing syllabus/debug drift, unrelated). Committed `be16e09`.
  **Not yet audited**: whether any other web page (beyond the ones this pass covered) calls a route
  requiring `institutionScope()` while being reachable by a department/section-scoped role; this pass
  fixed every tile currently in `sectionsFor()`/`buildTiles()`, not a from-scratch audit of every route.

### NEXT SLICE — validate on the phone, end to end (runbook 06)
- **Why next:** every module is built and unit-tested but none has been opened on a real phone since
  ADM-1, and since then skeletons (UX-3), saved reads (OF-R1), calendar/program edit and archive
  (FB-2) and sign-in by code (OTP-1…4, OTP-6) were all built without a device. One pass of
  `docs/runbook/06-first-college.md` against a running server, both apps, signing in with code
  123456, records what works and what breaks before more is built.
- **Then:** timetable ✅ done 2026-09-24; marks stays 🚫 (needs OD-1/M10 resolved first — see the ST-1
  line above). Fees (D1) and circulars need their modules specified first. OD-AD72-1 (retire the web
  platform console) awaits the owner.

### LATER — ST-1 detail
- **Why next:** the owner asked to complete the app from the prototype, and all three prototype
  screens (attendance %, fees, circulars) are student surfaces. Attendance data already exists
  (M6); only the student role, the account and a self-scoped read are missing. Fees (D1) and
  circulars (no module) come later. Drift 6 stays ready and unblocked.
- **To build:** the student's account linked to the M5 student; `GET /me/attendance` summarised
  per subject; the prototype's attendance screen and a student dashboard.
- **Decided (AD-69):** College Admin onboards one person at a time (no bulk); a student activates
  with college code + enrolment number + a one-time code (hash-only, expiring, printable), then a
  password; each student account takes a seat. Teachers keep the email invitation.
- **Not blocked:** trying it on Supabase after ENV-2 is preferred, but ST-1 does not depend on it.
- **After ST-1:** SAM-2b (plan, seats, branding in the admin app), then SAM-3 (audit, accounts), then
  the web platform console retires (AD-72).

### OPEN DECISIONS (relevant)
| ID | Question | Why it matters | Affects | Options | Status |
|---|---|---|---|---|---|
| OD-SA-1 | What does "suspended" mean for a college's users? | Live sessions end or turn read-only | SA-1 | — | ✅ Resolved as AD-60: refused entirely |
| OD-SA-3 | Second factor for platform accounts | — | SA-3 | — | ✅ Resolved as AD-62: TOTP authenticator app |
| OD-SA-5 | How the server stores a secret it must read back | — | SA-3b | — | ✅ Resolved as AD-63 |
| OD-SA-4 | What a seat is | — | SA-4 | — | ✅ Resolved as AD-65 |
| OD-ENV-1 | Which database is development's source of truth | — | Development | — | ✅ AD-66 (local), superseded by AD-68: Supabase for dev and app testing |
| OD-SA-6 | Minimum number of active Owners beyond "never zero" | A single Owner is a single point of failure | Platform administration | Keep "never zero"; require two | Open, blocks nothing |
| OD-SA-2 | Retention and export for a closed college | Data protection duty | Export, retention | Fixed period; per contract | Open; close shipped without export or deletion |
| OD-1 | Examinations model | Blocks M10; also blocks a student marks self-scoped read (migration 017 reserves "publication to students" for M10) | M10, student marks | See docs/MASTER-CHECKLIST.md | Open |
| OD-MOB-1 | Should every module be on mobile too (R63)? | — | Mobile scope | — | ✅ Resolved as AD-81: every module, one slice at a time |
| OD-MOB-2 | "Create classes" (R62): a cohort section, or timetable sessions? | — | M3/M4 on mobile | — | ✅ Both, under AD-81: sections are ADM-6 (built); timetable slots and sessions are ADM-8 |
| OD-BIO-1 | A phone with no screen lock: let through (built) or refuse? Lock-screen sign-out keeps unsent changes dormant (built) or deletes them? | Security vs. being locked out of work | BIO-1 | As built; or stricter | Open, owner to confirm |
| OD-PW-1 | How does a college user who forgot their password get back in (R69)? | — | Identity, security | — | ✅ Resolved as AD-80: option (a), one-time reset code; emailed link later with an email provider |
| OD-AD72-1 | Retire the web platform console now that the Super Admin app covers it? | AD-72 said to retire it at parity; SAM-2b and SAM-3 reach parity | Web platform console | Retire (remove its routes from the web client); keep as a fallback | Open, owner to confirm; blocks nothing |
| OD-ST-1 | How a student gets an account: who issues it, how they sign in, does it take a seat (AD-65) | Identity, seats, data protection | ST-1 | — | ✅ Resolved as AD-69: admin-issued, enrolment number + one-time code, takes a seat |

### BLOCKERS
Xcode (iOS, deferred). Drift 6 (backend push delivery). OD-1 (M10).

## 1. Modules
M1–M7 built (see `MODULE_REGISTRY.md`). Offline outbox: slice 1 (AD-58) committed; slice 2, the
durable encrypted queue (AD-59), implemented and unit-tested (`a4f9622`). Real-device
validation BLOCKED at step 1 on 2026-09-13: no Android device connected (adb lists none, even
after an adb restart). Test data is seeded and verified over the API.
Platform administration: S1/S2 provisioning only; see `docs/blueprint/capabilities/platform-administration.md`.

## 2. Decisions
AD-1…AD-66, all in force. AD-65 implemented by SA-4a (migration 023 pending application). Index: `ARCHITECTURE_INDEX.md`.

## 3. Database
Migrations `001`–`022` applied on `college_erp_dev`, confirmed by the owner. Local `college_erp_dev`: `001`–`024` applied; 023 and 024 by `npm run migrate` on 2026-09-13.
Supabase: 023 was run there by hand (untracked, trigger verified); the rebuild applies `001`–`024`
tracked.
Supabase's `SUPABASE_DB_URL` password ends in an unencoded `@`: psql cannot parse it, the rebuild's
URL parser reads it correctly (tested).
Supabase (AD-68): stale untracked schema, to be rebuilt with all of `001`–`023` by
`npm run db:supabase:rebuild`; no data of anybody's there (3 seeded role definitions).

## 4. Commits (newest first)
```
9b0199b Change where a person's sign-in code goes (OTP-6, AD-82)
e32ddde Runbook and tracker: sign-in is by code (AD-82)
265e9be Capture a mobile number for students and teachers, for their sign-in code (OTP-4, AD-82)
f3152d0 The Super Admin app signs in with a code to its email (OTP-3, AD-82)
77975e5 The college app signs in with a code to email or mobile (OTP-2, AD-82)
adf1fe5 Sign in by a one-time code to email or mobile, on the server (OTP-1, AD-82)
d4f6121 Seed script reuses an existing calendar, and seeds 7 teachers, 10 students
28a4060 Edit and archive programs, academic years and terms (FB-2)
151ec7c People no longer lists the person looking at it (FB-1)
7814377 Add a script that builds runbook 09's whole college through the API
943ea33 Record today's commits in the tracker
a1f9d11 Open screens on their saved data, then refresh (OF-R1)
16c1545 Amend AD-9: reads are cache-first on every mobile screen
90bce01 Make every loading skeleton match its screen (UX-3)
93a726a Keep sessions for a year from last use
b8e0e71 Add program opens as a bottom sheet on the phone
a4bb19e Fix college users signed out after 15 minutes on Supabase (migration 026)
688696b Build ST-1: students sign in with their enrolment number and see their attendance (AD-69)
4924220 Add the runbook, and take a real database URL out of .env.example
5c1c541 Record the SAM-3 commit in the tracker
c549779 Build SAM-3: platform accounts, the audit and invitations in the Super Admin app (AD-72, AD-81)
cba69d7 Record the SAM-2b commit in the tracker
258940a Build SAM-2b: plan, seats and branding in the Super Admin app (AD-72, AD-81)
eff961d Record the ADM-11 commit in the tracker
4cee78c Build ADM-11: registers, mark verification and corrections on the phone (AD-81)
e5ec63d Record the ADM-10 commit in the tracker
d558b20 Build ADM-10: access and the college profile on the phone (AD-81)
f054e4d Record the ADM-9 commit in the tracker
e956717 Build ADM-9: students on the phone (AD-81)
927424c Record the ADM-8 commit in the tracker
4103271 Build ADM-8: the timetable, classes and non-teaching days on the phone (AD-81)
85fbe1c Record the ADM-7 commit in the tracker
080a2fa Build ADM-7: course offerings, their teachers and enrolments on the phone (AD-81)
f5f85e5 Record the ADM-6 commit in the tracker
a35dd2f Build ADM-6: sections and their members on the phone (AD-81)
40e5b2f Record the ADM-5 commit in the tracker
6650b8f Build ADM-5: rooms on the phone (AD-81)
68004bf Record the ADM-4 commit in the tracker
5746d1e Build ADM-4: courses and curriculum versions on the phone (AD-81)
c2a7cc2 Record the ADM-3 commit in the tracker
3f0b740 Build ADM-3 and decide AD-81: every module on the phone; programs and the calendar first
f1c3d10 Record the ADM-2 and PW-1 commit in the tracker
2f6852b Build ADM-2 and PW-1: campuses and departments on the phone; forgotten passwords by reset code (AD-80)
a74d340 Build ADM-1: the College Admin's own dashboard, and change password (AD-79)
838c839 Finish ENV-2: development runs on Supabase; the rebuild survives the pooler's delay
1de03b6 Build BIO-1: the phone's own lock guards every open of a signed-in app
47ace6c Build UX-2: a collapsing navy dashboard header, and a Profile for the person
09e79c2 Build ONB-1: the College Admin appoints teachers and onboards students from the phone
0e19d41 Build the college handover flow: lifecycle in the Super Admin app, invitations accepted on web and phone
f9303c0 Build OPS-2: operators create an Owner and disable an account in development
4474abd Build SAM-1: a separate Super Admin app with its own entry point
ff0f91d Build LOG-1: API logs through one redacting Dio interceptor
817eb5e Build BR-1: the app opens on the college code and wears the college's brand
5c98d42 Build OPS-1: a dev-only command to set a platform account's password
5772603 Prepare ENV-2: Supabase for development, onboarding decided (AD-68, AD-69)
649a45b Build MUX-1: a dashboard home in place of bottom navigation, light theme only
05a34d3 Build SA-4a: plan and seat limits with a database-enforced seat check
7b1842f Design the durable outbox and propose the encrypted local store
71765a1 Register com.nirvok.collegeErp in Firebase and validate on a real phone
052e0eb Record outbox slice one in the checkpoint and requirement R40
e15590f Make teacher field writes replay-safe: outbox slice one
9180c3f Build internal assessment: the plan, the mark sheet, and corrections
6ac3683 Keep the web/** analyzer exclusion as the owner decided
```
Tests: 417 backend, 195 web, 190 Flutter, all passing. One outbox test ("a write waits behind an
earlier one…") failed once under full-suite load and passed alone three times and on rerun: timing-sensitive.

## 5. Blockers
- iOS: Xcode not installed (Command Line Tools only).
- Push delivery from the backend: tokens stored hash-only (Drift 6). Console send only.
- M10 examinations/results: OD-1.

## 6. Open decisions
OD-1 (examinations model), OD-4, Drift 6 resolution (recoverable push token), approvals P1 spec
(checklist 7.4), student role and account issuance, OD-SA-1…4 (platform administration).

## 7. Next slice
1. When the phone is connected: AD-59 device validation (steps in `docs/12-mobile-platform-config.md`),
   using `npm run seed:device-test` data; credentials in `server/.device-test.local.json`.
2. Next capability: **SA-1 Tenant lifecycle** (platform-administration.md §5), after OD-SA-1.

## 8. Inspect before continuing
`docs/blueprint/capabilities/offline-outbox.md` §7, `lib/core/outbox/`, `lib/core/di/outbox_setup.dart`,
`test/core/outbox/outbox_test.dart`, `docs/12-mobile-platform-config.md` device table.

## 9. Known inconsistencies and risks
- `server/.env` names Supabase (through its session pooler) since 2026-09-14 (AD-68); local values
  are kept as `LOCAL_*`. The direct `db.<ref>.supabase.co` host does not resolve from here; the
  pooler does. After any role password change the pooler refuses logins (28P01) for up to a minute.
- Platform accounts have forced row-level security: the migrator login sees none of them; check
  them with the admin login.
- On Supabase, no platform Owner exists after the rebuild. `seed:device-test` creates one
  (`owner+device-test@…`, credentials in `.device-test.local.json`); there is no first-Owner CLI.
- After reconnecting, the outbox honours its backoff (up to 10 minutes) until the teacher taps
  "Send now", because the app has no connectivity listener. Observed on device; by design today.
- Firebase console test sends need the owner's console access; not yet done.
- `docs/IMPLEMENTATION-CHECKPOINT.md` calls S2 "Super Admin console — COMPLETE". It covers sign-in and
  provisioning only; tenant lifecycle, audit view, platform roles and impersonation are missing.
- The seat limit is stored and never enforced (SA-4).
- College status is cached up to 15 s per server process; another process lags by at most that.
- Outbox deviations from its §7 design, recorded there: no roster cache (§7.2), so a register
  cannot be opened for the first time offline; no coalescing, since every queued write was
  already attempted online; transport failures retry indefinitely at 10 minutes, only 5xx parks.
- A queued "taught" shows in the schedule's waiting bar, not on its row, until it is sent.
- Queued writes of a person whose session expired stay dormant, encrypted, until they sign in
  again; another person on the device can neither see nor send them.
- `google-services.json` still lists the retired `com.example.college_erp` client.
- The dashboard's "now / up next" reads the device clock at load; it updates on pull-to-refresh
  or on returning from another screen, not on a timer.
- `AppTheme.dark()` builds but is not wired (AD-67); re-enable with `darkTheme:` in `app.dart`.
- No request rate limiting anywhere in the API; the public college lookup (AD-70) makes that
  visible. Accepted for development; to close before production.
- A college logo is an https link until the storage port (Cloudinary) exists; the app falls back
  to initials when it fails to load.
- Platform accounts on local: Owner `nirvokofficial@gmail.com` (real, no authenticator yet);
  `owner@nirvok.com` disabled; dev leftovers `o@n.com`, `owner+31650@nirvok.com`,
  `owner+device-test@nirvok.dev` still active. Supabase has none until its rebuild, then
  `platform:create-owner` gives it the same Owner.
- Owner's change, committed inside `d15ca38` and `0e19d41` (it was staged, and those commits took
  the whole index; 2026-09-14): `ApiClient` logs through
  `CustomLogInterceptor` (`dio_intercepter.dart`, coloured `dart:developer` output) instead of
  `withApiLogs`; it masks the token and redacts bodies with the shared `redact` (AD-73 holds).
  `AuthApi` and `PlatformAuthApi` still use `ApiLogInterceptor`. Left in it: `onError` prints the
  raw response (only on transport failures, since every status is a response), and the
  `DisplayOnlineExam`/`FeeBackStudent` path check is always true.
- `server/.env.example` has an uncommitted edit containing the real Supabase password; it must
  go back to the placeholder and never be committed.
- No email delivery anywhere: invitations are handed over by the super admin (AD-75).
- Departments, programs and curriculum can only be created on the web console; a fresh college
  (IIT Doon, IIT Delhi) has none, so phone onboarding shows "No departments/programs yet" until then.
- A college account cannot be deactivated yet; after a handover the temporary administrator has no
  access but still uses one seat (AD-65).
- Local colleges IIT Doon and IIT Delhi (2026-09-14) have invited administrators who have not
  accepted; their invitations can now be reissued from the Super Admin app.
- The super admin app has no app lock; an unlocked phone holding an Owner session is platform
  access. Biometric lock recommended before production (AD-72). iOS flavors not configured.
- The dev server on port 3000 was restarted from a Claude session; restart `npm run dev` in a
  terminal to own it.
