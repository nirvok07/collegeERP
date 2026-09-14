# 7. Tests and builds

Run these before every commit that touches the code they cover.

## Server

```bash
cd server
npm run typecheck
npm test
```

`npm test` always uses a **local** PostgreSQL database named `college_erp_test`, whatever
`server/.env` says, and connects as `erp_app` / `erp_migrator` with the local passwords
(`erp_app_local`, `erp_migrator_local`). So it needs:

1. PostgreSQL running on `localhost:5432`,
2. the database created (`npm run db:setup` creates it),
3. the two roles existing with those passwords (created once by a local `npm run migrate` with
   `BOOTSTRAP_DATABASE_URL` set; see [Database](02-database.md)).

The tests apply migrations themselves and clear their own data between tests. They take about two
minutes. Set `TEST_DB_NAME` to use a different database name.

## Web console

```bash
cd clients/web
npm run typecheck
npm test
```

## Flutter (both apps)

From the repository root:

```bash
flutter analyze
flutter test
```

One test, the encrypted-database smoke test (`test/core/outbox/cipher_smoke_test.dart`), has
occasionally failed when the whole suite runs under load and passed on a rerun. A repeatable
failure is a real failure.

## Builds

```bash
flutter build apk --debug --flavor college -t lib/main.dart
flutter build apk --debug --flavor admin -t lib/main_admin.dart
(cd clients/web && npm run build)
```

## Real-device checks

Unit and widget tests do not prove the apps work on a phone. Before calling a mobile feature done,
open it on a real Android phone against a running server ([Mobile apps](05-mobile-apps.md)) and go
through the relevant part of [First college, end to end](06-first-college.md). Record what was
checked in `PROJECT_STATE.md`.
