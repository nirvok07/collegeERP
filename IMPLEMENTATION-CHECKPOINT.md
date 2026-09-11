# Implementation Checkpoint

```
UPDATED   2026-09-12
Slices    S1 backend foundation — COMPLETE
          S2 Super Admin console — COMPLETE
Stack     Node 24 / Fastify / PostgreSQL 16 (pg, no ORM)
          React 19 / Vite / TypeScript, no component framework
Tests     74 backend + 18 web = 92 passing
Next      S3b console People screen; then M2 academic structure
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
