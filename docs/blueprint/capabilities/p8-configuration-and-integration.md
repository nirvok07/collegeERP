# P8 — Configuration and Integration

Blueprint capability P8. **Status: ⚠️ fragments.** Remote Config exists (AD-30). College branding
is per-tenant configuration and is built (BR-1, AD-70). Seats and plan are built (SA-4a, AD-65). A
dummy payment gateway is built (FEE-7). There is no general capability.

## 1. What this capability owns

Per-tenant settings, feature flags, import pipelines with dry-run, and outbound integrations.

## 2. Per-tenant settings

Settings are **declared**, like permissions and document kinds: key, type, default, validation,
permission to change, and whether the platform may override. A tenant cannot invent a setting, for
the same reason it cannot invent a permission (migration 002's header).

Initial families: institution identity and branding (built), academic defaults (week start, grading
scale, attendance threshold), finance (currency — INR only per M11 §3, receipt prefix, late-fee
rules), notification defaults, working days and holidays calendar source, timezone.

**Timezone is load-bearing**, not cosmetic: P9 §7 schedules in it, P5 §4 aggregates in it, and
`workDateOf()` in staff attendance currently hard-codes `Asia/Kolkata`. That hard-code is correct
for today's single-country deployment and is a recorded assumption to revisit here, not a bug.

## 3. Feature flags

Per-tenant, evaluated server-side, audited on change. Two real uses already exist:

- **AD-91's capability flag** for the autonomous examination engine — the mechanism that lets M10
  support affiliating and autonomous institutions from one codebase.
- Progressive module enablement: a college that has not bought Hostel should not see Hostel.

A flag that gates a *permission* is a permission, not a flag. Flags gate features; authority stays
in M1. Confusing the two is how systems end up with two answers to "may this person do this".

## 4. Import pipelines

One pattern, not one per module: upload → parse → validate → **dry-run preview with per-row errors**
→ commit, partially failable → downloadable error report.

The dry-run is the point. An admissions import of four thousand rows that half-succeeds with no
preview is a data-recovery job. Used by M4 (applications), M5 (students), M13 (employees), M16
(catalogue), M19 (stock), M11 (opening balances).

Every import is idempotent by a declared natural key, audited, and attributable per row.

## 5. Outbound integrations

Each sits behind an interface with a recorded contract, fixture-driven tests, and a replayable
inbound webhook with idempotency. The dummy payment gateway is the pattern to copy: its swap to
real Razorpay touches only the checkout page and two provider routes.

| Integration | Status | Blocked by |
|---|---|---|
| Payment gateway (Razorpay) | Dummy built | OD-4, credentials |
| University result portal | ❌ | OD-1 → AD-91; one adapter per format (AD-8) |
| Accounting export (Tally) | ❌ | OD-5; export before API |
| Biometric attendance devices | ❌ | Not modelled; `MASTER-PLAN.md` §4 |
| SMS gateway | ❌ | Needed by P2's security channel |
| Email | ❌ | Needed by P2 |
| Government portals (AISHE, scholarship) | ❌ | Statutory returns module |

## 6. Invariants

- No undeclared setting; validation runs server-side on write.
- A setting change is audited with actor and reason where `sensitive`.
- Webhooks verify signatures and are idempotent by provider reference. **A non-idempotent payment
  webhook creates duplicate payments** — named explicitly in `MASTER-CHECKLIST.md` §15.3.
- Credentials are sealed per AD-63, never in a settings table in plaintext.
- An integration failure degrades the feature, never the request that triggered it.

## 7. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P8-1 | Settings registry, validation, per-tenant store, audit | S |
| P8-2 | Settings screens by family | W, F |
| P8-3 | Feature flags, server-side evaluation, audit | S, W, F |
| P8-4 | Import pipeline: parse, validate, dry-run, partial commit | S, W |
| P8-5 | Outbound integration interface, webhook idempotency, replay | S |
| P8-6 | Real Razorpay, replacing the dummy | S, W, F |

P8-4 is web-first with a recorded parity exception: a four-thousand-row import preview is not a
phone interaction (AD-84 §6.4).

## 8. Cross-module impact

Read by every module. Depends on P6 (audit), AD-63 (sealed credentials), M1 (permission to change).
Consumed by P9 (timezone, schedules), P2 (defaults), M10 (AD-91 flag), M11 (finance settings).
