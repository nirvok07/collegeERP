import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';

/// SA-ATT-1: a staff member's own attendance, punched in and out.
/// Self-scoped — the same shape as `/me/sessions`: no permission beyond being
/// signed in, and the server derives who from the token, never a client id.
abstract interface class StaffAttendanceRepository {
  /// The last ~90 days, most recent first.
  Future<Result<List<StaffAttendanceDay>>> history();
  Future<Result<StaffAttendanceDay>> punchIn();
  Future<Result<StaffAttendanceDay>> punchOut();
}

class StaffAttendanceApi implements StaffAttendanceRepository {
  const StaffAttendanceApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<List<StaffAttendanceDay>>> history() => _client.get(
    '/v1/me/staff-attendance',
    (data) => (data as List).map((j) => StaffAttendanceDay.fromJson(j as Map)).toList(),
  );

  @override
  Future<Result<StaffAttendanceDay>> punchIn() =>
      _client.post('/v1/me/staff-attendance/punch-in', const {}, (data) => StaffAttendanceDay.fromJson(data as Map));

  @override
  Future<Result<StaffAttendanceDay>> punchOut() =>
      _client.post('/v1/me/staff-attendance/punch-out', const {}, (data) => StaffAttendanceDay.fromJson(data as Map));
}

class StaffAttendanceDay {
  const StaffAttendanceDay({
    required this.id, required this.workDate, required this.punchInAt, this.punchOutAt,
  });

  final String id;

  /// 'YYYY-MM-DD'.
  final String workDate;
  final DateTime punchInAt;
  final DateTime? punchOutAt;

  bool get isOpen => punchOutAt == null;

  Duration get worked => (punchOutAt ?? DateTime.now()).difference(punchInAt);

  static StaffAttendanceDay fromJson(Map json) => StaffAttendanceDay(
    id: json['id'] as String,
    workDate: '${json['work_date']}',
    punchInAt: DateTime.parse(json['punch_in_at'] as String).toLocal(),
    punchOutAt: json['punch_out_at'] == null ? null : DateTime.parse(json['punch_out_at'] as String).toLocal(),
  );
}
