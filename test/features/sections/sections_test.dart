import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/academic/domain/academic.dart';
import 'package:college_erp/features/sections/data/sections_api.dart';
import 'package:college_erp/features/sections/domain/section.dart';
import 'package:college_erp/features/sections/presentation/sections_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-6 (AD-81): sections on the phone. What matters: a new section gets
/// the next free label, the lifecycle buttons are the server's, students are
/// placed from the unplaced ones of the program, and refusals stay in the form.
void main() {
  test('the next label is the first free letter', () {
    expect(nextSectionLabel(const []), 'A');
    expect(nextSectionLabel(const ['A', 'b']), 'C');
  });

  Future<_FakeSections> pump(WidgetTester tester, Set<String> permissions) async {
    final repo = _FakeSections();
    await tester.pumpWidget(MaterialApp(
      home: SectionsScreen(
        authority: Authority(permissions: permissions, hasAccess: true),
        repository: repo,
        today: DateTime(2026, 9, 14),
      ),
    ));
    await tester.pumpAndSettle();
    return repo;
  }

  const admin = {'person.read', 'section.read', 'section.manage', 'student.read', 'enrolment.manage'};

  Finder inDialog(String label) =>
      find.descendant(of: find.byType(AlertDialog), matching: find.widgetWithText(FilledButton, label));

  testWidgets('a reader sees the current term and nothing to change', (tester) async {
    await pump(tester, {'person.read', 'section.read'});
    expect(find.text('BTech CSE · term 1 · A'), findsOneWidget);
    expect(find.widgetWithText(FloatingActionButton, 'Add section'), findsNothing);
  });

  testWidgets('an admin adds section B; the label is suggested', (tester) async {
    final repo = await pump(tester, admin);
    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add section'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'B'), findsOneWidget, reason: 'A is taken');
    await tester.tap(inDialog('Add section'));
    await tester.pumpAndSettle();
    expect(repo.created, ['p1/t1/1/B']);
    expect(find.text('BTech CSE · term 1 · B'), findsOneWidget);
  });

  testWidgets('an admin opens a section and places a student in it', (tester) async {
    final repo = await pump(tester, admin);
    await tester.tap(find.text('BTech CSE · term 1 · A'));
    await tester.pumpAndSettle();
    expect(find.text('Start teaching'), findsOneWidget, reason: "the server's allowed transitions");
    expect(find.text('0 students of 60'), findsOneWidget);

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add students'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Asha Rao'));
    await tester.pump();
    await tester.tap(inDialog('Add'));
    await tester.pumpAndSettle();

    expect(repo.placed, ['s1']);
    expect(find.text('1 student of 60'), findsOneWidget);
    expect(find.text('Asha Rao'), findsOneWidget);
  });

  testWidgets("cancelling needs a reason, and the server's refusal stays in the form", (tester) async {
    await pump(tester, admin);
    await tester.tap(find.text('BTech CSE · term 1 · A'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel section'));
    await tester.pumpAndSettle();
    await tester.tap(inDialog('Cancel section'));
    await tester.pumpAndSettle();
    expect(find.text('Give a reason for cancelling.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Merged with B');
    await tester.tap(inDialog('Cancel section'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Move them before cancelling'), findsOneWidget);
  });
}

class _FakeSections implements SectionsRepository {
  final _sections = [_section('x1', 'A')];
  final _members = <Member>[];
  final created = <String>[];
  final placed = <String>[];

  static Section _section(String id, String label) => Section(
        id: id, label: label, status: 'open', termNumber: 1, capacity: 60, programId: 'p1', programName: 'BTech CSE',
        termId: 't1', termName: 'Semester 1', yearName: '2026-27', allowedTransitions: const ['planned', 'active', 'cancelled'],
      );

  @override
  Future<Result<List<Section>>> sections() async => Ok(List.of(_sections));

  @override
  Future<Result<Section>> section(String id) async => Ok(_sections.firstWhere((s) => s.id == id));

  @override
  Future<Result<List<Program>>> programs() async => const Ok([
        Program(
          id: 'p1', name: 'BTech CSE', code: 'btech-cse', award: null, departmentId: 'd1', departmentName: 'CSE',
          durationYears: 4, termType: 'semester', publishedVersions: 1,
        ),
      ]);

  @override
  Future<Result<List<Term>>> terms() async => Ok([
        Term(id: 't1', academicYearId: 'y1', sequence: 1, name: 'Semester 1', startsOn: DateTime(2026, 6, 1), endsOn: DateTime(2026, 11, 30)),
      ]);

  @override
  Future<Result<void>> createSection({
    required String programId,
    required String termId,
    required int termNumber,
    required String label,
    int? capacity,
  }) async {
    created.add('$programId/$termId/$termNumber/$label');
    _sections.add(_section('x${_sections.length + 1}', label));
    return const Ok(null);
  }

  @override
  Future<Result<void>> transition(String id, String to, {String? reason}) async => const Err(Failure(
        code: FailureCode.conflict,
        message: '2 students are enrolled in section A. Move them before cancelling it.',
      ));

  @override
  Future<Result<void>> setCapacity(String id, int? capacity) async => const Ok(null);

  @override
  Future<Result<List<Member>>> members(String sectionId) async => Ok(List.of(_members));

  @override
  Future<Result<List<Member>>> unplaced(String programId, {String? search}) async => const Ok([
        Member(id: 's1', fullName: 'Asha Rao', enrolmentNumber: 'CSE26001', status: 'enrolled'),
        Member(id: 's2', fullName: 'Ravi Kumar', enrolmentNumber: 'CSE26002', status: 'enrolled'),
      ]);

  @override
  Future<Result<void>> place(String sectionId, String studentId) async {
    placed.add(studentId);
    _members.add(const Member(id: 's1', fullName: 'Asha Rao', enrolmentNumber: 'CSE26001', status: 'enrolled'));
    return const Ok(null);
  }

  @override
  Future<Result<void>> endPlacement(String sectionId, String studentId, String reason) async => const Ok(null);
}
