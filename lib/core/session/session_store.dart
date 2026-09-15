import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'college_brand.dart';

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

  static const _collegeKey = 'college_erp.college';

  /// The college chosen on the first screen (AD-70). Survives sign-out, as the
  /// code always did: the device belongs to one college's person.
  Future<CollegeBrand?> readCollege() async {
    try {
      final raw = await _storage.read(key: _collegeKey);
      return raw == null ? null : CollegeBrand.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  Future<void> writeCollege(CollegeBrand college) async {
    try {
      await _storage.write(key: _collegeKey, value: jsonEncode(college.toJson()));
      await _storage.write(key: _institutionKey, value: college.code);
    } catch (_) {}
  }

  Future<void> clearCollege() async {
    try {
      await _storage.delete(key: _collegeKey);
    } catch (_) {}
  }

  static const _appLockKey = 'college_erp.app_lock_enabled';

  /// LK-1: on by default (AD-78); off only once the person turns it off in
  /// Settings. Absent (never written, or wiped by [clear]) reads as on.
  Future<bool> readAppLockEnabled() async {
    try {
      return await _storage.read(key: _appLockKey) != 'false';
    } catch (_) {
      return true;
    }
  }

  Future<void> writeAppLockEnabled(bool enabled) async {
    try {
      await _storage.write(key: _appLockKey, value: enabled.toString());
    } catch (_) {}
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _refreshTokenKey);
      // OD-LK-1: a sign-out puts the lock back on for whoever signs in next.
      await _storage.delete(key: _appLockKey);
    } catch (_) {}
  }
}
