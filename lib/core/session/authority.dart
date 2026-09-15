import '../error/result.dart';
import '../network/api_client.dart';

/// One role the person holds, and at what level, as the server resolved it.
class RoleGrant {
  const RoleGrant({required this.roleKey, required this.scopeType});

  final String roleKey;
  final String scopeType;

  String get label => switch (roleKey) {
    'college_admin' => 'College Administrator',
    'department_head' => 'Head of Department',
    'faculty' => 'Faculty',
    _ => roleKey.replaceAll('_', ' '),
  };

  String get scopeLabel => switch (scopeType) {
    'institution' => 'Whole college',
    'campus' => 'Campus',
    'department' => 'Department',
    'program' => 'Program',
    'section' => 'Section',
    _ => scopeType,
  };
}

/// ST-1: the signed-in person is a student. Their own screens follow from
/// this, self-scoped, not from a role.
class StudentInfo {
  const StudentInfo({
    required this.id,
    required this.enrolmentNumber,
    required this.programName,
    required this.status,
    this.sectionLabel,
    this.sectionTermNumber,
  });

  final String id;
  final String enrolmentNumber;
  final String programName;
  final String status;
  final String? sectionLabel;
  final int? sectionTermNumber;

  String get placement =>
      sectionLabel == null ? programName : '$programName · term $sectionTermNumber · section $sectionLabel';

  static StudentInfo? fromJson(Object? json) {
    if (json is! Map) return null;
    return StudentInfo(
      id: json['id'] as String,
      enrolmentNumber: json['enrolment_number'] as String? ?? '',
      programName: json['program_name'] as String? ?? '',
      status: json['status'] as String? ?? 'enrolled',
      sectionLabel: json['section_label'] as String?,
      sectionTermNumber: (json['section_term_number'] as num?)?.toInt(),
    );
  }
}

/// What the signed-in person may do, as the server resolves it.
///
/// Read from `/v1/auth/me` rather than inferred from a role name held on the
/// device, because authority is role × scope × validity and only the server can
/// resolve it. The app uses it to decide which surfaces exist, and the server
/// checks every request again regardless. It also carries who the person is,
/// which only the Profile shows (UX-2).
class Authority {
  const Authority({
    required this.permissions,
    required this.hasAccess,
    this.fullName,
    this.loginIdentifier,
    this.roles = const [],
    this.student,
  });

  /// Present only when the signed-in person is a student (ST-1).
  final StudentInfo? student;

  static const none = Authority(permissions: <String>{}, hasAccess: false);

  final Set<String> permissions;

  /// False on a genuinely new account that nobody has granted anything yet,
  /// which is a designed state rather than an error.
  final bool hasAccess;

  final String? fullName;

  /// The email (or, for a student, the enrolment number) they sign in with.
  final String? loginIdentifier;
  final List<RoleGrant> roles;

  bool can(String permission) => permissions.contains(permission);

  static Authority fromJson(dynamic json) {
    final map = json as Map;
    return Authority(
      permissions: ((map['permissions'] as List?) ?? const []).map((e) => '$e').toSet(),
      hasAccess: map['has_access'] as bool? ?? false,
      fullName: map['full_name'] as String?,
      loginIdentifier: map['login_identifier'] as String?,
      student: StudentInfo.fromJson(map['student']),
      roles: ((map['assignments'] as List?) ?? const [])
          .map((a) => RoleGrant(roleKey: '${(a as Map)['role_key']}', scopeType: '${a['scope_type']}'))
          .toList(),
    );
  }
}

class AuthorityApi {
  const AuthorityApi(this._client);
  final ApiClient _client;

  Future<Result<Authority>> mine() => _client.get('/v1/auth/me', Authority.fromJson);

  /// CR-1b: when [mine] was last saved.
  Future<DateTime?> mineSavedAt() => _client.savedAt('/v1/auth/me');
}
