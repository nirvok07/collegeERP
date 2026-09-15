import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/fees/presentation/fee_heads_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fee_test_support.dart';

/// FEE-1: fee heads. What matters: fee.read sees them, fee.manage adds and
/// archives, and everyone else is read-only.
void main() {
  testWidgets('an Accountant adds and archives a fee head', (tester) async {
    final repo = FakeFeesRepository();
    await tester.pumpWidget(MaterialApp(
      home: FeeHeadsScreen(authority: const Authority(permissions: {'fee.manage'}, hasAccess: true), repository: repo),
    ));
    await tester.pumpAndSettle();
    expect(find.text('No fee heads yet'), findsOneWidget);

    await tester.tap(find.text('Add fee head'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Tuition fee');
    await tester.enterText(find.byType(TextField).at(1), 'tuition');
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();

    expect(find.text('Tuition fee'), findsOneWidget);
    expect(find.text('TUITION'), findsOneWidget);
    expect(repo.allHeads.single.code, 'TUITION');

    await tester.tap(find.byIcon(Icons.archive_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archive').last);
    await tester.pumpAndSettle();

    expect(find.text('No fee heads yet'), findsOneWidget, reason: 'archived heads drop off the default list');
    expect(repo.allHeads.single.status, 'archived');
  });

  testWidgets('without fee.manage there is no way to add or archive', (tester) async {
    final repo = FakeFeesRepository()..allHeads.add(const FeeHead(id: 'h1', name: 'Tuition', code: 'TUITION', status: 'active'));
    await tester.pumpWidget(MaterialApp(
      home: FeeHeadsScreen(authority: const Authority(permissions: {'fee.read'}, hasAccess: true), repository: repo),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Tuition'), findsOneWidget);
    expect(find.text('Add fee head'), findsNothing);
    expect(find.byIcon(Icons.archive_outlined), findsNothing);
  });
}
