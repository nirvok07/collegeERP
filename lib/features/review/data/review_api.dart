import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../assessment/domain/assessment.dart';
import '../../attendance/domain/attendance_sheet.dart';

/// One class's register at a glance, from the college-wide overview.
class RegisterSummary {
  const RegisterSummary({
    required this.sessionId,
    required this.date,
    required this.startsAt,
    required this.courseCode,
    required this.sectionLabel,
    required this.status,
    required this.marked,
    required this.present,
    required this.absent,
    this.programName = '',
    this.teacherName,
    this.sessionStatus = 'scheduled',
  });

  final String sessionId;
  final String date;
  final String startsAt;
  final String courseCode;
  final String sectionLabel;
  final String programName;
  final String? teacherName;
  final String sessionStatus;

  /// The register's own state: `draft` or `submitted`.
  final String status;
  final int marked;
  final int present;
  final int absent;

  bool get isSubmitted => status == 'submitted';

  static RegisterSummary fromJson(dynamic json) {
    final m = json as Map;
    final course = (m['course'] as Map?) ?? const {};
    final section = (m['section'] as Map?) ?? const {};
    final counts = (m['counts'] as Map?) ?? const {};
    final teacher = m['teacher'] as Map?;
    return RegisterSummary(
      sessionId: m['session_id'] as String,
      date: '${m['date']}',
      startsAt: '${m['starts_at']}',
      courseCode: course['code'] as String? ?? '',
      sectionLabel: section['label'] as String? ?? '',
      programName: m['program_name'] as String? ?? '',
      teacherName: teacher?['full_name'] as String?,
      sessionStatus: m['session_status'] as String? ?? 'scheduled',
      status: m['status'] as String? ?? 'draft',
      marked: (m['marked'] as num?)?.toInt() ?? 0,
      present: (counts['present'] as num?)?.toInt() ?? 0,
      absent: (counts['absent'] as num?)?.toInt() ?? 0,
    );
  }
}

/// A register read for review: the teacher's sheet plus whether this person
/// may correct it, which the server states.
class ReviewRegister {
  const ReviewRegister({required this.sheet, required this.canCorrect, this.corrections = 0});

  final AttendanceSheet sheet;
  final bool canCorrect;
  final int corrections;

  static ReviewRegister fromJson(dynamic json) {
    final m = json as Map;
    return ReviewRegister(
      sheet: AttendanceSheet.fromJson(m),
      canCorrect: m['can_correct'] as bool? ?? false,
      corrections: ((m['corrections'] as List?) ?? const []).length,
    );
  }
}

/// A mark sheet read for review, with each mark's id for correcting it.
class ReviewSheet {
  const ReviewSheet({
    required this.sheet,
    required this.canVerify,
    required this.canCorrect,
    required this.markIds,
    this.corrections = 0,
  });

  final AssessmentSheet sheet;
  final bool canVerify;
  final bool canCorrect;

  /// Student id to the id of their mark, for students who have one.
  final Map<String, String> markIds;
  final int corrections;

  static ReviewSheet fromJson(dynamic json) {
    final m = json as Map;
    return ReviewSheet(
      sheet: AssessmentSheet.fromJson(m),
      canVerify: m['can_verify'] as bool? ?? false,
      canCorrect: m['can_correct'] as bool? ?? false,
      markIds: {
        for (final s in (m['students'] as List?) ?? const [])
          if ((s as Map)['mark_id'] != null) s['student_id'] as String: s['mark_id'] as String,
      },
      corrections: ((m['corrections'] as List?) ?? const []).length,
    );
  }
}

/// ADM-11 (AD-81): reviewing what teachers recorded, on the endpoints the web
/// uses. Kept apart from the teacher's repositories, whose writes are queued
/// offline (AD-59): these are online-only, administrative actions.
abstract interface class ReviewRepository {
  Future<Result<List<RegisterSummary>>> registers(String date);
  Future<Result<ReviewRegister>> register(String sessionId);
  Future<Result<void>> correctAttendance(String recordId, String state, String reason);
  Future<Result<List<AssessmentComponent>>> queue(String status);
  Future<Result<ReviewSheet>> sheet(String componentId);
  Future<Result<void>> verify(String componentId, int version);
  Future<Result<void>> correctMark(String markId, {required String status, double? score, required String reason});
}

class ReviewApi implements ReviewRepository {
  const ReviewApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}
  static String _enc(String s) => Uri.encodeComponent(s);

  @override
  Future<Result<List<RegisterSummary>>> registers(String date) =>
      _client.get('/v1/attendance?from=$date&to=$date', (data) => (data as List).map(RegisterSummary.fromJson).toList());

  @override
  Future<Result<ReviewRegister>> register(String sessionId) =>
      _client.get('/v1/sessions/${_enc(sessionId)}/attendance', ReviewRegister.fromJson);

  @override
  Future<Result<void>> correctAttendance(String recordId, String state, String reason) =>
      _client.post('/v1/attendance-records/${_enc(recordId)}/correct', {'state': state, 'reason': reason}, _ignore);

  @override
  Future<Result<List<AssessmentComponent>>> queue(String status) => _client.get(
    '/v1/assessments?status=$status',
    (data) => (data as List).map((j) => AssessmentComponent.fromJson(j as Map)).toList(),
  );

  @override
  Future<Result<ReviewSheet>> sheet(String componentId) =>
      _client.get('/v1/assessments/${_enc(componentId)}/sheet', ReviewSheet.fromJson);

  @override
  Future<Result<void>> verify(String componentId, int version) =>
      _client.post('/v1/assessments/${_enc(componentId)}/verify', {'version': version}, _ignore);

  @override
  Future<Result<void>> correctMark(String markId, {required String status, double? score, required String reason}) =>
      _client.post('/v1/assessment-marks/${_enc(markId)}/correct', {'status': status, 'score': score, 'reason': reason}, _ignore);
}
