import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';

/// CAL-1: the academic calendar (AD-39, owned by M2): years, terms and the
/// days the college does not teach. Read by everyone signed in to the college;
/// changed only by whoever holds term.manage.
abstract interface class CalendarRepository {
  Future<Result<AcademicCalendar>> read();

  /// One day, or every day from [from] to [to] under one label (all or none).
  Future<Result<void>> addHoliday({required String from, String? to, required String label});
  Future<Result<void>> removeHoliday(String id);
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
}

/// A calendar date with no time and no timezone (AD-49).
DateTime dayOf(String iso) {
  final p = iso.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

bool sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

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

class CalendarPeriod {
  const CalendarPeriod({
    required this.isTerm,
    required this.id,
    required this.name,
    required this.yearName,
    required this.startsOn,
    required this.endsOn,
    required this.isCurrent,
  });

  final bool isTerm;
  final String id;
  final String name;
  final String? yearName;
  final DateTime startsOn;
  final DateTime endsOn;
  final bool isCurrent;

  bool covers(DateTime day) => !day.isBefore(startsOn) && !day.isAfter(endsOn);

  static CalendarPeriod fromJson(dynamic json) {
    final m = json as Map;
    return CalendarPeriod(
      isTerm: m['kind'] == 'term',
      id: m['id'] as String,
      name: m['name'] as String,
      yearName: m['year_name'] as String?,
      startsOn: dayOf('${m['starts_on']}'),
      endsOn: dayOf('${m['ends_on']}'),
      isCurrent: m['is_current'] == true,
    );
  }
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
  AcademicCalendar({required List<CalendarHoliday> holidays, required this.periods})
      : holidays = [...holidays]..sort((a, b) => a.onDate.compareTo(b.onDate));

  final List<CalendarHoliday> holidays;
  final List<CalendarPeriod> periods;

  static AcademicCalendar fromJson(dynamic json) {
    final m = json as Map;
    return AcademicCalendar(
      holidays: (m['holidays'] as List).map(CalendarHoliday.fromJson).toList(),
      periods: (m['periods'] as List).map(CalendarPeriod.fromJson).toList(),
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

  /// The term a day falls in, if any.
  CalendarPeriod? termOn(DateTime day) {
    for (final p in periods) {
      if (p.isTerm && p.covers(day)) return p;
    }
    return null;
  }

  /// Breaks that touch the month.
  List<HolidayRun> runsIn(DateTime month) {
    final start = DateTime(month.year, month.month);
    final end = DateTime(month.year, month.month + 1, 0);
    return runs.where((r) => !r.last.isBefore(start) && !r.first.isAfter(end)).toList();
  }

  /// Breaks that have not ended yet, soonest first.
  List<HolidayRun> upcoming(DateTime today, {int limit = 5}) =>
      runs.where((r) => !r.last.isBefore(DateTime(today.year, today.month, today.day))).take(limit).toList();
}
