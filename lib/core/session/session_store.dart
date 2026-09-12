import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the refresh token in platform secure storage.
///
/// Keychain on iOS, EncryptedSharedPreferences backed by the Keystore on
/// Android. The access token is deliberately absent: it lives in memory for its
/// fifteen minutes and is re-minted from the refresh token on every launch, so
/// nothing short-lived is ever written to disk.
///
/// Every access is guarded. Secure storage can throw on a device with a broken
/// keystore, and a sign-in screen is a far better outcome than a crash on launch.
class SessionStore {
  SessionStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const _refreshTokenKey = 'college_erp.refresh_token';
  static const _institutionKey = 'college_erp.institution_code';

  Future<String?> readRefreshToken() async {
    try {
      return await _storage.read(key: _refreshTokenKey);
    } catch (_) {
      return null;
    }
  }

  Future<void> writeRefreshToken(String token) async {
    try {
      await _storage.write(key: _refreshTokenKey, value: token);
    } catch (_) {
      // A session that cannot be persisted still works until the app closes.
    }
  }

  /// Remembered so the sign-in screen can prefill it. Not a secret.
  Future<String?> readInstitutionCode() async {
    try {
      return await _storage.read(key: _institutionKey);
    } catch (_) {
      return null;
    }
  }

  Future<void> writeInstitutionCode(String code) async {
    try {
      await _storage.write(key: _institutionKey, value: code);
    } catch (_) {}
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _refreshTokenKey);
    } catch (_) {}
  }
}
