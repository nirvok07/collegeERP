# P1 — Parity debt and platform capabilities

Four unbuilt domains (D3, D7, D8, D9) each need approvals, notifications, documents, reporting and
scheduled work. **Build them once here, or build them four times later.**

Build order matters: **P9 → P2 → P1 → P3 → P5 → P4**. P2's queue drain is a scheduled job; P1's
SLA escalation is a scheduled job and sends notifications; P4 renders through P3 and is approved
through P1.

---

# Parity debt

## PAR-1 — Fees on web (AD-86, closes OD-FEE-5)

Mobile has 17 files and 2,766 lines of fee code. Web has **none** — every "fee" match in
`clients/web/src` is the substring inside "feedback". A Cashier currently runs counter collection
from a phone.

Server is complete; this is a client-only slice against existing endpoints.

### Fee heads and structures
- [ ] `WEB` `features/fees/HeadsPage.tsx` — list, create, edit, archive; `fee.manage`
- [ ] `WEB` `features/fees/StructuresPage.tsx` — list by program × academic year
- [ ] `WEB` `features/fees/StructureDetailPanel.tsx` — heads, amounts, instalments
- [ ] `WEB` Archive refuses with a named reason when a structure is in use

### Invoices
- [ ] `WEB` `features/fees/InvoicesPage.tsx` — filters by program, year, state, overdue
- [ ] `WEB` Keyset paging (AD-61), not offset
- [ ] `WEB` `StudentFeePage.tsx` — one student's invoices, payments, running balance

### Collection — the Cashier's screen
- [ ] `WEB` Record a payment: amount, method, allocation across invoices
- [ ] `WEB` Issue a receipt; gapless number shown
- [ ] `WEB` Reverse a payment — a reversal, never a delete (`m11-student-finance.md` §3)
- [ ] `WEB` Receipt PDF matching the Flutter `FeeDocument` output, including the CANCELLED banner
- [ ] `WEB` Statement PDF: full invoice and payment ledger with running balance
- [ ] `WEB` Optimistic concurrency conflict surfaced, not swallowed (AD-52)

### Requests and reports
- [ ] `WEB` Concession, waiver and fine requests: raise, approve, reject, withdraw
- [ ] `WEB` Requests register with requester and decider names
- [ ] `WEB` Collection report — grouped by day, cashier, method; reversals as negative lines
- [ ] `WEB` Outstanding report; `WEB` Defaulters report with days overdue
- [ ] `WEB` Requests register report
- [ ] `WEB` CSV export per report

### Close
- [ ] `TEST` Web tests for each screen's loading, empty, error and success states
- [ ] `TEST` **Unauthorised role on every route** — a teacher must not reach any fee screen
- [ ] `TEST` A Cashier cannot open structures; an Accountant cannot record a payment
- [ ] `VAL` Verified in a live browser against the seeded database
- [ ] `DOC` OD-FEE-5 marked resolved; `MODULE_REGISTRY.md` M11 row shows web ✅

## PAR-2 — Calendar on web

Web currently only *reads* holidays, inside `PunchCard`. There is no calendar module.

- [ ] `WEB` `features/calendar/CalendarPage.tsx` — month grid, holidays, events, today
- [ ] `WEB` Multi-day break rendered as one entry, matching the Flutter behaviour
- [ ] `WEB` Add/edit/remove a holiday and a date range, behind `term.manage`
- [ ] `WEB` Add/edit/remove an event: all-day or timed
- [ ] `WEB` Reads `GET /v1/calendar?from&to` — one source of truth with the Timetable holidays tab
- [ ] `WEB` Range add: ≤ 60 days, all-or-none, clashing day named
- [ ] `TEST` Unauthorised role cannot mutate; everyone signed in can read
- [ ] `VAL` Live browser

## PAR-3 — Staff attendance on web

- [ ] `WEB` Daily register by campus and department
- [ ] `WEB` My monthly summary
- [ ] `WEB` Correction request approval queue (after CAP-4's P1)
- [ ] `WEB` Punch action resolved per P0-0 (withdraw recommended)
- [ ] `TEST` Unauthorised role cannot see another person's register
- [ ] `DOC` Parity exception recorded if punch is withdrawn

---

# CAP-1 — Contract generation (AD-85)

The highest-leverage slice in the plan: parity doubles client cost, and generation is the lever
that makes it affordable across D3/D7/D8/D9.

- [ ] `S` Emit OpenAPI 3.1 from the existing zod schemas at build time
- [ ] `S` Commit `server/openapi.json`; regenerate in CI
- [ ] `S` Annotate every route with its permission key, so the description carries authorization
- [ ] `W` Generate TypeScript types; replace hand-written API types in `clients/web/src/lib/api.ts`
- [ ] `F` Generate Dart models; replace hand-written models under `lib/features/*/data/`
- [ ] `F` Keep hand-written mappers where a model is deliberately shaped for the UI
- [ ] `S` CI check: regenerate and fail when the committed description differs from the code
- [ ] `TEST` A deliberate schema change fails CI until the description is regenerated
- [ ] `DOC` Document the workflow in `docs/05-api-contract.md`

---

# CAP-2 — P9 Scheduled Work (AD-88)

Doc: `docs/blueprint/capabilities/p9-scheduled-work.md`. **Built first** — P2 and P1 both need it.

### Migration
- [ ] `MIG` `scheduled_job`: key, module, schedule, scope, enabled, timeout_seconds,
      overlap_policy, next_due_at
- [ ] `MIG` `job_run`: job_key, tenant_id, window_start, state, started_at, finished_at, attempt,
      rows_affected, error, actor_person_id
- [ ] `MIG` **Unique index `(job_key, tenant_id, window_start)`** — the exactly-once claim
- [ ] `MIG` `job_lock` backed by advisory locks
- [ ] `MIG` RLS FORCE on `job_run`; GRANTs declared; `migration-invariants.test.ts` updated
- [ ] `MIG` `job_run` has no UPDATE grant after a terminal state (trigger)

### Runner
- [ ] `SVC` Job registry: modules register key, schedule, scope, timeout, **and an idempotency note**
- [ ] `SVC` Registration refuses a job with no idempotency note
- [ ] `SVC` Leader election by PostgreSQL advisory lock — no new infrastructure
- [ ] `SVC` Window claiming by inserting the `job_run` row; duplicate insert loses the race
- [ ] `SVC` Per-tenant execution **inside that tenant's RLS context**, as `erp_app`, never superuser
- [ ] `SVC` Skip suspended and closed tenants entirely (AD-60)
- [ ] `SVC` Schedules evaluated in the **tenant's timezone**, not the server's
- [ ] `SVC` `overlap_policy`: `skip` (default) or `queue`. Never `parallel`
- [ ] `SVC` Timeout marks `timed_out` and releases the lock
- [ ] `SVC` Retry with backoff to a declared limit, then `failed`
- [ ] `SVC` A job acting for a person records `actor_person_id` and runs in that person's scope; if
      their authority lapsed, the job stops and says so
- [ ] `SVC` Alert on repeated failure — platform support for platform jobs, tenant admin for others
- [ ] `SVC` **Alert when a job has not run in two due windows**, even with no failure. A job that
      silently stops is the failure nobody notices

### Clients
- [ ] `WEB` `APP` Job health: last run, next due, duration trend, failures
- [ ] `WEB` `APP` Permissioned, audited manual trigger for a fixed job
- [ ] `DOC` Parity exception if triggering is web-only

### Tests
- [ ] `TEST` Two runner instances, one job, one run
- [ ] `TEST` Claiming the same window twice fails on the unique index
- [ ] `TEST` A per-tenant job cannot read another tenant's rows
- [ ] `TEST` **Timezone boundary**: a "today" job at local midnight in a non-UTC tenant returns the
      right day — the 2026-09-23 fee-report bug class
- [ ] `TEST` Suspended tenant is skipped
- [ ] `TEST` A job killed mid-run does not block the next window forever

### First jobs
- [ ] `JOB` `notifications.drain` (needs CAP-3)
- [ ] `JOB` `approvals.sla_sweep` (needs CAP-4)

---

# CAP-3 — P2 Notifications (AD-87)

Doc: `p2-notifications.md`. **This slice contains the Drift 6 fix.**

### The token change — the unblock
- [ ] `MIG` Add `devices.push_token_sealed bytea` (AES-256-GCM, dedicated key per AD-63)
- [ ] `MIG` Add `devices.push_token_fp text` (truncated HMAC, for uniqueness only)
- [ ] `MIG` Move the unique index from `push_token_hash` to `push_token_fp`, still
      `WHERE revoked_at IS NULL`
- [ ] `MIG` Drop `push_token_hash` — a hash cannot be un-hashed, so there is nothing to back-fill
- [ ] `MIG` Revoke all existing registrations; devices re-register on next launch
- [ ] `S` Reuse the existing AD-63 sealer (`secret-sealer.test.ts` covers the mechanism)
- [ ] `F` Re-register on launch; handle the revoked-token path silently
- [ ] `TEST` A sealed token round-trips; the fingerprint is stable; two devices with the same token
      cannot both be live

### Migration, rest
- [ ] `MIG` `notification_template`: tenant_id NULL = platform default, event_key, channel, locale,
      subject, body, active
- [ ] `MIG` `notification_preference`: person, category, channel, enabled, quiet hours
- [ ] `MIG` `notification_queue`: tenant, event_key, person, channel, payload, state, attempts,
      next_attempt_at, **dedupe_key**, created_at
- [ ] `MIG` `notification_receipt`: INSERT only
- [ ] `MIG` `notification_digest`
- [ ] `MIG` Unique on `dedupe_key = (event_key, subject_id, person, channel)`
- [ ] `MIG` RLS FORCE throughout; GRANTs; invariants test updated

### Templates
- [ ] `SVC` Declared field schema per `event_key`
- [ ] `SVC` **Validate a template at save time**, not at send time; a missing field fails the save
- [ ] `SVC` Tenant row overrides the platform default (the `role_definitions` pattern)
- [ ] `SVC` Rendered body is stored **on the queue row** — what was queued is what is sent, even if
      the template is edited afterwards

### Queue and delivery
- [ ] `SVC` Worker claims with `FOR UPDATE SKIP LOCKED`
- [ ] `SVC` Retry 1m, 5m, 25m, 2h, 8h, then dead-letter
- [ ] `SVC` Dead letters visible to platform support and the tenant admin, never discarded
- [ ] `SVC` An invalid-token push **revokes the registration** rather than retrying
- [ ] `SVC` Triggered by domain events (AD-10); no module calls the notifier directly

### Channels
- [ ] `SVC` FCM provider behind an interface
- [ ] `SVC` Email provider behind an interface
- [ ] `SVC` SMS provider behind an interface
- [ ] `SVC` In-app channel
- [ ] `SVC` **Security notifications never go to push** — a sign-in code on a lock screen defeats
      its purpose (AD-82 makes this load-bearing)

### Preferences
- [ ] `SVC` Categories: academic, attendance, finance, approvals, services, announcements, security
- [ ] `SVC` **Security is not switchable off**
- [ ] `SVC` Quiet hours suppress push and SMS, never in-app, never security
- [ ] `SVC` Suppressed *informational* joins the digest
- [ ] `SVC` Suppressed *time-bound* is **held and released**, not dropped
- [ ] `JOB` `notifications.drain`, `assemble_digests`, `release_quiet_hours`, `token_hygiene`
      (revoke registrations unseen 90 days)

### Clients
- [ ] `WEB` `APP` Notification centre: by category, unread first, deep-link to the subject
- [ ] `WEB` `APP` Preference screen: per category, per channel, quiet hours, digest
- [ ] `WEB` `APP` In-app toast obeying `07-design-system.md` §7.7 (`.m-rise`, `--dur-exit`)
- [ ] `F` FCM foreground, background and terminated delivery; tap routes correctly
- [ ] `DOC` Browser push is out of scope — parity exception recorded

### Tests and validation
- [ ] `TEST` A replayed domain event produces one message, not two
- [ ] `TEST` Quiet hours: informational digests, time-bound holds, security delivers
- [ ] `TEST` Template edited after queueing does not change the queued body
- [ ] `TEST` A person matching an audience twice receives one message
- [ ] `TEST` Deactivated person between queue and send → dropped with a reason
- [ ] `VAL` 🔴 **A real push arrives on a physical phone.** Not a console test (`CLAUDE.md` §10)
- [ ] `DOC` Drift 6 closed in `docs/MASTER-CHECKLIST.md`

---

# CAP-4 — P1 Approvals

Doc: `p1-approvals.md`. Previously "❌ not specified" — now specified.

### Migration
- [ ] `MIG` `approval_definition`: tenant, kind, version, active
- [ ] `MIG` `approval_step`: definition, sequence, mode, resolver, sla_hours, escalates_to
- [ ] `MIG` `approval_request`: tenant, kind, subject_id, **subject_version**, requested_by, state
- [ ] `MIG` `approval_assignment`: request, step, assignee, state, due_at, delegated_from
- [ ] `MIG` `approval_decision`: **INSERT only** (trigger refuses UPDATE and DELETE)
- [ ] `MIG` RLS FORCE; GRANTs; no DELETE on any table; invariants test updated

### Engine
- [ ] `SVC` Definition versioning; **captured and frozen on request open** (AD-3/AD-34 discipline)
- [ ] `SVC` Step modes: `all`, `any`, `quorum(n)`
- [ ] `SVC` A rejection at any step ends the request immediately
- [ ] `SVC` Resolvers: `role_in_scope`, `head_of`, `reporting_manager`, `named_committee`, `fixed`
- [ ] `SVC` Resolution happens **when the step opens**; assignees stored on the assignment
- [ ] `SVC` 🔴 **Nobody approves their own request.** A resolved requester is skipped and escalated
- [ ] `SVC` An empty step escalates to the fallback approver, **never auto-approves**
- [ ] `SVC` Two steps resolving to one person: decide once, second auto-passes with a reason
- [ ] `SVC` Delegation obeys AD-17: not chained, not exceeded, not outliving its source
- [ ] `SVC` Expired delegation reverts pending assignments to the delegator
- [ ] `SVC` 🔴 `subject_version` re-checked before applying the outcome (AD-52); a changed subject
      refuses the outcome and returns the request to the requester
- [ ] `SVC` Events out: `approval.granted`, `rejected`, `withdrawn`. P1 never writes module tables

### Escalation
- [ ] `JOB` `approvals.sla_sweep`: remind at 50%, notify at 100%, reassign at 150%
- [ ] `SVC` Escalation **never auto-approves**
- [ ] `TEST` An unanswered request escalates and stays unapproved

### Clients
- [ ] `WEB` `APP` **Approval inbox** — grouped by kind, sorted by age, subject summarised inline
- [ ] `WEB` `APP` Request detail: subject rendered by the owning module, chain position, decisions
- [ ] `WEB` `APP` Requester view: where it is, who has it, how long
- [ ] `WEB` `APP` Bulk approve, only where the module declares it safe (leave yes, payroll never)
- [ ] `APP` Mobile matters most here — a HoD approving from a corridor

### The proof
- [ ] `S` `W` `F` 🔴 **Retro-fit attendance corrections (AD-53) onto P1**
- [ ] `S` `W` `F` 🔴 **Retro-fit mark verification (M9) onto P1**
- [ ] `TEST` Both behave exactly as before from the user's point of view
- [ ] `DOC` If either cannot be absorbed without distortion, **the design is wrong — fix it now**,
      before D3/D7/D8/D9 build on it

### Tests
- [ ] `TEST` Self-approval blocked; escalation path taken
- [ ] `TEST` Chain edited mid-flight; in-flight requests keep their captured version
- [ ] `TEST` Subject changed under an approver → outcome refused
- [ ] `TEST` Quorum reached and not reached
- [ ] `TEST` Decision by a non-assignee refused
- [ ] `TEST` `approval_decision` UPDATE and DELETE both refused at the database

---

# CAP-5 — P3 Documents (AD-89)

Doc: `p3-documents.md`.

- [ ] `MIG` `document`, `document_kind`, `retention_class`, `document_access_log` (INSERT only)
- [ ] `MIG` `content_sha256` dedupe **within** a tenant only, never across
- [ ] `MIG` RLS FORCE; storage keys tenant-prefixed so a mis-scoped read fails twice
- [ ] `SVC` Declared kinds only — no runtime invention (the migration-002 permissions discipline)
- [ ] `SVC` Two-step upload: grant → direct-to-storage → confirm. **Bytes never pass through the API**
- [ ] `SVC` Signed time-boxed URLs; one-time for sensitive kinds
- [ ] `SVC` Size and content type re-checked server-side at grant **and** confirm
- [ ] `SVC` Per-tenant quota checked at grant
- [ ] `SVC` Virus scan at ingest; quarantine on infection
- [ ] `SVC` 🔴 **Unreadable until `scan_state = 'clean'`, enforced at read, not only in UI**
- [ ] `SVC` Every read permission-checked and logged (P6's sensitive-read requirement)
- [ ] `SVC` Verification state `pending → verified → rejected`; rejected is **superseded, never
      overwritten**
- [ ] `WEB` Uploader with drag-drop; `APP` uploader with **camera capture** and file picker
- [ ] `WEB` `APP` Viewer: inline for images and PDF, download otherwise, verification state visible
- [ ] `WEB` `APP` Verification queue showing the document beside the field it supports
- [ ] `S` `W` `F` 🔴 **Migrate syllabus (036) onto P3** — the pilot, and it clears the P0-1 drift
- [ ] `JOB` Retention sweep with tombstones; orphan reconciliation; scan retry
- [ ] `SVC` Erasure on request is distinct from retention expiry and **cannot remove a
      statutory-basis document**
- [ ] `TEST` Infected file never readable; grant expires when bytes never arrive; cross-tenant read
      refused; quota enforced

---

# CAP-6 — P5 Reporting (AD-90)

Doc: `p5-reporting.md`. Seventy reports across D3/D7/D8/D9 × two clients is the cost this avoids.

- [ ] `S` Descriptor schema: id, module, permission, parameters, columns, default_sort, row_source,
      grouping, exports, drill_to
- [ ] `S` Registration at startup; **a descriptor without a permission fails registration**
- [ ] `S` A `total` column must be numeric — validated at registration
- [ ] `S` Resolver applies **the owning module's own scope resolution**; never widens reach
- [ ] `S` Keyset paging (AD-61); no unbounded result
- [ ] `S` Aggregates computed, never stored (AD-7)
- [ ] `S` 🔴 Every date aggregation states its timezone explicitly and is **tested at a local
      midnight boundary** — the 2026-09-23 collection-report bug
- [ ] `S` `report.export` permission, `sensitive`; every export audited with row count
- [ ] `S` `heavy: true` descriptors route to a read replica
- [ ] `S` The report path is read-only at the database-role level
- [ ] `WEB` `APP` One report surface: parameter form → table → export
- [ ] `WEB` Dense table, sticky header, column visibility, multi-sort, inline drill
- [ ] `APP` Cards on a phone, table from 600dp per `docs/new-design/`; horizontal scroll last resort
- [ ] `WEB` `APP` Report library: every descriptor the person may run, grouped, searchable
- [ ] `S` `W` `F` Saved views: parameters, columns, sort, grouping; personal or shared to a role
- [ ] `S` `W` `F` 🔴 **Migrate the four fee reports onto P5** — the pilot
- [ ] `DOC` If the descriptor cannot express the collection report's negative reversal lines without
      special-casing, **fix the model before the other seventy**
- [ ] `JOB` Scheduled delivery via P9 and P2, running as a named person's authority; stops when
      their role lapses
- [ ] `TEST` A report cannot reveal a row its runner could not otherwise read

---

# CAP-7 — P4 Certificates

Doc: `p4-certificates.md`.

- [ ] `MIG` `certificate_kind`, `certificate_series`, `certificate_issue`,
      `certificate_revocation` (INSERT only)
- [ ] `MIG` `frozen_payload` immutable after issue (trigger); `serial` UPDATE refused
- [ ] `SVC` **Gapless numbering** `<TENANT>/<KIND>/<YEAR>/<NNNN>`, assigned inside the issuing
      transaction, never pre-allocated; a failed render rolls the number back
- [ ] `SVC` Template engine; freeze the rendered payload; PDF via P3
- [ ] `SVC` Eligibility rules per kind, evaluated server-side at issue — a client cannot assert it
- [ ] `SVC` 🔴 **Clearance capability** (AD-28): M11, M16, M17, M18 each answer
      `clearance(student) → clear | blocked(reason)`; the TC refuses while any blocks
- [ ] `API` Public verification endpoint: kind, name, serial, date, state — **and nothing else**
- [ ] `API` Rate-limited, non-enumerable; unknown and revoked answer alike where disclosure would
      leak (AD-70 precedent)
- [ ] `SVC` Revocation records a reason and flips the public answer; never deletes
- [ ] `SVC` Reissue supersedes with a new serial; duplicates stamped as duplicates
- [ ] `WEB` `APP` Request (a student requests a bonafide from the phone)
- [ ] `WEB` `APP` Issue queue with **eligibility failures named** — "2 books out, ₹4,500 due"
- [ ] `WEB` `APP` Register: search by serial, person, kind, date; revoke with a reason
- [ ] `APP` OS share/print sheet, reusing the `FeeDocument` pattern
- [ ] `SVC` Approval chains via P1 for TC, migration and transcript; **bonafide needs none**
- [ ] `TEST` Serial gaplessness under a failed render and under concurrency
- [ ] `TEST` TC refused with outstanding dues, a book out, a bed held, an active pass
- [ ] `TEST` Verification endpoint leaks nothing beyond the five fields

---

# CAP-8 — Generic data table, bulk and import

- [ ] `WEB` `APP` Generic table: filters, keyset paging, column visibility, saved views, bulk select
- [ ] `WEB` `APP` Bulk-action pattern with **partial-failure reporting** — n succeeded, m failed, why
- [ ] `WEB` Import pipeline UI: upload → parse → validate → **dry-run preview with per-row errors**
      → partial commit → downloadable error report
- [ ] `S` Import idempotent by a declared natural key; audited; attributable per row
- [ ] `DOC` Import is web-only — parity exception recorded (a 4,000-row preview is not a phone task)
- [ ] `TEST` A half-valid import commits the valid rows and reports the rest

---

## 🚧 P1 EXIT GATE

- [ ] Fee, calendar and staff-attendance parity gaps closed or exceptions recorded
- [ ] 🔴 **A real push delivered to a real phone** (closes Drift 6)
- [ ] A scheduled job proven exactly-once with two runner instances
- [ ] 🔴 Attendance correction **and** mark verification both running on P1 (CAP-4's proof)
- [ ] Syllabus on P3; the four fee reports on P5
- [ ] A certificate issued with a gapless serial and verified through the public endpoint
- [ ] `server/openapi.json` committed and CI-enforced
