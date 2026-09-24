import '../data/staff_attendance_api.dart';

/// This month, classified day by day: present (a punch-in exists), absent
/// (a past working day with none), holiday (the academic calendar,
/// CAL-1/CAL-2) or remaining (still to come). Today counts as absent until
/// punched in, same as any other working day.
class MonthCounts {
  const MonthCounts({required this.present, required this.absent, required this.holiday, required this.remaining});

  final int present;
  final int absent;
  final int holiday;
  final int remaining;

  int get total => present + absent + holiday + remaining;
}

MonthCounts computeMonthCounts({
  required List<StaffAttendanceDay> days,
  required List<String> holidayDates,
  required DateTime now,
}) {
  final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
  final todayIso = _iso(now.year, now.month, now.day);
  final holidaySet = holidayDates.toSet();
  final presentSet = days.map((d) => d.workDate).toSet();

  var present = 0, absent = 0, holiday = 0, remaining = 0;
  for (var day = 1; day <= daysInMonth; day++) {
    final iso = _iso(now.year, now.month, day);
    if (iso.compareTo(todayIso) > 0) {
      remaining++;
    } else if (holidaySet.contains(iso)) {
      holiday++;
    } else if (presentSet.contains(iso)) {
      present++;
    } else {
      absent++;
    }
  }
  return MonthCounts(present: present, absent: absent, holiday: holiday, remaining: remaining);
}

String _iso(int year, int month, int day) =>
    '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
