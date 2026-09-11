# 5. API Contract

Backend-agnostic by design. The Flutter client depends on this contract, not on a vendor. If
the backend becomes Supabase or Firebase later, an adapter satisfies this shape and nothing
above `data/datasources/remote` changes.

## 5.1 Conventions

- Base URL per flavor, versioned: `https://{env}.api.nirvok.com/v1`
- JSON only, UTC ISO-8601 timestamps, `snake_case` field names
- Resource paths are plural nouns. Actions are sub-resources, for example
  `POST /attendance-sessions/{id}/submit`
- Pagination is cursor-based: `?limit=50&cursor=...`, and responses carry `next_cursor`
- Tenant scope is a claim inside the access token. A `X-Tenant-Id` header is accepted only for
  Super Admin impersonation and is audit-logged server-side

## 5.2 Envelope

Success:

```json
{ "data": { }, "meta": { "next_cursor": null, "server_time": "2026-09-11T10:00:00Z" } }
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Roll number already exists in this section.",
    "field_errors": { "roll_no": "Already taken" },
    "trace_id": "01J9..."
  }
}
```

`message` is user-safe and shown directly. `trace_id` is logged, never displayed.

Error codes the client handles explicitly: `UNAUTHENTICATED`, `TOKEN_EXPIRED`,
`FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`, `SEAT_LIMIT_REACHED`,
`TENANT_SUSPENDED`, `CURSOR_TOO_OLD`, `RATE_LIMITED`.

## 5.3 Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Email or enrollment number plus password, returns token pair and user |
| POST | `/auth/refresh` | Rotates the refresh token, returns a new pair |
| POST | `/auth/logout` | Revokes the refresh token and the device push token |
| POST | `/auth/forgot-password` | Sends a reset link |
| POST | `/auth/accept-invite` | First-time password set for an invited user |
| GET | `/auth/me` | Current user, tenant, role and permission set |

Access token lives 15 minutes. Refresh token lives 30 days and rotates on every use. Reuse of
a consumed refresh token revokes the whole family and forces re-login, which is the standard
defence against token theft.

## 5.4 Representative endpoints

### Super Admin
```
GET    /tenants                       list colleges
POST   /tenants                       create college and invite its first admin
PATCH  /tenants/{id}                  update or suspend
GET    /platform/metrics              counts, sync health, storage
```

### College Admin
```
GET    /academic-years                POST, PATCH
GET    /departments  /programs  /class-sections  /subjects
POST   /users                         create teacher or student
POST   /users/import                  multipart CSV, returns a job id
GET    /users/import/{jobId}          import progress and row errors
POST   /teaching-assignments
GET    /timetable-slots?section_id=   POST batch, DELETE
POST   /exams  /assessments
POST   /exams/{id}/publish
GET    /reports/attendance?...        server-computed aggregates
```

### Teacher
```
GET    /me/timetable?date=
GET    /attendance-sessions?date=     own sessions
POST   /attendance-sessions           create with a client UUID
PUT    /attendance-sessions/{id}/records   full roster upsert
POST   /attendance-sessions/{id}/submit
GET    /me/assessments
PUT    /assessments/{id}/marks        batch upsert
```

### Student
```
GET    /me/timetable
GET    /me/attendance/summary
GET    /me/results
GET    /me/notices
POST   /notices/{id}/read
```

## 5.5 Sync endpoints

These carry the offline engine and matter more than any single resource endpoint.

### Pull
```
POST /sync/pull
{
  "cursors": { "class_sections": "2026-09-10T08:00:00Z", "notices": null },
  "entity_types": ["class_sections", "notices"]
}
```
Response, per entity type: `changed` (full records), `deleted` (ids), `cursor` (new value) and
`has_more`. The client repeats while any `has_more` is true. A null cursor means a full sync of
that type. A cursor older than the server's retention window returns `CURSOR_TOO_OLD`, and the
client responds by clearing that type and pulling it whole.

### Push
```
POST /sync/push
{
  "mutations": [
    {
      "id": "01J9...",                    outbox row id, used as the idempotency key
      "entity_type": "attendance_sessions",
      "entity_id": "d3f1...",             client UUID
      "operation": "create",
      "client_updated_at": "2026-09-11T09:12:00Z",
      "payload": { }
    }
  ]
}
```
Response, per mutation: `accepted` with the canonical server record, `conflict` with the server
record and a reason, or `rejected` with field errors. The endpoint is idempotent on
`id`, so replaying a batch after a lost response is safe and returns the original outcomes.

Mutations are applied server-side in the order given, and the whole batch is one transaction
per entity type.

## 5.6 Authorization, server-side

The client hides what a role cannot do. The server independently enforces it. A teacher POSTing
attendance for a section they do not teach gets a 403 regardless of what the app allowed, and
every endpoint validates tenant ownership of every referenced id before writing. Client-side
role checks are a user experience feature, never a security control.

## 5.7 Push notifications

FCM. The payload carries `type`, `entity_type` and `entity_id` but never content. On receipt the
client triggers a targeted sync and reads the real content from the local database, so nothing
sensitive sits in a notification payload or in a notification center.
