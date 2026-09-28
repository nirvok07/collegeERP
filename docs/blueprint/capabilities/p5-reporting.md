# P5 — Reporting and Analytics

Blueprint capability P5. **Status: ⚠️ per-module only.** Four hand-written fee reports exist
(`GET /v1/fees/reports/*`, 2026-09-23) and are good work in the wrong shape. AD-90 makes reports a
declared contract.

There is deliberately **no "Reports module"**. Every module contributes descriptors; P5 renders them.

## 1. The problem this solves

A report today costs: bespoke SQL, a bespoke endpoint, a bespoke screen on web, a bespoke screen on
Flutter, and tests for all four. `02-domains.md` lists roughly **seventy** reports across D3, D7, D8
and D9. Under AD-84 parity that is seventy × four pieces of hand-written work.

With a descriptor it is seventy × one query plus one declaration, rendered by one surface per
client. This is the single largest cost reduction available in the remaining plan.

## 2. What a descriptor is

```
report_descriptor
  id                 e.g. 'fees.collection'
  module             owning module
  permission         permission key required (P5 never invents authority)
  parameters[]       name, type, required, default, source (e.g. term picker, date range)
  columns[]          key, label, type, format, align, width, sortable, total
  default_sort       column, direction
  row_source         a named server-side query, registered by the owning module
  grouping[]         optional, with subtotals
  exports[]          csv, pdf, xlsx
  drill_to           optional route for a row (e.g. a student's ledger)
```

The descriptor is **code, not data** — registered by the owning module at startup and validated
against the column types. A tenant cannot author SQL. A tenant *can* save views over a descriptor
(§5), which is where the flexibility people actually want lives.

## 3. Authorization

`permission` is checked per request, resolved per AD-16, and scope-filtered: a HoD running a
staff-strength report sees their department, the Principal sees the institution. **P5 applies the
same scope resolution as the owning module's read path** — it never widens reach. A report is a
read of data the person could already read, arranged differently. If a report can show something its
runner could not otherwise see, that is a permission bug, not a reporting feature.

`report.export` is separately permissioned and `sensitive`: exporting ten thousand student rows to
a spreadsheet is a different act from looking at a screen, and `person.export` already sets this
precedent as `critical`.

## 4. Execution

- Every report is keyset-paged (AD-61); no report returns an unbounded set to a client.
- Every aggregate is computed, never stored (AD-7).
- Dates are calendar dates end to end (AD-49), and every timestamp aggregation states its timezone
  explicitly. **This is not theoretical**: the fee collection report returned nothing near local
  midnight until `AT TIME ZONE 'UTC'` was made explicit (2026-09-23). Every new descriptor's
  date handling is tested against that case.
- A slow descriptor declares `heavy: true`, which routes it to the read replica and to scheduled
  delivery rather than interactive rendering.

## 5. Saved views

A saved view is a named set of parameter values, column visibility, sort and grouping, owned by a
person or shared to a role. `docs/MASTER-CHECKLIST.md` §4 already requires "every list works at the
scale in OD-9, with saved views and bulk actions"; this is where that requirement is met.

Saved views are how a Cashier gets "today's counter collection, my counter" as one tap without
anyone writing that report.

## 6. Scheduled and delivered reports (P9)

A descriptor may be scheduled: daily/weekly/monthly, to a role or a person, delivered through P2 as
an attachment or a link. The defaulters register on the 1st, the collection summary each evening,
the attendance-shortage list each Monday.

A scheduled report runs **as a named person's authority**, not as a superuser, so its scope is that
person's scope. A report that outlives its owner's role stops running and says so.

## 7. Three tiers of reporting

| Tier | What | Where |
|---|---|---|
| Operational | The seventy descriptors. Lists, filters, export | P5, this document |
| Dashboards and MIS | Per-role figures and charts, computed | Module dashboards, built |
| Statutory and accreditation | NAAC, NBA, AICTE, AISHE returns with an evidence trail | **Own module — gap, see §11** |

## 8. Invariants

- A descriptor without a `permission` fails registration at startup.
- A column marked `total` must be numeric; validated at registration.
- Export respects the same scope and permission as the screen.
- Every export is audited (P6): who, which report, which parameters, how many rows.
- No descriptor may write. The report path is read-only at the database role level.

## 9. Clients (AD-84 parity)

**One report surface per client**, driven by the descriptor:
parameter form → results table → export.

Web: dense table, sticky header, column visibility, keyset paging, multi-sort, inline drill.
Flutter: the same descriptor rendered as cards on a phone and a table from 600dp, per `docs/new-design/`
breakpoint language; horizontal scroll is a last resort, not the default.

**Report library**, both surfaces: every descriptor the person may run, grouped by module, searchable,
with their saved views pinned.

This is where CAP-7's generic data-table earns itself back: the report surface and the module list
screens share it.

## 10. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P5-1 | Descriptor schema, registration, startup validation | S |
| P5-2 | Resolver: parameters, scope filtering, keyset paging | S |
| P5-3 | CSV and PDF export, audited | S |
| P5-4 | Report surface and library | W, F |
| P5-5 | Saved views | S, W, F |
| P5-6 | **Migrate the four fee reports onto P5** — the pilot | S, W, F |
| P5-7 | Scheduled delivery via P9 and P2 | S |
| P5-8 | Heavy-report routing to a read replica | S |

**P5-6 is the proof.** The four fee reports are real, shipped and non-trivial — one groups by day,
cashier and method with reversals as negative lines. If the descriptor model cannot express them
without special-casing, it is not ready for the other seventy.

## 11. The gap this capability does not close

Statutory and accreditation returns (NAAC, NBA, AICTE, AISHE) are **not** reports. They need an
evidence trail, a submission history, a preparation workflow across departments and a frozen
snapshot of what was submitted. Several domains list them under *Reports*, which understates them.

They need their own module. Recorded in `docs/MASTER-PLAN.md` §17 as X-4, and flagged here so a
future engineer does not try to solve an accreditation return with a descriptor.

## 12. Cross-module impact

Every module contributes descriptors. Depends on M1 (permission and scope), P6 (export audit),
P9 (scheduling), P2 (delivery), AD-61 (paging). Consumed by the dashboards, which stay per-role and
hand-built because a dashboard is a designed surface, not a table.
