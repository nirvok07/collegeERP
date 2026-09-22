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

  /// True once the stored value has actually been read (or set explicitly).
  /// Callers that must not act on the optimistic default — such as deciding
  /// whether to ask the phone for its fingerprint — wait for this.
  bool get settled => _settled;

  Future<void> _load() async {
    final stored = await _store.readAppLockEnabled();
    if (_settled) return;
    _settled = true;
    _setSettled(stored);
  }

  Future<void> enable() async {
    _settled = true;
    _setSettled(true);
    await _store.writeAppLockEnabled(true);
  }

  Future<void> disable() async {
    _settled = true;
    _setSettled(false);
    await _store.writeAppLockEnabled(false);
  }

  /// Called when the session ends, so the in-memory value matches what
  /// [SessionStore.clear] just did to the persisted one.
  void resetOnSignOut() {
    _settled = true;
    _setSettled(true);
  }

  /// [ValueNotifier.value]'s setter skips [notifyListeners] when the new
  /// value equals the old one — right the first time [_load] resolves to the
  /// default it was already constructed with. A caller waiting on [settled]
  /// (BIO-1: whether it is now safe to ask the phone for its fingerprint)
  /// would then never see it flip, so this notifies unconditionally.
  void _setSettled(bool next) {
    if (value == next) {
      notifyListeners();
    } else {
      value = next;
    }
  }
}
