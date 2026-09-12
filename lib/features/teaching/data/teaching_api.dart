import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/teaching_offering.dart';
import '../domain/teaching_repository.dart';

/// The teacher's own teaching, and nothing else.
///
/// There is no section-list call here on purpose: a college-wide list is an
/// administrator's screen and belongs to the web console.
class TeachingApi implements TeachingRepository {
  const TeachingApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<List<TeachingOffering>>> myTeaching() => _client.get(
    '/v1/me/teaching',
    (data) => (data as List).map((json) => TeachingOffering.fromJson(json as Map)).toList(),
  );
}
