import 'package:local_auth/local_auth.dart';

import 'app_lock.dart';

/// The phone's own lock, through local_auth 3: fingerprint, face, or the
/// PIN/pattern the phone falls back to (BIO-1). Nothing is stored by the app;
/// the operating system decides who passes.
class LocalAuthUnlock implements DeviceUnlock {
  LocalAuthUnlock([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  @override
  Future<bool> isAvailable() async {
    try {
      return await _auth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> unlock(String reason) async {
    try {
      // The prompt survives the app briefly going to the background, which
      // the system prompt itself can cause on some phones.
      return await _auth.authenticate(localizedReason: reason, persistAcrossBackgrounding: true);
    } catch (_) {
      // Cancelled, locked out or unavailable: stay locked. The person can try
      // again, or sign out from the lock screen.
      return false;
    }
  }
}
