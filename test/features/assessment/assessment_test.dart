import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/widgets/screen_state.dart';
import 'package:college_erp/features/assessment/domain/assessment.dart';
import 'package:college_erp/features/assessment/domain/assessment_repository.dart';
import 'package:college_erp/features/assessment/presentation/assessment_cubits.dart';
import 'package:flutter_test/flutter_test.dart';

/// Entering marks is consequential and repetitive. These tests pin down what
/// keeps it honest: absent is not zero, a keystroke is never lost to a failed
/// request, "unsaved" means a real difference, and a sheet with gaps cannot be
/// submitted.
Map<String, Object?> componentJson({
  String id = 'a1',
  String offeringId = 'o1',
  String status = 'draft',
  Object maxMarks = 50,
  String? heldOn = '2026-06-10',
  int version = 3,
  int markCount = 0,
}) => {
  'id': id,
  'offering_id': offeringId,
  'name': 'Test 1',
  'kind': 'test',
  'max_marks': maxMarks,
  'weight': 20,
  'held_on': heldOn,
  'status': status,
  'version': version,
  'mark_count': markCount,
  'course': {'code': 'CS301', 'title': 'Operating Systems'},
  'section': {'id': 's1', 'label': 'A'},
};

Map<String, Object?> studentJson(String id, String name, {String? status, Object? score}) => {
  'student_id': id,
  'full_name': name,
  'enrolment_number': 'CSE-$id',
  'student_status': 'enrolled',
  'mark_id': status == null ? null : 'm-$id',
  'status': status,
  'score': score,
};

Map<String, Object?> sheetJson({
  Map<String, Object?>? component,
  bool needsDate = false,
  List<Map<String, Object?>>? students,
  bool canMark = true,
  bool canSubmit = true,
}) => {
  'component': component ?? componentJson(),
  'needs_date': needsDate,
  'students': students ?? [studentJson('s1', 'Nisha Kumar'), studentJson('s2', 'Ravi Nair')],
  'can_mark': canMark,
  'can_submit': canSubmit,
};

AssessmentSheet sheet([Map<String, Object?>? json]) =>
    AssessmentSheet.fromJson(json ?? sheetJson());

class _FakeRepository implements AssessmentRepository {
  _FakeRepository({Result<AssessmentSheet>? sheet, this.components = const []})
    : sheetResult = sheet ?? Ok(AssessmentSheet.fromJson(sheetJson()));

  Result<AssessmentSheet> sheetResult;
  List<AssessmentComponent> components;
  Result<void> writeResult = const Ok<void>(null);
  final writes = <String>[];
  final keys = <String>[];
  int reads = 0;
  int? lastVersion;
  List<Map<String, Object?>>? lastMarks;

  @override
  Future<Result<List<AssessmentComponent>>> myComponents() async => Ok(components);

  @override
  Future<Result<AssessmentSheet>> readSheet(String componentId) async {
    reads++;
    return sheetResult;
  }

  @override
  Future<Result<void>> recordHeldOn({
    required String componentId,
    required int version,
    required String heldOn,
    required String idempotencyKey,
  }) async {
    writes.add('held:$heldOn');
    keys.add(idempotencyKey);
    lastVersion = version;
    return writeResult;
  }

  @override
  Future<Result<void>> saveMarks({
    required String componentId,
    required int version,
    required List<Map<String, Object?>> marks,
    required String idempotencyKey,
  }) async {
    writes.add('save');
    keys.add(idempotencyKey);
    lastVersion = version;
    lastMarks = marks;
    return writeResult;
  }

  @override
  Future<Result<void>> submit({
    required String componentId,
    required int version,
    required String idempotencyKey,
  }) async {
    writes.add('submit');
    keys.add(idempotencyKey);
    lastVersion = version;
    return writeResult;
  }
}

void main() {
  group('reading from the server', () {
    test('accepts a decimal sent as a number or as text, because PostgreSQL may send either', () {
      expect(AssessmentComponent.fromJson(componentJson(maxMarks: 50)).maxMarks, 50);
      expect(AssessmentComponent.fromJson(componentJson(maxMarks: '12.50')).maxMarks, 12.5);
    });

    test('writes marks the way a teacher does, without a trailing .0', () {
      expect(formatMarks(42), '42');
      expect(formatMarks(37.5), '37.5');
      expect(AssessmentComponent.fromJson(componentJson(maxMarks: 50)).outOf, 'out of 50');
    });

    test('states the stage in a teacher words', () {
      expect(AssessmentComponent.fromJson(componentJson(heldOn: null)).stageLabel, 'Not held yet');
      expect(AssessmentComponent.fromJson(componentJson()).stageLabel, 'Nothing entered');
      expect(AssessmentComponent.fromJson(componentJson(markCount: 12)).stageLabel, '12 entered');
      expect(
        AssessmentComponent.fromJson(componentJson(status: 'submitted')).stageLabel,
        'Submitted',
      );
    });

    test('keeps a missing result apart from absent and from zero', () {
      final s = sheet(
        sheetJson(
          students: [
            studentJson('s1', 'Nisha', status: 'scored', score: 0),
            studentJson('s2', 'Ravi', status: 'absent'),
            studentJson('s3', 'Meera'),
          ],
        ),
      );
      expect(s.students[0].status, MarkStatus.scored);
      expect(s.students[0].score, 0);
      expect(s.students[1].status, MarkStatus.absent);
      expect(s.students[1].score, isNull);
      expect(s.students[2].status, isNull);
    });
  });

  group('the local draft', () {
    test('holds a typed score and counts it as unsaved', () {
      final draft = MarkDraft(sheet());
      draft.setScore('s1', '42');
      expect(draft.statusFor('s1'), MarkStatus.scored);
      expect(draft.textFor('s1'), '42');
      expect(draft.pendingCount, 1);
    });

    test('marking absent clears any score, because absent is not zero', () {
      final draft = MarkDraft(sheet());
      draft.setScore('s1', '42');
      draft.setStatus('s1', MarkStatus.absent);
      expect(draft.statusFor('s1'), MarkStatus.absent);
      expect(draft.textFor('s1'), '');
      expect(draft.payload().single, {'student_id': 's1', 'status': 'absent', 'score': null});
    });

    test('typing back what the server holds is not a change', () {
      final draft = MarkDraft(
        sheet(
          sheetJson(
            students: [studentJson('s1', 'Nisha', status: 'scored', score: '42.00')],
          ),
        ),
      );
      draft.setScore('s1', '40');
      expect(draft.pendingCount, 1);
      draft.setScore('s1', '42');
      expect(draft.pendingCount, 0, reason: '"unsaved" must mean a real difference');
    });

    test('says what is wrong with a score while it is typed', () {
      final draft = MarkDraft(sheet());
      draft.setScore('s1', '');
      expect(draft.errorFor('s1'), contains('absent or exempt'));
      draft.setScore('s1', '10.333');
      expect(draft.errorFor('s1'), contains('two decimal places'));
      draft.setScore('s1', '51');
      expect(draft.errorFor('s1'), 'out of 50');
      draft.setScore('s1', '37.5');
      expect(draft.errorFor('s1'), isNull);
    });

    test('will not save while any field is wrong', () {
      final draft = MarkDraft(sheet());
      draft.setScore('s1', '42');
      draft.setScore('s2', '99');
      expect(draft.hasErrors, isTrue);
      expect(draft.canSave, isFalse);
    });

    test('sends only what changed, with scores as numbers', () {
      final draft = MarkDraft(
        sheet(
          sheetJson(
            students: [
              studentJson('s1', 'Nisha'),
              studentJson('s2', 'Ravi', status: 'scored', score: 30),
            ],
          ),
        ),
      );
      draft.setScore('s1', '37.5');
      expect(draft.payload(), [
        {'student_id': 's1', 'status': 'scored', 'score': 37.5},
      ]);
    });
  });

  group('what stops a sheet being submitted', () {
    final complete = sheetJson(
      students: [
        studentJson('s1', 'Nisha', status: 'scored', score: 40),
        studentJson('s2', 'Ravi', status: 'absent'),
      ],
    );

    test('nothing, once everybody has a result and all is saved', () {
      expect(MarkDraft(sheet(complete)).submitBlockedReason, isNull);
    });

    test('the date, first', () {
      expect(MarkDraft(sheet(sheetJson(needsDate: true))).submitBlockedReason, contains('held'));
    });

    test('unsaved changes, counted', () {
      final draft = MarkDraft(sheet(complete));
      draft.setScore('s1', '41');
      expect(draft.submitBlockedReason, contains('1 unsaved change'));
    });

    test('a student with no result', () {
      final draft = MarkDraft(
        sheet(
          sheetJson(
            students: [
              studentJson('s1', 'Nisha', status: 'scored', score: 40),
              studentJson('s2', 'Ravi'),
            ],
          ),
        ),
      );
      expect(draft.submitBlockedReason, contains('1 student has no result'));
    });

    test('a sheet already submitted, or no authority, which the server decides', () {
      expect(
        MarkDraft(sheet(sheetJson(component: componentJson(status: 'submitted'))))
            .submitBlockedReason,
        contains('submitted'),
      );
      expect(
        MarkDraft(sheet(sheetJson(canSubmit: false))).submitBlockedReason,
        contains('cannot submit'),
      );
    });
  });

  group('the course list', () {
    test('shows this course only, and leaves out what was never held', () async {
      final repository = _FakeRepository(
        components: [
          AssessmentComponent.fromJson(componentJson(id: 'a1')),
          AssessmentComponent.fromJson(componentJson(id: 'a2', offeringId: 'other')),
          AssessmentComponent.fromJson(componentJson(id: 'a3', status: 'cancelled')),
        ],
      );
      final cubit = CourseAssessmentsCubit(repository, 'o1');
      await cubit.load();
      expect(cubit.state.components.map((c) => c.id), ['a1']);
    });

    test('is empty, not failed, before the department has planned anything', () async {
      final cubit = CourseAssessmentsCubit(_FakeRepository(), 'o1');
      await cubit.load();
      expect(cubit.state.status, LoadStatus.empty);
    });
  });

  group('the mark sheet cubit', () {
    test('sends the sheet once, with the version it read', () async {
      final repository = _FakeRepository();
      final cubit = MarkSheetCubit(repository, 'a1');
      await cubit.load();

      cubit.setScore('s1', '42');
      cubit.setStatus('s2', MarkStatus.exempt);
      expect(await cubit.save(), isNull);

      expect(repository.writes, ['save']);
      expect(repository.lastVersion, 3);
      expect(repository.lastMarks, hasLength(2));
      expect(repository.reads, 2, reason: 're-read rather than patched');
    });

    test('keeps every keystroke when the save fails', () async {
      final repository = _FakeRepository()..writeResult = const Err(Failure.network);
      final cubit = MarkSheetCubit(repository, 'a1');
      await cubit.load();

      cubit.setScore('s1', '42');
      expect(await cubit.save(), Failure.network.message);
      expect(cubit.state.draft!.textFor('s1'), '42');
      expect(cubit.state.draft!.isDirty, isTrue);
      expect(cubit.state.busy, isFalse);
    });

    test('does not send a sheet with a wrong score', () async {
      final repository = _FakeRepository();
      final cubit = MarkSheetCubit(repository, 'a1');
      await cubit.load();

      cubit.setScore('s1', '99');
      expect(await cubit.save(), isNull);
      expect(repository.writes, isEmpty);
    });

    test('refuses to submit with unsaved results, without asking the server', () async {
      final repository = _FakeRepository();
      final cubit = MarkSheetCubit(repository, 'a1');
      await cubit.load();

      cubit.setScore('s1', '42');
      expect(await cubit.submit(), 'Save your changes first.');
      expect(repository.writes, isEmpty);
    });

    test('records the date and re-reads, because the class list depends on it', () async {
      final repository = _FakeRepository(
        sheet: Ok(sheet(sheetJson(needsDate: true, students: []))),
      );
      final cubit = MarkSheetCubit(repository, 'a1');
      await cubit.load();
      expect(cubit.state.draft!.sheet.needsDate, isTrue);

      expect(await cubit.recordHeldOn('2026-06-10'), isNull);
      expect(repository.writes, ['held:2026-06-10']);
      expect(repository.reads, 2);
    });

    test('ignores entry when the server says this reader cannot mark', () async {
      final repository = _FakeRepository(sheet: Ok(sheet(sheetJson(canMark: false))));
      final cubit = MarkSheetCubit(repository, 'a1');
      await cubit.load();

      cubit.setScore('s1', '42');
      expect(cubit.state.draft!.isDirty, isFalse);
    });

    test('reuses its key when the identical sheet is retried after a failure', () async {
      final repository = _FakeRepository()..writeResult = const Err(Failure.network);
      final cubit = MarkSheetCubit(repository, 'a1');
      await cubit.load();

      cubit.setScore('s1', '42');
      await cubit.save();
      await cubit.save();

      expect(repository.keys, hasLength(2));
      expect(repository.keys[0], repository.keys[1]);
    });

    test('takes a new key for the next save once one has landed', () async {
      final repository = _FakeRepository();
      final cubit = MarkSheetCubit(repository, 'a1');
      await cubit.load();

      cubit.setScore('s1', '42');
      await cubit.save();
      cubit.setScore('s1', '42');
      await cubit.save();

      // The same-looking request after a success is a new write, not a resend.
      expect(repository.keys, hasLength(2));
      expect(repository.keys[0], isNot(repository.keys[1]));
    });

  });
}
