/// ADM-8 (AD-81): the weekly timetable, generated classes and non-teaching
/// days, as the phone needs them. Field names mirror the API.
class Slot {
  const Slot({
    required this.id,
    required this.dayOfWeek,
    required this.startsAt,
    required this.endsAt,
    this.roomCode,
    this.roomName,
  });

  final String id;

  /// ISO-8601: 1 is Monday, 7 is Sunday.
  final int dayOfWeek;
  final String startsAt;
  final String endsAt;
  final String? roomCode;
  final String? roomName;

  String get label => '${dayName(dayOfWeek)} $startsAt – $endsAt${roomCode == null ? '' : ' · $roomCode'}';

  static Slot fromJson(dynamic json) {
    final m = json as Map;
    final room = m['room'] as Map?;
    return Slot(
      id: m['id'] as String,
      dayOfWeek: (m['day_of_week'] as num).toInt(),
      startsAt: '${m['starts_at']}',
      endsAt: '${m['ends_at']}',
      roomCode: room?['code'] as String?,
      roomName: room?['name'] as String?,
    );
  }
}

const _days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

String dayName(int isoDay) => _days[(isoDay - 1).clamp(0, 6)];

/// What generating a course's classes would do, or did.
class GenerationReport {
  const GenerationReport({
    required this.from,
    required this.to,
    required this.created,
    required this.alreadyScheduled,
    required this.skippedDays,
    required this.clashes,
    required this.occurrences,
  });

  final String from;
  final String to;
  final int created;
  final int alreadyScheduled;
  final List<({String date, String label})> skippedDays;
  final List<String> clashes;

  /// Classes a preview would create.
  final int occurrences;

  static GenerationReport fromJson(dynamic json) {
    final m = json as Map;
    return GenerationReport(
      from: '${m['from']}',
      to: '${m['to']}',
      created: (m['created'] as num?)?.toInt() ?? 0,
      alreadyScheduled: (m['already_scheduled'] as num?)?.toInt() ?? 0,
      skippedDays: [
        for (final d in (m['skipped_days'] as List?) ?? const []) (date: '${(d as Map)['date']}', label: '${d['label']}'),
      ],
      clashes: [
        for (final c in (m['clashes'] as List?) ?? const [])
          '${(c as Map)['date']} ${c['starts_at']}: ${c['kind'] == 'room' ? 'room' : 'teacher'} ${c['subject']} '
              'is busy with ${c['with_course_code']} (section ${c['with_section_label']})',
      ],
      occurrences: ((m['occurrences'] as List?) ?? const []).length,
    );
  }
}

class Holiday {
  const Holiday({required this.id, required this.onDate, required this.label});

  final String id;

  /// 'YYYY-MM-DD', never parsed into an instant.
  final String onDate;
  final String label;

  static Holiday fromJson(dynamic json) {
    final m = json as Map;
    return Holiday(id: m['id'] as String, onDate: '${m['on_date']}', label: m['label'] as String);
  }
}

/// 'HH:MM', the server's shape.
String clock(int hour, int minute) => '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

/// The Monday of the week that holds [date] ('YYYY-MM-DD').
String mondayOf(String date) {
  final p = date.split('-').map(int.parse).toList();
  final d = DateTime.utc(p[0], p[1], p[2]);
  final monday = d.subtract(Duration(days: d.weekday - 1));
  return '${monday.year.toString().padLeft(4, '0')}-${monday.month.toString().padLeft(2, '0')}-${monday.day.toString().padLeft(2, '0')}';
}
