# Owner decision brief

Prepared 2026-09-29 for P0 close-out. This is a decision packet, not an owner response. No
decision is treated as approved until the owner answers and the answer is dated in the ADR and
the relevant checklist.

## OD-1 — Examinations model

Question: is the institution affiliating, autonomous, or required to support both?

Recommended default: support both. Mirror external results read-only (AD-8), and build the
autonomous examination engine behind a capability flag (AD-23).

Why it matters: the answer controls M10, university-result integration 15.2, phase 20, and the
student marks self-view. The mirror is the smaller near-term slice; the autonomous engine is
deferred until a tenant needs it. If deferred or rejected, M10 remains blocked.

Owner response: `Support both` / `Mirror only` / `Autonomous only` / `Other: ____`.

## OD-4 — Money handling

Question: does the ERP only record money, or collect it online as well?

Recommended default: record first, collect second. Keep the ledger authoritative and add online
collection as a replaceable channel.

Why it matters: collection adds settlement, refunds, chargebacks, reconciliation, provider
credentials, compliance and operational support. The existing dummy gateway demonstrates the
structural collect path but is not production payment capability.

Owner response: `Record only` / `Record and collect` / `Other: ____`.

## OD-ACC-1 — Accounting boundary

Question: where do payroll, payables and budget commitments post when the ERP has no general
ledger and no accounting module is assigned?

Recommended default: export to Tally or another accounting system, plus a thin budget and
commitment ledger inside the ERP. Do not build a full general ledger speculatively.

Why it matters: the answer gates M15 payroll and M19 payables and determines the posting,
reconciliation and export boundary.

Owner response: `Export + thin budget/commitment ledger` / `Full general ledger` /
`Other: ____`.

## Recording protocol

For each response, record the owner, decision date, selected option, constraints, affected
modules, and follow-up ADR. Until then, keep the three decisions open in `PROJECT_STATE.md`,
`docs/MASTER-CHECKLIST.md`, and the P0 checklist. Do not start the gated domains based on the
recommendations alone.
