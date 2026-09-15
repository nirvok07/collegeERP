import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/fees/presentation/fee_requests_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fee_test_support.dart';

/// FEE-3/FEE-5: concessions and waivers. What matters: only fee.approve
/// decides, an approval is not the same actor as who requested it (checked
/// server-side; this only checks the screen shows the right controls), and
/// a decided request shows its outcome instead of the approve/reject pair.
void main() {
  FeeRequest pending({String kind = 'concession'}) => FeeRequest(
        id: 'r1', kind: kind, studentId: 'st1', studentName: 'Nisha Kumar', invoiceId: 'inv1',
        amountPaise: 200000, reason: 'Sibling discount', status: 'requested', requestedAt: DateTime.now(),
      );

  testWidgets('a College Admin approves a pending request', (tester) async {
    final fees = FakeFeesRepository()..allRequests.add(pending());
    await tester.pumpWidget(MaterialApp(home: FeeRequestsScreen(canApprove: true, repository: fees)));
    await tester.pumpAndSettle();

    expect(find.text('Concession · Nisha Kumar'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.check_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve').last);
    await tester.pumpAndSettle();

    expect(fees.allRequests.single.status, 'approved');
    expect(find.text('Nothing pending'), findsOneWidget, reason: 'a decided request drops off the pending list');
  });

  testWidgets('rejecting needs a reason', (tester) async {
    final fees = FakeFeesRepository()..allRequests.add(pending());
    await tester.pumpWidget(MaterialApp(home: FeeRequestsScreen(canApprove: true, repository: fees)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reject').last);
    await tester.pumpAndSettle();
    expect(fees.allRequests.single.status, 'requested', reason: 'no reason, nothing happened');

    await tester.enterText(find.byType(TextField), 'Not eligible');
    await tester.tap(find.text('Reject').last);
    await tester.pumpAndSettle();
    expect(fees.allRequests.single.status, 'rejected');
  });

  testWidgets('without fee.approve there is nothing to decide', (tester) async {
    final fees = FakeFeesRepository()..allRequests.add(pending());
    await tester.pumpWidget(MaterialApp(home: FeeRequestsScreen(repository: fees)));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_rounded), findsNothing);
    expect(find.text('requested'), findsOneWidget);
  });
}
