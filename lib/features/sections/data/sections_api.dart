import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../academic/domain/academic.dart';
import '../domain/section.dart';

/// ADM-6 (AD-81): the endpoints the web console uses for sections and their
/// members. One contract, one set of rules; this only shapes it.
abstract interface class SectionsRepository {
  Future<Result<List<Section>>> sections();
  Future<Result<Section>> section(String id);
  Future<Result<List<Program>>> programs();
  Future<Result<List<Term>>> terms();
  Future<Result<void>> createSection({
    required String programId,
    required String termId,
    required int termNumber,
    required String label,
    int? capacity,
  });
  Future<Result<void>> transition(String id, String to, {String? reason});
  Future<Result<void>> setCapacity(String id, int? capacity);
  Future<Result<List<Member>>> members(String sectionId);

  /// Students of [programId] in no section yet, the ones a section can take.
  Future<Result<List<Member>>> unplaced(String programId, {String? search});
  Future<Result<void>> place(String sectionId, String studentId);
  Future<Result<void>> endPlacement(String sectionId, String studentId, String reason);
}

class SectionsApi implements SectionsRepository {
  const SectionsApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}
  static String _enc(String s) => Uri.encodeComponent(s);
  static List<Member> _members(dynamic data) => (data as List).map(Member.fromJson).toList();

  @override
  Future<Result<List<Section>>> sections() =>
      _client.get('/v1/sections', (data) => (data as List).map(Section.fromJson).toList());

  @override
  Future<Result<Section>> section(String id) => _client.get('/v1/sections/${_enc(id)}', Section.fromJson);

  @override
  Future<Result<List<Program>>> programs() =>
      _client.get('/v1/programs', (data) => (data as List).map(Program.fromJson).toList());

  @override
  Future<Result<List<Term>>> terms() => _client.get('/v1/terms', (data) => (data as List).map(Term.fromJson).toList());

  @override
  Future<Result<void>> createSection({
    required String programId,
    required String termId,
    required int termNumber,
    required String label,
    int? capacity,
  }) => _client.post(
    '/v1/sections',
    {'program_id': programId, 'term_id': termId, 'term_number': termNumber, 'label': label, 'capacity': capacity},
    _ignore,
  );

  @override
  Future<Result<void>> transition(String id, String to, {String? reason}) =>
      _client.post('/v1/sections/${_enc(id)}/status', {'status': to, 'reason': ?reason}, _ignore);

  @override
  Future<Result<void>> setCapacity(String id, int? capacity) =>
      _client.patch('/v1/sections/${_enc(id)}/capacity', {'capacity': capacity}, _ignore);

  @override
  Future<Result<List<Member>>> members(String sectionId) =>
      _client.get('/v1/students?section_id=${_enc(sectionId)}', _members);

  @override
  Future<Result<List<Member>>> unplaced(String programId, {String? search}) {
    final q = (search == null || search.trim().isEmpty) ? '' : '&q=${Uri.encodeQueryComponent(search.trim())}';
    return _client.get('/v1/students?program_id=${_enc(programId)}&unplaced=true&status=enrolled$q', _members);
  }

  @override
  Future<Result<void>> place(String sectionId, String studentId) =>
      _client.post('/v1/sections/${_enc(sectionId)}/members', {'student_id': studentId}, _ignore);

  @override
  Future<Result<void>> endPlacement(String sectionId, String studentId, String reason) => _client.post(
    '/v1/sections/${_enc(sectionId)}/members/${_enc(studentId)}/end',
    {'reason': reason},
    _ignore,
  );
}
