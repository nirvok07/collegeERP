import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/academic/domain/academic.dart';
import 'package:college_erp/features/curriculum/data/curriculum_api.dart';
import 'package:college_erp/features/curriculum/domain/curriculum.dart';
import 'package:college_erp/features/curriculum/presentation/curriculum_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-4 (AD-81): curricula on the phone. What matters: authoring appears
/// only with its permission, a draft is filled term by term and published,
/// and a published version offers a new version instead of an edit.
void main() {
  Future<_FakeCurriculum> pump(WidgetTester tester, Set<String> permissions) async {
    final repo = _FakeCurriculum();
    await tester.pumpWidget(MaterialApp(
      home: CurriculumScreen(
        authority: Authority(permissions: permissions, hasAccess: true),
        repository: repo,
        today: DateTime(2026, 9, 14),
      ),
    ));
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('a reader sees regulations and courses but no way to change them', (tester) async {
    await pump(tester, {'person.read'});
    expect(find.text('BTech CSE'), findsOneWidget);
    expect(find.widgetWithText(FloatingActionButton, 'New regulation'), findsNothing);
    await tester.tap(find.text('Courses'));
    await tester.pumpAndSettle();
    expect(find.text('CS101 · Programming'), findsOneWidget);
    expect(find.widgetWithText(FloatingActionButton, 'Add course'), findsNothing);
  });

  testWidgets('an admin drafts a regulation, fills its one term and publishes it', (tester) async {
    final repo = await pump(tester, {'person.read', 'department.manage'});

    await tester.tap(find.widgetWithText(FloatingActionButton, 'New regulation'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, '2026'), findsOneWidget, reason: 'this year by default');
    await tester.enterText(find.widgetWithText(TextField, '2'), '1');
    await tester.tap(find.widgetWithText(FilledButton, 'Create draft'));
    await tester.pumpAndSettle();

    expect(find.text('Regulation 2026'), findsOneWidget, reason: 'the new draft opens');
    expect(find.text('No courses yet'), findsOneWidget);

    await tester.tap(find.text('Publish'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Terms 1 have no courses'), findsOneWidget, reason: 'warned before asking');
    await tester.tap(inDialog('Publish'));
    await tester.pumpAndSettle();
    expect(find.textContaining('No courses in term 1'), findsOneWidget, reason: "the server's refusal stays in the form");
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add course to term 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();
    expect(find.text('CS101 · Programming'), findsOneWidget);

    await tester.tap(find.text('Publish'));
    await tester.pumpAndSettle();
    await tester.tap(inDialog('Publish'));
    await tester.pumpAndSettle();

    expect(repo.published, isTrue);
    expect(find.text('Published'), findsWidgets);
    expect(find.text('New version'), findsOneWidget);
    expect(find.text('Add course to term 1'), findsNothing, reason: 'a published curriculum never changes');
  });
}

class _FakeCurriculum implements CurriculumRepository {
  CurriculumVersion? draft;
  final entries = <TermEntry>[];
  bool published = false;

  static const program = Program(
    id: 'p1', name: 'BTech CSE', code: 'btech-cse', award: null, departmentId: 'd1',
    departmentName: 'CSE', durationYears: 1, termType: 'semester', publishedVersions: 0,
  );

  @override
  Future<Result<List<Program>>> programs() async => const Ok([program]);

  @override
  Future<Result<List<Course>>> courses() async => const Ok([Course(id: 'c1', code: 'CS101', title: 'Programming')]);

  @override
  Future<Result<void>> createCourse({required String code, required String title, String? description}) async => const Ok(null);

  @override
  Future<Result<void>> retitleCourse(String id, {required String title, String? description}) async => const Ok(null);

  CurriculumVersion _current() => CurriculumVersion(
        id: draft!.id, programId: 'p1', programName: 'BTech CSE', regulationYear: draft!.regulationYear, revision: 1,
        status: published ? 'published' : 'draft', totalTerms: draft!.totalTerms, editable: !published,
        courseCount: entries.length, totalCredits: entries.fold<num>(0, (s, e) => s + e.credits),
      );

  @override
  Future<Result<List<CurriculumVersion>>> versions(String programId) async => Ok(draft == null ? [] : [_current()]);

  @override
  Future<Result<VersionDetail>> version(String id) async => Ok(VersionDetail(
        version: _current(),
        terms: [
          for (var t = 1; t <= draft!.totalTerms; t++)
            CurriculumTerm(number: t, courses: t == 1 ? List.of(entries) : const [], credits: t == 1 ? entries.fold<num>(0, (s, e) => s + e.credits) : 0),
        ],
      ));

  @override
  Future<Result<String>> createDraft({required String programId, required int regulationYear, required int totalTerms, String? title}) async {
    draft = CurriculumVersion(
      id: 'v1', programId: programId, programName: 'BTech CSE', regulationYear: regulationYear, revision: 1,
      status: 'draft', totalTerms: totalTerms, editable: true,
    );
    return const Ok('v1');
  }

  @override
  Future<Result<void>> addEntry(
    String versionId, {
    required String courseId,
    required int termNumber,
    required num credits,
    required String requirement,
    String? electiveGroup,
  }) async {
    entries.add(TermEntry(id: 'e${entries.length + 1}', courseId: courseId, code: 'CS101', title: 'Programming', credits: credits, requirement: requirement));
    return const Ok(null);
  }

  @override
  Future<Result<void>> removeEntry(String versionId, String entryId) async => const Ok(null);

  @override
  Future<Result<void>> publish(String id) async {
    if (entries.isEmpty) {
      return const Err(Failure(code: FailureCode.validationFailed, message: 'No courses in term 1. Publication cannot be undone.'));
    }
    published = true;
    return const Ok(null);
  }

  @override
  Future<Result<String>> successor(String id, {required String kind, required String reason, int? regulationYear}) async =>
      const Ok('v2');
}

/// The confirming button inside the dialog, not the page's own button of the same name.
Finder inDialog(String label) =>
    find.descendant(of: find.byType(AlertDialog), matching: find.widgetWithText(FilledButton, label));
