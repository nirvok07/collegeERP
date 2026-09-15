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
}
