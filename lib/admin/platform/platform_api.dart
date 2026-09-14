import '../../core/error/result.dart';
import '../../core/network/api_client.dart';

/// SAM-3 (AD-72, AD-81): a platform account as the Super Admin app needs it.
class PlatformAccount {
  const PlatformAccount({
    required this.id,
    required this.email,
    required this.fullName,
    required this.status,
    required this.role,
    required this.mfaEnrolled,
    this.lastLoginAt,
    this.isYou = false,
    this.actions = const [],
    this.roleHistory = const [],
  });

  final String id;
  final String email;
  final String fullName;

  /// `invited`, `active`, `suspended` (disabled) or `deactivated`.
  final String status;

  /// `owner`, `support`, or null for none.
  final String? role;
  final bool mfaEnrolled;
  final DateTime? lastLoginAt;
  final bool isYou;

  /// What may be done to this account now, stated by the server: `disable`,
  /// `enable`, `change_role`, `reset_mfa`, `reissue_invitation`.
  final List<String> actions;
  final List<({String role, DateTime grantedAt, DateTime? endedAt, String? reason})> roleHistory;

  static String roleLabel(String? role) => switch (role) {
        'owner' => 'Owner',
        'support' => 'Support',
        null => 'No role',
        _ => role,
      };

  static String statusLabel(String status) => switch (status) {
        'invited' => 'Invited',
        'active' => 'Active',
        'suspended' => 'Disabled',
        'deactivated' => 'Deactivated',
        _ => status,
      };

  static PlatformAccount fromJson(dynamic json) {
    final m = json as Map;
    DateTime? at(Object? v) => v == null ? null : DateTime.tryParse('$v');
    return PlatformAccount(
      id: m['id'] as String,
      email: m['email'] as String,
      fullName: m['full_name'] as String,
      status: m['status'] as String,
      role: m['role'] as String?,
      mfaEnrolled: m['mfa'] == 'enrolled',
      lastLoginAt: at(m['last_login_at']),
      isYou: m['is_you'] as bool? ?? false,
      actions: ((m['actions'] as List?) ?? const []).map((e) => '$e').toList(),
      roleHistory: [
        for (final h in (m['role_history'] as List?) ?? const [])
          (
            role: '${(h as Map)['role']}',
            grantedAt: at(h['granted_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
            endedAt: at(h['ended_at']),
            reason: h['reason'] as String?,
          ),
      ],
    );
  }
}

/// A platform invitation, returned once and handed over by hand.
class PlatformInvite {
  const PlatformInvite({required this.account, required this.token, required this.expiresAt});

  final PlatformAccount account;
  final String token;
  final DateTime expiresAt;

  String get message {
    final t = expiresAt.toLocal();
    return 'You are invited to the Nirvok platform as ${PlatformAccount.roleLabel(account.role)}.\n'
        'Invitation code: $token\n'
        'Valid until: ${t.day}/${t.month}/${t.year}\n'
        'Open the Super Admin app, tap "I have an invitation", enter this code and set your own password. '
        'Then set up an authenticator app (such as Google Authenticator) when asked.';
  }

  static PlatformInvite fromJson(dynamic json) {
    final m = json as Map;
    final invitation = m['invitation'] as Map;
    return PlatformInvite(
      account: PlatformAccount.fromJson(m),
      token: invitation['token'] as String,
      expiresAt: DateTime.parse(invitation['expires_at'] as String),
    );
  }
}

/// One platform audit event. Before and after are already redacted by the server.
class AuditEvent {
  const AuditEvent({
    required this.id,
    required this.at,
    required this.action,
    required this.subjectType,
    this.collegeName,
    this.actorName,
    this.reason,
    this.before,
    this.after,
  });

  final String id;
  final DateTime at;
  final String action;
  final String subjectType;
  final String? collegeName;
  final String? actorName;
  final String? reason;
  final Object? before;
  final Object? after;

  /// 'institution.plan_changed' reads as 'Institution plan changed'.
  String get title {
    final words = action.replaceAll('.', ' ').replaceAll('_', ' ').trim();
    return words.isEmpty ? action : '${words[0].toUpperCase()}${words.substring(1)}';
  }

  static AuditEvent fromJson(dynamic json) {
    final m = json as Map;
    final college = m['college'] as Map?;
    final actor = m['actor'] as Map?;
    final subject = (m['subject'] as Map?) ?? const {};
    return AuditEvent(
      id: '${m['id']}',
      at: DateTime.parse(m['at'] as String),
      action: m['action'] as String,
      subjectType: subject['type'] as String? ?? '',
      collegeName: (college?['name'] ?? college?['code']) as String?,
      actorName: (actor?['name'] ?? actor?['email']) as String?,
      reason: m['reason'] as String?,
      before: m['before'],
      after: m['after'],
    );
  }
}

class AuditPage {
  const AuditPage({required this.events, this.nextCursor});

  final List<AuditEvent> events;
  final String? nextCursor;

  static AuditPage fromJson(dynamic json) {
    final m = json as Map;
    return AuditPage(
      events: ((m['events'] as List?) ?? const []).map(AuditEvent.fromJson).toList(),
      nextCursor: m['next_cursor'] as String?,
    );
  }
}

/// SAM-3: the endpoints the web platform console uses for accounts and the audit.
abstract interface class PlatformRepository {
  Future<Result<List<PlatformAccount>>> accounts();
  Future<Result<PlatformAccount>> account(String id);
  Future<Result<PlatformInvite>> invite({required String email, required String fullName, required String role});
  Future<Result<PlatformInvite>> reissue(String id);
  Future<Result<PlatformAccount>> resetAuthenticator(String id, String reason);

  /// [action] is `disable` or `enable`.
  Future<Result<PlatformAccount>> setStatus(String id, String action, String reason);

  /// Pinned to the role the screen showed, so two Owners cannot cross.
  Future<Result<PlatformAccount>> changeRole(String id, {required String role, required String? expectedRole, required String reason});
  Future<Result<AuditPage>> audit({String? collegeId, String? cursor});
}

class PlatformApi implements PlatformRepository {
  const PlatformApi(this._client);
  final ApiClient _client;

  static String _enc(String s) => Uri.encodeComponent(s);

  @override
  Future<Result<List<PlatformAccount>>> accounts() =>
      _client.get('/v1/platform/accounts', (data) => (data as List).map(PlatformAccount.fromJson).toList());

  @override
  Future<Result<PlatformAccount>> account(String id) => _client.get('/v1/platform/accounts/${_enc(id)}', PlatformAccount.fromJson);

  @override
  Future<Result<PlatformInvite>> invite({required String email, required String fullName, required String role}) =>
      _client.post('/v1/platform/accounts', {'email': email, 'full_name': fullName, 'role': role}, PlatformInvite.fromJson);

  @override
  Future<Result<PlatformInvite>> reissue(String id) =>
      _client.post('/v1/platform/accounts/${_enc(id)}/invitation', const <String, Object?>{}, PlatformInvite.fromJson);

  @override
  Future<Result<PlatformAccount>> resetAuthenticator(String id, String reason) =>
      _client.post('/v1/platform/accounts/${_enc(id)}/mfa/reset', {'reason': reason}, PlatformAccount.fromJson);

  @override
  Future<Result<PlatformAccount>> setStatus(String id, String action, String reason) =>
      _client.post('/v1/platform/accounts/${_enc(id)}/$action', {'reason': reason}, PlatformAccount.fromJson);

  @override
  Future<Result<PlatformAccount>> changeRole(String id, {required String role, required String? expectedRole, required String reason}) =>
      _client.post(
        '/v1/platform/accounts/${_enc(id)}/role',
        {'role': role, 'expected_role': expectedRole, 'reason': reason},
        PlatformAccount.fromJson,
      );

  @override
  Future<Result<AuditPage>> audit({String? collegeId, String? cursor}) {
    final query = [
      'limit=50',
      if (collegeId != null) 'college=${Uri.encodeQueryComponent(collegeId)}',
      if (cursor != null) 'cursor=${Uri.encodeQueryComponent(cursor)}',
    ].join('&');
    return _client.get('/v1/platform/audit?$query', AuditPage.fromJson);
  }
}
