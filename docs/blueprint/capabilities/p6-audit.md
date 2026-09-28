# P6 — Audit and Compliance

Blueprint capability P6. **Status: ✅ largely built, ⚠️ incomplete on reads.** Write auditing works
and is used across shipped modules; `audit.read` is a seeded permission; the platform reads its own
events through a narrow SECURITY DEFINER function with keyset paging (AD-61). SA-2 platform audit
view is built on both surfaces.

What is missing is the half of P6's own definition that covers **reads of sensitive data**.

## 1. What this capability owns

An immutable event log of every write and every sensitive read: actor, scope, subject, before and
after, reason, time. Tamper-evident. Not optional per module.

## 2. What is built

- Domain events recorded on write across M1–M7 and M11.
- Platform actions audited separately, read through one definer function, newest first by keyset
  (AD-61).
- `audit.read` permission, `sensitive`, seeded in migration 002.
- Platform audit view on web and in the Super Admin app (SA-2, SAM-3).

## 3. What is missing

**Sensitive reads are not logged.** P6's own definition requires "every read of sensitive data".
Today, viewing a payslip, a case file, a student's full ledger or an answer script leaves no trace.
As D7 payroll and D9 cases land, this becomes the difference between an audit trail and a partial one.

The mechanism now exists to do it properly: P3 §5 logs every document read, and that pattern
generalises. A read is audited when the **kind** of data is declared sensitive, not when a developer
remembers to log it.

**Tamper evidence is not implemented.** The log is append-only by grant, which stops the
application from editing it, but there is no hash chain. A per-tenant chained digest over
`(previous_digest, row)` makes retrospective alteration detectable rather than merely difficult.

**Reason capture is inconsistent.** Some sensitive actions record a reason; most do not. A reason
is what turns a log line into an explanation.

## 4. Invariants

- Audit rows are INSERT only at the database-role level; `erp_app` holds no UPDATE or DELETE.
- Every row carries tenant, actor, scope, subject, action, at.
- Cross-tenant reads only through a narrow SECURITY DEFINER function (migrations 005, 020, 022).
- Retention outlives the records it describes.
- **An audit write failing fails the action.** An action that succeeded without its audit row is
  an action nobody can account for.

## 5. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P6-1 | Declare sensitive read kinds; audit reads at the boundary, not per call site | S |
| P6-2 | Hash-chained digest per tenant; verification job (P9) | S |
| P6-3 | Reason capture on `critical` actions, enforced | S, W, F |
| P6-4 | Tenant-facing audit browser (today it is platform-facing only) | W, F |
| P6-5 | Retention and export for statutory requests | S |

## 6. Cross-module impact

Every module writes to it. Consumed by P4 (issue register), P5 (export audit), P1 (decision trail),
the platform audit view, and any statutory return needing evidence (`p5-reporting.md` §11).
