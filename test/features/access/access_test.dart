import 'package:college_erp/core/widgets/app_sheet.dart';
import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/access/data/access_api.dart';
import 'package:college_erp/features/access/presentation/access_screen.dart';
import 'package:college_erp/features/college/college_profile.dart';
import 'package:college_erp/features/organisation/domain/org_unit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-10 (AD-81): access and the college profile on the phone. What
/// matters: only roles that can still be given are offered, a department
/// role needs a department, the server's refusals stay in the form, and the
/// profile saves pinned to the version it read.
void main() {
  Finder inDialog(String label) =>
      find.descendant(of: find.byType(AppSheet), matching: find.widgetWithText(FilledButton, label));

  Future<_FakeAccess> pumpAccess(WidgetTester tester, {bool canAssign = true}) async {
    final repo = _FakeAccess();
    await tester.pumpWidget(MaterialApp(
      home: AccessScreen(personId: 'p1', personName: 'Meera Iyer', canAssign: canAssign, repository: repo),
    ));
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('a reader sees access and cannot change it', (tester) async {
    await pumpAccess(tester, canAssign: false);
    expect(find.text('Faculty'), findsOneWidget);
    expect(find.text('Computer Science'), findsOneWidget);
    expect(find.widgetWithText(FloatingActionButton, 'Give access'), findsNothing);
  });

  testWidgets('giving Head of Department in a department', (tester) async {
    final repo = await pumpAccess(tester);
    await tester.tap(find.widgetWithText(FloatingActionButton, 'Give access'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('College Administrator').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Head of Department').last);
    await tester.pumpAndSettle();
    expect(find.text('Department'), findsOneWidget, reason: 'a department role asks where');
    await tester.tap(inDialog('Give access'));
    await tester.pumpAndSettle();
    expect(repo.granted, ['department_head/department/d1']);
  });

  testWidgets("removing the last administrator: the server's refusal stays in the form", (tester) async {
    final repo = await pumpAccess(tester);
    repo.refuseRevoke = true;
    await tester.tap(find.byTooltip('Remove Faculty'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Left the college');
    await tester.tap(inDialog('Remove'));
    await tester.pumpAndSettle();
    expect(find.text('This is the only administrator. Give someone else administrator access first.'), findsOneWidget);
  });

  test('branding is checked as on the web', () {
    expect(brandingProblem(name: 'A', logoUrl: '', brandColor: ''), 'Give the college a name.');
    expect(brandingProblem(name: 'ABC', logoUrl: 'http://x.png', brandColor: ''), contains('https://'));
    expect(brandingProblem(name: 'ABC', logoUrl: '', brandColor: 'blue'), contains('#1E40AF'));
    expect(brandingProblem(name: 'ABC College', logoUrl: 'https://x/logo.png', brandColor: '#1e40af'), isNull);
  });

  testWidgets('the college profile saves pinned to the version it read', (tester) async {
    final repo = _FakeProfile();
    await tester.pumpWidget(MaterialApp(home: CollegeProfileScreen(canManage: true, repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('ABC College'), findsOneWidget);
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Colour (optional)'), '#1e40af');
    await tester.tap(inDialog('Save'));
    await tester.pumpAndSettle();
    expect(repo.saved, ['7/ABC College/null/#1E40AF']);
  });
}

class _FakeAccess implements AccessRepository {
  final granted = <String>[];
  bool refuseRevoke = false;

  @override
  Future<Result<List<Grant>>> grants() async => const Ok([
        Grant(id: 'g1', personId: 'p1', roleKey: 'faculty', roleName: 'Faculty', scopeType: 'department', scopeRefId: 'd1'),
        Grant(id: 'g2', personId: 'other', roleKey: 'college_admin', roleName: 'College Administrator', scopeType: 'institution'),
      ]);

  @override
  Future<Result<List<RoleOption>>> roles() async => const Ok([
        RoleOption(key: 'college_admin', name: 'College Administrator', allowedScopeTypes: ['institution'], summary: 'Can grant and remove access'),
        RoleOption(key: 'department_head', name: 'Head of Department', allowedScopeTypes: ['department'], summary: 'Can invite and deactivate accounts'),
      ]);

  @override
  Future<Result<List<Department>>> departments() async =>
      const Ok([Department(id: 'd1', name: 'Computer Science', code: 'cse', campusId: 'c1', campusName: 'Main')]);

  @override
  Future<Result<void>> grant({required String personId, required String roleKey, required String scopeType, String? scopeRefId, String? reason}) async {
    granted.add('$roleKey/$scopeType/$scopeRefId');
    return const Ok(null);
  }

  @override
  Future<Result<void>> revoke(String grantId, String reason) async => refuseRevoke
      ? const Err(Failure(code: FailureCode.conflict, message: 'This is the only administrator. Give someone else administrator access first.'))
      : const Ok(null);
}

class _FakeProfile implements CollegeProfileRepository {
  final saved = <String>[];

  @override
  Future<Result<CollegeProfile>> load() async =>
      const Ok(CollegeProfile(code: 'abc', name: 'ABC College', status: 'active', version: 7));

  @override
  Future<Result<void>> save({required int version, required String name, String? logoUrl, String? brandColor}) async {
    saved.add('$version/$name/$logoUrl/$brandColor');
    return const Ok(null);
  }
}
