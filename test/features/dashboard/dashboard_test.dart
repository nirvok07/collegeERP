import 'dart:async';

import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/core/widgets/screen_state.dart';
import 'package:college_erp/features/dashboard/domain/dashboard_summary.dart';
import 'package:college_erp/features/dashboard/presentation/dashboard_cubit.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/features/dashboard/data/overview_api.dart';
import 'package:college_erp/features/dashboard/presentation/dashboard_screen.dart';
import 'package:college_erp/features/delivery/domain/class_session.dart';
import 'package:college_erp/features/delivery/domain/delivery_repository.dart';
import 'package:college_erp/features/teaching/domain/teaching_offering.dart';
import 'package:college_erp/features/teaching/domain/teaching_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The dashboard only shapes the teacher's own sessions and teaching. These
/// tests pin down the shaping, what it asks the server for, and that a surface
/// the person has no authority for is absent.
ClassSession session({
  String id = 'cs1',
  String date = '2026-09-13',
  String start = '09:00',
  String end = '10:00',
  String status = 'scheduled',
  String title = 'Operating Systems',
}) => ClassSession(
  id: id,
  offeringId: 'o1',
  date: date,
  startsAt: start,
  endsAt: end,
  status: status,
  courseCode: 'CS301',
  courseTitle: title,
  component: 'lecture',
  sectionLabel: 'A',
  programName: 'B.Tech CSE',
  termName: 'Semester 1',
  roomCode: 'LH-204',
  roomName: null,
  teacherName: null,
  iAmTeaching: true,
  iAmStandingIn: false,
  cancelledReason: null,
  movedFromDate: null,
  allowedActions: const ['complete'],
);

TeachingOffering offering({String id = 'o1', String status = 'active'}) => TeachingOffering(
  id: id,
  component: 'lecture',
  status: status,
  courseCode: 'CS301',
  courseTitle: 'Operating Systems',
  sectionId: 'sec1',
  sectionLabel: 'A',
  sectionStatus: 'active',
  termNumber: 5,
  programName: 'B.Tech CSE',
  departmentName: 'Computer Science',
  termName: 'Semester 1',
  academicYearName: '2026-27',
  myRole: 'lead',
  instructors: const [],
);

class _FakeDelivery implements DeliveryRepository {
  _FakeDelivery(this.result);
  Result<List<ClassSession>> result;
  String? from;
  String? to;
  var calls = 0;

  @override
  Future<Result<List<ClassSession>>> mySessions({required String from, required String to}) async {
    calls++;
    this.from = from;
    this.to = to;
    return result;
  }

  @override
  Future<Result<void>> markTaught(String sessionId, {required String idempotencyKey}) async =>
      const Ok(null);
}

class _FakeTeaching implements TeachingRepository {
  _FakeTeaching(this.result);
  Result<List<TeachingOffering>> result;
  var calls = 0;

  @override
  Future<Result<List<TeachingOffering>>> myTeaching() async {
    calls++;
    return result;
  }
}

const today = '2026-09-13';

void main() {
  group('buildDashboard', () {
    test('the teaching record counts past classes and today\'s taught, not what is still to come', () {
      final summary = buildDashboard(
        sessions: [
          session(id: 'a', date: '2026-09-10', status: 'completed'),
          session(id: 'b', date: '2026-09-11'),
          session(id: 'c', date: '2026-09-12', status: 'cancelled'),
          session(id: 'd', date: today, status: 'completed'),
          session(id: 'e', date: today, start: '15:00', end: '16:00'),
          session(id: 'f', date: '2026-09-15'),
        ],
        offerings: const [],
        today: today,
        now: '12:00',
      );

      expect(summary.pulse.taught, 2);
      expect(summary.pulse.notMarked, 1);
      expect(summary.pulse.cancelled, 1);
      expect(summary.pulse.total, 4);
      expect(summary.pulse.taughtShare, closeTo(2 / 3, 1e-9));
      expect(summary.needsMarking.map((s) => s.id), ['b']);
    });

    test('nothing due reads as no share, never as 0%', () {
      final summary = buildDashboard(sessions: const [], offerings: const [], today: today, now: '09:00');
      expect(summary.pulse.taughtShare, isNull);
      expect(summary.focus, isNull);
    });

    test('a class in progress is "now", and up to two classes follow it', () {
      final summary = buildDashboard(
        sessions: [
          session(id: 'late', start: '15:00', end: '16:00'),
          session(id: 'now', start: '09:00', end: '10:00'),
          session(id: 'next', start: '11:00', end: '12:00'),
          session(id: 'then', start: '13:00', end: '14:00'),
        ],
        offerings: const [],
        today: today,
        now: '09:30',
      );

      expect(summary.focus?.id, 'now');
      expect(summary.focusIsNow, isTrue);
      expect(summary.following.map((s) => s.id), ['next', 'then']);
    });

    test('between classes the next one leads; cancelled classes and seconds in times are handled', () {
      final summary = buildDashboard(
        sessions: [
          session(id: 'done', start: '09:00:00', end: '10:00:00'),
          session(id: 'off', start: '10:30:00', end: '11:00:00', status: 'cancelled'),
          session(id: 'next', start: '11:00:00', end: '12:00:00'),
        ],
        offerings: const [],
        today: today,
        now: '10:15',
      );

      expect(summary.focus?.id, 'next');
      expect(summary.focusIsNow, isFalse);
      expect(summary.following, isEmpty);
    });

    test('after the last class there is no focus', () {
      final summary = buildDashboard(
        sessions: [session(start: '09:00', end: '10:00')],
        offerings: const [],
        today: today,
        now: '18:00',
      );
      expect(summary.focus, isNull);
    });

    test('the week counts classes per day from today, leaving out cancelled ones', () {
      final summary = buildDashboard(
        sessions: [
          session(id: 'a', date: today),
          session(id: 'b', date: '2026-09-14'),
          session(id: 'c', date: '2026-09-14', start: '11:00', end: '12:00'),
          session(id: 'd', date: '2026-09-15', status: 'cancelled'),
          session(id: 'e', date: '2026-09-20'),
        ],
        offerings: const [],
        today: today,
        now: '08:00',
      );

      expect(summary.week.map((d) => d.date).toList(), [
        '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19',
      ]);
      expect(summary.week.map((d) => d.classes).toList(), [1, 2, 0, 0, 0, 0, 0]);
      expect(summary.weekTotal, 3);
    });

    test('finished and cancelled teaching is not listed as a current course', () {
      final summary = buildDashboard(
        sessions: const [],
        offerings: [
          offering(id: 'live'),
          offering(id: 'planned', status: 'planned'),
          offering(id: 'done', status: 'completed'),
          offering(id: 'off', status: 'cancelled'),
        ],
        today: today,
        now: '08:00',
      );
      expect(summary.courses.map((c) => c.id), ['live', 'planned']);
    });

    test('weekday and clock helpers read calendar values without a timezone', () {
      expect(weekdayShort('2026-09-13'), 'Sun');
      expect(weekdayShort('2026-09-14'), 'Mon');
      expect(clockNow(DateTime(2026, 9, 13, 7, 5)), '07:05');
    });
  });

  group('DashboardCubit', () {
    test('asks for four weeks back and a week ahead, and nothing it has no authority for', () async {
      final delivery = _FakeDelivery(const Ok([]));
      final cubit = DashboardCubit(delivery: delivery, today: today, clock: () => '08:00');

      await cubit.load();

      expect(delivery.from, '2026-08-16');
      expect(delivery.to, '2026-09-19');
      expect(cubit.state.status, LoadStatus.success);
      expect(cubit.state.summary.week, hasLength(7));
      await cubit.close();
    });

    test('with no authority for either surface it asks the server nothing', () async {
      final cubit = DashboardCubit(today: today, clock: () => '08:00');
      await cubit.load();
      expect(cubit.state.status, LoadStatus.success);
      expect(cubit.state.summary.courses, isEmpty);
      await cubit.close();
    });

    test('a failed first read is a failure; a failed refresh keeps what was shown', () async {
      final delivery = _FakeDelivery(const Err(Failure.network));
      final teaching = _FakeTeaching(Ok([offering()]));
      final cubit = DashboardCubit(delivery: delivery, teaching: teaching, today: today, clock: () => '08:00');

      await cubit.load();
      expect(cubit.state.status, LoadStatus.failure);

      delivery.result = Ok([session()]);
      await cubit.load();
      expect(cubit.state.status, LoadStatus.success);
      expect(cubit.state.summary.courses, hasLength(1));

      delivery.result = const Err(Failure.network);
      await cubit.load(refresh: true);
      expect(cubit.state.status, LoadStatus.success);
      expect(cubit.state.failure, isNotNull);
      expect(cubit.state.summary.courses, hasLength(1));
      await cubit.close();
    });
  });

  group('DashboardScreen', () {
    Future<void> pump(WidgetTester tester, Authority authority, DashboardCubit cubit) async {
      tester.view.physicalSize = const Size(1080, 4200);
      tester.view.devicePixelRatio = 2.6;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          home: DashboardScreen(
            authority: authority,
            createCubit: () => cubit,
            college: const CollegeBrand(code: 'sunrise', name: 'Sunrise College'),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('a teacher sees the day, the charts and their own shortcuts only', (tester) async {
      final cubit = DashboardCubit(
        delivery: _FakeDelivery(
          Ok([
            session(id: 'miss', date: '2026-09-11'),
            session(id: 'now', start: '09:00', end: '10:00', title: 'Operating Systems'),
            session(id: 'next', start: '11:00', end: '12:00', title: 'Compiler Design'),
          ]),
        ),
        teaching: _FakeTeaching(Ok([offering()])),
        today: today,
        clock: () => '09:30',
      );

      await pump(
        tester,
        const Authority(permissions: {'session.read', 'offering.read'}, hasAccess: true),
        cubit,
      );

      expect(find.text('Sunrise College'), findsOneWidget, reason: 'the college, in the header');
      expect(find.textContaining('Good '), findsNothing, reason: 'no greeting on the dashboard');
      expect(find.byTooltip('Settings'), findsOneWidget, reason: 'SET-1: settings, with the profile inside');
      expect(find.text('1 class is waiting to be marked'), findsOneWidget);
      expect(find.text('Now'), findsOneWidget);
      expect(find.text('Compiler Design'), findsOneWidget);
      expect(find.text('Teaching record'), findsOneWidget);
      expect(find.text('Week ahead'), findsOneWidget);
      // FB-5: the same grid as the admin's, with their own work in it.
      expect(find.text('Your work'), findsOneWidget);
      expect(find.text('Manage your college'), findsNothing);
      expect(find.text('Schedule'), findsOneWidget);
      expect(find.text('Courses'), findsOneWidget);
      expect(find.text('1 to mark'), findsOneWidget, reason: 'the tile says what is waiting');
      expect(find.text('Profile'), findsOneWidget);
      // No person.read: the people and organisation surfaces are absent.
      expect(find.text('People'), findsNothing);
      expect(find.text('Organisation'), findsNothing);
      // No bottom navigation any more.
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('without schedule authority the day and its charts are absent', (tester) async {
      final cubit = DashboardCubit(today: today, clock: () => '09:30');
      await pump(tester, const Authority(permissions: {'person.read'}, hasAccess: true), cubit);

      expect(find.text('People'), findsOneWidget);
      expect(find.text('Organisation'), findsOneWidget);
      expect(find.text("Today's classes"), findsNothing);
      expect(find.text('Teaching record'), findsNothing);
      expect(find.text('Schedule'), findsNothing);
    });

    testWidgets("a College Admin gets the college's dashboard, not a teacher's", (tester) async {
      final cubit = DashboardCubit(
        delivery: _FakeDelivery(const Ok([])),
        teaching: _FakeTeaching(const Ok([])),
        overview: _FakeOverview(),
        today: today,
        clock: () => '09:30',
      );
      await pump(
        tester,
        const Authority(
          permissions: {
            'institution.read', 'institution.manage', 'person.read', 'account.manage', 'role.assign',
            'student.manage', 'session.read', 'offering.read',
          },
          hasAccess: true,
        ),
        cubit,
      );

      expect(find.text('Your college'), findsOneWidget);
      expect(find.text('340'), findsOneWidget, reason: 'students, in the header');
      expect(find.text('2 people have not signed in yet'), findsOneWidget);
      expect(find.text('Manage your college'), findsOneWidget);
      expect(find.text('Onboarding'), findsOneWidget);
      expect(find.text('12 staff'), findsOneWidget);
      expect(find.text('Teaching record'), findsNothing, reason: 'no teaching record for an admin who does not teach');
      expect(find.text("Today's classes"), findsNothing);
    });

    // UX-3: the first read's placeholder is the dashboard's own shape.
    Future<void> pumpLoading(WidgetTester tester, Authority authority, DashboardCubit cubit) async {
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 2.6;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          home: DashboardScreen(
            authority: authority,
            createCubit: () => cubit,
            college: const CollegeBrand(code: 'sunrise', name: 'Sunrise College'),
          ),
        ),
      );
      // The skeleton shimmers for as long as it shows, so it never settles.
      await tester.pump(const Duration(milliseconds: 100));
    }

    testWidgets('while an admin dashboard loads, its real header and tile grid are drawn in place', (tester) async {
      final overview = _PendingOverview();
      final cubit = DashboardCubit(overview: overview, today: today, clock: () => '09:30');
      await pumpLoading(
        tester,
        const Authority(permissions: {'institution.read', 'institution.manage', 'person.read'}, hasAccess: true),
        cubit,
      );

      expect(cubit.state.status, LoadStatus.loading);
      expect(tester.takeException(), isNull);
      expect(find.text('Sunrise College'), findsOneWidget, reason: 'the college is known before the numbers');
      expect(find.byType(SliverAppBar), findsOneWidget, reason: 'the navy header, not a list of rows');
      expect(find.byType(GridView), findsOneWidget, reason: 'the module tiles, in their grid');
      expect(find.byType(SkeletonBox), findsWidgets);
      expect(find.text('Your college'), findsNothing, reason: 'no numbers until they arrive');

      overview.complete();
      await tester.pumpAndSettle();
      expect(find.text('Your college'), findsOneWidget);
      expect(find.byType(SkeletonBox), findsNothing);
    });

    testWidgets("while a teacher's dashboard loads, the day and the week are drawn in place", (tester) async {
      final delivery = _PendingDelivery();
      final cubit = DashboardCubit(
        delivery: delivery,
        teaching: _FakeTeaching(Ok([offering()])),
        today: today,
        clock: () => '09:30',
      );
      await pumpLoading(tester, const Authority(permissions: {'session.read', 'offering.read'}, hasAccess: true), cubit);

      expect(tester.takeException(), isNull);
      expect(find.text('Sunrise College'), findsOneWidget);
      expect(find.byType(SliverAppBar), findsOneWidget);
      expect(find.byType(GridView), findsOneWidget, reason: "FB-5: a teacher's tiles are drawn in place, as the admin's");
      expect(find.byType(SkeletonBox), findsWidgets);

      delivery.complete();
      await tester.pumpAndSettle();
      expect(find.text('Teaching record'), findsOneWidget);
      expect(find.byType(SkeletonBox), findsNothing);
    });
  });
}

/// Holds the first read open, so the loading state can be looked at.
class _PendingOverview implements OverviewRepository {
  final _done = Completer<Result<CollegeOverview>>();

  void complete() => _done.complete(const Ok(CollegeOverview(
    staff: 12, students: 340, departments: 4, programs: 3, sections: 6, offerings: 18, rooms: 9, pendingInvitations: 0,
  )));

  @override
  Future<Result<CollegeOverview>> load() => _done.future;
}

class _PendingDelivery extends _FakeDelivery {
  _PendingDelivery() : super(const Ok([]));

  final _done = Completer<void>();

  void complete() => _done.complete();

  @override
  Future<Result<List<ClassSession>>> mySessions({required String from, required String to}) async {
    await _done.future;
    return result;
  }
}

class _FakeOverview implements OverviewRepository {
  @override
  Future<Result<CollegeOverview>> load() async => const Ok(CollegeOverview(
    staff: 12, students: 340, departments: 4, programs: 3, sections: 6, offerings: 18, rooms: 9, pendingInvitations: 2,
  ));
}
