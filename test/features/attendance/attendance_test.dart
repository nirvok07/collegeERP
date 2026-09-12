import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/widgets/screen_state.dart';
import 'package:college_erp/features/attendance/domain/attendance_repository.dart';
import 'package:college_erp/features/attendance/domain/attendance_sheet.dart';
import 'package:college_erp/features/attendance/presentation/attendance_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

/// Attendance is the most consequential thing this app writes.
///
/// These tests pin down the three things that keep it honest: a tap is never
/// lost to a failed request, "unsaved" always means a real difference from what
/// the server holds, and a register cannot be submitted while anybody on it is
/// unaccounted for.
Map<String, Object?> sheetJson({
  String status = 'draft',
  int version = 0,
  bool canMark = true,
  bool canSubmit = true,
  String? submittedBy,
  List<Map<String, Object?>>? students,
}) => {
  'session': {
    'id': 'cs1',
    'date': '2026-06-02',
    'starts_at': '09:00',
    'ends_at': '10:00',
    'status': 'scheduled',
    'course': {'id': 'c1', 'code': 'CS301', 'title': 'Operating Systems'},
    'component': 'lecture',
    'section': {'id': 'sec1', 'label': 'A'},
    'program': {'id': 'p1', 'name': 'B.Tech CSE'},
    'term': {'id': 't1', 'name': 'Semester 1'},
    'room': {'id': 'r1', 'code': 'LH-204'},
    'teacher': {'id': 'per1', 'full_name': 'Asha Menon'},
  },
  'sheet': {
    'status': status,
    'version': version,
    'submitted_at': null,
    'submitted_by': submittedBy,
  },
  'students': students ??
      [
        student('st1', 'Nisha Kumar', 'CSE2026-001'),
        student('st2', 'Ravi Nair', 'CSE2026-002'),
      ],
  'corrections': const [],
  'summary': const {
    'present': 0,
    'absent': 0,
    'late': 0,
    'excused': 0,
    'marked': 0,
    'unmarked': 2,
    'total': 2,
  },
  'can_mark': canMark,
  'can_submit': canSubmit,
  'can_correct': false,
};

Map<String, Object?> student(
  String id,
  String name,
  String number, {
  String? state,
  String? recordId,
}) => {
  'student_id': id,
  'full_name': name,
  'enrolment_number': number,
  'student_status': 'enrolled',
  'state': state,
  'note': null,
  'record_id': recordId ?? (state == null ? null : 'rec-$id'),
  'marked_by': state == null ? null : 'Asha Menon',
  'marked_at': null,
};

class _FakeRepository implements AttendanceRepository {
  _FakeRepository(this.sheet);

  Result<AttendanceSheet> sheet;
  Result<int> saveResult = const Ok(1);
  Result<void> submitResult = const Ok<void>(null);
  final saved = <Map<String, Object?>>[];
  int reads = 0;
  int submits = 0;
  int? lastVersion;

  @override
  Future<Result<AttendanceSheet>> readSheet(String sessionId) async {
    reads++;
    return sheet;
  }

  @override
  Future<Result<int>> saveMarks({
    required String sessionId,
    required int version,
    required List<Map<String, Object?>> marks,
  }) async {
    lastVersion = version;
    saved.add({'version': version, 'marks': marks});
    return saveResult;
  }

  @override
  Future<Result<void>> submit({required String sessionId, required int version}) async {
    submits++;
    lastVersion = version;
    return submitResult;
  }
}

AttendanceSheet parse(Map<String, Object?> json) => AttendanceSheet.fromJson(json);

void main() {
  group('reading a register', () {
    test('maps the roster and the class without reinterpreting them', () {
      final sheet = parse(sheetJson());
      expect(sheet.session.courseCode, 'CS301');
      expect(sheet.session.roomCode, 'LH-204');
      expect(sheet.students, hasLength(2));
      expect(sheet.version, 0, reason: 'no register exists until something is marked');
      expect(sheet.isSubmitted, isFalse);
    });

    test('an unmarked student is null, which is not absent', () {
      final sheet = parse(sheetJson());
      expect(sheet.students.first.mark, isNull);
      expect(sheet.students.first.recordId, isNull);
    });

    test('takes the permissions from the server rather than guessing them', () {
      final locked = parse(sheetJson(status: 'submitted', canMark: false, canSubmit: false));
      expect(locked.canMark, isFalse);
      expect(locked.isSubmitted, isTrue);
    });

    test('maps every state the server can send', () {
      expect(AttendanceMark.fromWire('present'), AttendanceMark.present);
      expect(AttendanceMark.fromWire('absent'), AttendanceMark.absent);
      expect(AttendanceMark.fromWire('late'), AttendanceMark.late);
      expect(AttendanceMark.fromWire('excused'), AttendanceMark.excused);
      expect(AttendanceMark.fromWire(null), isNull);
      expect(AttendanceMark.fromWire('nonsense'), isNull);
    });

    test('offers one letter for the row and a full word for a screen reader', () {
      expect(AttendanceMark.present.letter, 'P');
      expect(AttendanceMark.excused.label, 'Excused');
    });
  });

  group('the local draft', () {
    test('shows a tap immediately, before anything is sent', () {
      final draft = SheetDraft(parse(sheetJson()));
      draft.mark('st1', AttendanceMark.present);
      expect(draft.markFor('st1'), AttendanceMark.present);
      expect(draft.isDirty, isTrue);
      expect(draft.pendingCount, 1);
    });

    test('marks a whole class in one action, which is the common case', () {
      final draft = SheetDraft(parse(sheetJson()));
      draft.markAll(AttendanceMark.present);
      expect(draft.pendingCount, 2);
      expect(draft.unmarkedCount, 0);
      expect(draft.counts[AttendanceMark.present], 2);
    });

    test('tapping back to what the server holds is not a change', () {
      final draft = SheetDraft(parse(sheetJson(
        students: [
          student('st1', 'Nisha Kumar', 'CSE2026-001', state: 'present'),
          student('st2', 'Ravi Nair', 'CSE2026-002', state: 'absent'),
        ],
      )));

      draft.mark('st1', AttendanceMark.absent);
      expect(draft.pendingCount, 1);

      // Back to present, which is what the server already has.
      draft.mark('st1', AttendanceMark.present);
      expect(draft.pendingCount, 0, reason: '"unsaved" must mean a real difference');
      expect(draft.isDirty, isFalse);
    });

    test('sends only what changed, so it cannot overwrite somebody else work', () {
      final draft = SheetDraft(parse(sheetJson(
        students: [
          student('st1', 'Nisha Kumar', 'CSE2026-001'),
          student('st2', 'Ravi Nair', 'CSE2026-002', state: 'present'),
        ],
      )));
      draft.mark('st1', AttendanceMark.absent);

      final payload = draft.payload();
      expect(payload, hasLength(1));
      expect(payload.single['student_id'], 'st1');
      expect(payload.single['state'], 'absent');
    });

    test('counts what is still unaccounted for', () {
      final draft = SheetDraft(parse(sheetJson()));
      expect(draft.unmarkedCount, 2);
      draft.mark('st1', AttendanceMark.late);
      expect(draft.unmarkedCount, 1);
      expect(draft.counts[AttendanceMark.late], 1);
    });
  });

  group('what stops a register being submitted', () {
    test('nothing, once every student is marked and saved', () {
      final draft = SheetDraft(parse(sheetJson(
        version: 1,
        students: [
          student('st1', 'Nisha Kumar', 'CSE2026-001', state: 'present'),
          student('st2', 'Ravi Nair', 'CSE2026-002', state: 'absent'),
        ],
      )));
      expect(draft.submitBlockedReason, isNull);
      expect(draft.canSubmit, isTrue);
    });

    test('unsaved marks, counted', () {
      final draft = SheetDraft(parse(sheetJson(
        version: 1,
        students: [
          student('st1', 'Nisha Kumar', 'CSE2026-001', state: 'present'),
          student('st2', 'Ravi Nair', 'CSE2026-002', state: 'absent'),
        ],
      )));
      draft.mark('st1', AttendanceMark.absent);
      expect(draft.submitBlockedReason, contains('1 unsaved change'));
      expect(draft.canSubmit, isFalse);
    });

    test('a student nobody has accounted for', () {
      final draft = SheetDraft(parse(sheetJson(
        version: 1,
        students: [
          student('st1', 'Nisha Kumar', 'CSE2026-001', state: 'present'),
          student('st2', 'Ravi Nair', 'CSE2026-002'),
        ],
      )));
      expect(draft.submitBlockedReason, contains('1 student has'));
    });

    test('the register already being submitted', () {
      final draft = SheetDraft(parse(sheetJson(status: 'submitted', canSubmit: false)));
      expect(draft.submitBlockedReason, contains('has been submitted'));
    });

    test('not holding the authority, which the server decides', () {
      final draft = SheetDraft(parse(sheetJson(canSubmit: false)));
      expect(draft.submitBlockedReason, contains('cannot submit'));
    });
  });

  group('the attendance cubit', () {
    test('loads the register and reports an empty roster as empty', () async {
      final empty = _FakeRepository(Ok(parse(sheetJson(students: const []))));
      final cubit = AttendanceCubit(empty, 'cs1');
      await cubit.load();
      expect(cubit.state.status, LoadStatus.empty);
    });

    test('sends the whole batch once, with the version it read', () async {
      final repository = _FakeRepository(Ok(parse(sheetJson(version: 3))));
      final cubit = AttendanceCubit(repository, 'cs1');
      await cubit.load();

      cubit.markAll(AttendanceMark.present);
      final error = await cubit.save();

      expect(error, isNull);
      expect(repository.saved, hasLength(1), reason: 'sixty students is one request');
      expect(repository.lastVersion, 3);
      expect((repository.saved.single['marks']! as List), hasLength(2));
    });

    test('keeps every tap on screen when the save fails', () async {
      final repository = _FakeRepository(Ok(parse(sheetJson())));
      repository.saveResult = const Err(Failure.network);
      final cubit = AttendanceCubit(repository, 'cs1');
      await cubit.load();

      cubit.mark('st1', AttendanceMark.absent);
      final error = await cubit.save();

      expect(error, Failure.network.message);
      // The whole point: a classroom is where the network is worst, and a lost
      // tap is a wrong academic record.
      expect(cubit.state.draft!.markFor('st1'), AttendanceMark.absent);
      expect(cubit.state.draft!.isDirty, isTrue);
      expect(cubit.state.saving, isFalse);
    });

    test('surfaces a stale version without pretending the marks landed', () async {
      final repository = _FakeRepository(Ok(parse(sheetJson(version: 1))));
      repository.saveResult = const Err(
        Failure(
          code: FailureCode.conflict,
          message: 'Somebody else changed this register while you were marking it.',
        ),
      );
      final cubit = AttendanceCubit(repository, 'cs1');
      await cubit.load();

      cubit.mark('st1', AttendanceMark.present);
      final error = await cubit.save();

      expect(error, contains('Somebody else changed'));
      expect(cubit.state.draft!.isDirty, isTrue);
    });

    test('re-reads after a successful save rather than patching a version', () async {
      final repository = _FakeRepository(Ok(parse(sheetJson())));
      final cubit = AttendanceCubit(repository, 'cs1');
      await cubit.load();
      expect(repository.reads, 1);

      cubit.mark('st1', AttendanceMark.present);
      await cubit.save();

      expect(repository.reads, 2, reason: 'the screen shows what the server holds');
    });

    test('refuses to submit with unsaved marks, without asking the server', () async {
      final repository = _FakeRepository(Ok(parse(sheetJson(version: 1))));
      final cubit = AttendanceCubit(repository, 'cs1');
      await cubit.load();

      cubit.mark('st1', AttendanceMark.present);
      final error = await cubit.submit();

      expect(error, 'Save your changes first.');
      expect(repository.submits, 0);
    });

    test('submits with the version it read and re-reads afterwards', () async {
      final repository = _FakeRepository(Ok(parse(sheetJson(
        version: 4,
        students: [
          student('st1', 'Nisha Kumar', 'CSE2026-001', state: 'present'),
          student('st2', 'Ravi Nair', 'CSE2026-002', state: 'absent'),
        ],
      ))));
      final cubit = AttendanceCubit(repository, 'cs1');
      await cubit.load();

      final error = await cubit.submit();

      expect(error, isNull);
      expect(repository.submits, 1);
      expect(repository.lastVersion, 4);
      expect(repository.reads, 2);
    });

    test('ignores marking once the register is submitted', () async {
      final repository = _FakeRepository(
        Ok(parse(sheetJson(status: 'submitted', canMark: false, canSubmit: false))),
      );
      final cubit = AttendanceCubit(repository, 'cs1');
      await cubit.load();

      cubit.mark('st1', AttendanceMark.absent);
      expect(cubit.state.draft!.isDirty, isFalse, reason: 'a submitted register is read-only');
      expect(cubit.state.draft!.markFor('st1'), isNull);
    });

    test('a failed cold load surrenders the screen; a failed refresh does not', () async {
      final repository = _FakeRepository(const Err(Failure.network));
      final cubit = AttendanceCubit(repository, 'cs1');
      await cubit.load();
      expect(cubit.state.status, LoadStatus.failure);

      repository.sheet = Ok(parse(sheetJson()));
      await cubit.load();
      expect(cubit.state.status, LoadStatus.success);

      repository.sheet = const Err(Failure.network);
      await cubit.load(refresh: true);
      expect(cubit.state.status, LoadStatus.success, reason: 'the roster stays on screen');
      expect(cubit.state.failure, Failure.network);
    });
  });
}
