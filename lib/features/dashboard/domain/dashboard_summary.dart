import '../../delivery/domain/class_session.dart';
import '../../teaching/domain/teaching_offering.dart';

/// Whether a teacher's classes in a window were accounted for.
///
/// Derived from the teacher's own sessions, never stored (AD-7). A class today
/// that has not happened yet is in none of the three: it is not late.
class TeachingPulse {
  const TeachingPulse({required this.taught, required this.notMarked, required this.cancelled});

  static const empty = TeachingPulse(taught: 0, notMarked: 0, cancelled: 0);

  final int taught;
  final int notMarked;
  final int cancelled;

  /// Classes that were due to run: taught, or passed without anyone saying.
  int get due => taught + notMarked;
  int get total => due + cancelled;

  /// The share of due classes recorded as taught; null when nothing was due,
  /// so "no classes" never reads as 0%.
  double? get taughtShare => due == 0 ? null : taught / due;
}

class DayLoad {
  const DayLoad({required this.date, required this.classes});

  final String date;
  final int classes;
}

/// Everything the dashboard shows, shaped once so the screen only draws.
class DashboardSummary {
  const DashboardSummary({
    required this.today,
    required this.pulse,
    required this.needsMarking,
    required this.week,
    required this.courses,
    this.focus,
    this.focusIsNow = false,
    this.following = const [],
  });

  static const empty = DashboardSummary(
    today: '',
    pulse: TeachingPulse.empty,
    needsMarking: [],
    week: [],
    courses: [],
  );

  final String today;
  final TeachingPulse pulse;
  final List<ClassSession> needsMarking;

  /// Today onwards, one entry per day of [DashboardCubit.lookAheadDays].
  final List<DayLoad> week;

  /// Teaching that is running or still to start, in the server's order.
  final List<TeachingOffering> courses;

  /// The class in progress, or failing that the next one today.
  final ClassSession? focus;
  final bool focusIsNow;

  /// Up to two classes after [focus], today.
  final List<ClassSession> following;

  int get weekTotal => week.fold(0, (sum, d) => sum + d.classes);
}

/// Times arrive as 'HH:mm' or 'HH:mm:ss'; comparing the first five characters
/// is exact for both, with no parsing and no timezone.
String _hm(String time) => time.length >= 5 ? time.substring(0, 5) : time;

/// Shapes the teacher's sessions and teaching into the dashboard.
///
/// [now] is the device's local time as 'HH:mm', like [todayDate] a local
/// reading: "up next" means next on this teacher's clock.
DashboardSummary buildDashboard({
  required List<ClassSession> sessions,
  required List<TeachingOffering> offerings,
  required String today,
  required String now,
  int weekDays = 7,
}) {
  var taught = 0, notMarked = 0, cancelled = 0;
  final needsMarking = <ClassSession>[];
  final todays = <ClassSession>[];
  final perDay = <String, int>{};

  for (final s in sessions) {
    if (s.date.compareTo(today) <= 0) {
      if (s.isTaught) {
        taught++;
      } else if (s.isCancelled) {
        cancelled++;
      } else if (s.isUnmarked(today)) {
        notMarked++;
        needsMarking.add(s);
      }
    }
    if (s.date == today) todays.add(s);
    if (!s.isCancelled && s.date.compareTo(today) >= 0) {
      perDay[s.date] = (perDay[s.date] ?? 0) + 1;
    }
  }

  todays.sort((a, b) => _hm(a.startsAt).compareTo(_hm(b.startsAt)));
  final live = todays.where((s) => !s.isCancelled).toList();
  final current = live.where(
    (s) => _hm(s.startsAt).compareTo(now) <= 0 && _hm(s.endsAt).compareTo(now) > 0,
  );
  final ahead = live.where((s) => _hm(s.startsAt).compareTo(now) > 0).toList();
  final focus = current.isNotEmpty ? current.first : (ahead.isEmpty ? null : ahead.first);
  final following = focus == null
      ? const <ClassSession>[]
      : ahead.where((s) => s != focus).take(2).toList();

  return DashboardSummary(
    today: today,
    pulse: TeachingPulse(taught: taught, notMarked: notMarked, cancelled: cancelled),
    needsMarking: needsMarking,
    week: [
      for (var i = 0; i < weekDays; i++)
        DayLoad(date: shiftDate(today, i), classes: perDay[shiftDate(today, i)] ?? 0),
    ],
    courses: offerings.where((o) => !o.isOver).toList(),
    focus: focus,
    focusIsNow: current.isNotEmpty,
    following: following,
  );
}

const _shortWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// 'Mon' for a calendar date, computed in UTC so no timezone moves the day.
String weekdayShort(String date) {
  final p = date.split('-').map(int.parse).toList();
  return _shortWeekdays[DateTime.utc(p[0], p[1], p[2]).weekday - 1];
}

/// The device's local time of day as 'HH:mm'.
String clockNow([DateTime? now]) {
  final d = now ?? DateTime.now();
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}
