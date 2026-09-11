# 3. Offline First

## 3.1 The one rule

**The local database is the single source of truth for every read.** The UI never awaits the
network to render. Repositories expose Drift streams; the network only ever writes into the
local database, and the database pushes into the UI.

```
UI  ◀── stream ── Drift ◀── writes ── Sync engine ◀── Dio ◀── API
 │                  ▲
 └── write ─────────┘ (local first, then outbox)
```

A screen that cannot render from local data is a design defect, not a network problem.

## 3.2 Read path

1. Cubit calls a use case, which calls `repository.watchX()`.
2. The repository returns `Stream<Result<T>>` backed by a Drift query. First value is immediate,
   from disk.
3. In parallel the repository asks the sync engine for a refresh of that entity. The refresh
   writes to Drift. The stream emits again. The Cubit never distinguishes the two emissions.
4. Every screen shows a freshness indicator when data is stale: "Updated 2 hours ago" plus an
   offline chip when there is no connection.

Consequence: there is no full-screen spinner after the very first sync. Loading state means
"we have nothing at all yet", which is rare and mostly limited to first login.

## 3.3 Write path — the outbox

Every mutation is local-first and durable.

1. Write the change to Drift immediately, with `syncStatus = pending` and a client-generated
   UUID as the primary key.
2. Insert a row into the `outbox` table describing the mutation: entity type, entity id,
   operation, JSON payload, an idempotency key, and the creation timestamp.
3. Return success to the Cubit right away. The UI reflects the change at once, marked pending.
4. The sync engine drains the outbox in insertion order whenever the device is online.
5. On server acknowledgement, reconcile the local row with the server's canonical version and
   set `syncStatus = synced`.

Client-generated UUIDs mean an offline-created record has a stable identity before the server
ever sees it, so references between offline records hold. The server accepts the client id as
the record's id rather than issuing its own.

The idempotency key makes a replayed request safe. If the response was lost but the server
committed, the retry returns the original result rather than creating a duplicate.

## 3.4 Ordering and dependencies

The outbox drains strictly in order per entity type. A create must be sent before the update
that follows it. If a create fails permanently, its dependent mutations are marked blocked and
surfaced together rather than sent against an id that does not exist.

Batches are grouped per entity type and capped at 200 mutations per request.

## 3.5 Pull sync — delta by cursor

Each entity type keeps a cursor row: the server timestamp of the last successfully applied
change. A pull sends every cursor and receives only what changed since.

- Deletes come back as tombstones, never as silent absences, so a delete that happened while
  offline actually propagates.
- A pull is applied in one Drift transaction per entity type. A partial failure rolls back and
  leaves the cursor untouched, so the next attempt is a clean retry.
- A cursor that the server rejects as too old triggers a full resync of that entity type.

### Sync triggers

| Trigger | Scope |
|---|---|
| App start, after session restore | All entities for the role |
| Connectivity regained | Outbox drain, then delta pull |
| App returns to foreground, if last sync over 5 minutes ago | Delta pull |
| Pull-to-refresh on a screen | That screen's entities |
| Push notification with a sync hint | Named entity only |
| Periodic while foregrounded, every 15 minutes | Delta pull |

## 3.6 Conflict policy

Conflicts are resolved per entity, not globally. Last-write-wins everywhere would silently
destroy a teacher's work.

| Entity | Policy | Reasoning |
|---|---|---|
| Attendance records | Client wins if the session is still a draft owned by that teacher; server wins once submitted | The teacher in the room is the authority until they submit |
| Marks | Client wins before publication; after publication the server wins and the client change is rejected with a message | Published results are institutional records |
| Notices | Server wins | Authored once, centrally |
| Timetable, academic structure | Server wins, always | Admin-owned reference data, never edited on a student or teacher device |
| Profile fields | Field-level merge on `updatedAt` per field | Two actors legitimately edit different fields |

When the server rejects a client change, the local row moves to `syncStatus = conflict`, the
server version is applied, and the user sees a non-blocking banner naming what was overwritten
and why. A conflict is never resolved silently.

## 3.7 Failure handling in the outbox

| Server response | Action |
|---|---|
| 2xx | Mark synced, reconcile, drop the outbox row |
| 409 conflict | Apply the conflict policy above, drop the outbox row |
| 422 validation | Terminal. Mark the row failed, surface it in a "Needs attention" list with the field errors |
| 401 | Pause the drain, refresh the token, resume |
| 5xx or transport failure | Retry with exponential backoff: 2s, 8s, 30s, 2m, 10m, capped at 6 attempts, then park as failed |

Failed mutations are never discarded automatically. They are listed in a Sync Center screen
where the user can retry or discard each one deliberately.

## 3.8 Storage limits

An ERP accumulates history quickly and a phone is not an archive.

- Students and teachers retain the current academic year locally, plus the previous year's
  results in summary form.
- Older data is fetched on demand and cached for 7 days.
- Admin list screens are paginated and locally capped at 500 rows per entity, with search
  hitting the server when the local cache misses.
- A pruning job at app start deletes synced rows outside the retention window. Pending and
  failed rows are never pruned.

## 3.9 What is deliberately not offline

- Login on a device with no previously stored session. Authentication requires the network.
- Payments, when they arrive in release two.
- CSV bulk import, which needs server validation.
- Report generation that aggregates across the college.

Each of these shows an explicit offline state explaining that a connection is required, rather
than failing with a generic error.
