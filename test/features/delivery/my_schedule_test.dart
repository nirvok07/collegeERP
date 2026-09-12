import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/widgets/screen_state.dart';
import 'package:college_erp/features/delivery/domain/class_session.dart';
import 'package:college_erp/features/delivery/domain/delivery_repository.dart';
import 'package:college_erp/features/delivery/presentation/my_schedule_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

/// The teacher's schedule is self-scoped: the server answers for the signed-in
/// person, and the client only shapes that answer. These tests pin down the
/// shaping, the calendar arithmetic, and the one write a teacher makes.
Map<String, Object?> sessionJson({
  String id = 'cs1',
  String offeringId = 'o1',
  String date = '2026-06-10',
  String startsAt = '09:00',
  String endsAt = '10:00',
  String status = 'scheduled',
  String code = 'CS301',
  String title = 'Operating Systems',
  String component = 'lecture',
  String? roomCode = 'LH-204',
  String? teacherName = 'Asha Menon',
  bool iAmTeaching = true,
  bool iAmStandingIn = false,
  String? cancelledReason,
  String? movedFrom,
  List<String> allowed = const ['reschedule', 'cancel', 'complete', 'reassign'],
}) => {
  'id': id,
  'offering_id': offeringId,
  'slot_id': 'slot1',
  'date': date,
  'starts_at': startsAt,
  'ends_at': endsAt,
  'status': status,
  'room': roomCode == null
      ? null
      : {
          'id': 'r1',
          'code': roomCode,
          'name': 'Lecture Hall 204',
          'campus_name': 'Main',
          'capacity': 70,
        },
  'teacher': teacherName == null ? null : {'id': 'p1', 'full_name': teacherName},
  'stand_in': iAmStandingIn,
  'course': {'id': 'c1', 'code': code, 'title': title},
  'component': component,
  'section': {'id': 'sec1', 'label': 'A', 'capacity': 60},
  'term_number': 5,
  'program': {'id': 'prog1', 'name': 'B.Tech CSE'},
  'department_name': 'Computer Science',
  'term': {'id': 't1', 'name': 'Semester 1'},
  'academic_year_name': '2026-27',
  'cancelled_reason': cancelledReason,
  'moved_from': movedFrom == null ? null : {'date': movedFrom, 'starts_at': '09:00'},
  'completed_at': null,
  'allowed_actions': allowed,
  'room_too_small': false,
  'i_am_teaching': iAmTeaching,
  'i_am_standing_in': iAmStandingIn,
};

class _FakeRepository implements DeliveryRepository {
  _FakeRepository(this.sessions);

  Result<List<ClassSession>> sessions;
  Result<void> markResult = const Ok<void>(null);
  final windows = <String>[];
  final marked = <String>[];
  final keys = <String>[];

  @override
  Future<Result<List<ClassSession>>> mySessions({
    required String from,
    required String to,
  }) async {
    windows.add('$from..$to');
    return sessions;
  }

  @override
  Future<Result<void>> markTaught(String sessionId, {required String idempotencyKey}) async {
    marked.add(sessionId);
    keys.add(idempotencyKey);
    return markResult;
  }
}

void main() {
  group('calendar arithmetic never becomes an instant', () {
    test('shifts a date across a month and a year boundary', () {
      expect(shiftDate('2026-06-30', 1), '2026-07-01');
      expect(shiftDate('2026-01-01', -1), '2025-12-31');
      expect(shiftDate('2026-06-10', 14), '2026-06-24');
    });

    test('survives a daylight-saving boundary', () {
      // Local-midnight arithmetic lands on 23:00 the previous day in a timezone
      // that shifts, and the date then reads one short.
      expect(shiftDate('2026-03-28', 1), '2026-03-29');
      expect(shiftDate('2026-10-24', 7), '2026-10-31');
    });

    test('formats today and tomorrow as a reader would say them', () {
      expect(dayLabel('2026-06-10', '2026-06-10'), 'Today');
      expect(dayLabel('2026-06-11', '2026-06-10'), 'Tomorrow');
      expect(dayLabel('2026-06-15', '2026-06-10'), 'Monday, 15 Jun');
    });

    test('reads today in the device own timezone, because that is the day meant', () {
      expect(todayDate(DateTime(2026, 6, 9, 23, 30)), '2026-06-09');
      expect(todayDate(DateTime(2026, 1, 5)), '2026-01-05');
    });
  });

  group('reading one class', () {
    test('maps the server shape without reinterpreting it', () {
      final s = ClassSession.fromJson(sessionJson());
      expect(s.courseCode, 'CS301');
      expect(s.sectionLabel, 'A');
      expect(s.roomCode, 'LH-204');
      expect(s.timeLabel, '09:00 – 10:00');
      expect(s.canMarkTaught, isTrue);
      expect(s.iAmTeaching, isTrue);
    });

    test('takes whether the reader is teaching from the server, not from an id compare', () {
      expect(ClassSession.fromJson(sessionJson(iAmTeaching: false)).iAmTeaching, isFalse);
      expect(ClassSession.fromJson(sessionJson(iAmStandingIn: true)).iAmStandingIn, isTrue);
    });

    test('states the class in a teacher words rather than an administrator status', () {
      expect(ClassSession.fromJson(sessionJson()).stateLabel('2026-06-01'), 'Scheduled');
      expect(
        ClassSession.fromJson(sessionJson(status: 'completed')).stateLabel('2026-06-20'),
        'Taught',
      );
      expect(
        ClassSession.fromJson(sessionJson(status: 'cancelled')).stateLabel('2026-06-20'),
        'Cancelled',
      );
    });

    test('derives unmarked from the date, exactly as the server does', () {
      final past = ClassSession.fromJson(sessionJson(date: '2026-06-01'));
      expect(past.isUnmarked('2026-06-10'), isTrue);
      expect(past.stateLabel('2026-06-10'), 'Not marked');

      // Today is not over, so nothing is owed yet.
      expect(
        ClassSession.fromJson(sessionJson(date: '2026-06-10')).isUnmarked('2026-06-10'),
        isFalse,
      );
      // A class already taught owes nobody anything.
      expect(
        ClassSession.fromJson(
          sessionJson(date: '2026-06-01', status: 'completed'),
        ).isUnmarked('2026-06-10'),
        isFalse,
      );
    });

    test('says where, even when nobody set a room', () {
      expect(ClassSession.fromJson(sessionJson(roomCode: null)).whereLabel, 'Room not set');
    });
  });

  group('the schedule splits the feed into what a teacher asks about', () {
    test('puts unmarked past classes first, then today, then the days ahead', () {
      final schedule = buildSchedule([
        ClassSession.fromJson(sessionJson(id: 'later', date: '2026-06-12')),
        ClassSession.fromJson(sessionJson(id: 'past', date: '2026-06-08')),
        ClassSession.fromJson(sessionJson(id: 'today', date: '2026-06-10')),
      ], '2026-06-10');

      expect(schedule.needsMarking.map((s) => s.id), ['past']);
      expect(schedule.today.map((s) => s.id), ['today']);
      expect(schedule.upcoming.single.date, '2026-06-12');
      expect(schedule.total, 3);
    });

    test('leaves finished business out of the waiting list', () {
      final schedule = buildSchedule([
        ClassSession.fromJson(sessionJson(id: 'done', date: '2026-06-08', status: 'completed')),
        ClassSession.fromJson(sessionJson(id: 'off', date: '2026-06-09', status: 'cancelled')),
      ], '2026-06-10');

      expect(schedule.needsMarking, isEmpty);
      expect(schedule.isEmpty, isTrue, reason: 'nothing here needs a teacher to act');
    });

    test('groups several classes under one upcoming day, in the order sent', () {
      final schedule = buildSchedule([
        ClassSession.fromJson(sessionJson(id: 'a', date: '2026-06-12', startsAt: '09:00')),
        ClassSession.fromJson(sessionJson(id: 'b', date: '2026-06-12', startsAt: '11:00')),
        ClassSession.fromJson(sessionJson(id: 'c', date: '2026-06-13')),
      ], '2026-06-10');

      expect(schedule.upcoming.map((d) => d.date), ['2026-06-12', '2026-06-13']);
      expect(schedule.upcoming.first.sessions.map((s) => s.id), ['a', 'b']);
    });

    test('is empty when nothing is assigned', () {
      expect(buildSchedule(const [], '2026-06-10').isEmpty, isTrue);
    });
  });

  group('the schedule cubit', () {
    test('asks for a week back and a fortnight forward, and nothing about anyone else', () async {
      final repository = _FakeRepository(Ok([ClassSession.fromJson(sessionJson())]));
      final cubit = MyScheduleCubit(repository, today: '2026-06-10');
      await cubit.load();

      expect(repository.windows, ['2026-06-03..2026-06-24']);
      expect(cubit.state.status, LoadStatus.success);
    });

    test('reports an empty fortnight as empty, not as a failure', () async {
      final cubit = MyScheduleCubit(
        _FakeRepository(const Ok(<ClassSession>[])),
        today: '2026-06-10',
      );
      await cubit.load();
      expect(cubit.state.status, LoadStatus.empty);
    });

    test('a cold load failure surrenders the screen so the error can be retried', () async {
      final cubit = MyScheduleCubit(
        _FakeRepository(const Err<List<ClassSession>>(Failure.network)),
        today: '2026-06-10',
      );
      await cubit.load();
      expect(cubit.state.status, LoadStatus.failure);
      expect(cubit.state.failure, Failure.network);
    });

    test('a failed refresh keeps the day on screen', () async {
      final repository = _FakeRepository(Ok([ClassSession.fromJson(sessionJson())]));
      final cubit = MyScheduleCubit(repository, today: '2026-06-10');
      await cubit.load();

      repository.sessions = const Err(Failure.network);
      await cubit.load(refresh: true);

      expect(cubit.state.status, LoadStatus.success);
      expect(cubit.state.schedule.today, hasLength(1));
      expect(cubit.state.failure, Failure.network);
    });

    test('records a class as taught and re-reads what the server holds', () async {
      final repository = _FakeRepository(Ok([ClassSession.fromJson(sessionJson())]));
      final cubit = MyScheduleCubit(repository, today: '2026-06-10');
      await cubit.load();

      repository.sessions = Ok([ClassSession.fromJson(sessionJson(status: 'completed'))]);
      final failure = await cubit.markTaught(cubit.state.schedule.today.single);

      expect(failure, isNull);
      expect(repository.marked, ['cs1']);
      // Re-read rather than patched, so the screen cannot claim something the
      // server refused.
      expect(cubit.state.schedule.today.single.isTaught, isTrue);
      expect(cubit.state.marking, isNull);
    });

    test('surfaces a refusal without claiming the class was recorded', () async {
      final repository = _FakeRepository(Ok([ClassSession.fromJson(sessionJson())]));
      repository.markResult = const Err(
        Failure(
          code: FailureCode.forbidden,
          message: 'You are not assigned to teach this class, so you cannot record it as taught.',
        ),
      );
      final cubit = MyScheduleCubit(repository, today: '2026-06-10');
      await cubit.load();

      final failure = await cubit.markTaught(cubit.state.schedule.today.single);

      expect(failure?.message, contains('not assigned to teach'));
      expect(cubit.state.schedule.today.single.isTaught, isFalse);
      expect(cubit.state.marking, isNull, reason: 'the row stops showing progress');
    });

    test('reuses its key when recording the same class is retried after a failure', () async {
      final repository = _FakeRepository(Ok([ClassSession.fromJson(sessionJson())]));
      repository.markResult = const Err(Failure.network);
      final cubit = MyScheduleCubit(repository, today: '2026-06-10');
      await cubit.load();

      final session = cubit.state.schedule.today.single;
      await cubit.markTaught(session);
      await cubit.markTaught(session);

      expect(repository.keys, hasLength(2));
      expect(repository.keys[0], repository.keys[1], reason: 'not "already recorded" on a resend');
    });

  });
}
