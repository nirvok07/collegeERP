import 'package:college_erp/core/security/app_lock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// BIO-1: every open of the signed-in app asks the phone's owner. What
/// matters: nothing behind the lock shows until they pass, it asks again on
/// every return from the background, a failed attempt stays locked, and a
/// phone with no screen lock is not locked out.
class _FakeUnlock implements DeviceUnlock {
  _FakeUnlock({this.available = true});
  final bool available;
  final answers = <bool>[];
  var asked = 0;

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<bool> unlock(String reason) async {
    asked++;
    return answers.isEmpty ? true : answers.removeAt(0);
  }
}

Future<void> _pump(WidgetTester tester, _FakeUnlock unlock, {bool startLocked = true}) async {
  await tester.pumpWidget(MaterialApp(
    home: AppLockGate(
      unlock: unlock,
      startLocked: startLocked,
      onSignOut: () {},
      child: const Scaffold(body: Text('Dashboard')),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('asks on open, and shows the app only after the owner passes', (tester) async {
    final unlock = _FakeUnlock();
    await _pump(tester, unlock);
    expect(unlock.asked, 1);
    expect(find.text('Locked'), findsNothing);
    expect(find.text('Dashboard'), findsOneWidget);
  });

  testWidgets('a failed attempt stays locked; Unlock asks again', (tester) async {
    final unlock = _FakeUnlock()..answers.addAll([false, true]);
    await _pump(tester, unlock);
    expect(find.text('Locked'), findsOneWidget);
    await tester.tap(find.text('Unlock'));
    await tester.pumpAndSettle();
    expect(unlock.asked, 2);
    expect(find.text('Locked'), findsNothing);
  });

  testWidgets('leaving the app locks it; coming back asks again', (tester) async {
    final unlock = _FakeUnlock();
    await _pump(tester, unlock);
    expect(unlock.asked, 1);

    // The owner fails the prompt on the way back, so the lock stays visible.
    unlock.answers.add(false);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    // No frame is drawn while paused; what matters is the first one after.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(unlock.asked, 2);
    expect(find.text('Locked'), findsOneWidget, reason: 'locked on the way back');

    await tester.tap(find.text('Unlock'));
    await tester.pumpAndSettle();
    expect(unlock.asked, 3);
    expect(find.text('Locked'), findsNothing);
  });

  testWidgets('a notification shade is not leaving the app', (tester) async {
    final unlock = _FakeUnlock();
    await _pump(tester, unlock);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(unlock.asked, 1);
    expect(find.text('Locked'), findsNothing);
  });

  testWidgets('a phone with no screen lock is let through', (tester) async {
    final unlock = _FakeUnlock(available: false);
    await _pump(tester, unlock);
    expect(unlock.asked, 0);
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.text('Locked'), findsNothing);
  });

  testWidgets('right after typing the password it does not ask; the next return does', (tester) async {
    final unlock = _FakeUnlock();
    await _pump(tester, unlock, startLocked: false);
    expect(unlock.asked, 0);
    expect(find.text('Locked'), findsNothing);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(unlock.asked, 1);
  });
}
