# Implementation Checkpoint

```
UPDATED   2026-09-12
Slices    S1 backend foundation — COMPLETE
          S2 Super Admin console — COMPLETE
Stack     Node 24 / Fastify / PostgreSQL 16 (pg, no ORM)
          React 19 / Vite / TypeScript, no component framework
Tests     97 backend + 48 web + 19 Flutter = 164 passing
Next      M2 programs and courses, or mobile write surfaces when M4 arrives
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

### S2 — Super Admin console (`web/`)

Sign in, see every college, add one, receive the invitation once. Verified against
the running backend: sign-in, empty state, provisioning, duplicate refusal,
invitation acceptance, administrator sign-in with 11 resolved permissions, and
the administrator correctly refused at the platform endpoint.

**Resolves OD-3 as AD-24.** Web console for back-office roles, Flutter for
students and faculty. Taken under an instruction not to wait, after the question
stood open across three sessions. Supersedes R3.

**Design system implemented, not improvised.** `web/src/design/tokens.css` is
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

### S3b — People screen and role-driven shell (`web/`)

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

### Motion system (`web/src/design/motion.css`, `motion.ts`)

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
