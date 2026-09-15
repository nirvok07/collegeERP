import 'package:college_erp/app/settings_screen.dart';
import 'package:college_erp/core/di/locator.dart';
import 'package:college_erp/core/security/app_lock.dart';
import 'package:college_erp/core/security/app_lock_preference.dart';
import 'package:college_erp/core/session/session_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// SET-1: settings hold the profile, how the app is locked and signed in to,
/// what has not been sent, and sign out, which asks first.
class _FakeUnlock implements DeviceUnlock {
  bool available = true;
  bool passes = true;
  int asked = 0;

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<bool> unlock(String reason) async {
    asked++;
    return passes;
  }
}

void main() {
  late _FakeUnlock unlock;
  late AppLockPreference preference;

  setUp(() {
    unlock = _FakeUnlock();
    preference = AppLockPreference(SessionStore());
    if (locator.isRegistered<DeviceUnlock>()) locator.unregister<DeviceUnlock>();
    if (locator.isRegistered<AppLockPreference>()) locator.unregister<AppLockPreference>();
    locator.registerSingleton<DeviceUnlock>(unlock);
    locator.registerSingleton<AppLockPreference>(preference);
  });

  tearDown(() {
    locator.unregister<DeviceUnlock>();
    locator.unregister<AppLockPreference>();
  });

  testWidgets('settings show only what is true of this app, and sign out asks first', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SettingsScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('App lock'), findsOneWidget);
    expect(find.textContaining('There is no password'), findsOneWidget);
    expect(find.text('Everything is sent.'), findsOneWidget);

    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Settings'), findsOneWidget, reason: 'Cancel keeps the person here, signed in');
  });

  testWidgets('LK-1: turning the lock off asks the phone first; turning it back on does not', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SettingsScreen()));
    await tester.pumpAndSettle();

    expect(find.byType(Switch), findsOneWidget);
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(unlock.asked, 1, reason: 'turning it off is confirmed by the phone');
    expect(preference.value, isFalse);
    expect(find.textContaining('Off'), findsOneWidget);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(unlock.asked, 1, reason: 'turning it back on needs no confirmation');
    expect(preference.value, isTrue);
  });

  testWidgets("LK-1: a phone that fails the check keeps the lock on", (tester) async {
    unlock.passes = false;
    await tester.pumpWidget(const MaterialApp(home: SettingsScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(preference.value, isTrue, reason: 'a failed check must not turn the lock off');
  });
}
