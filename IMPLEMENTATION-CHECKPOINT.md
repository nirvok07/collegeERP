# Implementation Checkpoint

```
UPDATED   2026-09-12
Slice     S1 backend foundation — COMPLETE
Stack     Node 24 / TypeScript / Fastify / PostgreSQL 16 (pg driver, no ORM)
Tests     45 passing
Next      S2 depends on OD-3 (web console or Flutter for back office)
Blocked   OD-1 affiliating vs autonomous, OD-3 client surface, OD-4 money
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
