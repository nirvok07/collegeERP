import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/fees/presentation/fee_reports_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fee_test_support.dart';

/// G2: daily collection, outstanding, defaulters, concession/waiver
/// register. What matters: a reversal reads as its own negative line, an
/// empty report reads as empty rather than blank, and switching the
/// segmented tab reads that report's own rows.
void main() {
  testWidgets('collection shows a reversal as its own negative line', (tester) async {
    final fees = FakeFeesRepository()
      ..collectionRows.addAll(const [
        FeeCollectionRow(date: '2026-09-23', receivedBy: 'p1', receivedByName: 'Rohit Nair', method: 'cash', kind: 'payment', amountPaise: 500000),
        FeeCollectionRow(date: '2026-09-23', receivedBy: 'p1', receivedByName: 'Rohit Nair', method: 'cash', kind: 'reversal', amountPaise: -500000),
      ]);
    await tester.pumpWidget(MaterialApp(home: FeeReportsScreen(repository: fees)));
    await tester.pumpAndSettle();

    expect(find.text('₹5,000.00'), findsOneWidget);
    expect(find.text('-₹5,000.00'), findsOneWidget);
  });

  testWidgets('switching to outstanding reads that report, sums the total', (tester) async {
    final fees = FakeFeesRepository()
      ..outstandingRows.addAll(const [
        FeeOutstandingRow(invoiceId: 'i1', studentId: 'st1', studentName: 'Nisha Kumar', enrolmentNumber: 'CSE2026-001',
            kind: 'instalment', dueDate: '2026-07-01', outstandingPaise: 300000, overdueDays: 40),
      ]);
    await tester.pumpWidget(MaterialApp(home: FeeReportsScreen(repository: fees)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Outstanding'));
    await tester.pumpAndSettle();

    expect(find.text('Total outstanding ₹3,000.00'), findsOneWidget);
    expect(find.textContaining('40d overdue'), findsOneWidget);
  });

  testWidgets('an empty register reads as empty, not blank', (tester) async {
    final fees = FakeFeesRepository();
    await tester.pumpWidget(MaterialApp(home: FeeReportsScreen(repository: fees)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Requests'));
    await tester.pumpAndSettle();

    expect(find.text('Nothing here'), findsOneWidget);
  });
}
