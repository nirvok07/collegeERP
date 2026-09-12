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

## 12.2 Firebase: pending re-registration

**Not done, and deliberately not faked.** Firebase project `collegeerp-6a872` has an Android app
registered for `com.example.college_erp` and an iOS app registered for `com.example.collegeErp`.
Three generated files still describe those registrations:

- `android/app/google-services.json`
- `ios/Runner/GoogleService-Info.plist`
- `lib/firebase_options.dart`

They are left exactly as generated. Editing the package name inside them by hand would let the
build pass while pointing the app at a registration made for a different identity, which is
worse than a build that fails and says why.

**Consequences until it is done:**

- The Android build fails at the Google Services step with a message that no client matches
  `com.nirvok.collegeErp`. The reason is written at that line in `build.gradle.kts`.
- iOS builds, but Firebase is configured for a different bundle, so FCM and Crashlytics cannot be
  trusted there.
- The app itself still runs: `FirebaseServices.initialise` guards every step and continues
  without Firebase, so no screen depends on it.

**To complete it, with console access to `collegeerp-6a872`:**

1. Register an Android app with package name `com.nirvok.collegeErp`.
2. Register an iOS app with bundle identifier `com.nirvok.collegeErp`.
3. Upload the APNs authentication key for the new iOS app, or FCM cannot reach iOS devices.
4. Add the signing-certificate SHA-1 and SHA-256 for the Android app once release signing exists.
5. From the repository root, run `flutterfire configure --project=collegeerp-6a872`, choosing
   Android and iOS only. It regenerates all three files.
6. Confirm each regenerated file names `com.nirvok.collegeErp`, then delete the two
   `com.example.*` apps from the project so nothing keeps sending to them.
7. Remove the PENDING comment from `build.gradle.kts`.

Web is never selected in step 5. There is no Flutter Web client (AD-24, AD-54).

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

**Toolchain on the current development machine**, as `flutter doctor` reports it: Android
licences are not accepted, and Xcode is incomplete. Neither platform can be built there until
both are resolved.
