import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../organisation/domain/org_unit.dart';
import '../domain/academic.dart';

/// ADM-3 (AD-81): the endpoints the web console uses for programs and the
/// academic calendar. One contract, one set of rules; this only shapes it.
abstract interface class AcademicRepository {
  Future<Result<List<Program>>> programs();
  Future<Result<List<Department>>> departments();
  Future<Result<void>> createProgram(ProgramInput input);
  Future<Result<void>> archiveProgram(String id, String reason);
  Future<Result<List<AcademicYear>>> years();
  Future<Result<List<Term>>> terms();
  Future<Result<void>> createYear({required String name, required DateTime startsOn, required DateTime endsOn, required bool makeCurrent});
  Future<Result<void>> createTerm({
    required String yearId,
    required int sequence,
    required String name,
    required DateTime startsOn,
    required DateTime endsOn,
  });

  // FB-2: correcting and removing. Removal is archival on the server.
  Future<Result<void>> renameProgram(String id, {required String name, String? award});
  Future<Result<void>> updateYear(
    String id, {
    required String name,
    required DateTime startsOn,
    required DateTime endsOn,
    required bool makeCurrent,
  });
  Future<Result<void>> archiveYear(String id, String reason);
  Future<Result<void>> updateTerm(String id, {required String name, required DateTime startsOn, required DateTime endsOn});
  Future<Result<void>> archiveTerm(String id, String reason);
}

class AcademicApi implements AcademicRepository {
  const AcademicApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}

  @override
  Future<Result<List<Program>>> programs() =>
      _client.get('/v1/programs', (data) => (data as List).map(Program.fromJson).toList());

  @override
  Future<Result<List<Department>>> departments() =>
      _client.get('/v1/departments', (data) => (data as List).map((j) => Department.fromJson(j as Map)).toList());

  @override
  Future<Result<void>> createProgram(ProgramInput input) => _client.post('/v1/programs', input.toJson(), _ignore);

  @override
  Future<Result<void>> archiveProgram(String id, String reason) =>
      _client.post('/v1/programs/${Uri.encodeComponent(id)}/archive', {'reason': reason}, _ignore);

  @override
  Future<Result<List<AcademicYear>>> years() =>
      _client.get('/v1/academic-years', (data) => (data as List).map(AcademicYear.fromJson).toList());

  @override
  Future<Result<List<Term>>> terms() => _client.get('/v1/terms', (data) => (data as List).map(Term.fromJson).toList());

  @override
  Future<Result<void>> createYear({
    required String name,
    required DateTime startsOn,
    required DateTime endsOn,
    required bool makeCurrent,
  }) => _client.post(
    '/v1/academic-years',
    {'name': name, 'starts_on': isoDate(startsOn), 'ends_on': isoDate(endsOn), 'make_current': makeCurrent},
    _ignore,
  );

  @override
  Future<Result<void>> createTerm({
    required String yearId,
    required int sequence,
    required String name,
    required DateTime startsOn,
    required DateTime endsOn,
  }) => _client.post(
    '/v1/terms',
    {
      'academic_year_id': yearId,
      'sequence': sequence,
      'name': name,
      'starts_on': isoDate(startsOn),
      'ends_on': isoDate(endsOn),
    },
    _ignore,
  );

  @override
  Future<Result<void>> renameProgram(String id, {required String name, String? award}) =>
      _client.patch('/v1/programs/${Uri.encodeComponent(id)}', {'name': name, 'award': award}, _ignore);

  @override
  Future<Result<void>> updateYear(
    String id, {
    required String name,
    required DateTime startsOn,
    required DateTime endsOn,
    required bool makeCurrent,
  }) => _client.patch(
    '/v1/academic-years/${Uri.encodeComponent(id)}',
    {'name': name, 'starts_on': isoDate(startsOn), 'ends_on': isoDate(endsOn), if (makeCurrent) 'make_current': true},
    _ignore,
  );

  @override
  Future<Result<void>> archiveYear(String id, String reason) =>
      _client.post('/v1/academic-years/${Uri.encodeComponent(id)}/archive', {'reason': reason}, _ignore);

  @override
  Future<Result<void>> updateTerm(String id, {required String name, required DateTime startsOn, required DateTime endsOn}) =>
      _client.patch(
        '/v1/terms/${Uri.encodeComponent(id)}',
        {'name': name, 'starts_on': isoDate(startsOn), 'ends_on': isoDate(endsOn)},
        _ignore,
      );

  @override
  Future<Result<void>> archiveTerm(String id, String reason) =>
      _client.post('/v1/terms/${Uri.encodeComponent(id)}/archive', {'reason': reason}, _ignore);
}
