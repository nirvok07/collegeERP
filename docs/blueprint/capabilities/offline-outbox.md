# Offline Outbox — one shared capability, built in slices

Designed once, as shared infrastructure, rather than as a queue per feature. The full design of
the client side already exists in [Offline First](../../03-offline-first.md); this document
records the audit that decided what to build first, and reconciles that design with what has
been built since.

## 1. Why now

Roadmap Phase 1 said no feature phase begins before the sync engine exists. Five have, M3 to M7,
under AD-9's narrowing of offline to field roles and the owner's direction slice by slice. That is
Drift 5. It is not closed by this document; it is being paid down.

AD-9 names what must work offline: **attendance, timetable, notices, and a student's own
records.** Two of those are writes a teacher makes in a classroom, and both now exist:
attendance, and internal assessment marks.

## 2. Which mobile operations need it

| Operation | Needs the outbox | Why |
|---|---|---|
| Save attendance marks | Yes | Daily, in basements and corridors, by the person the record is about |
| Submit an attendance register | Yes | Follows the marks it closes, on the same sheet |
| "I taught this class" | Yes | Attendance's companion, same place, same network |
| Record when an assessment was held | Yes | Precedes its marks on the same sheet |
| Save assessment marks, submit a sheet | Yes | Often entered in the room at the end of a test |
| Register a device for push | No | Retried on the next launch; losing one attempt costs nothing |
| Sign in, refresh, sign out | Never | Credentials are never queued; a replayed refresh would replay a rotated token |
| Timetable, teaching, a student's records | Not the outbox | Reads. They need the pull side of the sync engine, a local cache, not a queue |

Back-office writes on the web are online-first (AD-9) and are not queued.

## 3. What a queued write needs from the server

A queued write is sent when the network allows, and a network that drops mid-request loses the
response, not the request. So every queued write must be **safe to send twice**.

Today none of them is. Attendance and marks writes are pinned to a version (AD-52), which is right
for its purpose: it stops two *different* writes from overwriting each other. But the server
cannot tell the *same* write arriving twice from a different one, so a resent write whose first
attempt committed is refused as "somebody else changed this register". That is a false conflict,
and it can happen today on a flaky classroom network with no offline mode at all.

**This is slice one.** Each field write carries an `Idempotency-Key`. The server stores the
outcome against the key, and a resent write with the same key gets the stored outcome back
instead of being applied again or refused. AD-58.

## 4. The contract

- **Header.** `Idempotency-Key`, 8 to 128 letters, digits, dashes or underscores. The client makes
  one per logical write.
- **Opt-in per route.** Only routes marked idempotent honour it; every other route ignores the
  header. So no response carrying a secret, such as a new invitation token, is ever stored.
- **Scoped to the caller.** A key belongs to one person in one college. Nobody can replay, or even
  detect, another person's response by guessing a key.
- **Bound to the request.** The key records a hash of the method, the address and the body. The
  same key sent for a different request is refused with a validation error, never answered with
  the first request's outcome.
- **What is kept.** Successes and client errors are kept for 24 hours and replayed exactly, marked
  with `Idempotent-Replayed: true`. A server error releases the key, so the write can be retried.
  This is the failure table of Offline First section 3.7.
- **Two at once.** A second request with a key whose first request is still running is told to
  try again shortly. A reservation left running for more than two minutes is treated as
  abandoned and taken over.

## 5. Why the key is not recorded inside the write's own transaction

Recording it there would put idempotency inside every use case. Instead it is reserved before the
handler runs and completed after the response is produced, each in its own short transaction.

The one gap is a process crash after the write commits and before its outcome is recorded. Every
covered write is already version-pinned or guarded by a state transition, so resending it then
does not apply it twice: it reports an honest conflict, which is today's behaviour, confined to a
crash rather than to every lost response.

## 6. The client

- A key is minted when a save starts, and **reused only while the identical save is retried**.
  Once anything changes, the marks or the version, the next save is a different request and gets
  a new key.
- The key travels with the renew-and-resend the client already does on an expired token, so that
  resend is safe too.
- Nothing about the screens changes. A save that fails keeps every mark on screen, as before.

## 7. Slice two: the durable queue

Status: **implemented 2026-09-13 (AD-59), unit-tested, verified on an Android phone the same day** (evidence in docs/12). Code in
`lib/core/outbox/`. Three deliberate deviations from the design below:

- **No roster cache (§7.2).** The minimum-data rule wins: only queued writes are stored. A sheet
  already open keeps working offline; opening one for the first time offline does not.
- **No coalescing (§7.4).** Writes go online first, so every queued write has already been
  attempted and is frozen. Later edits queue behind it with their own key.
- **Transport failures keep retrying (§7.6).** At most every 10 minutes, never parked: a missing
  network does not need a person. Server errors still park after 6 attempts.

### 7.1 What may be queued

A closed allowlist of typed operations, not a generic mutation queue. The enum is the contract;
anything not in it cannot be enqueued, by type.

| Kind | Route | Target |
|---|---|---|
| `attendance.save` | PUT `/sessions/:id/attendance` | session |
| `attendance.submit` | POST `/sessions/:id/attendance/submit` | session |
| `session.taught` | POST `/sessions/:id/complete` | session |
| `assessment.heldOn` | POST `/assessments/:id/held-on` | component |
| `assessment.marks` | PUT `/assessments/:id/marks` | component |
| `assessment.submit` | POST `/assessments/:id/submit` | component |

Never queued: sign-in, renewal, sign-out, device registration, corrections, verification,
anything administrative. Corrections and verification carry authority that must be checked live.

### 7.2 Offline reads the queue needs

Marking a register offline needs its roster. So the same store caches **the last sheet read**
for each session and component (read-through), and the schedule prefetches the sheets for
today's and tomorrow's classes. This is the minimum pull side; it is not the general sync engine.

### 7.3 Operation record

`id`, `kind`, `tenant_id`, `person_id`, `target_id`, `payload` (JSON), `base_version`,
`version_from` (`fixed` or `predecessor`), `idempotency_key`, `state`, `attempts`,
`next_attempt_at`, `last_error_code`, `last_error_message`, `created_at`, `updated_at`.

States: `pending` → `sending` → `synced`, or `failed` (needs attention) or `conflict`.

### 7.4 Idempotency (AD-58)

- The key is minted at enqueue and **persisted with the operation**, so it survives restarts and
  a resend after a crash is replay-safe.
- An operation never attempted may be edited in place; its key is re-minted with it. Once
  attempted, its payload is frozen: a later edit becomes a new operation.
- Consecutive unsent `attendance.save` or `assessment.marks` for one target coalesce into one
  (latest value per student). Nothing coalesces across a submit.

### 7.5 Ordering and versions

- FIFO per target; targets drain independently. `heldOn` precedes `marks` precedes `submit`.
- An offline save-then-submit cannot know the submit's version in advance. It is enqueued with
  `version_from = predecessor` and takes the version the save returned. If the predecessor fails,
  its dependants wait; they are never sent on a guessed version.

### 7.6 Outcomes

| Response | Result |
|---|---|
| 2xx, or a replay | `synced`; the cached sheet is refreshed from the server |
| 409 | `conflict`. Never rebased automatically: a register is a record, and a person decides |
| 422 | `failed`, message kept |
| 403 | `failed`: authority or reach changed since enqueue |
| 401 | Renew and resend with the same key. If renewal needs a fresh sign-in, the queue pauses and says so. Nothing is dropped and the user is never signed out (AD-25, AD-26) |
| 5xx, timeout, no network | Retry at 2s, 8s, 30s, 2m, 10m; after 6 attempts, `failed` |

Drains on: connectivity regained, app resumed, after enqueue, and a manual "send now".

### 7.7 Identity

- Operations belong to the person and college that made them, and are drained only while that
  same person is signed in. Another account on the device never sends them.
- Sign-out with unsent operations says how many and requires an explicit "discard" to proceed.
  Security policy wipes the local database on sign-out (docs/08), so that is the only moment data
  can be lost, and never silently.

### 7.8 Encryption at rest (AD-59)

- Drift over `package:sqlite3` 3.x with the build hook set to **SQLite3MultipleCiphers**
  (`hooks: user_defines: sqlite3: source: sqlite3mc`). The legacy `sqlcipher_flutter_libs` and
  `sqlite3_flutter_libs` are end-of-life. sqlite3mc avoids linking OpenSSL on Android.
- A random 256-bit key is generated on first open and kept in `flutter_secure_storage`: the
  Android Keystore, and the iOS Keychain as "after first unlock, this device only", so it never
  leaves the device in a backup. It is applied with `PRAGMA key` before any other statement.
- The database file is excluded from Android backup, so a restored phone never holds a file
  without its key.
- If the key is unreadable (a reinstall or a Keystore reset), the database is deleted and
  recreated, and the teacher is told unsent items were lost. It cannot be recovered by design.
- Nothing from the queue is logged, sent to Crashlytics or put in a notification.

### 7.9 Crash recovery and cleanup

- On start, `sending` becomes `pending`. The persisted key makes the resend safe.
- `synced` operations are deleted after 24 hours, matching the server's key lifetime. `failed`
  and `conflict` stay until a person acts. Nothing is discarded automatically.
- A pending operation older than 24 hours still sends. It has lost replay protection, but version
  pinning still prevents a double apply.
- Cached sheets older than the term, or belonging to another person, are purged.

### 7.10 What the teacher sees

- Per sheet: saved on this phone, sending, sent, or needs attention.
- A Sync Center lists what needs attention, with the server's reason, retry, and an explicit
  discard with confirmation.
- Screens keep working from the cache offline. A submitted register still shows as "waiting to
  send" until the server confirms, never as submitted.

### 7.11 Local schema migrations

Drift `schemaVersion` with stepwise migrations, and schema snapshots checked in and tested with
`drift_dev`. A migration that would drop pending operations is forbidden. It must carry them
forward.

### 7.12 Tests required

Coalescing, ordering, predecessor versions, each outcome row, key persistence across a simulated
restart, account isolation, the sign-out warning, key loss, and an encrypted file that cannot be
opened without its key. On device: airplane mode, mark, submit, reconnect, confirmed on the server.
