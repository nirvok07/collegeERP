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

## 7. Slice two: the queue itself

Not built yet, and it needs one decision first.

- **A durable local store.** Offline First specifies Drift over SQLite. The queued marks are
  students' personal data, so encryption at rest belongs in that decision. Adding the dependency
  needs a line in Decisions, as the architecture requires.
- **Ordering.** Per sheet: the date held before marks, marks before submission. Across sheets
  there is no ordering to keep.
- **Retry and backoff.** 2s, 8s, 30s, 2m, 10m, capped at six attempts, then parked as failed.
- **Conflicts.** A 409 after offline edits means somebody else changed the sheet. The queue never
  rebases marks onto a newer version by itself: an attendance register is a record, and a person
  decides. The row goes to Needs attention.
- **Sessions offline.** The device stays signed in offline (AD-25, AD-26). A 401 pauses the drain,
  the session renews, and the drain resumes.
- **What the teacher sees.** Pending, sent, and needs attention, per sheet, and a Sync Center that
  never discards a failed write without asking.

Slice one is its prerequisite and is useful on its own: it makes every retry of a field write
safe today, online or not.
