import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/delivery/domain/class_session.dart';
import 'package:college_erp/features/student/data/my_attendance.dart';
import 'package:college_erp/features/student/presentation/my_timetable_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

ClassSession _session({required String date, required String status, String courseCode = 'CS101'}) => ClassSession(
      id: '$date-$courseCode',
      offeringId: 'o1',
      date: date,
      startsAt: '09:00',
      endsAt: '10:00',
      status: status,
      courseCode: courseCode,
      courseTitle: 'Programming',
      component: 'lecture',
      sectionLabel: 'A',
      programName: 'BTech CSE',
      termName: 'Semester 1',
      roomCode: 'R1',
      roomName: 'Room 1',
      teacherName: 'Asha Menon',
      iAmTeaching: false,
      iAmStandingIn: false,
      cancelledReason: status == 'cancelled' ? 'Faculty unwell' : null,
      movedFromDate: null,
      allowedActions: const [],
    );

class _FakeSelf implements StudentSelfRepository {
  _FakeSelf(this.sessions);
  final List<ClassSession> sessions;

  @override
  Future<Result<MyAttendance>> myAttendance() => throw UnimplementedError();
  @override
  Future<DateTime?> myAttendanceSavedAt() => throw UnimplementedError();
  @override
  Future<Result<MyFees>> myFees() => throw UnimplementedError();
  @override
  Future<DateTime?> myFeesSavedAt() => throw UnimplementedError();
  @override
  Future<Result<OnlinePaymentStarted>> payOnline(int amountPaise) => throw UnimplementedError();
  @override
  Future<Result<String>> onlinePaymentStatus(String intentId) => throw UnimplementedError();

  @override
  Future<Result<List<ClassSession>>> myTimetable() async => Ok(sessions);
  @override
  Future<DateTime?> myTimetableSavedAt() async => null;
}

/// A student's own timetable: classes of their section, grouped by date, a
/// cancelled class shown but struck through and labelled with its reason.
void main() {
  testWidgets('shows the section\'s classes grouped by date, cancelled ones called out', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: MyTimetableScreen(repository: _FakeSelf([
        _session(date: '2026-06-02', status: 'scheduled', courseCode: 'CS101'),
        _session(date: '2026-06-02', status: 'cancelled', courseCode: 'PH101'),
        _session(date: '2026-06-09', status: 'completed', courseCode: 'CS101'),
      ])),
    ));
    await tester.pumpAndSettle();

    expect(find.text('2026-06-02'), findsOneWidget);
    expect(find.text('2026-06-09'), findsOneWidget);
    expect(find.textContaining('CS101'), findsNWidgets(2));
    expect(find.textContaining('PH101'), findsOneWidget);
    expect(find.textContaining('Cancelled: Faculty unwell'), findsOneWidget);
  });

  testWidgets('an empty timetable says so', (tester) async {
    await tester.pumpWidget(MaterialApp(home: MyTimetableScreen(repository: _FakeSelf(const []))));
    await tester.pumpAndSettle();

    expect(find.text('Nothing on the timetable yet.'), findsOneWidget);
  });
}
