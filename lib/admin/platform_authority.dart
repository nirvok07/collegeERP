/// What the signed-in platform account may do, as the server states it
/// (`GET /v1/auth/me`, AD-64). Never a role name kept on the phone.
class PlatformAuthority {
  const PlatformAuthority({required this.role, required this.permissions});

  final String role;
  final Set<String> permissions;

  bool can(String permission) => permissions.contains(permission);

  String get roleLabel => switch (role) {
    'owner' => 'Owner',
    'support' => 'Support',
    _ => role,
  };

  /// Null when the session is not a platform one: a college account never
  /// opens this app, whatever token it holds.
  static PlatformAuthority? fromJson(dynamic json) {
    final map = json as Map;
    if (map['actor_type'] != 'platform') return null;
    return PlatformAuthority(
      role: map['platform_role'] as String? ?? '',
      permissions: ((map['permissions'] as List?) ?? const []).map((e) => '$e').toSet(),
    );
  }
}
