# Start here: run the server and test on your phone, A to Z

One page, for this exact setup: a Mac, the Supabase development database, and an Android phone
connected by USB. Follow it top to bottom. Every command is copy-paste.

You need **three terminal windows**: one for the server, one for the phone, one spare.

---

## If the app says "unable to connect" (check these first)

| # | Check | How | Fix |
|---|---|---|---|
| 1 | Is the server running? | `curl http://localhost:3000/health` | Must print `{"status":"ok"}`. If not, do **Step 3**. |
| 2 | Is the phone connected? | `adb devices` | Must list one device as `device`. If `unauthorized`, accept the prompt on the phone. |
| 3 | Is the phone forwarded to the Mac? | `adb reverse --list` | Must show `tcp:3000 tcp:3000`. If not: `adb reverse tcp:3000 tcp:3000`. **Repeat every time you unplug the phone or restart the Mac.** |
| 4 | Is only one server running? | `lsof -iTCP:3000 -sTCP:LISTEN` | At most one line. If the server says `EADDRINUSE`, stop the old one: `kill <PID from lsof>`. |
| 5 | Did the server stop with a database error? | Look at the server terminal | See **Problems** at the end. |

The installed apps look for the server at `http://localhost:3000` on the phone. That only reaches
your Mac through `adb reverse` (check 3). On Wi-Fi without a cable, see **Step 6b**.

---

## Step 1: once only, install the tools

- Node.js 22 or newer: `node --version`
- Flutter: `flutter doctor` (the Android line should be ticked)
- `adb`: `adb version` (comes with Android Studio's platform tools)

## Step 2: once only, the server's settings

```bash
cd ~/Dev/college_erp/server
npm install
ls .env            # must exist. If not: cp .env.example .env, then fill it in (03-server.md)
```

`server/.env` already points at Supabase (`DATABASE_URL=...pooler.supabase.com...`). Do not share or
commit this file.

## Step 3: every time, start the server (terminal 1)

```bash
cd ~/Dev/college_erp/server
npm run dev
```

Wait for this line:

```
Server listening at http://127.0.0.1:3000
```

Leave this window open; closing it stops the server. Check from terminal 3:

```bash
curl http://localhost:3000/health          # {"status":"ok"}
```

## Step 4: every time, connect the phone (terminal 2)

1. On the phone: Settings → Developer options → **USB debugging** on. (Xiaomi/Redmi: also **USB
   debugging (Security settings)** and **Install via USB**.)
2. Plug in the cable, accept "Allow USB debugging" on the phone.
3. Then:

```bash
adb devices                        # your phone listed as "device"
adb reverse tcp:3000 tcp:3000      # the phone's localhost:3000 now reaches the Mac
adb reverse --list                 # shows tcp:3000 tcp:3000
```

## Step 5: install the apps (terminal 2)

Either build and install in one go (from the repository root):

```bash
cd ~/Dev/college_erp
flutter run --flavor college -t lib/main.dart          # College app
flutter run --flavor admin -t lib/main_admin.dart      # Super Admin app (in another terminal)
```

or install the already-built APKs:

```bash
cd ~/Dev/college_erp
flutter build apk --debug --flavor college -t lib/main.dart
flutter build apk --debug --flavor admin -t lib/main_admin.dart
adb install -r build/app/outputs/flutter-apk/app-college-debug.apk
adb install -r build/app/outputs/flutter-apk/app-admin-debug.apk
```

## Step 6: test

### 6a. Over USB (normal)

Steps 3 and 4 done, open the app on the phone:

1. **Super Admin app**: enter the Owner's email (`nirvokofficial@gmail.com`) → **Send code** → type
   the code. There is no password and no authenticator (AD-82). Until go-live nothing is sent and
   the code is always **123456**.
2. **Add college**: code (such as `sunrise`), name, and the administrator's name and email (your own
   email works).
3. **College app**: enter the college code → the administrator's email → **Send code** → type
   **123456**. The administrator's account becomes active on this first sign-in.
4. Set up the college in the order in [First college, end to end](06-first-college.md): Organisation →
   Academic setup → Curriculum → Rooms → Onboarding → Sections → courses → timetable.

### 6b. Over Wi-Fi (no cable)

The phone and the Mac must be on the **same Wi-Fi**. Find the Mac's address:

```bash
ipconfig getifaddr en0             # for example 192.168.1.20
```

Build the app with that address, then install it:

```bash
cd ~/Dev/college_erp
flutter build apk --debug --flavor college -t lib/main.dart --dart-define=API_BASE_URL=http://192.168.1.20:3000
adb install -r build/app/outputs/flutter-apk/app-college-debug.apk
```

On the phone's browser, `http://192.168.1.20:3000/health` must show `{"status":"ok"}`. If it does not,
allow Node through the Mac's firewall (System Settings → Network → Firewall).

## Step 7: stop

- Server: press **Ctrl+C** in terminal 1.
- Nothing else needs stopping. Next time, repeat Steps 3, 4 and 6.

---

## Problems

| What you see | Why | Fix |
|---|---|---|
| Server: `EADDRINUSE :3000` | Another server already runs | `lsof -iTCP:3000 -sTCP:LISTEN`, then `kill <PID>`, then Step 3 again |
| Server: `password authentication failed` (28P01) | A Supabase password changed; the pooler remembers the old one for a while | Wait a minute and retry. If you changed the `erp_app` password, update `DATABASE_URL` in `server/.env` |
| Server: `Invalid configuration: …` | A setting in `server/.env` is missing | Fill in the names it lists ([Server](03-server.md)) |
| App: "No college uses that code" | Wrong code, or the college is suspended or closed | Check the code in the Super Admin app |
| Super Admin app: code refused | The phone's clock is off, or the code expired | Set the clock to automatic; use a fresh code |
| App worked, then stopped connecting | Cable was unplugged or `adb` restarted | `adb reverse tcp:3000 tcp:3000` again |
| Web console: requests fail with CORS | Opened on an address not in `CORS_ORIGINS` | Add it in `server/.env`, restart the server |

More detail on every part: [the runbook](README.md).
