import '../../core/error/result.dart';
import '../../core/network/api_client.dart';
import '../../features/people/domain/reset_code.dart';
import 'college_models.dart';

/// What the super admin app needs about colleges, stated as a port so the
/// screens are testable without a server.
abstract interface class CollegesRepository {
  Future<Result<List<CollegeSummary>>> list();
  Future<Result<CollegeDetail>> detail(String id);

  /// W0 (AD-20): the college and its first administrator, in one request.
  Future<Result<ProvisionedCollege>> provision(ProvisionInput input);

  /// SA-1: suspend, reactivate or close, pinned to [version], with a reason.
  Future<Result<CollegeDetail>> changeLifecycle(
    String id, {
    required String action,
    required int version,
    required String reason,
    String? confirmCode,
  });

  /// A new invitation for the administrator; the previous one stops working.
  Future<Result<ProvisionedCollege>> reissueInvitation(String id);

  /// AD-80: a one-time reset code for one of the college's administrators,
  /// named by their sign-in email.
  Future<Result<ResetCode>> resetAdministrator(String id, String email);
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

  @override
  Future<Result<CollegeDetail>> changeLifecycle(
    String id, {
    required String action,
    required int version,
    required String reason,
    String? confirmCode,
  }) => _client.post(
    '/v1/institutions/${Uri.encodeComponent(id)}/$action',
    {'version': version, 'reason': reason, 'confirm_code': ?confirmCode},
    CollegeDetail.fromJson,
  );

  // The response carries the college's detail and the new invitation, which
  // is exactly the shape of a provisioning result.
  @override
  Future<Result<ProvisionedCollege>> reissueInvitation(String id) => _client.post(
    '/v1/institutions/${Uri.encodeComponent(id)}/administrator-invitation',
    const <String, Object?>{},
    ProvisionedCollege.fromJson,
  );

  @override
  Future<Result<ResetCode>> resetAdministrator(String id, String email) => _client.post(
    '/v1/institutions/${Uri.encodeComponent(id)}/administrator-reset',
    {'email': email},
    ResetCode.fromJson,
  );
}
