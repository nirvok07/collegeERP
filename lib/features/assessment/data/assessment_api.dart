import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/assessment.dart';
import '../domain/assessment_repository.dart';

class AssessmentApi implements AssessmentRepository {
  const AssessmentApi(this._client);
  final ApiClient _client;

  static int _version(dynamic data) => ((data as Map)['version'] as num).toInt();

  @override
  Future<Result<List<AssessmentComponent>>> myComponents() => _client.get(
    '/v1/me/assessments',
    (data) => (data as List).map((e) => AssessmentComponent.fromJson(e as Map)).toList(),
  );

  @override
  Future<Result<AssessmentSheet>> readSheet(String componentId) =>
      _client.get('/v1/assessments/$componentId/sheet', AssessmentSheet.fromJson);

  @override
  Future<Result<int>> recordHeldOn({
    required String componentId,
    required int version,
    required String heldOn,
    required String idempotencyKey,
  }) => _client.post(
    '/v1/assessments/$componentId/held-on',
    {'version': version, 'held_on': heldOn},
    _version,
    idempotencyKey: idempotencyKey,
  );

  @override
  Future<Result<int>> saveMarks({
    required String componentId,
    required int version,
    required List<Map<String, Object?>> marks,
    required String idempotencyKey,
  }) => _client.put(
    '/v1/assessments/$componentId/marks',
    {'version': version, 'marks': marks},
    _version,
    idempotencyKey: idempotencyKey,
  );

  @override
  Future<Result<void>> submit({
    required String componentId,
    required int version,
    required String idempotencyKey,
  }) => _client.post(
    '/v1/assessments/$componentId/submit',
    {'version': version},
    (_) {},
    idempotencyKey: idempotencyKey,
  );
}
