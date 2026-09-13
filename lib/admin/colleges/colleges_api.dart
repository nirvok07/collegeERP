import '../../core/error/result.dart';
import '../../core/network/api_client.dart';
import 'college_models.dart';

/// What the super admin app needs about colleges, stated as a port so the
/// screens are testable without a server.
abstract interface class CollegesRepository {
  Future<Result<List<CollegeSummary>>> list();
  Future<Result<CollegeDetail>> detail(String id);

  /// W0 (AD-20): the college and its first administrator, in one request.
  Future<Result<ProvisionedCollege>> provision(ProvisionInput input);
}

class CollegesApi implements CollegesRepository {
  CollegesApi(this._client);

  final ApiClient _client;

  @override
  Future<Result<List<CollegeSummary>>> list() =>
      _client.get('/v1/institutions', (data) => (data as List).map(CollegeSummary.fromJson).toList());

  @override
  Future<Result<CollegeDetail>> detail(String id) =>
      _client.get('/v1/institutions/${Uri.encodeComponent(id)}', CollegeDetail.fromJson);

  @override
  Future<Result<ProvisionedCollege>> provision(ProvisionInput input) =>
      _client.post('/v1/institutions', input.toJson(), ProvisionedCollege.fromJson);
}
