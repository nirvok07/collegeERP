# P9 — Scheduled Work

**A new platform capability, added 2026-09-28** (AD-88). The blueprint's original capability list
runs P1–P8 and has no entry for scheduled work; this audit found that every unbuilt domain's
*Automation* section depends on it. Recorded as P9 rather than folded into another capability,
because it is genuinely cross-cutting and has its own failure modes.

**Status: ❌ nothing in `server/src` provides it.**

## 1. What depends on this

Not a list of nice-to-haves — these are automations `02-domains.md` already specifies per domain:

| Domain | Scheduled work it requires |
|---|---|
| D6 Finance | Invoice generation, late-fee accrual, overdue reminders, defaulter register |
| D7 HR | Leave accrual and lapse, payroll cycle, document expiry warnings |
| D8 Services | Library fine accrual, due reminders, reorder alerts, pass expiry, vacating reminders |
| D9 Engagement | Case escalation on deadline breach, event reminders, notice acknowledgement chase |
| P1 | SLA sweep and approval escalation |
| P2 | Queue drain, digest assembly, quiet-hours release, token hygiene |
| P3 | Retention sweep, orphan reconciliation |
| P5 | Scheduled report delivery |
| M2 | Class session materialisation from the timetable |

Without P9 each of these is built privately, four to nine times, each with its own idea of what
happens when it runs twice.

## 2. What this capability owns

Declaring recurring work, running it exactly once per due window per tenant, recording what
happened, and making failure visible. It owns the runner, the lock and the run log.

It does **not** own the work. A job is a named function the owning module registers. P9 decides
*when* and *whether*; the module decides *what*.

## 3. Entities

```
scheduled_job    key, module, schedule(cron), scope(platform|per_tenant), enabled,
                 timeout_seconds, overlap_policy, next_due_at
job_run          job_key, tenant(nullable), window_start, state, started_at, finished_at,
                 attempt, rows_affected, error, actor_person(nullable)
job_lock         job_key, tenant, acquired_at, holder    -- advisory-lock backed
```

`job_run` is INSERT plus a single state transition, and is never deleted by the application; it is
the evidence that an automation ran. Aged out by retention, not by convenience.

## 4. Exactly once, per tenant, per window

Three mechanisms together, because any one alone is insufficient:

1. **Leader election by PostgreSQL advisory lock.** A second server instance cannot start the same
   job. No new infrastructure — the database this system already depends on is the coordinator.
2. **A unique index on `(job_key, tenant_id, window_start)`.** A run is claimed by inserting its
   row; a duplicate insert fails. This survives a process dying mid-run in a way a lock alone does not.
3. **Idempotent job bodies.** Every job must be safe to run twice, because eventually one will.
   A job that cannot state how it is idempotent is not accepted into the registry.

`overlap_policy` is `skip` (default) or `queue`. Never `parallel`: two payroll runs for the same
month is not a scenario worth supporting.

## 5. Tenant scope, and running as somebody

A `per_tenant` job runs once per active tenant per window, inside that tenant's RLS context, with
`erp_app`'s least privilege — **not** as a superuser. This is the rule that keeps P9 from becoming a
hole in the tenant isolation that AD-22 and every migration's FORCE clause work to guarantee.

A job that acts on a person's behalf (a scheduled report, per P5 §6) records `actor_person` and runs
within that person's resolved scope. If the person's authority has lapsed, the job stops and says so
rather than running with more reach than its owner has.

Suspended or closed tenants (AD-60) are skipped entirely. Suspension is total, including automation.

## 6. Failure, retry and visibility

- Timeout per job; a run exceeding it is marked `timed_out` and the lock released.
- Retry with backoff up to a declared limit, then `failed`.
- **Repeated failure alerts** — to platform support for `platform` jobs, to the tenant's admin for
  `per_tenant` jobs.
- A job that has not run in two due windows raises an alert even if nothing failed, because a job
  that silently stops running is the failure mode nobody notices. Invoice generation quietly not
  running for a month is discovered by students, which is the worst way to discover it.

## 7. Time, and the trap in it

Schedules are evaluated in the **tenant's** timezone, not the server's. A digest at 8am means 8am
where the college is. Calendar-date jobs use AD-49's calendar-date discipline: "overdue as of today"
is a date comparison in the tenant's zone, never a UTC instant comparison.

The fee collection report bug of 2026-09-23 — nothing returned near local midnight because the
session timezone was not UTC — is exactly this class of error, and it has already happened once in
this codebase. Every job that reasons about "today" states its timezone explicitly and is tested at
a boundary.

## 8. Invariants

- No job runs without a registry entry declaring its schedule, timeout, scope and idempotency note.
- `(job_key, tenant_id, window_start)` is unique.
- Per-tenant jobs run under tenant RLS; a job cannot read across tenants.
- `job_run` rows are never updated after reaching a terminal state.
- A disabled job records that it was skipped, so a gap in the log is always explained.

## 9. Clients (AD-84 parity)

**Job health**, both surfaces, platform and tenant scoped as appropriate: last run, next due,
duration trend, failures. Admins need to see that invoice generation ran last night.

**Manual trigger**, permissioned and audited, for a job that failed and has been fixed. Rare, needed,
and dangerous enough to be logged loudly.

Flutter gets the read and the alert; triggering a payroll job from a phone is a recorded parity
exception (AD-84 §6.4).

## 10. First jobs, in build order

1. `notifications.drain` — P2's queue (everything else's delivery depends on it)
2. `approvals.sla_sweep` — P1 escalation
3. `fees.generate_invoices`, `fees.accrue_late_fees`, `fees.overdue_reminders`
4. `notifications.assemble_digests`, `notifications.release_quiet_hours`
5. `documents.retention_sweep`
6. `reports.scheduled_delivery`
7. Then per domain as each lands: leave accrual, library fines, case escalation, pass expiry

## 11. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P9-1 | Migration: registry, run log, locks; RLS, GRANTs, invariants | S |
| P9-2 | Runner, advisory-lock leader election, window claiming | S |
| P9-3 | Per-tenant execution under RLS, timezone handling | S |
| P9-4 | Timeout, retry, backoff, failure alerting | S |
| P9-5 | Job health screens, manual trigger | W, F |
| P9-6 | First jobs (§10, items 1–2) | S |

## 12. Why not an external scheduler

A cloud scheduler or cron container would work, and is rejected for now: it puts the tenant loop,
the RLS context and the run log outside the application that owns them, and it adds an operational
component to deploy, monitor and secure. PostgreSQL advisory locks give exactly-once across
instances with no new infrastructure. Revisit if job volume outgrows one process — and record it
as an ADR at that point, not silently.

## 13. Cross-module impact

Used by every module and by P1, P2, P3, P5. Depends on M1 (actor scope), M2 (tenant timezone),
P2 (failure alerts), P6 (audit of manual triggers).
