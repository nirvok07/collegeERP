import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../organisation/domain/org_unit.dart';

/// A role as the grant form offers it, with the server's one-sentence summary.
class RoleOption {
  const RoleOption({required this.key, required this.name, required this.allowedScopeTypes, required this.summary});

  final String key;
  final String name;
  final List<String> allowedScopeTypes;
  final String summary;

  bool get collegeWide => allowedScopeTypes.contains('institution');
  bool get departmentScoped => !collegeWide && allowedScopeTypes.contains('department');

  static RoleOption fromJson(dynamic json) {
    final m = json as Map;
    return RoleOption(
      key: m['key'] as String,
      name: m['name'] as String,
      allowedScopeTypes: ((m['allowed_scope_types'] as List?) ?? const []).map((e) => '$e').toList(),
      summary: m['summary'] as String? ?? '',
    );
  }
}

/// One live grant of a role at a scope.
class Grant {
  const Grant({
    required this.id,
    required this.personId,
    required this.roleKey,
    required this.roleName,
    required this.scopeType,
    this.scopeRefId,
    this.validTo,
    this.source = 'manual',
  });

  final String id;
  final String personId;
  final String roleKey;
  final String roleName;
  final String scopeType;
  final String? scopeRefId;
  final String? validTo;
  final String source;

  static Grant fromJson(dynamic json) {
    final m = json as Map;
    return Grant(
      id: m['id'] as String,
      personId: m['person_id'] as String,
      roleKey: m['role_key'] as String,
      roleName: m['role_name'] as String? ?? m['role_key'] as String,
      scopeType: m['scope_type'] as String? ?? 'institution',
      scopeRefId: m['scope_ref_id'] as String?,
      validTo: m['valid_to'] == null ? null : '${m['valid_to']}',
      source: m['source'] as String? ?? 'manual',
    );
  }
}

/// ADM-10 (AD-81): granting and removing access, on the endpoints the web uses.
abstract interface class AccessRepository {
  Future<Result<List<Grant>>> grants();
  Future<Result<List<RoleOption>>> roles();
  Future<Result<List<Department>>> departments();
  Future<Result<void>> grant({
    required String personId,
    required String roleKey,
    required String scopeType,
    String? scopeRefId,
    String? reason,
  });
  Future<Result<void>> revoke(String grantId, String reason);
}

class AccessApi implements AccessRepository {
  const AccessApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<List<Grant>>> grants() => _client.get('/v1/assignments', (data) => (data as List).map(Grant.fromJson).toList());

  @override
  Future<Result<List<RoleOption>>> roles() => _client.get('/v1/roles', (data) => (data as List).map(RoleOption.fromJson).toList());

  @override
  Future<Result<List<Department>>> departments() =>
      _client.get('/v1/departments', (data) => (data as List).map((j) => Department.fromJson(j as Map)).toList());

  @override
  Future<Result<void>> grant({
    required String personId,
    required String roleKey,
    required String scopeType,
    String? scopeRefId,
    String? reason,
  }) => _client.post(
    '/v1/assignments',
    {
      'person_id': personId,
      'role_key': roleKey,
      'scope_type': scopeType,
      'scope_ref_id': scopeRefId,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    },
    (_) {},
  );

  @override
  Future<Result<void>> revoke(String grantId, String reason) =>
      _client.post('/v1/assignments/${Uri.encodeComponent(grantId)}/revoke', {'reason': reason}, (_) {});
}
