import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';

/// CAL-1, CAL-2: the college's calendar. Holidays are days without classes
/// (AD-39, owned by M2); events (a farewell, Teachers' Day) are announced and do
/// not stop classes. Not tied to terms. Read by everyone signed in to the
/// college; changed only by whoever holds term.manage.
abstract interface class CalendarRepository {
  Future<Result<AcademicCalendar>> read();

  /// One day, or every day from [from] to [to] under one label (all or none).
  Future<Result<void>> addHoliday({required String from, String? to, required String label});
  Future<Result<void>> removeHoliday(String id);

  /// Adds an event, or changes the one with [id].
  Future<Result<void>> saveEvent(EventDraft draft, {String? id});
  Future<Result<void>> removeEvent(String id);
}

class CalendarApi implements CalendarRepository {
  const CalendarApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}

  @override
  Future<Result<AcademicCalendar>> read() => _client.get('/v1/calendar', AcademicCalendar.fromJson);

  @override
  Future<Result<void>> addHoliday({required String from, String? to, required String label}) => _client.post(
    '/v1/non-teaching-days',
    {'on_date': from, if (to != null && to != from) 'to_date': to, 'label': label.trim()},
    _ignore,
  );

  @override
  Future<Result<void>> removeHoliday(String id) =>
      _client.delete('/v1/non-teaching-days/${Uri.encodeComponent(id)}', _ignore);

  @override
  Future<Result<void>> saveEvent(EventDraft draft, {String? id}) => id == null
      ? _client.post('/v1/calendar/events', draft.toJson(), _ignore)
      : _client.patch('/v1/calendar/events/${Uri.encodeComponent(id)}', draft.toJson(), _ignore);

  @override
  Future<Result<void>> removeEvent(String id) =>
      _client.delete('/v1/calendar/events/${Uri.encodeComponent(id)}', _ignore);
}

/// A calendar date with no time and no timezone (AD-49).
DateTime dayOf(String iso) {
  final p = iso.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

bool sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// '14:00' → '2 PM'; '11:30' → '11:30 AM'.
String twelveHour(String hhmm) {
  final parts = hhmm.split(':').map(int.parse).toList();
  final hour = parts[0] % 12 == 0 ? 12 : parts[0] % 12;
  final suffix = parts[0] < 12 ? 'AM' : 'PM';
  return parts[1] == 0 ? '$hour $suffix' : '$hour:${parts[1].toString().padLeft(2, '0')} $suffix';
}

class CalendarHoliday {
  const CalendarHoliday({required this.id, required this.onDate, required this.label});
  final String id;

  /// 'YYYY-MM-DD'.
  final String onDate;
  final String label;
  DateTime get date => dayOf(onDate);

  static CalendarHoliday fromJson(dynamic json) {
    final m = json as Map;
    return CalendarHoliday(id: m['id'] as String, onDate: '${m['on_date']}', label: m['label'] as String);
  }
}

/// CAL-2: an announced event. No times means all day.
class CalendarEvent {
  const CalendarEvent({
    required this.id,
    required this.title,
    required this.onDate,
    this.startsAt,
    this.endsAt,
    this.note,
  });

  final String id;
  final String title;
  final String onDate;

  /// 'HH:MM', or null for a full-day event.
  final String? startsAt;
  final String? endsAt;
  final String? note;

  DateTime get date => dayOf(onDate);
  bool get allDay => startsAt == null;
  String get when => allDay ? 'All day' : '${twelveHour(startsAt!)} – ${twelveHour(endsAt!)}';

  static CalendarEvent fromJson(dynamic json) {
    final m = json as Map;
    return CalendarEvent(
      id: m['id'] as String,
      title: m['title'] as String,
      onDate: '${m['on_date']}',
      startsAt: m['starts_at'] as String?,
      endsAt: m['ends_at'] as String?,
      note: m['note'] as String?,
    );
  }
}

/// What the admin typed for an event.
class EventDraft {
  const EventDraft({required this.title, required this.onDate, this.startsAt, this.endsAt, this.note});

  final String title;
  final String onDate;
  final String? startsAt;
  final String? endsAt;
  final String? note;

  Map<String, Object?> toJson() => {
    'title': title.trim(),
    'on_date': onDate,
    'starts_at': startsAt,
    'ends_at': endsAt,
    'note': (note?.trim().isEmpty ?? true) ? null : note!.trim(),
  };
}

/// Consecutive days under one label: how a person thinks of a break.
class HolidayRun {
  const HolidayRun(this.days);
  final List<CalendarHoliday> days;

  String get label => days.first.label;
  DateTime get first => days.first.date;
  DateTime get last => days.last.date;
  int get length => days.length;
}

class AcademicCalendar {
  AcademicCalendar({required List<CalendarHoliday> holidays, List<CalendarEvent> events = const []})
      : holidays = [...holidays]..sort((a, b) => a.onDate.compareTo(b.onDate)),
        events = [...events]..sort((a, b) => '${a.onDate}${a.startsAt ?? ''}'.compareTo('${b.onDate}${b.startsAt ?? ''}'));

  final List<CalendarHoliday> holidays;
  final List<CalendarEvent> events;

  static AcademicCalendar fromJson(dynamic json) {
    final m = json as Map;
    return AcademicCalendar(
      holidays: (m['holidays'] as List).map(CalendarHoliday.fromJson).toList(),
      events: ((m['events'] as List?) ?? const []).map(CalendarEvent.fromJson).toList(),
    );
  }

  late final List<HolidayRun> runs = () {
    final runs = <List<CalendarHoliday>>[];
    for (final h in holidays) {
      final previous = runs.isEmpty ? null : runs.last.last;
      final next = previous == null ? null : DateTime(previous.date.year, previous.date.month, previous.date.day + 1);
      if (previous != null && previous.label == h.label && sameDay(next!, h.date)) {
        runs.last.add(h);
      } else {
        runs.add([h]);
      }
    }
    return runs.map(HolidayRun.new).toList();
  }();

  CalendarHoliday? holidayOn(DateTime day) {
    for (final h in holidays) {
      if (sameDay(h.date, day)) return h;
    }
    return null;
  }

  List<CalendarEvent> eventsOn(DateTime day) => events.where((e) => sameDay(e.date, day)).toList();

  /// Breaks that touch the month.
  List<HolidayRun> runsIn(DateTime month) {
    final start = DateTime(month.year, month.month);
    final end = DateTime(month.year, month.month + 1, 0);
    return runs.where((r) => !r.last.isBefore(start) && !r.first.isAfter(end)).toList();
  }

  List<CalendarEvent> eventsIn(DateTime month) =>
      events.where((e) => e.date.year == month.year && e.date.month == month.month).toList();

  /// Breaks that have not ended yet, soonest first.
  List<HolidayRun> upcoming(DateTime today, {int limit = 5}) =>
      runs.where((r) => !r.last.isBefore(DateTime(today.year, today.month, today.day))).take(limit).toList();

  /// Events from today on, soonest first.
  List<CalendarEvent> upcomingEvents(DateTime today, {int limit = 5}) =>
      events.where((e) => !e.date.isBefore(DateTime(today.year, today.month, today.day))).take(limit).toList();
}
