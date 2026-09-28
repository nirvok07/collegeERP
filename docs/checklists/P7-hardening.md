# P7 — Cross-cutting work and production hardening

Cross-cutting items are scheduled **through** the earlier phases where noted, not saved to the end.
The readiness gate is the go-live decision.

---

# Cross-cutting

## X-1 — Flutter motion parity (AD-31)

`docs/07-design-system.md` §7.7 defines duration bands, easing, a motion hierarchy, capped stagger
and reduced-motion behaviour — and **a test that parses the stylesheet and fails on any property
that can trigger layout**. AD-31 says Flutter implements the same principles natively. There is
currently no Dart equivalent of either.

- [ ] `F` Duration bands in `lib/core/design/tokens.dart`: micro 140, state 180, panel 260,
      page 300, exit 140
- [ ] `F` Curves: ease-out entrances, ease-in exits, ease-in-out between on-screen states,
      near-linear for press
- [ ] `F` Presets mirroring `.m-rise`, `.m-fade`, `.m-pop`, `.m-drawer`, `.m-bottom-sheet`,
      `.m-stagger`, `.m-changed`, `.m-press`
- [ ] `F` Stagger capped at 8, dropped above 24 — the same thresholds as web
- [ ] `F` Reduced motion: durations to 1ms, travel to zero, positional entrances become fades,
      indeterminate progress keeps looping (a frozen spinner reads as a hang)
- [ ] `TEST` 🔴 Guard test: no widget animates a layout-affecting property; animations use only
      transform, opacity and colour
- [ ] `TEST` Every screen's route transition uses a registered preset, not an ad-hoc one
- [ ] `DOC` Record in `07-design-system.md` that both clients now share one motion vocabulary

## X-2 — Dark theme

AD-67 locked light-only "for now". Enterprise users working long administrative days ask for dark,
and tokens are already semantic so the cost is bounded. Schedule it rather than letting per-screen
hacks accumulate.

- [ ] `DOC` Amend AD-67
- [ ] `W` Dark token set under `@media (prefers-color-scheme: dark)` with an explicit override
- [ ] `F` Dark `ThemeData` from the same semantic tokens
- [ ] `W` `F` Theme preference: system, light, dark — persisted per person
- [ ] `TEST` Contrast ratios meet WCAG AA in both themes
- [ ] `VAL` Every screen reviewed in dark on both clients

## X-3 — Accessibility

§7.8 specifies it; nothing tests it.

- [ ] `W` axe-core in the web test run; fail on serious and critical
- [ ] `W` Keyboard navigation through every flow; visible focus; no keyboard trap
- [ ] `W` Every interactive element has an accessible name
- [ ] `F` Flutter semantics audit; labels on icon-only buttons
- [ ] `F` Minimum touch target 48dp
- [ ] `W` `F` Screen-reader pass over the highest-traffic flows: sign-in, attendance marking, fee
      payment, notice reading
- [ ] `TEST` Accessibility checks in CI

## X-4 — 🔴 Statutory and accreditation returns

`p5-reporting.md` §11 states why this is **not** a report: it needs an evidence trail, a submission
history, a preparation workflow across departments, and a frozen snapshot of what was submitted.
Several domains list these under *Reports*, which understates them.

- [ ] `DOC` ADR: this is its own module, not a P5 descriptor
- [ ] `MIG` `return_definition`, `return_preparation`, `return_section`, `return_evidence`,
      `return_submission` (frozen payload, filed_at, ack_ref)
- [ ] `SVC` Definitions for NAAC, NBA, AICTE, AISHE with their section structure
- [ ] `SVC` Sections assigned to departments; each contributes and signs off via P1
- [ ] `SVC` Figures pulled from their owning modules, **never retyped** — student-staff ratio
      (M13), placement outcomes (M23), alumni outcomes (M24), pass percentages (M10), activity
      participation (M22), anti-ragging cases (M21)
- [ ] `SVC` Evidence documents attached per section (P3)
- [ ] `SVC` 🔴 Submission **freezes** the whole return; a later correction is a revision, both kept
- [ ] `WEB` Preparation workspace — **web primary**; `APP` section contribution and sign-off
- [ ] `S` Prior submissions comparable year on year
- [ ] `TEST` A frozen submission reproduces exactly, even after source data changes

## X-5 — Biometric device integration
- [ ] `DOC` ADR: most institutions already own biometric hardware; AD-83 chose geo-fenced phone punch
- [ ] `S` Device adapter behind an interface, fixture-driven (P8 §5)
- [ ] `S` `source = 'biometric'` on `staff_attendance`; fence not applicable; same table
- [ ] `S` Idempotent ingest by (device, employee, timestamp)
- [ ] `TEST` Duplicate device pushes do not double-record

## X-6 — Data retention and erasure (resolves OD-M1-4)
- [ ] `DOC` Retention class per data family with its legal basis
- [ ] `S` P3 retention sweep with tombstones (CAP-5)
- [ ] `S` Erasure request workflow: permissioned, audited, reasoned
- [ ] `S` 🔴 Erasure **cannot remove statutory-basis records** — student academic records and
      payroll outrank a deletion request, and the system must say so rather than silently refusing
- [ ] `S` Export of a person's own data on request
- [ ] `TEST` Erasure removes engagement data and retains the academic record

## X-7 — SA-5 platform impersonation (AD-19)
- [ ] `S` Read-only, institution-approved, time-boxed, fully audited
- [ ] `S` Every impersonated request tagged in the audit with both identities
- [ ] `S` Impersonation cannot be started against a suspended tenant (AD-60)
- [ ] `W` `F` Start, visible persistent banner, end
- [ ] `TEST` 🔴 No write succeeds while impersonating — proven per endpoint class
- [ ] `TEST` The session expires on its own

## X-8 — Real payment gateway
- [ ] `S` Replace the dummy provider with Razorpay; only the checkout page and two provider routes
      change, as FEE-7 was designed for
- [ ] `S` 🔴 **Signed webhook, idempotent by provider reference.** A non-idempotent payment webhook
      creates duplicate payments — named in `MASTER-CHECKLIST.md` §15.3
- [ ] `S` Reconciliation report: gateway settlement against recorded payments
- [ ] `S` Refund path through M11 as a reversal
- [ ] `TEST` A replayed webhook records one payment
- [ ] `TEST` An unsigned or mis-signed webhook is rejected

## X-9 — P7 Search and command palette
- [ ] `S` Per-module searchable projections with trigram and full-text indexes
- [ ] `S` 🔴 Scoped fan-out: a result a person may not open must be **absent, not greyed out** —
      "no matching student" and "a student you cannot see" must be indistinguishable (AD-70's rule
      applied to authenticated search)
- [ ] `W` `F` Global search
- [ ] `W` Command palette with registered actions, each carrying its permission —
      **web only, parity exception recorded** (a phone has no keyboard)
- [ ] `S` Recent and frequent per person
- [ ] `TEST` Search never reveals an out-of-scope subject

## X-10 — P6 sensitive reads and tamper evidence
- [ ] `S` Declare sensitive read kinds; audit **at the boundary**, not per call site
- [ ] `S` Cover: payslips, case files, student ledgers, answer scripts, alumni contacts, borrowing
      history, placement offers, scholarship income data
- [ ] `S` Hash-chained digest per tenant over `(previous_digest, row)`; verification job (P9)
- [ ] `S` Reason capture enforced on `critical` actions
- [ ] `W` `F` Tenant-facing audit browser (today it is platform-facing only)
- [ ] `TEST` A retrospectively altered audit row fails chain verification
- [ ] `TEST` An audit write failing fails the action it describes

---

# Production readiness gate

Nothing below is ticked yet. This is the go-live decision.

## Correctness
- [ ] Suite green on all three tiers with **no known failures** and no unexplained skips
- [ ] Every migration applied and asserted on every environment (the P0-1 audit, re-run)
- [ ] Tenant isolation tested with a hostile second tenant, per table
- [ ] Unauthorised-access test per endpoint (`CLAUDE.md` §19)
- [ ] Concurrency tested on every versioned entity (AD-52)
- [ ] Idempotency tested by replay on every replayable write (AD-58)
- [ ] 🔴 **Every business invariant has a negative test** — the P0-0 lesson, applied system-wide
- [ ] Offline outbox verified under real network loss, with a conflict

## Security
- [ ] External penetration test, findings closed
- [ ] Secrets in a manager, never `.env` in production
- [ ] Rate limiting on auth, OTP, public certificate verification and public college lookup
- [ ] 🔴 **Replace the fixed OTP `123456` before go-live** — AD-82 carries this as an owner-accepted
      development risk and it must not survive to production
- [ ] MFA enforced on every `critical` permission
- [ ] Session and access-token lifetimes reviewed (AD-25, AD-26)
- [ ] Audit covers every state-changing action and every sensitive read (X-10)
- [ ] Dependency and container scanning in CI
- [ ] Sealed secrets (AD-63) key rotation procedure documented and rehearsed

## Data
- [ ] Backup with a **tested restore**, timed
- [ ] Point-in-time recovery verified
- [ ] Retention implemented per class (X-6)
- [ ] 🔴 A **rehearsed academic-year rollover** (AD-11) on production-shaped data
- [ ] Rehearsed tenant provisioning, suspension (AD-60) and closure (AD-75)
- [ ] Data export for a departing tenant

## Performance
- [ ] Load-tested at the OD-9 scale targets, not adjectives
- [ ] Every list keyset-paged (AD-61); no offset paging in production paths
- [ ] Slow-query log reviewed; indexes added and justified
- [ ] Partitioning verified on the two high-volume tables (AD-22)
- [ ] Result-publication notification burst load-tested (M10-15)
- [ ] Mobile cold start and frame timings measured on a low-end device
- [ ] Web bundle size budgeted and enforced

## Operations
- [ ] Health, readiness and liveness endpoints
- [ ] Structured logging with **no PII**
- [ ] Error tracking on server, web and Flutter
- [ ] Uptime, job-failure and dead-letter alerting
- [ ] Runbook for the top ten incidents
- [ ] Documented, tested rollback
- [ ] Staging mirroring production, including RLS and grants
- [ ] On-call and escalation defined

## Clients
- [ ] 🔴 **iOS built and validated** — currently 🚫 (Xcode not installed). This is a real go-live
      blocker, not a deferrable one
- [ ] Android release signing, Play listing, both flavours
- [ ] Forced-upgrade path tested from an old build
- [ ] Web browser support matrix agreed and tested
- [ ] Accessibility audit passed (X-3)
- [ ] Both clients behave correctly against a suspended tenant (AD-60)

## Product
- [ ] Every `🔍 NEEDS VALIDATION` cleared
- [ ] No `⚠️ PARTIAL` capability shipped as done
- [ ] Every parity exception in `MODULE_REGISTRY.md` reviewed and still justified
- [ ] User documentation per role
- [ ] Admin training material
- [ ] A pilot institution signed off on real data

---

## 🚧 GO-LIVE GATE

- [ ] Every box above ticked, or explicitly accepted as risk **by the owner, in writing, with a date**
- [ ] `PROJECT_STATE.md` shows no open blocker
- [ ] Every open decision resolved or consciously deferred with its consequence recorded
