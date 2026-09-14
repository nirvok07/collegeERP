import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/organisation/data/organisation_api.dart';
import 'package:college_erp/features/organisation/domain/org_unit.dart';
import 'package:college_erp/features/organisation/presentation/organisation_cubit.dart';
import 'package:college_erp/features/organisation/presentation/organisation_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-2: the College Admin sets up campuses and departments from the phone.
/// What matters: the actions appear only with their permission, a new unit
/// shows once the server has it, and a refusal stays in the form that caused it.
void main() {
  test('a code is suggested from the name, in the server shape', () {
    expect(suggestCode('Computer Science & Engineering'), 'computer-science-engineering');
    expect(suggestCode('  North Campus  '), 'north-campus');
    expect(suggestCode('A' * 40).length, lessThanOrEqualTo(32));
  });

  Future<void> pump(WidgetTester tester, Set<String> permissions, _FakeOrganisation repo) async {
    await tester.pumpWidget(MaterialApp(
      home: OrganisationScreen(
        authority: Authority(permissions: permissions, hasAccess: true),
        repository: repo,
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('without campus.manage there is no way to add a campus', (tester) async {
    await pump(tester, {'person.read'}, _FakeOrganisation());
    expect(find.text('Main Campus'), findsOneWidget);
    expect(find.text('Add campus'), findsNothing);
  });

  testWidgets('an admin adds a campus; it appears once the server has it', (tester) async {
    final repo = _FakeOrganisation();
    await pump(tester, {'person.read', 'campus.manage', 'department.manage'}, repo);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'North Campus');
    expect(find.widgetWithText(TextField, 'north-campus'), findsOneWidget, reason: 'code follows the name');
    await tester.tap(find.widgetWithText(FilledButton, 'Add campus'));
    await tester.pumpAndSettle();

    expect(repo.created, ['North Campus/north-campus']);
    expect(find.text('North Campus'), findsOneWidget);
    expect(find.text('Campus added'), findsOneWidget);
  });

  testWidgets("the server's refusal stays in the form, on the field", (tester) async {
    final repo = _FakeOrganisation()
      ..refuse = const Failure(
        code: FailureCode.validationFailed,
        message: 'Check the highlighted fields.',
        fieldErrors: {'code': 'A campus already uses that code.'},
      );
    await pump(tester, {'person.read', 'campus.manage'}, repo);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Main Campus');
    await tester.tap(find.widgetWithText(FilledButton, 'Add campus'));
    await tester.pumpAndSettle();

    expect(find.text('A campus already uses that code.'), findsOneWidget);
    expect(find.byType(AlertDialog), findsOneWidget, reason: 'the form stays open');
  });

  testWidgets('an admin adds the first department of a campus', (tester) async {
    final repo = _FakeOrganisation();
    await pump(tester, {'person.read', 'campus.manage', 'department.manage'}, repo);

    await tester.tap(find.text('Main Campus'));
    await tester.pumpAndSettle();
    expect(find.text('No departments yet'), findsOneWidget);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Physics');
    await tester.tap(find.widgetWithText(FilledButton, 'Add department'));
    await tester.pumpAndSettle();

    expect(find.text('Physics'), findsOneWidget);
    expect(find.text('physics'), findsOneWidget);
  });
}

class _FakeOrganisation implements OrganisationRepository {
  final campuses = [
    const Campus(id: 'c1', name: 'Main Campus', code: 'main', isDefault: true, departmentCount: 0),
  ];
  final departments = <Department>[];
  final created = <String>[];
  Failure? refuse;

  @override
  Future<Result<OrgTree>> loadTree() async =>
      Ok(OrgTree(campuses: List.of(campuses), departments: List.of(departments)));

  @override
  Future<Result<void>> createCampus({required String name, required String code}) async {
    if (refuse != null) return Err(refuse!);
    created.add('$name/$code');
    campuses.add(Campus(id: 'c${campuses.length + 1}', name: name, code: code, isDefault: false, departmentCount: 0));
    return const Ok(null);
  }

  @override
  Future<Result<void>> createDepartment({required String campusId, required String name, required String code}) async {
    departments.add(Department(id: 'd${departments.length + 1}', name: name, code: code, campusId: campusId, campusName: ''));
    return const Ok(null);
  }

  @override
  Future<Result<void>> renameDepartment(String id, String name) async => const Ok(null);

  @override
  Future<Result<void>> archiveCampus(String id, String reason) async => const Ok(null);

  @override
  Future<Result<void>> archiveDepartment(String id, String reason) async => const Ok(null);
}
