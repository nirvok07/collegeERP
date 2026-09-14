# 5. Mobile apps

One Flutter codebase builds two separate apps (AD-72):

| App | Flavor | Entry point | Android id | Home screen name |
|---|---|---|---|---|
| College app: administrators, heads of department, teachers | `college` | `lib/main.dart` | `com.nirvok.collegeErp` | College |
| Super Admin app: the platform's Owners and Support | `admin` | `lib/main_admin.dart` | `com.nirvok.collegeErp.admin` | Super Admin |

They install side by side. Only the College app uses Firebase (messaging, Crashlytics, Remote
Config); the Super Admin app has none.

## Where the app finds the API

At build time, from `--dart-define=API_BASE_URL=…`. The default is `http://localhost:3000`, which
works on a USB-connected phone with `adb reverse` (below). There is no settings screen for it on
purpose: a released app must be built with the real address.

| Where the app runs | API address |
|---|---|
| Real phone over USB | run `adb reverse tcp:3000 tcp:3000`, then the default works |
| Android emulator | `--dart-define=API_BASE_URL=http://10.0.2.2:3000` (the emulator's name for your laptop) |
| Real phone on the same Wi-Fi | `--dart-define=API_BASE_URL=http://<laptop-ip>:3000` |

`adb reverse` lasts until the phone is unplugged or `adb` restarts; run it again after either.

## Run in development

From the repository root, with the server running ([Server](03-server.md)):

```bash
flutter pub get                                   # once, and after pulling

adb reverse tcp:3000 tcp:3000                     # USB phone

flutter run --flavor college -t lib/main.dart     # College app
flutter run --flavor admin -t lib/main_admin.dart # Super Admin app
```

With more than one device connected, add `-d <device id>` (from `flutter devices`).

## Build an installable APK

```bash
flutter build apk --debug --flavor college -t lib/main.dart
flutter build apk --debug --flavor admin -t lib/main_admin.dart
# → build/app/outputs/flutter-apk/app-college-debug.apk and app-admin-debug.apk

adb install -r build/app/outputs/flutter-apk/app-college-debug.apk
```

For a phone that will not be plugged into your laptop, build with the API's reachable address:

```bash
flutter build apk --debug --flavor college -t lib/main.dart \
  --dart-define=API_BASE_URL=http://<laptop-ip>:3000
```

Release builds (`--release`) are still signed with the debug key; a proper signing configuration is
needed before publishing to the Play Store.

## What to expect on first open

**College app**
1. Enter the **college code** (for example `sunrise`). The app shows the college's name and logo.
2. Sign in with email and password, or tap **I have an invitation** to set a password with the
   code from your invitation message. **Forgot password?** explains how to get a reset code.
3. Every later open asks for the phone's fingerprint, face or screen lock (a phone with no screen
   lock is let through).

**Super Admin app**
1. Sign in with email and password.
2. The first time, the app shows an authenticator key: add it to your authenticator app, type the
   six-digit code it shows, then sign in again with your password and a fresh code.
3. A person invited by an Owner taps **I have an invitation** instead, sets a password with the
   invitation code, then sets up the authenticator the same way.

## Offline

Teachers can take attendance and enter marks without a network; the app saves them encrypted on
the phone and sends them when the network returns. Administrative changes (setting up the college,
people, timetable) need a network and say so when it is missing.
