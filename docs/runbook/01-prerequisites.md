# 1. Prerequisites

Install these once. Versions are the ones the project is developed and tested with.

| Tool | Version | Why |
|---|---|---|
| Node.js | 22 or newer (developed on 24) | The API (`server/`) and the web console (`clients/web/`). `server/package.json` requires `>=22`. |
| npm | comes with Node | Installing and running both Node projects |
| PostgreSQL | 16 or newer, with `psql` and `createdb` on the PATH | The database for local development, and always for the server's tests |
| Flutter | stable channel, with Dart 3 | Both mobile apps |
| Android Studio or the Android SDK | with `adb` on the PATH | Building and installing on an emulator or a phone |
| Java | 17 | The Android build (`jvmTarget = 17`) |
| Git | any recent | |
| openssl | any | Generating secrets (`openssl rand -base64 32`) |

Optional:

- **A Supabase project**, if the team shares a hosted development database instead of each person
  running PostgreSQL. See [Database](02-database.md).
- **Xcode** for iOS. Not validated yet; the instructions here cover Android.

## Check the setup

```bash
node --version        # v22 or newer
psql --version
flutter doctor        # Android toolchain should be ticked
adb devices           # your phone or emulator should be listed
```

## Repository layout

| Path | What it is |
|---|---|
| `server/` | The Node API: `src/` code, `migrations/` SQL, `bootstrap/` role provisioning, `scripts/` operator commands, `tests/` |
| `clients/web/` | The web console (React + Vite) |
| `lib/main.dart` | The College app's entry point (flavor `college`) |
| `lib/main_admin.dart` | The Super Admin app's entry point (flavor `admin`) |
| `lib/features/` | College app features; `lib/admin/` Super Admin app |
| `docs/` | Product and architecture documents; `docs/blueprint/adr.md` holds every decision |
| `PROJECT_STATE.md` | What is built, tested and next |
