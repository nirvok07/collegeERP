import '../../../core/session/college_brand.dart';

/// AD-80: a one-time code for someone who forgot their password, or a fresh
/// invitation for someone who never accepted theirs. Returned once by the
/// server; nothing is emailed, so the issuer hands it over (AD-75).
class ResetCode {
  const ResetCode({required this.kind, required this.token, required this.expiresAt});

  final String kind;
  final String token;
  final DateTime expiresAt;

  bool get isInvitation => kind == 'invitation';

  static ResetCode fromJson(dynamic json) {
    final m = json as Map;
    return ResetCode(
      kind: m['kind'] as String? ?? 'reset',
      token: m['token'] as String,
      expiresAt: DateTime.parse(m['expires_at'] as String),
    );
  }

  static String _date(DateTime at) {
    final t = at.toLocal();
    return '${t.day}/${t.month}/${t.year}';
  }

  /// Everything the person needs, as one message to paste anywhere.
  String message({CollegeBrand? college}) {
    final what = isInvitation ? 'Invitation code' : 'Password reset code';
    return '${isInvitation ? 'Your invitation' : 'Your password reset'}${college == null ? '' : ' for ${college.name}'}.\n'
        '${college == null ? '' : 'College code: ${college.code}\n'}'
        '$what: $token\n'
        'Valid until: ${_date(expiresAt)}\n'
        'Open the College app, enter the college code, tap "Forgot password?" or "I have an invitation", '
        'enter this code and set your own password.';
  }
}
