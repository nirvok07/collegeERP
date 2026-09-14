# Runbook: running College ERP end to end

How to get every part of this project running on a development machine, from an empty laptop to a
college set up on a phone. Each part has its own page; this page is the order to read them in and
a quick start for someone who has done it before.

| # | Page | What it covers |
|---|---|---|
| 1 | [Prerequisites](01-prerequisites.md) | Tools and versions to install once |
| 2 | [Database](02-database.md) | Local PostgreSQL, or Supabase as plain PostgreSQL; roles and migrations |
| 3 | [Server](03-server.md) | `server/.env`, starting the API, the first platform Owner, operator commands |
| 4 | [Web console](04-web-console.md) | Starting the browser console and pointing it at the API |
| 5 | [Mobile apps](05-mobile-apps.md) | The College app and the Super Admin app, on an emulator or a real phone |
| 6 | [First college, end to end](06-first-college.md) | From the platform Owner to a teacher marking attendance |
| 7 | [Tests and builds](07-tests-and-builds.md) | Every check the project has, and building the APKs |
| 8 | [Troubleshooting](08-troubleshooting.md) | The problems people actually hit, and the fix for each |

## The pieces

```
Super Admin app (Flutter, flavor "admin")  ─┐
College app     (Flutter, flavor "college") ─┼──►  Node API (server/, Fastify, port 3000)  ──►  PostgreSQL
Web console     (clients/web, Vite, 5173)  ─┘                                                  (local, or Supabase)
```

One API serves all three clients with one set of rules. PostgreSQL is the only store; there is no
Supabase SDK, Supabase is only a hosted PostgreSQL for development (AD-68).

## Quick start (local database)

```bash
# 1. Database (once): create the databases, then roles + migrations
cd server
npm install
npm run db:setup                      # creates college_erp_dev and college_erp_test
cp .env.example .env                  # then edit: see 03-server.md
npm run migrate                       # with BOOTSTRAP_DATABASE_URL set the first time

# 2. The first platform Owner (once)
PLATFORM_PASSWORD='<a strong password>' npm run platform:create-owner -- \
  --email owner@example.com --name "Your Name" --reason "Owner for development" \
  --operator "Your Name" --confirm "CREATE OWNER owner@example.com"

# 3. API
npm run dev                           # http://localhost:3000/health → {"status":"ok"}

# 4. Web console (another terminal)
cd ../clients/web && npm install && npm run dev      # http://localhost:5173

# 5. Phone over USB (another terminal, from the repository root)
adb reverse tcp:3000 tcp:3000
flutter run --flavor admin -t lib/main_admin.dart    # Super Admin app
flutter run --flavor college -t lib/main.dart        # College app
```

Then follow [First college, end to end](06-first-college.md).
