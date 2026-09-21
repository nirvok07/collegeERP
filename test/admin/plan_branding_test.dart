import 'package:college_erp/core/widgets/app_sheet.dart';
import 'package:college_erp/admin/colleges/college_detail_screen.dart';
import 'package:college_erp/admin/colleges/college_models.dart';
import 'package:college_erp/admin/colleges/colleges_api.dart';
import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/people/domain/reset_code.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// SAM-2b (AD-72, AD-81): a college's plan, seats and branding from the Super
/// Admin app. What matters: every change is pinned to the version on screen,
/// a plan change carries a reason, only what changed is sent, and branding
/// is checked as the college's own profile checks it.
void main() {
  Finder inDialog(String label) =>
      find.descendant(of: find.byType(AppSheet), matching: find.widgetWithText(FilledButton, label));

  Future<_FakeColleges> pump(WidgetTester tester, {bool canManage = true}) async {
    final repo = _FakeColleges();
    await tester.pumpWidget(MaterialApp(home: CollegeDetailScreen(id: 'i1', canManage: canManage, repository: repo)));
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('without manage permission there is nothing to change', (tester) async {
    await pump(tester, canManage: false);
    expect(find.text('Change plan or seats'), findsNothing);
    expect(find.text('Edit branding'), findsNothing);
  });

  testWidgets('the seat limit is raised with a reason; only the seat limit is sent', (tester) async {
    final repo = await pump(tester);
    // The detail is one list; the dialogs' own scrollables come later.
    await tester.scrollUntilVisible(find.text('Change plan or seats'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Change plan or seats'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Seat limit'), '10');
    await tester.pump();
    expect(find.textContaining('below the 12 seats in use'), findsOneWidget, reason: 'warned before saving');

    await tester.enterText(find.widgetWithText(TextField, 'Seat limit'), '40');
    await tester.tap(inDialog('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Say why, in a few words.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Upgraded to 40 seats');
    await tester.tap(inDialog('Save'));
    await tester.pumpAndSettle();
    expect(repo.plans, ['v3/Upgraded to 40 seats/null/40']);
    expect(find.text('12 of 40 used, 28 left'), findsOneWidget);
  });

  testWidgets('branding refuses a colour that is not #RRGGBB, then saves it in capitals', (tester) async {
    final repo = await pump(tester);
    // The detail is one list; the dialogs' own scrollables come later.
    await tester.scrollUntilVisible(find.text('Edit branding'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Edit branding'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Colour (optional)'), 'blue');
    await tester.tap(inDialog('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Use a colour like #1E40AF.'), findsOneWidget);
    expect(repo.brandings, isEmpty);

    await tester.enterText(find.widgetWithText(TextField, 'Colour (optional)'), '#1e40af');
    await tester.tap(inDialog('Save'));
    await tester.pumpAndSettle();
    expect(repo.brandings, ['v3/Sunrise College/null/#1E40AF']);
  });
}

class _FakeColleges implements CollegesRepository {
  final plans = <String>[];
  final brandings = <String>[];
  var seatLimit = 25;
  String? colour;

  Map<String, Object?> _json() => {
        'id': 'i1', 'code': 'sunrise', 'name': 'Sunrise College', 'status': 'active', 'plan': 'standard',
        'timezone': 'Asia/Kolkata', 'seats': {'used': 12, 'limit': seatLimit}, 'logo_url': null,
        'brand_color': colour, 'version': 3, 'actions': ['suspend', 'close'], 'administrator': null,
      };

  @override
  Future<Result<CollegeDetail>> detail(String id) async => Ok(CollegeDetail.fromJson(_json()));

  @override
  Future<Result<CollegeDetail>> changePlan(String id, {required int version, required String reason, String? plan, int? seatLimit}) async {
    plans.add('v$version/$reason/$plan/$seatLimit');
    if (seatLimit != null) this.seatLimit = seatLimit;
    return Ok(CollegeDetail.fromJson(_json()));
  }

  @override
  Future<Result<CollegeDetail>> changeBranding(String id, {required int version, required String name, String? logoUrl, String? brandColor}) async {
    brandings.add('v$version/$name/$logoUrl/$brandColor');
    colour = brandColor;
    return Ok(CollegeDetail.fromJson(_json()));
  }

  @override
  Future<Result<List<CollegeSummary>>> list() async => const Ok([]);

  @override
  Future<Result<ProvisionedCollege>> provision(ProvisionInput input) async => const Err(Failure.unknown);

  @override
  Future<Result<CollegeDetail>> changeLifecycle(String id, {required String action, required int version, required String reason, String? confirmCode}) async =>
      const Err(Failure.unknown);

  @override
  Future<Result<ProvisionedCollege>> reissueInvitation(String id) async => const Err(Failure.unknown);

  @override
  Future<Result<ResetCode>> resetAdministrator(String id, String email) async => const Err(Failure.unknown);
}
