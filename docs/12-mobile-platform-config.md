# 12. Mobile Platform Configuration

What identifies the Flutter app to Android, iOS and Firebase, what state each piece is in, and
what the device-validation phase must do before any of it is called ready.

## 12.1 Canonical identity

Requirement R2 fixes the application identity. Nothing else is invented.

| Where | Value | State |
|---|---|---|
| Android `applicationId` | `com.nirvok.collegeErp` | Set in `android/app/build.gradle.kts` |
| Android `namespace` | `com.nirvok.collegeErp` | Set; `MainActivity.kt` moved to the matching package |
| iOS bundle identifier | `com.nirvok.collegeErp` | Set in `ios/Runner.xcodeproj/project.pbxproj` |
| iOS test bundle | `com.nirvok.collegeErp.RunnerTests` | Set |
| Display name | `College` | Android label and iOS `CFBundleDisplayName` and `CFBundleName` |

The Dart package is still named `college_erp`, which is correct and unrelated: a Dart package
name must be snake_case, it appears only in `package:` imports, and no store or Firebase sees it.

## 12.2 Firebase: registered for com.nirvok.collegeErp

**Done 2026-09-13, with the official CLI flow.** `flutterfire configure --project=collegeerp-6a872
--platforms=android,ios --android-package-name=com.nirvok.collegeErp
--ios-bundle-id=com.nirvok.collegeErp` registered two new apps and regenerated
`google-services.json`, `GoogleService-Info.plist`, `firebase_options.dart` and `firebase.json`.
It also added the Crashlytics Gradle plugin. No generated file was edited by hand.

| Platform | Firebase app id |
|---|---|
| Android | `1:949790606532:android:ce8194dcbf12bb46573591` |
| iOS | `1:949790606532:ios:a96311ee62a1d6ac573591` |

`google-services.json` still lists the old `com.example.college_erp` client beside the new one;
the build selects by package name, so it is inert.

**Tooling note.** FlutterFire fails with "doesn't support Dart 3.3.0" when Homebrew's `dart` is
first on PATH. Put Flutter's bundled Dart first and reactivate it:
`export PATH="$(dirname "$(readlink -f "$(which flutter)")")/cache/dart-sdk/bin:$PATH"` then
`dart pub global activate flutterfire_cli`.

**Still needs console access, and is not done:**

1. Upload the APNs authentication key for the new iOS app, or FCM cannot reach iOS devices.
2. Add the signing-certificate SHA-1 and SHA-256 for the Android app once release signing exists.
3. Delete the two `com.example.*` apps from the project, then re-run the configure command so
   the old client leaves `google-services.json`.

Web is never selected. There is no Flutter Web client (AD-24, AD-54).

### Device validation, 2026-09-13

Debug build on a physical Android 14 phone over USB, API reached with
`adb reverse tcp:3000 tcp:3000` and the default `API_BASE_URL`; no configuration changed.

| Check | Result | Evidence |
|---|---|---|
| Android build | VERIFIED | `flutter build apk --debug` succeeds |
| Launch | VERIFIED | Sign-in screen rendered, no crash |
| API connectivity | VERIFIED | A wrong sign-in from the phone reached the normal dev server on port 3000, and the server's refusal was shown |
| Firebase initialisation | VERIFIED | `FirebaseApp initialization successful`, no Dart-side fallback message |
| Crashlytics initialisation | VERIFIED | `Initializing Firebase Crashlytics for com.nirvok.collegeErp`. Collection is off in debug by design, so crash delivery is NOT VERIFIED |
| Remote Config | VERIFIED | A fetch was activated; no "using defaults" message |
| FCM registration | VERIFIED | After teacher sign-in: one Android device row for Test Teacher, `device.registered` audited |
| Push token hashed, never audited | VERIFIED on device | 64-hex SHA-256 only; audit payload `{platform, appVersion}`; no token in phone logs |
| Re-registration on the same phone | VERIFIED | Same row, `last_seen_at` updated, no new row |
| Sign-out revokes the device | VERIFIED after fix | `revoked_reason = signed_out`, `device.revoked` audited; next sign-in registers a fresh row |
| FCM delivery, Firebase console | NOT VERIFIED | Needs the owner to send a test message from the console |
| FCM delivery, backend | BLOCKED | Tokens are stored hash-only (Drift 6); the backend cannot address a device |
| iOS, any check | BLOCKED | Xcode is not installed; only Command Line Tools are active |
| Offline outbox (AD-59) save while offline | VERIFIED | App-only offline (USB forward removed): "Saved on this phone", server had no record |
| Outbox survives force-stop and relaunch | VERIFIED | Pending item shown after relaunch and a fresh sign-in; file encrypted, no plaintext keys |
| Outbox replay after reconnect | VERIFIED | One register v1, three correct records, one `attendance.marked`, idempotency row 200 |
| Local item removed only after acknowledgement | VERIFIED | "Everything has been sent" only after the server row existed |
| Stale write refused, not overwritten | VERIFIED | Idempotency row 409; other client's mark kept; "needs your attention" shown |
| Conflict resolved by a person | VERIFIED | Discard with confirmation; server unchanged |
| Sign-out with unsent work | VERIFIED | "Changes not sent yet" dialog: stay signed in, or delete and sign out |
| Offline cold start keeps the session | VERIFIED after fix | "Waiting for a connection", then continued into the session on reconnect |

## 12.3 What only the device-validation phase can confirm

Static analysis and unit tests stand behind the mobile client today, and nothing here is claimed
ready on a device. That phase verifies:

- Android and iOS builds, and release signing
- the identifiers above, as seen by each store tool
- Firebase configuration on both platforms after 12.2
- notification permission prompts, FCM token delivery, and push behaviour
- Crashlytics reports and Remote Config fetches
- API networking from a real device and from emulators
- secure session storage in the platform keystore and keychain

**Emulator networking.** On the Android emulator, `localhost` is the emulator, not the Mac. Pass
the host address per run rather than hard-coding it:

```
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

**Two apps (AD-72).** Android has two flavors. `college` is the default, so the commands above
build the college app unchanged (`app-college-debug.apk`). The super admin app is its own install,
`com.nirvok.collegeErp.admin`, named "Super Admin", with no Firebase:

```
flutter run   --flavor admin -t lib/main_admin.dart --dart-define=API_BASE_URL=http://10.0.2.2:3000
flutter build apk --debug --flavor admin -t lib/main_admin.dart
```

Debug builds print API logs to the console with every secret masked (AD-73); release and
production builds print none.

**Toolchain on the current development machine**, as `flutter doctor` reports it: Android
licences are not accepted, and Xcode is incomplete. Neither platform can be built there until
both are resolved.
