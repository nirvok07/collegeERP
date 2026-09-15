import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/platform/current_location.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/organisation/data/organisation_api.dart';
import 'package:college_erp/features/organisation/domain/org_unit.dart';
import 'package:college_erp/features/organisation/presentation/organisation_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// SA-A1 (AD-83): whoever manages campuses sets each campus's attendance area
/// from where they stand, sees it on the list, and can remove it; without
/// campus.manage there is no way to.
class _Repo implements OrganisationRepository {
  var campus = const Campus(id: 'c1', name: 'Main Campus', code: 'main', isDefault: true, departmentCount: 0);
  final saved = <CampusFence?>[];

  @override
  Future<Result<OrgTree>> loadTree() async => Ok(OrgTree(campuses: [campus], departments: const []));

  @override
  Future<Result<void>> setFence(String campusId, CampusFence? fence) async {
    saved.add(fence);
    campus = Campus(id: campus.id, name: campus.name, code: campus.code, isDefault: true, departmentCount: 0, fence: fence);
    return const Ok(null);
  }

  @override
  Future<Result<void>> createCampus({required String name, required String code}) async => const Ok(null);
  @override
  Future<Result<void>> createDepartment({required String campusId, required String name, required String code}) async =>
      const Ok(null);
  @override
  Future<Result<void>> renameDepartment(String id, String name) async => const Ok(null);
  @override
  Future<Result<void>> archiveCampus(String id, String reason) async => const Ok(null);
  @override
  Future<Result<void>> archiveDepartment(String id, String reason) async => const Ok(null);
}

const _admin = Authority(permissions: {'campus.manage', 'person.read'}, hasAccess: true);

Future<LocationFix> _onCampus() async =>
    const LocationFix(latitude: 28.545612, longitude: 77.192634, accuracyM: 9, isMocked: false);

void main() {
  testWidgets('the admin sets the area from where they stand; the list says so', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(MaterialApp(home: OrganisationScreen(authority: _admin, repository: repo, locate: _onCampus)));
    await tester.pumpAndSettle();
    expect(find.textContaining('No attendance area'), findsOneWidget);

    await tester.tap(find.byTooltip('More for Main Campus'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Attendance area'));
    await tester.pumpAndSettle();
    expect(find.text('Remove it (nobody can punch in here)'), findsNothing, reason: 'nothing to remove yet');

    await tester.tap(find.text('Use my location'));
    await tester.pumpAndSettle();
    expect(find.text('Your position, to within 9 m.'), findsOneWidget);
    await tester.tap(find.text('Save attendance area'));
    await tester.pumpAndSettle();

    final fence = repo.saved.single!;
    expect(fence.latitude, 28.545612);
    expect(fence.longitude, 77.192634);
    expect(fence.radiusM, CampusFence.defaultRadius);
    expect(find.textContaining('Attendance area 200 m'), findsOneWidget);
  });

  testWidgets('a position that cannot be had is said plainly, and nothing is saved', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(MaterialApp(
      home: OrganisationScreen(
        authority: _admin,
        repository: repo,
        locate: () async => throw const LocationUnavailable('Turn on location on this phone, then try again.'),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('More for Main Campus'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Attendance area'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Use my location'));
    await tester.pumpAndSettle();
    expect(find.text('Turn on location on this phone, then try again.'), findsOneWidget);
    await tester.tap(find.text('Save attendance area'));
    await tester.pumpAndSettle();
    expect(find.text('Use your location, or type the latitude and longitude.'), findsOneWidget);
    expect(repo.saved, isEmpty);
  });

  testWidgets('without campus.manage there is no attendance area to set', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: OrganisationScreen(
        authority: const Authority(permissions: {'person.read'}, hasAccess: true),
        repository: _Repo(),
        locate: _onCampus,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byTooltip('More for Main Campus'), findsNothing);
  });
}
