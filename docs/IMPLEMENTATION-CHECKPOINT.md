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
  Current open validation: forced loading/empty/error browser states and physical Android checks.

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
