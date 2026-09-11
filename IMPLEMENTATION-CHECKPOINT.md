# Implementation Checkpoint

```
UPDATED   2026-09-12
Slices    S1 backend foundation — COMPLETE
          S2 Super Admin console — COMPLETE
Stack     Node 24 / Fastify / PostgreSQL 16 (pg, no ORM)
          React 19 / Vite / TypeScript, no component framework
Tests     45 backend + 11 web = 56 passing
Next      S3 M1 write surface: invite, assign role with scope, revoke
Blocked   OD-1 affiliating vs autonomous, OD-4 money
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

**Not built.** Token refresh, so a session ends after 15 minutes. Pagination, not
needed at 50 rows. Saved views, filter rail and command palette, which belong
with the people list in S3.

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
