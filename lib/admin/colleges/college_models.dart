/// The platform's view of colleges (AD-72), as `/v1/institutions` states it:
/// a college's record and its first administrator, nothing operational.
class CollegeSummary {
  const CollegeSummary({
    required this.id,
    required this.code,
    required this.name,
    required this.status,
    required this.seatLimit,
  });

  final String id;
  final String code;
  final String name;
  final String status;
  final int seatLimit;

  static CollegeSummary fromJson(dynamic json) {
    final map = json as Map;
    return CollegeSummary(
      id: map['id'] as String,
      code: map['code'] as String,
      name: map['name'] as String,
      status: map['status'] as String,
      seatLimit: (map['seat_limit'] as num).toInt(),
    );
  }
}

String statusLabel(String status) => switch (status) {
  'active' => 'Active',
  'trial' => 'Trial',
  'suspended' => 'Suspended',
  'closed' => 'Closed',
  _ => status,
};

class CollegeAdministrator {
  const CollegeAdministrator({
    required this.fullName,
    required this.email,
    required this.accountStatus,
    required this.invitationState,
    required this.invitationExpiresAt,
    this.canReissue = false,
  });

  /// The server says whether a new invitation may be issued now.
  final bool canReissue;
  final String fullName;
  final String? email;
  final String accountStatus;
  final String invitationState;
  final DateTime? invitationExpiresAt;

  String get invitationLabel => switch (invitationState) {
    'pending' => 'Invitation waiting',
    'expired' => 'Invitation expired',
    'accepted' => 'Invitation accepted',
    'revoked' => 'Invitation replaced',
    _ => 'No invitation',
  };
}

class CollegeDetail {
  const CollegeDetail({
    required this.id,
    required this.code,
    required this.name,
    required this.status,
    required this.plan,
    required this.timezone,
    required this.seatsUsed,
    required this.seatLimit,
    required this.logoUrl,
    required this.brandColor,
    required this.administrator,
    this.version = 0,
    this.actions = const [],
  });

  /// Pins a lifecycle change to what is on screen (AD-12).
  final int version;

  /// The lifecycle actions the server allows now: suspend, reactivate, close.
  final List<String> actions;

  final String id;
  final String code;
  final String name;
  final String status;
  final String plan;
  final String timezone;
  final int seatsUsed;
  final int seatLimit;
  final String? logoUrl;
  final String? brandColor;
  final CollegeAdministrator? administrator;

  int get seatsRemaining => seatLimit - seatsUsed;

  static CollegeDetail fromJson(dynamic json) {
    final map = json as Map;
    final seats = map['seats'] as Map;
    final admin = map['administrator'] as Map?;
    final invitation = admin?['invitation'] as Map?;
    final expires = invitation?['expires_at'] as String?;
    return CollegeDetail(
      id: map['id'] as String,
      code: map['code'] as String,
      name: map['name'] as String,
      status: map['status'] as String,
      plan: map['plan'] as String,
      timezone: map['timezone'] as String,
      seatsUsed: (seats['used'] as num).toInt(),
      seatLimit: (seats['limit'] as num).toInt(),
      logoUrl: map['logo_url'] as String?,
      brandColor: map['brand_color'] as String?,
      version: (map['version'] as num?)?.toInt() ?? 0,
      actions: ((map['actions'] as List?) ?? const []).map((e) => '$e').toList(),
      administrator: admin == null
          ? null
          : CollegeAdministrator(
              fullName: admin['full_name'] as String,
              email: admin['email'] as String?,
              accountStatus: admin['account_status'] as String,
              invitationState: invitation?['state'] as String? ?? 'none',
              invitationExpiresAt: expires == null ? null : DateTime.parse(expires),
              canReissue: admin['can_reissue'] as bool? ?? false,
            ),
    );
  }
}

class ProvisionInput {
  const ProvisionInput({
    required this.code,
    required this.name,
    required this.adminName,
    required this.adminEmail,
    this.logoUrl = '',
    this.brandColor = '',
    this.seatLimit,
  });

  /// How many live accounts the college may hold (AD-65); the server uses 500 when absent.
  final int? seatLimit;

  final String code;
  final String name;
  final String adminName;
  final String adminEmail;
  final String logoUrl;
  final String brandColor;

  Map<String, Object?> toJson() => {
    'code': code.trim().toLowerCase(),
    'name': name.trim(),
    'logo_url': logoUrl.trim().isEmpty ? null : logoUrl.trim(),
    'brand_color': brandColor.trim().isEmpty ? null : brandColor.trim().toUpperCase(),
    'seat_limit': ?seatLimit,
    'admin': {'full_name': adminName.trim(), 'email': adminEmail.trim().toLowerCase()},
  };
}

/// The one moment the invitation token exists outside the server (AD-20).
class ProvisionedCollege {
  const ProvisionedCollege({
    required this.id,
    required this.code,
    required this.name,
    required this.invitationToken,
    required this.invitationExpiresAt,
  });

  final String id;
  final String code;
  final String name;
  final String invitationToken;
  final DateTime invitationExpiresAt;

  static ProvisionedCollege fromJson(dynamic json) {
    final map = json as Map;
    final institution = map['institution'] as Map;
    final invitation = map['invitation'] as Map;
    return ProvisionedCollege(
      id: institution['id'] as String,
      code: institution['code'] as String,
      name: institution['name'] as String,
      invitationToken: invitation['token'] as String,
      invitationExpiresAt: DateTime.parse(invitation['expires_at'] as String),
    );
  }
}

/// The code the web console suggests from a name, the same way.
String slugify(String name) {
  final slug = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-+|-+$'), '');
  return slug.length > 32 ? slug.substring(0, 32) : slug;
}

/// Guidance before sending; the server is the authority and names the field.
String? provisionFormError(ProvisionInput input) {
  if (input.name.trim().length < 2) return 'Give the college a name.';
  if (!RegExp(r'^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$').hasMatch(input.code.trim().toLowerCase())) {
    return 'The code uses 3 to 32 lowercase letters, numbers and hyphens.';
  }
  if (input.adminName.trim().length < 2) return "Give the administrator's name.";
  if (input.seatLimit != null && input.seatLimit! < 1) return 'Seats is a whole number of at least 1.';
  if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(input.adminEmail.trim())) {
    return "Enter the administrator's email address.";
  }
  final logo = input.logoUrl.trim();
  if (logo.isNotEmpty && !RegExp(r'^https://\S+$').hasMatch(logo)) return 'The logo must be an https:// link.';
  final colour = input.brandColor.trim();
  if (colour.isNotEmpty && !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(colour)) return 'Use a colour like #1E40AF.';
  return null;
}
