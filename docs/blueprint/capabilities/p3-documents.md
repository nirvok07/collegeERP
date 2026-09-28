# P3 — Documents and Files

Blueprint capability P3. **Status: ⚠️ one-off only.** `036_syllabus.sql` implements syllabus upload
as a private mechanism. AD-89 generalises it. That migration is also the one with live RLS drift
(`docs/MASTER-PLAN.md` P0-1), which is itself an argument for one audited path rather than several.

## 1. What this capability owns

Bytes belonging to a tenant: upload, storage, retrieval under permission, verification state,
retention and deletion. It owns the object store boundary and the signed-URL contract.

It does **not** own meaning. P3 knows a file is a `document` of kind `admission_marksheet` attached
to `application:uuid`. It does not know whether that marksheet is acceptable — M4 decides that, and
records its verdict through P3's verification state.

## 2. Entities

```
document            tenant, kind, owner_entity, owner_id, filename, content_type, byte_size,
                    content_sha256, storage_key, uploaded_by, uploaded_at, retention_class,
                    scan_state, verification_state, version, superseded_by
document_kind       key, label, allowed_content_types, max_bytes, retention_class,
                    requires_verification, permission_read, permission_upload
retention_class     key, label, keep_years, basis          -- statutory, contractual, operational
document_access_log document, person, action, at           -- P6 audit, INSERT only
```

`content_sha256` deduplicates within a tenant: the same bytes uploaded twice are one stored object
with two `document` rows. Across tenants, never — dedupe across a tenant boundary would let one
tenant's storage prove another tenant holds a given file.

## 3. Kinds are declared, not free-form

A `document_kind` row declares what may be uploaded, how large, which permission reads it, which
permission uploads it, and how long it is kept. A module cannot invent a kind at runtime.

This is the same discipline as `permissions` in migration 002 — *a tenant composes from these, it
does not invent, because an invented permission enforces nothing*. An undeclared document kind has
no retention, no size bound and no permission, which is three ways to be wrong at once.

Initial kinds by module: M4 admission documents (marksheet, ID proof, category, migration,
photograph), M13 HR (qualification, appointment letter, experience), M15 payslips, M21 case
evidence, M19 purchase orders and invoices, M2 syllabus (migrated), M10 answer scripts.

## 4. Upload, and why it is two steps

1. Client asks for an upload grant: kind, filename, content type, size.
2. Server checks permission, kind rules, size and tenant quota, then returns a **time-boxed signed
   URL** and a `document` row in state `pending`.
3. Client uploads directly to object storage.
4. Client confirms; server verifies size and `content_sha256`, moves state to `scanning`.
5. Scanner completes; state becomes `clean` or `infected`.

Bytes never pass through the API server. A 20 MB marksheet from four hundred applicants on
admission day would otherwise saturate the API's memory and its request timeouts.

**A document is not readable until `scan_state = 'clean'`.** Enforced at read, not only in UI.

## 5. Reading, and the rule that keeps it safe

Every read resolves a signed URL valid for minutes, issued only after a permission check against
the kind's `permission_read` **and** the owner entity's own scope rule. A storage key is never
guessable and never public.

A signed URL is a bearer credential for its lifetime. So: short expiry, one-time where the kind is
sensitive (payslip, case evidence, answer script), and every issue recorded in
`document_access_log`. P6 requires an immutable log of every read of sensitive data; this is where
that requirement is actually met for files.

## 6. Verification state

For kinds with `requires_verification`, a document carries `pending → verified → rejected`, with
the verifier, the time and a reason. Verification runs through P1 where a chain is needed (M4
admission documents) and as a direct permissioned action where it is not.

A rejected document is **superseded, never overwritten**: the applicant uploads a replacement, the
old row keeps `superseded_by`. An institution that later has to prove what it saw at admission time
needs the original, not the corrected one.

## 7. Invariants

- Tenant RLS with FORCE; storage keys are tenant-prefixed so a mis-scoped read fails twice.
- `document` rows are never DELETEd by the application; removal is a retention job (P9).
- `document_access_log` is INSERT only.
- Size and content type are re-checked server-side after upload, never trusted from the client.
- A kind's `max_bytes` and `allowed_content_types` are enforced at grant **and** at confirm.
- Quota per tenant, checked at grant. An unbounded upload path is a denial-of-service on the
  institution's own bill.

## 8. Retention and erasure (resolves OD-M1-4)

Every kind has a retention class with a stated basis. A P9 job sweeps expired documents, deletes the
object, and keeps a tombstone `document` row recording that it existed and was deleted — because
"we deleted it on schedule" is itself a compliance answer.

Erasure on request is a **different** operation from retention expiry: it is a permissioned,
audited, reasoned action that cannot remove a document whose retention basis is statutory. Student
records and payroll have retention obligations that outrank a deletion request, and the system must
say so rather than silently refusing.

## 9. Scheduled work (P9)

Retention sweep, orphan reconciliation (objects with no row, rows with no object), scan retry,
quota reporting, tombstone ageing.

## 10. Clients (AD-84 parity)

**Uploader**, both surfaces: drag-drop on web, camera and file picker on Flutter, progress,
client-side size and type pre-check, retry on failure. Camera capture matters — an applicant
photographing a marksheet is the common case in Indian admissions, not the exception.

**Viewer**, both surfaces: inline for images and PDF, download otherwise, with the verification
state and history visible.

**Verification queue**, both surfaces: the reviewer sees the document beside the field it supports,
which is the difference between a five-second check and a thirty-second one across four hundred
applicants.

## 11. Edge cases

- Upload confirmed but bytes never arrived → `pending` expires by job; the grant is not a promise.
- Same bytes, two kinds → two rows, one object (§2).
- Infected file → quarantined, uploader told, never readable, kept for investigation.
- Person deactivated with documents pending verification → documents survive; they are the
  institution's record, not the person's.
- Tenant closed (AD-75) → documents follow the tenant's data retention, not immediate deletion.
- Storage provider outage → grant fails loudly; the module must not record a document that has no bytes.

## 12. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P3-1 | Migration: tables, kinds, retention classes, RLS, GRANTs | S |
| P3-2 | Storage interface, signed URLs, grant/confirm | S |
| P3-3 | Virus scan at ingest, quarantine | S |
| P3-4 | Read authorization, access log, one-time URLs | S |
| P3-5 | Verification state and queue | S, W, F |
| P3-6 | Uploader and viewer components | W, F |
| P3-7 | **Migrate syllabus (036) onto P3** — the pilot, and it fixes the drift | S, W, F |
| P3-8 | Retention sweep and erasure (P9) | S |

## 13. Cross-module impact

Consumed by M4, M9, M10, M13, M15, M19, M21, M2. Depends on P1 (verification chains), P6 (access
audit), P9 (retention), M1 (permission and scope). P4 certificates **generates** documents through
P3 rather than storing its own.
