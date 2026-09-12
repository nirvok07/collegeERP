import '../error/result.dart';
import '../network/api_client.dart';

/// What the signed-in person may do, as the server resolves it.
///
/// Read from `/v1/auth/me` rather than inferred from a role name held on the
/// device, because authority is role × scope × validity and only the server can
/// resolve it. The app uses it to decide which surfaces exist, and the server
/// checks every request again regardless.
class Authority {
  const Authority({required this.permissions, required this.hasAccess});

  static const none = Authority(permissions: <String>{}, hasAccess: false);

  final Set<String> permissions;

  /// False on a genuinely new account that nobody has granted anything yet,
  /// which is a designed state rather than an error.
  final bool hasAccess;

  bool can(String permission) => permissions.contains(permission);

  static Authority fromJson(dynamic json) {
    final map = json as Map;
    return Authority(
      permissions: ((map['permissions'] as List?) ?? const []).map((e) => '$e').toSet(),
      hasAccess: map['has_access'] as bool? ?? false,
    );
  }
}

class AuthorityApi {
  const AuthorityApi(this._client);
  final ApiClient _client;

  Future<Result<Authority>> mine() => _client.get('/v1/auth/me', Authority.fromJson);
}
