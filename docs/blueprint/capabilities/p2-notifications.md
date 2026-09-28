# P2 — Notifications

Blueprint capability P2. **Status: ⚠️ partial and blocked.** FCM registers and revokes device
tokens on Android. **Backend delivery is impossible** because `008_devices.sql` stores
`push_token_hash text NOT NULL` — a hash, which cannot be sent to. This is Drift 6, and AD-87
resolves it.

Every domain in `02-domains.md` lists notifications as a first-class output. There is currently
nothing to build them on.

## 1. What this capability owns

One outbound path from a domain event to a person's chosen channel, with templates, preferences,
quiet hours, retry, dead-lettering and delivery receipts. It owns the queue and the providers.

It does **not** own the decision to notify. A module raises a domain event (AD-10); P2 decides
whether that event has a template, who its audience resolves to, and how each of them has asked to
be reached. A module never calls FCM, and never knows a person's email address for this purpose.

## 2. The storage change that unblocks everything (AD-87)

A push token must be *recoverable* to be usable. Today it is hashed, which is correct for a secret
you only ever compare and wrong for an address you must send to.

Per AD-63, secrets the server must read back are sealed with AES-256-GCM under a dedicated key —
that mechanism already exists in this codebase for platform secrets. Device tokens move onto it:

```
devices.push_token_sealed   bytea      -- AES-256-GCM, dedicated key, per AD-63
devices.push_token_fp       text       -- truncated HMAC, for the uniqueness index only
```

The existing unique index on `(tenant_id, push_token_hash) WHERE revoked_at IS NULL` moves to
`push_token_fp`, preserving "one live registration per token" without keeping a plaintext column.
The migration re-registers rather than back-fills: a hash cannot be un-hashed, so every device
re-registers on next launch and old rows are revoked.

## 3. Entities

```
notification_template    tenant(nullable), event_key, channel, locale, subject, body, active
notification_preference  person, category, channel, enabled, quiet_hours_start, quiet_hours_end
notification_queue       tenant, event_key, person, channel, payload, state, attempts,
                         next_attempt_at, dedupe_key, created_at
notification_receipt     queue_id, state(sent|delivered|read|failed), provider_ref, at
notification_digest      person, category, window, items[]   -- for digest-mode delivery
devices                  altered per §2
```

`tenant_id NULL` on a template means a platform default; a tenant row overrides it. This is the
same pattern `role_definitions` already uses for system role templates (migration 002), so the
override semantics are familiar rather than novel.

## 4. Channels and urgency

| Urgency | Push | In-app | Email | SMS | Example |
|---|---|---|---|---|---|
| Action required now | ✅ | ✅ | ✅ | — | Approval assigned, hearing scheduled |
| Time-bound | ✅ | ✅ | ✅ | escalation only | Fee due, book overdue, pass expiring |
| Informational | ✅ | ✅ | digest | — | Notice published, payslip available |
| Security | — | ✅ | ✅ | ✅ | Sign-in code, role granted, impersonation started |

**Security never goes to push.** A push notification renders on a locked screen; a sign-in code
that appears there defeats the purpose of sending it. AD-82 makes one-time codes the sign-in
mechanism for everyone, which makes this rule load-bearing rather than fastidious.

## 5. Preferences, quiet hours and digests

Preferences are per **category**, not per event — nobody will configure eighty switches. Categories:
academic, attendance, finance, approvals, services, announcements, security.

- Security is **not** switchable off. A person cannot opt out of being told their role changed.
- Quiet hours suppress push and SMS, never in-app, and never security.
- A suppressed informational notification joins the daily digest rather than being dropped.
- A suppressed time-bound notification is **held and sent when quiet hours end**, not dropped.

Without this, D8 alone — library overdue, hostel notices, transport pass expiry — will make the app
unusable within a term. This is not polish; it is what keeps notifications credible.

## 6. Delivery, retry and idempotency

`dedupe_key` is `(event_key, subject_id, person, channel)`. A domain event replayed by the outbox
(AD-58 is the same discipline) never produces a second message.

Retry is exponential with jitter: 1m, 5m, 25m, 2h, 8h, then dead-letter. A dead-lettered message is
visible to platform support and to the tenant's admin, never silently discarded. A push failure
that reports an invalid token revokes the device registration rather than retrying, because
retrying a dead token is how a queue fills up permanently.

## 7. Invariants

- A queue row is claimed by exactly one worker (`FOR UPDATE SKIP LOCKED`), so a second server
  instance cannot double-send.
- Tenant RLS with FORCE; a tenant's notifications are never visible to another.
- A template render that references a missing field fails at **template save time**, not at send
  time — validated against a declared field schema per `event_key`.
- Payload carries no sensitive value that is not needed to render: no marks, no amounts beyond
  what the template shows, never a password or a code in a push body.
- `notification_receipt` is INSERT only.

## 8. Scheduled work (P9)

Queue drain (continuous), digest assembly (daily per tenant timezone), quiet-hours release,
dead-letter alerting, token hygiene — revoke registrations unseen for 90 days.

## 9. Reports (P5)

Delivery rate by channel, failure rate by provider, dead-letter ageing, notice reach and
acknowledgement (feeds M20), opt-out rate by category. A high opt-out rate on a category is a
product signal that the category is over-sending.

## 10. Clients (AD-84 parity)

**Notification centre**, both surfaces: grouped by category, unread first, each deep-linking to the
subject. Mark read, mark all read.

**Preference screen**, both surfaces: per category, per channel, quiet hours, digest opt-in.

**In-app toast** for events arriving while the app is open, obeying `docs/07-design-system.md` §7.7
motion — `.m-rise` in, exit at `--dur-exit`.

Flutter additionally handles FCM foreground/background/terminated delivery and notification taps
into the right route. Web uses in-app plus email; browser push is **out of scope** and recorded as
a parity exception (AD-84 §6.4) — an administrator at a desk has the app open.

## 11. Edge cases

- Person holds two roles and matches an audience twice → one message, deduped by `dedupe_key`.
- A person is deactivated between queue and send → drop, record the reason.
- A student's guardian should receive a copy → audience resolution, not a second event.
- Tenant suspended (AD-60) → queue drains to nothing; suspension is total.
- Device re-registers with a token another person held → old registration revoked, per §2's index.
- Template edited while messages are queued → queued rows carry their rendered body, not a
  template reference. **What was queued is what is sent.**

## 12. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P2-1 | Migration: tables, RLS, GRANTs, invariants test | S |
| P2-2 | **Device token sealing (Drift 6 fix, AD-87)** | S, F |
| P2-3 | Template registry, field schemas, render, validation | S |
| P2-4 | Queue worker, retry, dead-letter, dedupe | S |
| P2-5 | FCM provider; **verify a real push on a real device** | S, F |
| P2-6 | Email and SMS providers behind interfaces | S |
| P2-7 | Preferences, quiet hours, digests | S, W, F |
| P2-8 | Notification centre | W, F |
| P2-9 | Reports via P5 | S, W, F |

P2-5 is done when a push **arrives on a physical phone**, not when a console test succeeds
(`CLAUDE.md` §10).

## 13. Cross-module impact

Consumed by every module. Depends on P9 (queue drain, digests), P1 (approval events), P6 (audit),
M1 (audience resolution from authority), M2 (tenant timezone for quiet hours and digests).
