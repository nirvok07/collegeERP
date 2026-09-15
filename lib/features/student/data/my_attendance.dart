import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';

/// ST-1: one course's attendance, or the total, from submitted registers.
/// Present and late count as attended; excused absences are left out.
class AttendanceTally {
  const AttendanceTally({
    required this.present,
    required this.late,
    required this.absent,
    required this.excused,
    required this.total,
    this.percent,
    this.courseCode = '',
    this.courseTitle = '',
    this.component = 'lecture',
  });

  final int present;
  final int late;
  final int absent;
  final int excused;
  final int total;

  /// Null until there is something to count.
  final double? percent;
  final String courseCode;
  final String courseTitle;
  final String component;

  /// The usual college rule: below this, a student may not sit the examination.
  static const threshold = 75.0;

  bool get isShort => percent != null && percent! < threshold;

  /// Classes attended of those counted.
  String get summary => '${present + late} of ${total - excused} classes';

  static AttendanceTally fromJson(dynamic json) {
    final m = json as Map;
    final course = (m['course'] as Map?) ?? const {};
    int n(String k) => (m[k] as num?)?.toInt() ?? 0;
    return AttendanceTally(
      present: n('present'),
      late: n('late'),
      absent: n('absent'),
      excused: n('excused'),
      total: n('total'),
      percent: (m['percent'] as num?)?.toDouble(),
      courseCode: course['code'] as String? ?? '',
      courseTitle: course['title'] as String? ?? '',
      component: m['component'] as String? ?? 'lecture',
    );
  }
}

class MyAttendance {
  const MyAttendance({required this.overall, required this.courses});

  final AttendanceTally overall;
  final List<AttendanceTally> courses;

  static MyAttendance fromJson(dynamic json) {
    final m = json as Map;
    return MyAttendance(
      overall: AttendanceTally.fromJson(m['overall']),
      courses: ((m['courses'] as List?) ?? const []).map(AttendanceTally.fromJson).toList(),
    );
  }
}

/// The student's own reads. The server derives who from the token; nothing
/// here names a student.
abstract interface class StudentSelfRepository {
  Future<Result<MyAttendance>> myAttendance();

  /// CR-1b: when [myAttendance] was last saved.
  Future<DateTime?> myAttendanceSavedAt();
}

class StudentSelfApi implements StudentSelfRepository {
  const StudentSelfApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<MyAttendance>> myAttendance() => _client.get('/v1/me/attendance', MyAttendance.fromJson);

  @override
  Future<DateTime?> myAttendanceSavedAt() => _client.savedAt('/v1/me/attendance');
}

class StudentHomeState {
  const StudentHomeState({this.status = LoadStatus.loading, this.attendance, this.failure, this.updatedAt});

  final LoadStatus status;
  final MyAttendance? attendance;
  final Failure? failure;

  /// CR-1b (OD-CR-1): when this was last saved.
  final DateTime? updatedAt;
}

class StudentHomeCubit extends Cubit<StudentHomeState> {
  StudentHomeCubit(this._repository) : super(const StudentHomeState());

  final StudentSelfRepository _repository;

  /// CR-1 (AD-9 amended again): opens on what was saved; the network is asked
  /// only when nothing was saved, or on an explicit refresh.
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    final result = await _repository.myAttendance();
    if (isClosed) return;
    await result.when(
      ok: (a) async {
        final updatedAt = await _repository.myAttendanceSavedAt();
        if (isClosed) return;
        emit(StudentHomeState(status: LoadStatus.success, attendance: a, updatedAt: updatedAt));
      },
      err: (f) async => emit(StudentHomeState(
        status: state.attendance == null ? LoadStatus.failure : LoadStatus.success,
        attendance: state.attendance,
        failure: f,
        updatedAt: state.updatedAt,
      )),
    );
  }
}
