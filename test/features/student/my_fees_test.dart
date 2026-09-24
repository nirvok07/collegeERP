import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/delivery/domain/class_session.dart';
import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/student/data/my_attendance.dart';
import 'package:college_erp/features/student/presentation/my_fees_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeSelf implements StudentSelfRepository {
  _FakeSelf(this.fees, {this.payOnlineCalledWith});
  final MyFees fees;

  /// Set by the fake when [payOnline] is called, so a test can assert the amount asked for.
  final void Function(int amountPaise)? payOnlineCalledWith;

  @override
  Future<Result<MyAttendance>> myAttendance() => throw UnimplementedError();
  @override
  Future<DateTime?> myAttendanceSavedAt() => throw UnimplementedError();

  @override
  Future<Result<OnlinePaymentStarted>> payOnline(int amountPaise) async {
    payOnlineCalledWith?.call(amountPaise);
    return const Ok(OnlinePaymentStarted(intentId: 'i1', checkoutUrl: 'https://example.test/checkout'));
  }

  @override
  Future<Result<String>> onlinePaymentStatus(String intentId) => throw UnimplementedError();

  @override
  Future<Result<MyFees>> myFees() async => Ok(fees);
  @override
  Future<DateTime?> myFeesSavedAt() async => null;

  @override
  Future<Result<List<ClassSession>>> myTimetable() => throw UnimplementedError();
  @override
  Future<DateTime?> myTimetableSavedAt() => throw UnimplementedError();
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

  testWidgets('nothing due reads as clear, not zero, and there is no pay-online button', (tester) async {
    await tester.pumpWidget(MaterialApp(home: MyFeesScreen(repository: _FakeSelf(const MyFees(invoices: [], payments: [])))));
    await tester.pumpAndSettle();
    expect(find.text('Nothing due'), findsOneWidget);
    expect(find.text('No invoices yet.'), findsOneWidget);
    expect(find.text('No payments yet.'), findsOneWidget);
    expect(find.byIcon(Icons.credit_card_rounded), findsNothing, reason: 'nothing to pay online');
  });

  // FEE-7: the online-payment button offers the full amount due, and asks
  // the repository for exactly that when tapped.
  // G1: a receipt is offered per payment (it has one), a statement for the
  // whole ledger; a reversal never gets a "Receipt" action of its own.
  testWidgets('offers a receipt for a paid payment, a statement overall, and no receipt for a reversal', (tester) async {
    final fees = MyFees(
      invoices: const [
        FeeInvoice(id: 'i1', studentId: 's1', studentName: 'Me', enrolmentNumber: 'E1', kind: 'instalment', instalmentSeq: 1, amountPaise: 500000, dueDate: '2026-07-01', status: 'paid'),
      ],
      payments: [
        FeePayment(
          id: 'p1', studentId: 's1', kind: 'payment', method: 'cash', amountPaise: 500000, reference: 'UTR1',
          reversesPaymentId: null, reason: null, receivedAt: DateTime(2026, 6, 1),
          receiptNumber: 7, receiptStatus: 'issued', receiptIssuedAt: DateTime(2026, 6, 1),
        ),
        FeePayment(
          id: 'p2', studentId: 's1', kind: 'reversal', method: 'cash', amountPaise: 500000, reference: null,
          reversesPaymentId: 'p1', reason: 'Cheque bounced', receivedAt: DateTime(2026, 6, 2),
        ),
      ],
    );
    await tester.pumpWidget(MaterialApp(home: MyFeesScreen(repository: _FakeSelf(fees))));
    await tester.pumpAndSettle();

    // One "Statement" action in the app bar, and exactly one "Receipt"
    // action — the paid payment's, never the reversal's.
    expect(find.byTooltip('Statement'), findsOneWidget);
    expect(find.byTooltip('Receipt'), findsOneWidget);
  });

  testWidgets('a student with dues sees a pay-online button for the full amount', (tester) async {
    final fees = MyFees(
      invoices: const [
        FeeInvoice(id: 'i1', studentId: 's1', studentName: 'Me', enrolmentNumber: 'E1', kind: 'instalment', instalmentSeq: 1, amountPaise: 500000, dueDate: '2026-07-01', status: 'due'),
      ],
      payments: const [],
    );
    int? asked;
    await tester.pumpWidget(MaterialApp(
      home: MyFeesScreen(repository: _FakeSelf(fees, payOnlineCalledWith: (a) => asked = a)),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Pay ₹5,000.00 online'), findsOneWidget);
    // Tapping starts the intent (the fake never really launches a URL browser-side).
    await tester.tap(find.text('Pay ₹5,000.00 online'));
    await tester.pump();
    expect(asked, 500000);
  });
}
