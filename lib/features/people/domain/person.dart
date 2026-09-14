import 'package:characters/characters.dart';

/// A person as the mobile client needs them. Field names mirror the API so a
/// reader can move between the two clients and the backend without translating.
class Person {
  const Person({
    required this.id,
    required this.fullName,
    required this.email,
    required this.personType,
    required this.accountStatus,
    required this.roleKeys,
    required this.lastLoginAt,
    this.phone,
  });

  final String id;
  final String fullName;
  final String? email;

  /// Where their sign-in code can go, with the email (AD-82).
  final String? phone;
  final String personType;
  final String? accountStatus;
  final List<String> roleKeys;
  final DateTime? lastLoginAt;

  bool get hasAccess => roleKeys.isNotEmpty;

  /// Initials for the avatar, which is cheaper and more reliable than loading
  /// a photo for every row on a mobile connection.
  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }

  static Person fromJson(Map json) => Person(
        id: json['person_id'] as String,
        fullName: json['full_name'] as String,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        personType: json['person_type'] as String? ?? 'staff',
        accountStatus: json['account_status'] as String?,
        roleKeys: ((json['role_keys'] as List?) ?? const []).map((e) => '$e').toList(),
        lastLoginAt: json['last_login_at'] == null
            ? null
            : DateTime.tryParse('${json['last_login_at']}'),
      );
}
