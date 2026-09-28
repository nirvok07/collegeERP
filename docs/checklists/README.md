# Execution Checklists

Task-level build plan, one file per phase. `docs/EXECUTION-CHECKLIST.md` is the summary and the
gate list; **these files are the work**.

| Phase | Theme | File | Slices |
|---|---|---|---|
| P0 | Stabilise | [P0-stabilise.md](P0-stabilise.md) | 11 |
| P1 | Parity debt and platform capabilities | [P1-capabilities.md](P1-capabilities.md) | 11 |
| P2 | M4 Admissions and Student Lifecycle | [P2-admissions.md](P2-admissions.md) | 16 |
| P3 | M10 Examinations and Results | [P3-examinations.md](P3-examinations.md) | 14 |
| P4 | D7 People and HR | [P4-people-and-hr.md](P4-people-and-hr.md) | 30 |
| P5 | D9 Engagement | [P5-engagement.md](P5-engagement.md) | 46 |
| P6 | D8 Campus Services | [P6-campus-services.md](P6-campus-services.md) | 48 |
| P7 | Cross-cutting and production hardening | [P7-hardening.md](P7-hardening.md) | 10 + gates |

## Conventions used in every file

**Surface tags** — `S` server · `W` web · `F` Flutter · `D` docs/decision.

**Code layout**, from the existing repository:

```
server/src/modules/<module>/
  application/      use cases, pure, dependency-injected
  domain/           entities and rules
  infrastructure/   repositories, raw SQL
  presentation/     <module>-routes.ts
server/migrations/NNN_name.sql
server/tests/<name>.test.ts
clients/web/src/features/<feature>/
lib/features/<feature>/{data,domain,presentation}/
test/…                         Flutter tests
```

**Every slice carries the same four closing tasks**, written out per slice rather than assumed:
migration invariants asserted, unauthorised-access tested, both client surfaces or a recorded
parity exception, tracker updated and committed.

**Task prefixes**

- `MIG` migration · `SVC` application service · `REPO` repository · `API` route
- `WEB` React screen · `APP` Flutter screen · `TEST` test · `JOB` scheduled job
- `DOC` documentation or decision · `VAL` validation on a real device or browser

## Rules that apply to every task

1. No module holds a monetary balance except M11 (AD-6).
2. No module stores a derived academic value (AD-7); declared exceptions are listed per module.
3. Correction is a workflow, never an edit (AD-13); correction tables are INSERT and SELECT only.
4. Cross-module questions go through a declared capability (AD-28), never a shared read.
5. A slice is DONE on every surface AD-84 requires, or its exception is recorded in
   `MODULE_REGISTRY.md` with a reason.
6. **Every business invariant gets a negative test** — the lesson of the unenforced geo-fence (P0-0).
