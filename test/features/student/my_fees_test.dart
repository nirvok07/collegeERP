import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/student/data/my_attendance.dart';
import 'package:college_erp/features/student/presentation/my_fees_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeSelf implements StudentSelfRepository {
  _FakeSelf(this.fees);
  final MyFees fees;

  @override
  Future<Result<MyAttendance>> myAttendance() => throw UnimplementedError();
  @override
  Future<DateTime?> myAttendanceSavedAt() => throw UnimplementedError();

  @override
  Future<Result<MyFees>> myFees() async => Ok(fees);
  @override
  Future<DateTime?> myFeesSavedAt() async => null;
}

/// FEE-6: a student's own fees. What matters: dues are called out, and
/// invoices and payments both show, each with its own state.
void main() {
  testWidgets('shows what is owed, and both lists', (tester) async {
    final fees = MyFees(
      invoices: const [
        FeeInvoice(id: 'i1', studentId: 's1', studentName: 'Me', enrolmentNumber: 'E1', kind: 'instalment', instalmentSeq: 1, amountPaise: 500000, dueDate: '2026-07-01', status: 'due'),
      ],
      payments: [
        FeePayment(id: 'p1', studentId: 's1', kind: 'payment', method: 'cash', amountPaise: 200000, reference: 'UTR1', reversesPaymentId: null, reason: null, receivedAt: DateTime(2026, 6, 1)),
      ],
    );
    await tester.pumpWidget(MaterialApp(home: MyFeesScreen(repository: _FakeSelf(fees))));
    await tester.pumpAndSettle();

    expect(find.text('You owe ₹5,000.00'), findsOneWidget);
    expect(find.text('Instalment 1'), findsOneWidget);
    expect(find.text('Cash'), findsOneWidget);
    expect(find.text('₹2,000.00'), findsOneWidget);
  });

  testWidgets('nothing due reads as clear, not zero', (tester) async {
    await tester.pumpWidget(MaterialApp(home: MyFeesScreen(repository: _FakeSelf(const MyFees(invoices: [], payments: [])))));
    await tester.pumpAndSettle();
    expect(find.text('Nothing due'), findsOneWidget);
    expect(find.text('No invoices yet.'), findsOneWidget);
    expect(find.text('No payments yet.'), findsOneWidget);
  });
}
