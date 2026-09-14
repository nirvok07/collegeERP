import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../academic/domain/academic.dart';
import '../../sections/domain/section.dart';
import '../domain/student.dart';

/// Filters on the student list, all applied by the server.
class StudentFilter {
  const StudentFilter({this.search = '', this.programId, this.status = 'enrolled', this.unplacedOnly = false});

  final String search;
  final String? programId;

  /// Null shows every status.
  final String? status;
  final bool unplacedOnly;

  StudentFilter copyWith({String? search, String? programId, bool anyProgram = false, String? status, bool anyStatus = false, bool? unplacedOnly}) =>
      StudentFilter(
        search: search ?? this.search,
        programId: anyProgram ? null : (programId ?? this.programId),
        status: anyStatus ? null : (status ?? this.status),
        unplacedOnly: unplacedOnly ?? this.unplacedOnly,
      );

  String get query => [
        'limit=200',
        if (search.trim().isNotEmpty) 'q=${Uri.encodeQueryComponent(search.trim())}',
        if (programId != null) 'program_id=${Uri.encodeQueryComponent(programId!)}',
        if (status != null) 'status=$status',
        if (unplacedOnly) 'unplaced=true',
      ].join('&');
}

/// ADM-9 (AD-81): the endpoints the web console uses for students.
abstract interface class StudentsRepository {
  Future<Result<List<Student>>> students(StudentFilter filter);
  Future<Result<Student>> student(String id);
  Future<Result<List<Placement>>> placements(String id);
  Future<Result<void>> setStatus(String id, String status, {String? reason});
  Future<Result<List<Program>>> programs();

  /// For naming the sections in a student's history.
  Future<Result<List<Section>>> sections();
}

class StudentsApi implements StudentsRepository {
  const StudentsApi(this._client);
  final ApiClient _client;

  static String _enc(String s) => Uri.encodeComponent(s);

  @override
  Future<Result<List<Student>>> students(StudentFilter filter) =>
      _client.get('/v1/students?${filter.query}', (data) => (data as List).map(Student.fromJson).toList());

  @override
  Future<Result<Student>> student(String id) => _client.get('/v1/students/${_enc(id)}', Student.fromJson);

  @override
  Future<Result<List<Placement>>> placements(String id) =>
      _client.get('/v1/students/${_enc(id)}/placements', (data) => (data as List).map(Placement.fromJson).toList());

  @override
  Future<Result<void>> setStatus(String id, String status, {String? reason}) =>
      _client.patch('/v1/students/${_enc(id)}/status', {'status': status, 'reason': ?reason}, (_) {});

  @override
  Future<Result<List<Program>>> programs() =>
      _client.get('/v1/programs', (data) => (data as List).map(Program.fromJson).toList());

  @override
  Future<Result<List<Section>>> sections() =>
      _client.get('/v1/sections', (data) => (data as List).map(Section.fromJson).toList());
}
