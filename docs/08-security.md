# 8. Security

## 8.1 Threat model

The data here is personal and academic: names, dates of birth, guardian phone numbers,
attendance and results, all belonging largely to young adults. The realistic threats are a lost
or shared device, a curious student probing the API directly, a teacher reaching data outside
their assignment, and one college seeing another's records.

## 8.2 Token handling

- Access and refresh tokens live in `flutter_secure_storage`, which is Keychain on iOS and
  EncryptedSharedPreferences backed by the Keystore on Android. Never in `SharedPreferences`,
  never in Drift, never in a log line.
- The access token is held in memory during a session and read from secure storage only on cold
  start.
- Refresh tokens rotate on every use. Reuse of a consumed token revokes the family and forces
  re-login.
- Logout clears secure storage, wipes the local database, and revokes the device push token.
  A shared device must leak nothing to the next user.

## 8.3 Authorization

Client-side role checks shape the interface. They are not a security control. Every rule is
enforced again on the server, which is the only authority.

The permission set arrives from `/auth/me` and is cached with the session. The UI asks
`session.can(Permission.markAttendance, sectionId: id)` rather than testing
`role == teacher`, so a permission change does not require touching every screen.

Teacher scope derives from `teaching_assignments`. A teacher's queries are filtered by their
assignments in the DAO layer, and the server re-validates on every write.

## 8.4 Tenant isolation

- `tenant_id` is a token claim. The client cannot choose it.
- Every local DAO applies the active tenant filter internally.
- Switching tenants, which only a Super Admin can do, clears the local database entirely before
  loading the new one. Two tenants never coexist on disk.
- Super Admin impersonation is read-only, is banner-marked in the UI for the whole session, and
  every impersonated request is audit-logged server-side.

## 8.5 Data at rest

- The Drift database is encrypted with SQLCipher, keyed by a random value generated on first
  launch and stored in secure storage.
- Saved reads (AD-9 amended) are a second encrypted Drift file, `saved_reads.sqlite`, with its own
  key. It holds the server's last answer to each read, for the signed-in account only, and is
  emptied at every sign-in and sign-out. An answer the server now refuses (403) or cannot find
  (404) is deleted, so access that was taken away does not linger on the phone.
- Cached avatars and notice attachments live in the app's private directory, never in shared
  or external storage.
- The app opts out of Android auto-backup and iOS iCloud backup for its database and secure
  storage, so academic records do not leave the device through a cloud backup.
- `FLAG_SECURE` is set on Android and the iOS app snapshot is obscured on backgrounding for
  screens showing results or personal details.

## 8.6 Transport

- HTTPS only, TLS 1.2 minimum, cleartext traffic disabled in both platform configurations.
- Certificate pinning against the API's leaf and a backup pin, with a documented rotation
  procedure and a remote kill-switch so a botched rotation cannot brick the installed base.

## 8.7 Input and output

- Every form validates on the client for immediate feedback and again on the server for truth.
- Search terms and identifiers are passed as parameters, never concatenated into a query string
  or an SQL statement. Drift's generated queries are parameterized throughout.
- Notice bodies render as plain text or a restricted subset of formatting. Arbitrary HTML is
  never rendered.
- Uploads are limited by type and size, and the server verifies the actual content type rather
  than trusting the extension.

## 8.8 Logging and privacy

- No personal data, token, password or full request body in any log, in any build.
- Debug logging is compiled out of release builds.
- Crash reports carry a user id, never a name, email or phone number.
- A retention and deletion policy for graduated students is a server responsibility and is
  documented with the backend. The client must support account deletion requests as required by
  both app stores.

## 8.9 Release hardening checklist

Verified before every store submission.

- Release builds are obfuscated with split debug symbols retained
- No debug flags, test accounts or staging URLs compiled into release
- Secrets come from build-time configuration, never from a committed file
- Certificate pins are current and a rotation window is open
- Dependencies scanned for known advisories
- Permissions requested are only those actually used, each with a clear purpose string

## Platform accounts' second factor (SA-3b)

- Every platform account signs in with a password and a code from an authenticator app (TOTP,
  AD-62). A password alone yields a five-minute, single-use challenge, never a session.
- TOTP secrets are sealed with AES-256-GCM under `SECRET_SEALING_KEY` (AD-63), a key held only in
  configuration. Production refuses to start without it. Generate one with
  `openssl rand -base64 32` and keep it with the other production secrets; losing it means every
  platform account must re-enrol.
- Wrong codes count toward the existing lockout. No code is accepted twice.
- Recovery: an Owner resets another account's authenticator in the console, with a reason. A
  sole Owner who loses theirs is recovered by `npm run platform:break-glass` on the server, which
  forces re-enrolment. Both are audited; neither switches MFA off.

