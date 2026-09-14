/// One concrete occurrence of teaching, as a teacher needs it.
///
/// Read from `GET /v1/me/sessions`, which derives the set from the signed-in
/// person on the server. The client never names a section, a room or a
/// colleague. See docs/blueprint/modules/m4-teaching-delivery.md.
class ClassSession {
  const ClassSession({
    required this.id,
    required this.offeringId,
    required this.date,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.courseCode,
    required this.courseTitle,
    required this.component,
    required this.sectionLabel,
    required this.programName,
    required this.termName,
    required this.roomCode,
    required this.roomName,
    required this.teacherName,
    required this.iAmTeaching,
    required this.iAmStandingIn,
    required this.cancelledReason,
    required this.movedFromDate,
    required this.allowedActions,
    this.roomId,
  });

  final String id;
  final String offeringId;

  /// A calendar date as 'YYYY-MM-DD'. Never parsed into a DateTime for display:
  /// a local DateTime would shift the day for every timezone east of UTC.
  final String date;
  final String startsAt;
  final String endsAt;
  final String status;
  final String courseCode;
  final String courseTitle;
  final String component;
  final String sectionLabel;
  final String programName;
  final String termName;
  /// ADM-8: moving a class keeps its room unless someone changes it.
  final String? roomId;
  final String? roomCode;
  final String? roomName;
  final String? teacherName;

  /// Stated by the server, so the app never compares identifiers to find itself.
  final bool iAmTeaching;
  final bool iAmStandingIn;

  final String? cancelledReason;
  final String? movedFromDate;
  final List<String> allowedActions;

  bool get isCancelled => status == 'cancelled';
  bool get isTaught => status == 'completed';
  bool get canMarkTaught => allowedActions.contains('complete');

  /// Nobody has said whether this class ran, and its day has gone. Derived
  /// exactly as the server derives it, never stored.
  bool isUnmarked(String todayDate) => status == 'scheduled' && date.compareTo(todayDate) < 0;

  String get whereLabel => roomCode ?? 'Room not set';

  String get timeLabel => '$startsAt – $endsAt';

  /// The state in a teacher's words, not an administrator's status name.
  String stateLabel(String todayDate) {
    if (isCancelled) return 'Cancelled';
    if (isTaught) return 'Taught';
    if (isUnmarked(todayDate)) return 'Not marked';
    return 'Scheduled';
  }

  String get componentLabel => switch (component) {
    'lecture' => 'Lecture',
    'lab' => 'Lab',
    'tutorial' => 'Tutorial',
    _ => component,
  };

  static ClassSession fromJson(Map json) {
    final course = json['course'] as Map;
    final section = json['section'] as Map;
    final program = json['program'] as Map;
    final term = json['term'] as Map;
    final room = json['room'] as Map?;
    final teacher = json['teacher'] as Map?;
    final movedFrom = json['moved_from'] as Map?;
    return ClassSession(
      id: json['id'] as String,
      offeringId: json['offering_id'] as String,
      date: '${json['date']}',
      startsAt: '${json['starts_at']}',
      endsAt: '${json['ends_at']}',
      status: json['status'] as String,
      courseCode: course['code'] as String,
      courseTitle: course['title'] as String,
      component: json['component'] as String? ?? 'lecture',
      sectionLabel: section['label'] as String,
      programName: program['name'] as String,
      termName: term['name'] as String,
      roomId: room?['id'] as String?,
      roomCode: room?['code'] as String?,
      roomName: room?['name'] as String?,
      teacherName: teacher?['full_name'] as String?,
      iAmTeaching: json['i_am_teaching'] as bool? ?? false,
      iAmStandingIn: json['i_am_standing_in'] as bool? ?? false,
      cancelledReason: json['cancelled_reason'] as String?,
      movedFromDate: movedFrom == null ? null : '${movedFrom['date']}',
      allowedActions: ((json['allowed_actions'] as List?) ?? const []).map((e) => '$e').toList(),
    );
  }
}

/// A day of classes, which is the unit a teacher actually works in.
class ScheduleDay {
  const ScheduleDay({required this.date, required this.sessions});

  final String date;
  final List<ClassSession> sessions;
}

/// What the schedule screen shows, in the order a teacher needs it.
///
/// Classes that have passed without being marked come first, because they are
/// the only part of the list somebody is waiting on. Today next, then the days
/// ahead. Nothing is hidden; the order carries the priority.
class Schedule {
  const Schedule({required this.needsMarking, required this.today, required this.upcoming});

  static const empty = Schedule(needsMarking: [], today: [], upcoming: []);

  final List<ClassSession> needsMarking;
  final List<ClassSession> today;
  final List<ScheduleDay> upcoming;

  bool get isEmpty => needsMarking.isEmpty && today.isEmpty && upcoming.isEmpty;
  int get total =>
      needsMarking.length +
      today.length +
      upcoming.fold(0, (sum, day) => sum + day.sessions.length);
}

/// Splits one flat feed into the three things a teacher asks about.
///
/// Dates are compared as strings, which is safe because they are ISO calendar
/// dates: '2026-06-09' sorts before '2026-06-10' without any parsing, and no
/// timezone can shift a comparison that never becomes an instant.
Schedule buildSchedule(List<ClassSession> sessions, String todayDate) {
  final needsMarking = <ClassSession>[];
  final today = <ClassSession>[];
  final laterOrder = <String>[];
  final later = <String, List<ClassSession>>{};

  for (final session in sessions) {
    if (session.date == todayDate) {
      today.add(session);
    } else if (session.date.compareTo(todayDate) < 0) {
      // Only the unanswered ones. A class already taught or cancelled is
      // finished business and does not belong in a list of things to do.
      if (session.isUnmarked(todayDate)) needsMarking.add(session);
    } else {
      if (!later.containsKey(session.date)) {
        laterOrder.add(session.date);
        later[session.date] = [];
      }
      later[session.date]!.add(session);
    }
  }

  return Schedule(
    needsMarking: needsMarking,
    today: today,
    upcoming: laterOrder.map((date) => ScheduleDay(date: date, sessions: later[date]!)).toList(),
  );
}

/// Today as a calendar date, in the device's own timezone.
///
/// The device's local day is the right one here: a teacher in India asking what
/// they teach today means their day, not UTC's.
String todayDate([DateTime? now]) {
  final d = now ?? DateTime.now();
  return '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

/// Shifts a calendar date by whole days without ever becoming an instant.
String shiftDate(String date, int days) {
  final parts = date.split('-').map(int.parse).toList();
  final shifted = DateTime.utc(parts[0], parts[1], parts[2]).add(Duration(days: days));
  return '${shifted.year.toString().padLeft(4, '0')}-'
      '${shifted.month.toString().padLeft(2, '0')}-'
      '${shifted.day.toString().padLeft(2, '0')}';
}

const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/// 'Monday, 8 Jun', or 'Today' and 'Tomorrow' where that is what a reader means.
String dayLabel(String date, String todayString) {
  if (date == todayString) return 'Today';
  if (date == shiftDate(todayString, 1)) return 'Tomorrow';
  final parts = date.split('-').map(int.parse).toList();
  final d = DateTime.utc(parts[0], parts[1], parts[2]);
  return '${_weekdays[d.weekday - 1]}, ${d.day} ${_months[d.month - 1]}';
}
