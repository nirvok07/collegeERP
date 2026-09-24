import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/calendar/data/calendar_api.dart';
import 'package:college_erp/features/staff_attendance/data/staff_attendance_api.dart';
import 'package:college_erp/features/staff_attendance/presentation/staff_attendance_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeCalendar implements CalendarRepository {
  @override
  Future<Result<AcademicCalendar>> read() async => Ok(AcademicCalendar(holidays: const []));

  @override
  Future<DateTime?> readSavedAt() async => null;

  @override
  Future<Result<void>> addHoliday({required String from, String? to, required String label}) async => const Ok(null);

  @override
  Future<Result<void>> removeHoliday(String id) async => const Ok(null);

  @override
  Future<Result<void>> saveEvent(EventDraft draft, {String? id}) async => const Ok(null);

  @override
  Future<Result<void>> removeEvent(String id) async => const Ok(null);
}

class _FakeRepository implements StaffAttendanceRepository {
  List<StaffAttendanceDay> days = const [];
  bool refuse = false;

  @override
  Future<Result<List<StaffAttendanceDay>>> history() async => Ok(days);

  @override
  Future<Result<StaffAttendanceDay>> punchIn() async {
    if (refuse) return Err(const Failure(code: FailureCode.conflict, message: 'Already punched out for today.'));
    final day = StaffAttendanceDay(
      id: 'd1', workDate: _today(), punchInAt: DateTime.now(),
    );
    days = [day, ...days];
    return Ok(day);
  }

  @override
  Future<Result<StaffAttendanceDay>> punchOut() async {
    if (refuse) return Err(const Failure(code: FailureCode.conflict, message: 'Punch in first.'));
    final open = days.first;
    final closed = StaffAttendanceDay(
      id: open.id, workDate: open.workDate, punchInAt: open.punchInAt, punchOutAt: DateTime.now(),
    );
    days = [closed, ...days.skip(1)];
    return Ok(closed);
  }

  static String _today() {
    final n = DateTime.now();
    return '${n.year.toString().padLeft(4, '0')}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }
}

void main() {
  testWidgets('punches in, then out, and today reflects it', (tester) async {
    final repo = _FakeRepository();
    await tester.pumpWidget(MaterialApp(home: StaffAttendanceScreen(repository: repo, calendarRepository: _FakeCalendar())));
    await tester.pumpAndSettle();

    expect(find.text('Not punched in yet'), findsOneWidget);
    expect(find.text('Punch in'), findsOneWidget);

    await tester.tap(find.text('Punch in'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Punched in at'), findsWidgets);
    expect(find.text('Punch out'), findsOneWidget);

    await tester.tap(find.text('Punch out'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Punched out at'), findsWidgets);
    expect(find.text('Done for today'), findsOneWidget);
  });

  testWidgets('a refused punch shows the server\'s reason without losing the screen', (tester) async {
    final repo = _FakeRepository()..refuse = true;
    await tester.pumpWidget(MaterialApp(home: StaffAttendanceScreen(repository: repo, calendarRepository: _FakeCalendar())));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Punch in'));
    await tester.pumpAndSettle();

    expect(find.text('Already punched out for today.'), findsOneWidget);
    expect(find.text('Not punched in yet'), findsOneWidget, reason: 'the day is unchanged since the punch was refused');
  });
}
