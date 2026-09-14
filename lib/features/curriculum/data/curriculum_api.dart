import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../academic/domain/academic.dart';
import '../domain/curriculum.dart';

/// ADM-4 (AD-81): the endpoints the web console uses for courses and
/// curriculum versions. One contract, one set of rules; this only shapes it.
abstract interface class CurriculumRepository {
  Future<Result<List<Program>>> programs();
  Future<Result<List<Course>>> courses();
  Future<Result<void>> createCourse({required String code, required String title, String? description});
  Future<Result<void>> retitleCourse(String id, {required String title, String? description});
  Future<Result<List<CurriculumVersion>>> versions(String programId);
  Future<Result<VersionDetail>> version(String id);
  Future<Result<String>> createDraft({required String programId, required int regulationYear, required int totalTerms, String? title});
  Future<Result<void>> addEntry(
    String versionId, {
    required String courseId,
    required int termNumber,
    required num credits,
    required String requirement,
    String? electiveGroup,
  });
  Future<Result<void>> removeEntry(String versionId, String entryId);
  Future<Result<void>> publish(String id);
  Future<Result<String>> successor(String id, {required String kind, required String reason, int? regulationYear});
}

class CurriculumApi implements CurriculumRepository {
  const CurriculumApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}
  static String _id(dynamic data) => (data as Map)['id'] as String;
  static String _enc(String s) => Uri.encodeComponent(s);

  @override
  Future<Result<List<Program>>> programs() =>
      _client.get('/v1/programs', (data) => (data as List).map(Program.fromJson).toList());

  @override
  Future<Result<List<Course>>> courses() =>
      _client.get('/v1/courses', (data) => (data as List).map(Course.fromJson).toList());

  @override
  Future<Result<void>> createCourse({required String code, required String title, String? description}) => _client.post(
    '/v1/courses',
    {'code': code, 'title': title, if (description != null && description.isNotEmpty) 'description': description},
    _ignore,
  );

  @override
  Future<Result<void>> retitleCourse(String id, {required String title, String? description}) => _client.patch(
    '/v1/courses/${_enc(id)}',
    {'title': title, if (description != null && description.isNotEmpty) 'description': description},
    _ignore,
  );

  @override
  Future<Result<List<CurriculumVersion>>> versions(String programId) => _client.get(
    '/v1/curriculum-versions?program_id=${_enc(programId)}',
    (data) => (data as List).map(CurriculumVersion.fromJson).toList(),
  );

  @override
  Future<Result<VersionDetail>> version(String id) =>
      _client.get('/v1/curriculum-versions/${_enc(id)}', VersionDetail.fromJson);

  @override
  Future<Result<String>> createDraft({
    required String programId,
    required int regulationYear,
    required int totalTerms,
    String? title,
  }) => _client.post(
    '/v1/curriculum-versions',
    {
      'program_id': programId,
      'regulation_year': regulationYear,
      'total_terms': totalTerms,
      if (title != null && title.isNotEmpty) 'title': title,
    },
    _id,
  );

  @override
  Future<Result<void>> addEntry(
    String versionId, {
    required String courseId,
    required int termNumber,
    required num credits,
    required String requirement,
    String? electiveGroup,
  }) => _client.post(
    '/v1/curriculum-versions/${_enc(versionId)}/entries',
    {
      'course_id': courseId,
      'term_number': termNumber,
      'credits': credits,
      'requirement': requirement,
      if (electiveGroup != null && electiveGroup.isNotEmpty) 'elective_group': electiveGroup,
    },
    _ignore,
  );

  @override
  Future<Result<void>> removeEntry(String versionId, String entryId) =>
      _client.delete('/v1/curriculum-versions/${_enc(versionId)}/entries/${_enc(entryId)}', _ignore);

  @override
  Future<Result<void>> publish(String id) =>
      _client.post('/v1/curriculum-versions/${_enc(id)}/publish', const <String, Object?>{}, _ignore);

  @override
  Future<Result<String>> successor(String id, {required String kind, required String reason, int? regulationYear}) =>
      _client.post(
        '/v1/curriculum-versions/${_enc(id)}/successor',
        {'kind': kind, 'reason': reason, 'regulation_year': ?regulationYear},
        _id,
      );
}
