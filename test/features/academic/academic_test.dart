import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/academic/data/academic_api.dart';
import 'package:college_erp/features/academic/domain/academic.dart';
import 'package:college_erp/features/academic/presentation/academic_screen.dart';
import 'package:college_erp/features/organisation/domain/org_unit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-3 (AD-81): programs and the calendar on the phone. What matters: the
/// actions appear only with their permission, forms start from sensible
/// defaults, and what is added shows once the server has it.
void main() {
  final today = DateTime(2026, 9, 14);

  test('a new year defaults to June to May, and follows the latest one', () {
    final first = suggestYear(today, const []);
    expect(first.name, '2026-27');
    expect(isoDate(first.startsOn), '2026-06-01');
    expect(isoDate(first.endsOn), '2027-05-31');

    final year = AcademicYear(
      id: 'y1', name: '2026-27', startsOn: first.startsOn, endsOn: first.endsOn, isCurrent: true, status: 'active',
    );
    expect(suggestYear(today, [year]).name, '2027-28');
  });

  test('terms follow each other inside the year', () {
    final year = AcademicYear(
      id: 'y1', name: '2026-27', startsOn: DateTime(2026, 6, 1), endsOn: DateTime(2027, 5, 31), isCurrent: true, status: 'active',
    );
    final first = suggestTerm(year, const []);
    expect(first.sequence, 1);
    expect(isoDate(first.startsOn), '2026-06-01');
    expect(isoDate(first.endsOn), '2026-11-30');
    final term = Term(
      id: 't1', academicYearId: 'y1', sequence: 1, name: 'Semester 1', startsOn: first.startsOn, endsOn: first.endsOn,
    );
    final second = suggestTerm(year, [term]);
    expect(second.name, 'Semester 2');
    expect(isoDate(second.startsOn), '2026-12-01');
    expect(isoDate(second.endsOn), '2027-05-31');
  });

  Future<_FakeAcademic> pump(WidgetTester tester, Set<String> permissions, [_FakeAcademic? given]) async {
    final repo = given ?? _FakeAcademic();
    await tester.pumpWidget(MaterialApp(
      home: AcademicScreen(
        authority: Authority(permissions: permissions, hasAccess: true),
        repository: repo,
        today: today,
      ),
    ));
    await tester.pumpAndSettle();
    return repo;
  }

  const admin = {'person.read', 'department.manage', 'section.read', 'term.manage'};

  testWidgets('without department.manage there is no way to add a program', (tester) async {
    await pump(tester, {'person.read'});
    expect(find.text('Programs'), findsWidgets);
    expect(find.text('Calendar'), findsNothing, reason: 'no section.read, no calendar');
    expect(find.widgetWithText(FloatingActionButton, 'Add program'), findsNothing);
  });

  testWidgets('an admin adds a program', (tester) async {
    final repo = await pump(tester, admin);
    expect(find.text('No programs yet'), findsOneWidget);

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add program'));
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsOneWidget, reason: 'the form opens as a bottom sheet');
    expect(find.byType(AlertDialog), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'BTech Computer Science');
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Add program'));
    await tester.tap(find.widgetWithText(FilledButton, 'Add program'));
    await tester.pumpAndSettle();

    expect(repo.createdPrograms.single.code, 'btech-computer-science');
    expect(repo.createdPrograms.single.departmentId, 'd1');
    expect(find.text('BTech Computer Science'), findsOneWidget);
    expect(find.text('Program added'), findsOneWidget);
  });

  testWidgets('an admin adds this academic year, then its first term', (tester) async {
    await pump(tester, admin);
    await tester.tap(find.text('Calendar'));
    await tester.pumpAndSettle();
    expect(find.text('No academic years yet'), findsOneWidget);

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add academic year'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, '2026-27'), findsOneWidget, reason: 'the name is suggested');
    await tester.tap(find.widgetWithText(FilledButton, 'Add year'));
    await tester.pumpAndSettle();
    expect(find.text('2026-27'), findsOneWidget);
    expect(find.text('Current'), findsOneWidget);

    await tester.tap(find.text('Add term'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Add term'));
    await tester.pumpAndSettle();
    expect(find.text('Semester 1'), findsOneWidget);
  });

  testWidgets('FB-2: an admin edits a program, its name and award, never its code', (tester) async {
    final repo = _FakeAcademic();
    repo._programs.add(const Program(
      id: 'p1', name: 'BTech CS', code: 'btech-cs', award: null, departmentId: 'd1',
      departmentName: 'Computer Science', durationYears: 4, termType: 'semester', publishedVersions: 0,
    ));
    await pump(tester, admin, repo);

    await tester.tap(find.byTooltip('More for BTech CS'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    expect(find.text('Edit program'), findsOneWidget);
    expect(find.textContaining('btech-cs'), findsWidgets, reason: 'the code is shown, not editable');

    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'B.Tech Computer Science');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();

    expect(repo.renamed['p1'], 'B.Tech Computer Science');
    expect(find.text('B.Tech Computer Science'), findsOneWidget);
    expect(find.text('Program updated'), findsOneWidget);
  });

  testWidgets('FB-2: an admin corrects a term, then archives it', (tester) async {
    final repo = _FakeAcademic();
    repo._years.add(AcademicYear(
      id: 'y1', name: '2026-27', startsOn: DateTime(2026, 6, 1), endsOn: DateTime(2027, 5, 31), isCurrent: true, status: 'active',
    ));
    repo._terms.add(Term(
      id: 't1', academicYearId: 'y1', sequence: 1, name: 'Semester 1', startsOn: DateTime(2026, 6, 1), endsOn: DateTime(2026, 11, 30),
    ));
    await pump(tester, admin, repo);
    await tester.tap(find.text('Calendar'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('More for Semester 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Odd semester');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(find.text('Odd semester'), findsOneWidget);

    await tester.tap(find.byTooltip('More for Odd semester'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archive'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Added by mistake');
    await tester.tap(find.widgetWithText(FilledButton, 'Archive'));
    await tester.pumpAndSettle();

    expect(repo.archivedTerms, ['t1']);
    expect(find.text('Odd semester'), findsNothing);
    expect(find.text('No terms yet'), findsOneWidget);
  });
}

class _FakeAcademic implements AcademicRepository {
  final _programs = <Program>[];
  final createdPrograms = <ProgramInput>[];
  final _years = <AcademicYear>[];
  final _terms = <Term>[];

  @override
  Future<Result<List<Department>>> departments() async => const Ok([
        Department(id: 'd1', name: 'Computer Science', code: 'cse', campusId: 'c1', campusName: 'Main'),
      ]);

  @override
  Future<Result<List<Program>>> programs() async => Ok(List.of(_programs));

  @override
  Future<Result<void>> createProgram(ProgramInput input) async {
    createdPrograms.add(input);
    _programs.add(Program(
      id: 'p${_programs.length + 1}', name: input.name, code: input.code, award: null, departmentId: input.departmentId,
      departmentName: 'Computer Science', durationYears: input.durationYears, termType: input.termType, publishedVersions: 0,
    ));
    return const Ok(null);
  }

  @override
  Future<Result<void>> archiveProgram(String id, String reason) async => const Ok(null);

  @override
  Future<Result<List<AcademicYear>>> years() async => Ok(List.of(_years));

  @override
  Future<Result<List<Term>>> terms() async => Ok(List.of(_terms));

  @override
  Future<Result<void>> createYear({
    required String name,
    required DateTime startsOn,
    required DateTime endsOn,
    required bool makeCurrent,
  }) async {
    _years.add(AcademicYear(
      id: 'y${_years.length + 1}', name: name, startsOn: startsOn, endsOn: endsOn, isCurrent: makeCurrent, status: 'active',
    ));
    return const Ok(null);
  }

  @override
  Future<Result<void>> createTerm({
    required String yearId,
    required int sequence,
    required String name,
    required DateTime startsOn,
    required DateTime endsOn,
  }) async {
    _terms.add(Term(id: 't${_terms.length + 1}', academicYearId: yearId, sequence: sequence, name: name, startsOn: startsOn, endsOn: endsOn));
    return const Ok(null);
  }

  final renamed = <String, String>{};
  final archivedTerms = <String>[];

  @override
  Future<Result<void>> renameProgram(String id, {required String name, String? award}) async {
    renamed[id] = name;
    final i = _programs.indexWhere((p) => p.id == id);
    final p = _programs[i];
    _programs[i] = Program(
      id: p.id, name: name, code: p.code, award: award, departmentId: p.departmentId,
      departmentName: p.departmentName, durationYears: p.durationYears, termType: p.termType,
      publishedVersions: p.publishedVersions,
    );
    return const Ok(null);
  }

  @override
  Future<Result<void>> updateYear(
    String id, {
    required String name,
    required DateTime startsOn,
    required DateTime endsOn,
    required bool makeCurrent,
  }) async {
    final i = _years.indexWhere((y) => y.id == id);
    final y = _years[i];
    _years[i] = AcademicYear(
      id: id, name: name, startsOn: startsOn, endsOn: endsOn, isCurrent: y.isCurrent || makeCurrent, status: y.status,
    );
    return const Ok(null);
  }

  @override
  Future<Result<void>> archiveYear(String id, String reason) async {
    _years.removeWhere((y) => y.id == id);
    return const Ok(null);
  }

  @override
  Future<Result<void>> updateTerm(String id, {required String name, required DateTime startsOn, required DateTime endsOn}) async {
    final i = _terms.indexWhere((t) => t.id == id);
    final t = _terms[i];
    _terms[i] = Term(id: id, academicYearId: t.academicYearId, sequence: t.sequence, name: name, startsOn: startsOn, endsOn: endsOn);
    return const Ok(null);
  }

  @override
  Future<Result<void>> archiveTerm(String id, String reason) async {
    archivedTerms.add(id);
    _terms.removeWhere((t) => t.id == id);
    return const Ok(null);
  }
}
