import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/fees/presentation/student_fee_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fee_test_support.dart';

/// FEE-3/4/5: one student's fees. What matters: a Cashier records a payment
/// only up to what is due, an Accountant can raise a fine and request a
/// concession or a waiver, and neither action shows without its permission.
void main() {
  const args = StudentFeeArgs(studentId: 'st1', studentName: 'Nisha Kumar', enrolmentNumber: 'CSE2026-001', canCollect: true, canManage: true);

  FakeFeesRepository dueRepo() => FakeFeesRepository()
    ..invoices['st1'] = [
      const FeeInvoice(id: 'inv1', studentId: 'st1', studentName: 'Nisha Kumar', enrolmentNumber: 'CSE2026-001', kind: 'instalment', instalmentSeq: 1, amountPaise: 500000, dueDate: '2026-07-01', status: 'due'),
    ];

  testWidgets('a Cashier records a payment against what is due', (tester) async {
    final fees = dueRepo();
    await tester.pumpWidget(MaterialApp(home: StudentFeeScreen(args: args, repository: fees)));
    await tester.pumpAndSettle();

    expect(find.text('Owes ₹5,000.00'), findsOneWidget);
    await tester.tap(find.text('Record payment'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Record'));
    await tester.pumpAndSettle();

    expect(fees.payments['st1'], hasLength(1));
    expect(fees.payments['st1']!.single.amountPaise, 500000);
    expect(find.text('Nothing due'), findsOneWidget);
  });

  testWidgets('an Accountant raises a fine', (tester) async {
    final fees = FakeFeesRepository();
    await tester.pumpWidget(MaterialApp(home: StudentFeeScreen(args: args, repository: fees)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Fine'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), '500');
    await tester.enterText(find.byType(TextField).at(1), 'Library book not returned');
    await tester.tap(find.text('Raise fine'));
    await tester.pumpAndSettle();

    expect(fees.invoices['st1'], hasLength(1));
    expect(fees.invoices['st1']!.single.kind, 'fine');
  });

  testWidgets('an Accountant requests a concession on an instalment', (tester) async {
    final fees = dueRepo();
    await tester.pumpWidget(MaterialApp(home: StudentFeeScreen(args: args, repository: fees)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.request_page_outlined));
    await tester.pumpAndSettle();
    expect(find.text('Request a concession'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'Sibling discount');
    await tester.tap(find.text('Request'));
    await tester.pumpAndSettle();

    expect(fees.allRequests.single.kind, 'concession');
  });

  testWidgets('without any fee permission there is nothing to do but look', (tester) async {
    final fees = dueRepo();
    await tester.pumpWidget(MaterialApp(
      home: StudentFeeScreen(
        args: const StudentFeeArgs(studentId: 'st1', studentName: 'Nisha Kumar', enrolmentNumber: 'CSE2026-001'),
        repository: fees,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Record payment'), findsNothing);
    expect(find.text('Fine'), findsNothing);
    expect(find.byIcon(Icons.request_page_outlined), findsNothing);
  });
}
