import 'package:college_erp/app/settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// SET-1: settings hold the profile, how the app is locked and signed in to,
/// what has not been sent, and sign out, which asks first.
void main() {
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
}
