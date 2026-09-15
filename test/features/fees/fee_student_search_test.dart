import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/fees/presentation/fee_student_search_screen.dart';
import 'package:college_erp/features/fees/presentation/student_fee_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fee_test_support.dart';

/// A Cashier or Accountant's own way to find a student (no student.read).
void main() {
  testWidgets('finds a student by name, and opens their fees', (tester) async {
    final fees = FakeFeesRepository()
      ..students.add(const FeeStudentSummary(id: 'st1', fullName: 'Nisha Kumar', enrolmentNumber: 'CSE2026-001', programName: 'B.Tech CSE'));
    await tester.pumpWidget(MaterialApp(
      onGenerateRoute: (settings) => MaterialPageRoute(
        builder: (_) => StudentFeeScreen(args: settings.arguments! as StudentFeeArgs, repository: fees),
      ),
      home: FeeStudentSearchScreen(canCollect: true, repository: fees),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Type at least two characters.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Nisha');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();

    expect(find.text('Nisha Kumar'), findsOneWidget);
    await tester.tap(find.text('Nisha Kumar'));
    await tester.pumpAndSettle();

    expect(find.text('CSE2026-001'), findsOneWidget, reason: 'opened the student fee screen');
  });

  testWidgets('no match says so', (tester) async {
    final fees = FakeFeesRepository();
    await tester.pumpWidget(MaterialApp(home: FeeStudentSearchScreen(repository: fees)));
    await tester.enterText(find.byType(TextField), 'Nobody');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(find.text('No student matches "Nobody".'), findsOneWidget);
  });
}
