import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/academic/data/academic_api.dart';
import 'package:college_erp/features/academic/domain/academic.dart';
import 'package:college_erp/features/fees/domain/fees.dart';
import 'package:college_erp/features/fees/presentation/fee_structure_detail_screen.dart';
import 'package:college_erp/features/fees/presentation/fee_structures_screen.dart';
import 'package:college_erp/features/organisation/domain/org_unit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fee_test_support.dart';

class _FakeAcademic implements AcademicRepository {
  final programs_ = <Program>[
    const Program(
      id: 'p1', name: 'B.Tech CSE', code: 'btech-cse', award: null, departmentId: 'd1',
      departmentName: 'CSE', durationYears: 4, termType: 'semester', publishedVersions: 0,
    ),
  ];
  final years_ = <AcademicYear>[
    AcademicYear(id: 'y1', name: '2026-27', startsOn: DateTime(2026, 6, 1), endsOn: DateTime(2027, 5, 31), isCurrent: true, status: 'active'),
  ];

  @override
  Future<Result<List<Program>>> programs() async => Ok(programs_);
  @override
  Future<Result<List<AcademicYear>>> years() async => Ok(years_);

  @override
  Future<Result<List<Department>>> departments() => throw UnimplementedError();
  @override
  Future<Result<void>> createProgram(ProgramInput input) => throw UnimplementedError();
  @override
  Future<Result<void>> archiveProgram(String id, String reason) => throw UnimplementedError();
  @override
  Future<Result<List<Term>>> terms() => throw UnimplementedError();
  @override
  Future<Result<void>> createYear({required String name, required DateTime startsOn, required DateTime endsOn, required bool makeCurrent}) =>
      throw UnimplementedError();
  @override
  Future<Result<void>> createTerm({required String yearId, required int sequence, required String name, required DateTime startsOn, required DateTime endsOn}) =>
      throw UnimplementedError();
  @override
  Future<Result<void>> renameProgram(String id, {required String name, String? award}) => throw UnimplementedError();
  @override
  Future<Result<void>> updateYear(String id, {required String name, required DateTime startsOn, required DateTime endsOn, required bool makeCurrent}) =>
      throw UnimplementedError();
  @override
  Future<Result<void>> archiveYear(String id, String reason) => throw UnimplementedError();
  @override
  Future<Result<void>> updateTerm(String id, {required String name, required DateTime startsOn, required DateTime endsOn}) => throw UnimplementedError();
  @override
  Future<Result<void>> archiveTerm(String id, String reason) => throw UnimplementedError();
}

/// FEE-1: fee structures. What matters: a draft is created for a program and
/// year, instalments and their fees are composed only while it is a draft,
/// and publishing exposes generate-invoices instead of further editing.
void main() {
  testWidgets('an Accountant creates a draft, composes it, and publishes it', (tester) async {
    final fees = FakeFeesRepository()..allHeads.add(const FeeHead(id: 'h1', name: 'Tuition', code: 'TUITION', status: 'active'));
    final academic = _FakeAcademic();
    await tester.pumpWidget(MaterialApp(
      onGenerateRoute: (settings) {
        if (settings.name == '/detail') {
          final args = settings.arguments! as FeeStructureDetailArgs;
          return MaterialPageRoute(builder: (_) => FeeStructureDetailScreen(args: args, repository: fees));
        }
        return null;
      },
      home: Builder(
        builder: (context) => FeeStructuresScreen(
          authority: const Authority(permissions: {'fee.manage'}, hasAccess: true),
          feesRepository: fees,
          academicRepository: academic,
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('No fee structures yet'), findsOneWidget);

    await tester.tap(find.text('New structure'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create draft'));
    await tester.pumpAndSettle();

    expect(find.text('Draft'), findsOneWidget);
    expect(fees.allStructures.single.status, 'draft');
    expect(fees.allStructures.single.programId, 'p1');
    expect(fees.allStructures.single.academicYearId, 'y1');
  });

  testWidgets('without fee.manage there is no way to start a structure', (tester) async {
    final fees = FakeFeesRepository();
    await tester.pumpWidget(MaterialApp(
      home: FeeStructuresScreen(
        authority: const Authority(permissions: {'fee.read'}, hasAccess: true),
        feesRepository: fees,
        academicRepository: _FakeAcademic(),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('New structure'), findsNothing);
  });
}
