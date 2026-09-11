# Blueprint 4 — Scale, Performance and Deployment

Resolves OD-9 and OD-10, which blocked Phase 16 entirely and Phase 17 through it. Every number
here is derived rather than asserted, so when a real customer contradicts one, the consequence
is traceable rather than a guess collapsing.

---

## 4.1 The shape of a college

Derivation starts from the institution, not from a hoped-for user count.

| Institution | Students | Teaching staff | Sections | Periods per day |
|---|---|---|---|---|
| Small college | 500 | 30 | 12 | 6 |
| Typical college | 3,000 | 150 | 70 | 6 |
| Large college | 10,000 | 450 | 240 | 7 |
| Design ceiling, one tenant | 20,000 | 900 | 500 | 8 |

The ceiling is a multi-campus institution or a large affiliated college. It is a design limit,
not an expectation. Above it, the tenant moves to a dedicated database under §4.6.

**Platform targets.** 50 tenants in the first two years. Architecture designed for 500 without a
structural rewrite. At 500 tenants averaging 3,000 students, the platform holds roughly 1.5
million students and 75,000 staff.

---

## 4.2 Data volume, and the two tables that decide the architecture

Per tenant per academic year, at the typical 3,000-student college.

| Entity | Rows per year | At the 20,000 ceiling |
|---|---|---|
| **Attendance records** | 3.6 M | 24 M |
| **Audit events** | 4 to 8 M | 30 M |
| Session occurrences | 84,000 | 800,000 |
| Marks | 96,000 | 640,000 |
| Ledger entries | 60,000 | 400,000 |
| Notices and receipts | 400,000 | 2.6 M |
| Everything else combined | under 200,000 | under 1.5 M |

Attendance is 3,000 students × 6 periods × 200 teaching days. Audit follows from every sensitive
read and every mutation.

**The conclusion that shapes everything.** Two tables carry 95 percent of the volume, and both
are append-heavy, immutable after a short correction window, and queried almost always within one
academic year. Everything else is small enough to be uninteresting at any realistic scale.

At 500 tenants over five years, attendance alone approaches 9 billion rows. That is the number
that decides the deployment model, and it is why §4.6 partitions rather than hoping.

---

## 4.3 Load profile

Colleges are extremely peaky. Designing for the average would fail on the four days a year that
matter, and each of those days is the day the customer judges the product.

| Peak | Shape | Concurrency at 3,000 students | Dominant cost |
|---|---|---|---|
| **Result publication** | 40 percent of students and guardians within five minutes of the notification | ~2,400 sessions, ~40 requests per second for one tenant | Read amplification on one dataset |
| **Morning attendance** | Teachers mark between 09:00 and 09:20 | ~90 concurrent | Writes, mostly offline then synced |
| **Fee deadline** | Spread over the final day, sharpest in the final two hours | ~600 concurrent | Ledger writes, payment callbacks |
| **Admission open** | Applicants over several days, spiky at the deadline | ~500 concurrent, external users | Document upload |
| **Ordinary weekday** | Steady, low | under 200 concurrent | Nothing notable |

**Platform design targets.** 2,000 peak concurrent users at 50 tenants, 20,000 at 500. Sustained
200 requests per second, peak 2,000 at maturity.

**Two consequences that are design requirements, not optimizations.**

1. **Result publication must be staggered.** If publication fires a notification to everyone at
   once, the read spike is self-inflicted. Publication notifies in waves over ten minutes, and
   the result screen serves from a materialized snapshot rather than recomputing per request.
   This is the only place in the product where a pre-computed academic value is permitted, and
   it is a cache of a published, frozen result, which does not contradict AD-7.
2. **Attendance sync must tolerate a thundering herd.** Ninety teachers regaining connectivity
   when the staff-room network returns is a synchronized burst. Sync retries carry jitter, and
   the outbox drain is rate-limited per tenant.

---

## 4.4 Performance budgets

Budgets, not aspirations. Each is measurable in continuous integration and each can fail a build.

| Surface | Budget | Measured as |
|---|---|---|
| Mobile cold start to first meaningful paint | 2.0 s | Low-end Android, p95 |
| Any screen rendering from local data | 300 ms | p95, offline |
| Attendance roster open and first tap | 500 ms | p95, offline |
| Server list query, 50 rows with filters | 400 ms | p95, server time |
| Cross-module search | 500 ms | p95 |
| Delta sync pull, one day of changes | 2 s | p95 |
| Outbox drain, 50 mutations | 5 s | p95 |
| Interactive report | 3 s | p95, else it becomes scheduled |
| Result publication, 3,000 students | 5 min | Background job, p99 |
| CSV import, 2,000 rows, dry run | 60 s | p95 |
| Permission resolution, cached | 5 ms | p99, the hottest path in the system |
| Permission resolution, cold | 50 ms | p99 |

Any report that cannot meet three seconds is reclassified as scheduled rather than optimized
indefinitely. That reclassification is a design decision, not a failure.

---

## 4.5 Availability and degradation

**Target.** 99.5 percent monthly during the academic year, measured on the operational API. That
permits roughly three and a half hours of downtime a month, which is honest for a product at this
stage. Committing to four nines would be a promise the architecture cannot keep.

**Protected windows.** No planned maintenance during result publication, the fee deadline week,
admission open, or 08:30 to 10:00 on any teaching day.

**Degradation, in priority order.** When the backend is unavailable, the following must still
work, per AD-9: viewing a timetable, marking and submitting attendance locally, reading a
student's own records, and reading cached notices. The following degrade with an explicit
message: sign-in on a new device, payments, imports, reports and approvals.

The test is concrete. A teacher must be able to complete a full teaching day with no backend at
all, and lose nothing.

---

## 4.6 Tenancy and deployment — resolving OD-10

**Decision. A single PostgreSQL cluster, one shared schema, `tenant_id` on every table, isolation
enforced in the data access layer and independently at the database through row-level security.**
Partitioning on the two high-volume tables. A documented path to move one tenant to a dedicated
database without a schema change.

**Why shared.** At 50 tenants, per-tenant databases means 50 migration runs per release, 50
connection pools and 50 backup schedules, with no isolation benefit that row-level security does
not already provide. Operational cost would dominate engineering cost within a year.

**Why row-level security in addition to application filtering.** Application-layer filtering is
one forgotten `where` clause away from a cross-tenant leak, which is the single failure that
ends this product. Two independent mechanisms, at different layers, means a single mistake is
not sufficient to cause it. This is defence in depth applied to the one risk that matters most.

**Partitioning.** `attendance_records` and `audit_events` partition by academic year, and
sub-partition by tenant above a volume threshold. Current-year queries then touch one partition,
and archiving a closed year is a partition detach rather than a mass delete.

**The escape hatch.** A tenant exceeding the 20,000 ceiling, or contractually requiring isolation,
moves to a dedicated database. Because the schema is identical and every query is already
tenant-scoped, this is a data move and a routing change, not a redesign. The routing layer
resolves a tenant to a connection at request time from day one, even while every tenant resolves
to the same cluster, so the capability exists before it is needed rather than being retrofitted
under pressure.

**Hosting and residency.** India region, with backups in the same region. Student personal data,
including data about minors, does not leave the country. Any third-party processor must offer
in-region processing or is not used.

**Backup and recovery.** Point-in-time recovery with a five minute recovery point objective and a
one hour recovery time objective. Restore rehearsed quarterly against a production-shaped copy,
because a backup that has never been restored is a belief rather than a capability. Rehearsal
before June is mandatory, since that is when rollover makes a restore most likely to be needed.

---

## 4.7 Observability

Instrumented from the first release, because an ERP that cannot be seen inside cannot be
supported at a customer site.

| Signal | Why it is on this short list |
|---|---|
| Sync health per tenant: outbox depth, oldest pending mutation, failure rate | The first symptom of nearly every field problem |
| Unmarked attendance sessions by cutoff | A leading indicator that teachers have stopped trusting the app |
| Background job outcomes and dead letters | A silently failing job corrupts data at 2am |
| Permission denials by permission and role | Spikes mean either an attack or a broken role definition, and both need attention |
| Slow queries beyond budget | The budgets in §4.4 are only real if a breach is visible |
| Cross-tenant access attempts | Must be zero. Any non-zero value is an incident |
| Payment and integration failures | Money and external systems fail differently from everything else |

Alerting is on the last three unconditionally. Everything else feeds a dashboard the support team
reads daily.

---

## 4.8 What this unblocks and what it assumes

Resolves OD-9 and OD-10. Unblocks checklist items 0.7, 0.8, 16.1 through 16.6, 17.5 and 12.5,
and removes two of the five critical blockers on the readiness gate.

**These numbers are assumptions until a real college contradicts them.** The three most
load-bearing, and what to do if they are wrong:

1. **20,000 students per tenant.** If a customer is larger, they take a dedicated database. The
   architecture already permits it.
2. **Result publication is the peak.** If a customer publishes results outside the ERP, the peak
   becomes the fee deadline and the read-heavy optimizations matter less.
3. **200 teaching days and six periods.** If a tenant runs eight periods across 220 days,
   attendance volume rises about 47 percent, which the partitioning absorbs.
