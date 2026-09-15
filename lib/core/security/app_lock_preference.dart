import 'dart:async';

import 'package:flutter/foundation.dart';

import '../session/session_store.dart';

/// LK-1: whether the phone's own lock (BIO-1, AD-78) guards this app.
///
/// On by default. Turning it off happens only in Settings, and only once the
/// person has already passed the phone's own check — disabling the lock must
/// itself sit behind the lock it removes. A sign-out puts it back on
/// (OD-LK-1), so whoever signs in next on this phone starts protected.
class AppLockPreference extends ValueNotifier<bool> {
  AppLockPreference(this._store) : super(true) {
    unawaited(_load());
  }

  final SessionStore _store;

  /// True once an explicit value has arrived, from the store or from the
  /// person. Without this, a disable() called right after construction could
  /// be overwritten moments later when the constructor's own read resolves.
  bool _settled = false;

  Future<void> _load() async {
    final stored = await _store.readAppLockEnabled();
    if (_settled) return;
    _settled = true;
    value = stored;
  }

  Future<void> enable() async {
    _settled = true;
    value = true;
    await _store.writeAppLockEnabled(true);
  }

  Future<void> disable() async {
    _settled = true;
    value = false;
    await _store.writeAppLockEnabled(false);
  }

  /// Called when the session ends, so the in-memory value matches what
  /// [SessionStore.clear] just did to the persisted one.
  void resetOnSignOut() {
    _settled = true;
    value = true;
  }
}
