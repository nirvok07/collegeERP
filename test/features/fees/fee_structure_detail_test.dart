import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/fees/presentation/fee_structure_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fee_test_support.dart';

/// FEE-1/FEE-2/FEE-5: composing a fee structure — instalments, their fees,
/// publishing, and what publishing unlocks.
void main() {
  Future<FakeFeesRepository> seeded(WidgetTester tester, {required bool canManage}) async {
    final fees = FakeFeesRepository()
      ..allHeads.add(const FeeHead(id: 'h1', name: 'Tuition', code: 'TUITION', status: 'active'))
      ..allStructures.add(const FeeStructure(
        id: 's1', programId: 'p1', programName: 'B.Tech CSE', academicYearId: 'y1', academicYearName: '2026-27', status: 'draft',
      ));
    await tester.pumpWidget(MaterialApp(
      home: FeeStructureDetailScreen(args: FeeStructureDetailArgs(structureId: 's1', canManage: canManage), repository: fees),
    ));
    await tester.pumpAndSettle();
    return fees;
  }

  testWidgets('an Accountant adds an instalment, a fee on it, then publishes', (tester) async {
    final fees = await seeded(tester, canManage: true);
    expect(find.text('No instalments yet.'), findsOneWidget);

    await tester.tap(find.text('Add instalment'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    expect(fees.allStructures.single.instalments, hasLength(1));
    expect(find.textContaining('Instalment 1'), findsOneWidget);

    await tester.tap(find.text('Add fee'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '5000');
    await tester.tap(find.text('Add').last);
    await tester.pumpAndSettle();
    expect(find.text('Tuition'), findsOneWidget);
    expect(find.text('₹5,000.00'), findsWidgets);

    await tester.tap(find.text('Publish'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Publish').last);
    await tester.pumpAndSettle();

    expect(fees.allStructures.single.status, 'published');
    expect(find.text('Generate invoices'), findsOneWidget);
    expect(find.text('Add fee'), findsNothing, reason: 'a published structure is fixed');
  });

  testWidgets('generating invoices from a published structure', (tester) async {
    final fees = await seeded(tester, canManage: true);
    await fees.publishStructure('s1');
    await tester.pumpWidget(Container());
    await tester.pumpWidget(MaterialApp(
      home: FeeStructureDetailScreen(args: const FeeStructureDetailArgs(structureId: 's1', canManage: true), repository: fees),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Generate invoices'));
    await tester.pumpAndSettle();
    expect(find.text('Invoices generated'), findsOneWidget);
  });

  testWidgets('without fee.manage there is nothing to add, publish or generate', (tester) async {
    await seeded(tester, canManage: false);
    expect(find.text('Add instalment'), findsNothing);
    expect(find.text('Publish'), findsNothing);
    expect(find.text('Generate invoices'), findsNothing);
  });
}
