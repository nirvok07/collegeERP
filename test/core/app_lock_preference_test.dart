import 'package:college_erp/core/security/app_lock_preference.dart';
import 'package:college_erp/core/session/session_store.dart';
import 'package:flutter_test/flutter_test.dart';

/// LK-1: the lock is on by default, off only by choice, and back on after a
/// sign-out (OD-LK-1) so whoever signs in next on this phone starts protected.
class _FakeStore implements SessionStore {
  bool enabled = true;

  @override
  Future<bool> readAppLockEnabled() async => enabled;
  @override
  Future<void> writeAppLockEnabled(bool value) async => enabled = value;
  @override
  Future<void> clear() async => enabled = true;

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

void main() {
  test('on by default; disable and enable persist through the store', () async {
    final store = _FakeStore();
    final preference = AppLockPreference(store);
    await Future<void>.delayed(Duration.zero);
    expect(preference.value, isTrue);

    await preference.disable();
    expect(preference.value, isFalse);
    expect(store.enabled, isFalse);

    await preference.enable();
    expect(preference.value, isTrue);
    expect(store.enabled, isTrue);
  });

  test('a fresh preference loads what the store has, even if off', () async {
    final store = _FakeStore()..enabled = false;
    final preference = AppLockPreference(store);
    await Future<void>.delayed(Duration.zero);
    expect(preference.value, isFalse);
  });

  test('OD-LK-1: resetOnSignOut puts it back on in memory at once', () async {
    final store = _FakeStore();
    final preference = AppLockPreference(store);
    await preference.disable();
    expect(preference.value, isFalse);

    preference.resetOnSignOut();
    expect(preference.value, isTrue);
  });

  // Owner feedback (feedbackchanges.md, 2026-09): after turning the lock off in
  // Settings, it must not ask the phone again until that is actually known —
  // not just assumed from the constructor's optimistic default.
  test('settled is false until the store has answered, even when the answer is the default', () {
    final store = _FakeStore();
    final preference = AppLockPreference(store);
    expect(preference.settled, isFalse, reason: 'the read has not resolved yet');
    expect(preference.value, isTrue, reason: 'the optimistic default, not yet trustworthy');
  });

  test('settled becomes true once loaded, even when the stored value equals the default', () async {
    final store = _FakeStore(); // enabled = true, same as the constructor's default
    final preference = AppLockPreference(store);
    var notified = 0;
    preference.addListener(() => notified++);
    await Future<void>.delayed(Duration.zero);
    expect(preference.settled, isTrue);
    expect(notified, greaterThan(0), reason: 'a listener waiting on settled must be told, even though value did not change');
  });

  test('settled becomes true immediately on disable(), before the store write finishes', () {
    final store = _FakeStore();
    final preference = AppLockPreference(store);
    final future = preference.disable();
    expect(preference.settled, isTrue);
    expect(preference.value, isFalse);
    return future;
  });
}
