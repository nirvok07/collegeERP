# 8. Troubleshooting

## Server

**`Invalid configuration: JWT_SECRET, COOKIE_SECRET` (or other names)**
Those variables are missing from `server/.env` or too short. Secrets need at least 32 characters.

**`SECRET_SEALING_KEY is not set: sealing with the insecure development key`**
A warning, not an error, outside production. Set `SECRET_SEALING_KEY` (`openssl rand -base64 32`)
to silence it. In production the server refuses to start without it.

**Migrations say the application role is missing**
Run `npm run migrate` once with `BOOTSTRAP_DATABASE_URL` set to an administrative connection; it
creates the roles first.

**`password authentication failed` (`28P01`) against Supabase, right after a rebuild or a password change**
Supabase's pooler keeps a role's old password for a while after it changes. Wait a minute and retry.
`npm run db:supabase:rebuild` already retries through this delay.

**`psql` cannot parse a Supabase URL whose password contains `@`**
Percent-encode it in URLs you give to `psql`: `@` is `%40`. The server's own URL handling copes.

**Tests fail with connection errors**
They always use local PostgreSQL (`college_erp_test`), never Supabase. See
[Tests and builds](07-tests-and-builds.md).

## Web console

**The console loads but every request fails, with a CORS error in the browser console**
Add the address you opened the console on to `CORS_ORIGINS` in `server/.env`, then restart the
server.

## Mobile apps

**The app cannot reach the server ("network" errors)**
- USB phone: run `adb reverse tcp:3000 tcp:3000` again (unplugging or restarting `adb` clears it).
- Emulator: build with `--dart-define=API_BASE_URL=http://10.0.2.2:3000`; `localhost` on an
  emulator is the emulator itself.
- Wi-Fi: the laptop and phone must be on the same network, and the firewall must allow port 3000.
- Check the server is up: `curl http://localhost:3000/health`.

**"No college uses that code. Check it with your college."**
The code is wrong, or the college is suspended or closed. The server deliberately gives the same
answer for all three.

**The Super Admin app's code is refused**
The phone's clock must be right (authenticator codes depend on time). A code works once and for
about 30 seconds.

**Someone entered the invitation code into Google Authenticator**
It is not an authenticator key. The invitation code goes into **I have an invitation**; the
authenticator key is shown only later, during authenticator setup.

**The app asks for a fingerprint every time it opens**
By design (R59). A phone with no screen lock at all is let through.

**A build fails in a Firebase or Crashlytics task for the admin flavor**
The admin flavor has no Firebase client by design and its Firebase tasks are switched off in
`android/app/build.gradle.kts`. Build it with `--flavor admin -t lib/main_admin.dart`, never with
the college entry point.

## Secrets

- Never commit `server/.env`, `server/.device-test.local.json` or any real password.
- `server/.env.example` holds placeholders only.
- If a real password was ever committed, **change it** at its source (for Supabase: Project
  Settings → Database → reset the database password) and update your own `server/.env`. Removing
  it from the file does not remove it from git history.
