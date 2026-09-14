import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/assessment/domain/assessment.dart';
import 'package:college_erp/features/review/data/review_api.dart';
import 'package:college_erp/features/review/presentation/registers_screen.dart';
import 'package:college_erp/features/review/presentation/verify_marks_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-11 (AD-81): reviewing what teachers recorded. What matters: a day's
/// registers show which are open, a submitted mark is corrected only with a
/// reason, a sheet is verified pinned to the version read, and a corrected
/// score cannot exceed the maximum.
void main() {
  Finder inDialog(String label) =>
      find.descendant(of: find.byType(AlertDialog), matching: find.widgetWithText(FilledButton, label));

  testWidgets('a day of registers; a submitted one is corrected with a reason', (tester) async {
    final repo = _FakeReview();
    await tester.pumpWidget(MaterialApp(home: RegistersScreen(repository: repo, today: '2026-09-14')));
    await tester.pumpAndSettle();
    expect(repo.days, ['2026-09-14']);
    expect(find.text('1 not submitted yet.'), findsOneWidget);
    expect(find.text('Submitted'), findsOneWidget);

    await tester.tap(find.text('09:00 · CS101 · A'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Tap a student to correct'), findsOneWidget);
    await tester.tap(find.text('Asha Rao'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Excused'));
    await tester.pumpAndSettle();
    await tester.tap(inDialog('Correct'));
    await tester.pumpAndSettle();
    expect(find.text('Give a reason for the correction.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Medical certificate');
    await tester.tap(inDialog('Correct'));
    await tester.pumpAndSettle();
    expect(repo.corrected, ['r1/excused/Medical certificate']);
  });

  testWidgets('a waiting sheet is verified at the version read; a score over the maximum is refused', (tester) async {
    final repo = _FakeReview();
    await tester.pumpWidget(MaterialApp(home: VerifyMarksScreen(repository: repo)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('CS101 · A · Mid-term'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Asha Rao'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Score'), '31');
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Totalling error');
    await tester.tap(inDialog('Correct'));
    await tester.pumpAndSettle();
    expect(find.text('The score is out of 30.'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Verify'));
    await tester.pumpAndSettle();
    await tester.tap(inDialog('Verify'));
    await tester.pumpAndSettle();
    expect(repo.verified, ['c1@4']);
  });
}

class _FakeReview implements ReviewRepository {
  final days = <String>[];
  final corrected = <String>[];
  final verified = <String>[];

  @override
  Future<Result<List<RegisterSummary>>> registers(String date) async {
    days.add(date);
    return const Ok([
      RegisterSummary(sessionId: 's1', date: '2026-09-14', startsAt: '09:00', courseCode: 'CS101', sectionLabel: 'A', status: 'submitted', marked: 2, present: 1, absent: 1),
      RegisterSummary(sessionId: 's2', date: '2026-09-14', startsAt: '11:00', courseCode: 'PH101', sectionLabel: 'A', status: 'draft', marked: 0, present: 0, absent: 0),
    ]);
  }

  @override
  Future<Result<ReviewRegister>> register(String sessionId) async => Ok(ReviewRegister.fromJson({
        'session': {
          'id': 's1', 'date': '2026-09-14', 'starts_at': '09:00',
          'course': {'code': 'CS101', 'title': 'Programming'}, 'section': {'label': 'A'}, 'room': null,
        },
        'sheet': {'status': 'submitted', 'version': 3, 'submitted_by': 'Meera Iyer'},
        'students': [
          {'student_id': 'st1', 'full_name': 'Asha Rao', 'enrolment_number': 'CSE26001', 'state': 'absent', 'record_id': 'r1'},
        ],
        'can_correct': true,
      }));

  @override
  Future<Result<void>> correctAttendance(String recordId, String state, String reason) async {
    corrected.add('$recordId/$state/$reason');
    return const Ok(null);
  }

  static const _component = {
    'id': 'c1', 'offering_id': 'o1', 'name': 'Mid-term', 'kind': 'test', 'max_marks': 30, 'weight': 20,
    'held_on': '2026-09-01', 'status': 'submitted', 'version': 4, 'mark_count': 1,
    'course': {'code': 'CS101', 'title': 'Programming'}, 'section': {'label': 'A'},
  };

  @override
  Future<Result<List<AssessmentComponent>>> queue(String status) async => Ok([AssessmentComponent.fromJson(_component)]);

  @override
  Future<Result<ReviewSheet>> sheet(String componentId) async => Ok(ReviewSheet.fromJson({
        'component': _component,
        'needs_date': false,
        'students': [
          {'student_id': 'st1', 'full_name': 'Asha Rao', 'enrolment_number': 'CSE26001', 'mark_id': 'm1', 'status': 'scored', 'score': 24},
        ],
        'can_verify': true,
        'can_correct': true,
      }));

  @override
  Future<Result<void>> verify(String componentId, int version) async {
    verified.add('$componentId@$version');
    return const Ok(null);
  }

  @override
  Future<Result<void>> correctMark(String markId, {required String status, double? score, required String reason}) async =>
      const Err(Failure(code: FailureCode.validationFailed, message: 'Unexpected'));
}
