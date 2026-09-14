# 3. Server (the API)

The API is `server/`: Node, Fastify, TypeScript run directly by `tsx`. Every npm script loads
`server/.env` itself.

## `server/.env`

```bash
cd server
cp .env.example .env
```

Then fill it in. **Never commit `server/.env`**, and never put a real password in `.env.example`.

| Variable | Required | What to put |
|---|---|---|
| `NODE_ENV` | no (default `development`) | `development` locally, `production` on a server |
| `PORT` | no (default `3000`) | The API's port |
| `DATABASE_URL` | yes | The `erp_app` connection ([Database](02-database.md)) |
| `MIGRATION_DATABASE_URL` | yes | The `erp_migrator` connection |
| `BOOTSTRAP_DATABASE_URL` | first migrate only | An administrative connection that can create roles |
| `JWT_SECRET` | yes, 32+ characters | `openssl rand -base64 48` |
| `COOKIE_SECRET` | yes, 32+ characters, different from `JWT_SECRET` | `openssl rand -base64 48` |
| `SECRET_SEALING_KEY` | yes in production | `openssl rand -base64 32`; seals authenticator secrets (AD-63) |
| `SECRET_SEALING_KEY_ID` | no (default `k1`) | A label for the key, so it can be rotated |
| `CORS_ORIGINS` | no (default `http://localhost:5173,http://localhost:4173`) | Browser origins allowed to call the API; the web console's address |
| `INVITATION_TTL_HOURS` | no (default 72) | How long invitations last |
| `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS` | no (900, 30) | Session lengths |

Without `SECRET_SEALING_KEY`, outside production, the server uses a publicly known development key
and prints a warning. That is fine on a laptop and refused in production.

## Start it

```bash
cd server
npm install          # once
npm run dev          # restarts on every change
# or
npm start            # no watching
```

Check it is up:

```bash
curl http://localhost:3000/health       # {"status":"ok"}
```

The server listens on all interfaces (`0.0.0.0`), so a phone on the same Wi-Fi can reach it at
`http://<your-laptop-ip>:3000`. Stop it with Ctrl+C; it closes the database pool cleanly.

If it exits at once with `Invalid configuration: …`, the names listed are the variables that are
missing or too short.

## The first platform Owner

Nobody can sign in until a platform Owner exists. Create one from the command line (development
and app testing only). The password comes from an environment variable so it never lands in shell
history arguments or logs, and the command refuses without the exact confirmation phrase:

```bash
cd server
PLATFORM_PASSWORD='<a strong password>' npm run platform:create-owner -- \
  --email owner@example.com \
  --name "Your Name" \
  --reason "Owner account for development" \
  --operator "Your Name" \
  --confirm "CREATE OWNER owner@example.com"
```

The authenticator is set up at this account's first sign-in in the Super Admin app. The action is
recorded in the platform audit, with the operator named.

## Operator commands

All of these are for development and app testing, refuse without their confirmation phrase, never
print a secret, and are audited.

| Command | When |
|---|---|
| `npm run platform:create-owner -- …` | Create an Owner (above) |
| `PLATFORM_PASSWORD='…' npm run platform:set-password -- --email … --reason … --operator … --confirm "SET PASSWORD <email>"` | Set a platform account's password. Does not touch its authenticator. |
| `npm run platform:disable-account -- …` | Disable a platform account |
| `npm run platform:break-glass -- --email … --reason … --operator … --confirm "RESET <email>"` | The **only** Owner lost their authenticator phone: clears it so they set up a new one. Refuses if another enrolled Owner exists, because that Owner can reset it in the Super Admin app. |
| `npm run seed:device-test` | Creates a separate `device-test` college for trying the app on a phone. Its passwords are written only to `server/.device-test.local.json` (git-ignored). |
| `npm run db:setup`, `npm run db:bootstrap`, `npm run migrate`, `npm run db:supabase:rebuild` | See [Database](02-database.md) |

Forgotten passwords of college users are **not** an operator job: an administrator issues a reset
code in the app (People → a person → Reset password), and the Super Admin issues one for a
college's administrator from the college's page (AD-80).

## Production, briefly

The same server runs in production with `NODE_ENV=production`, on our own PostgreSQL, behind HTTPS.
It refuses to start without `JWT_SECRET` and `SECRET_SEALING_KEY`. Set `CORS_ORIGINS` to the real
web console address. The operator commands above are development tools.
