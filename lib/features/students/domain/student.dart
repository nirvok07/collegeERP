/// ADM-9 (AD-81): a student's record as the phone needs it. Field names mirror the API.
class Student {
  const Student({
    required this.id,
    required this.fullName,
    required this.enrolmentNumber,
    required this.programId,
    required this.programName,
    required this.admittedOn,
    required this.status,
    this.email,
    this.phone,
    this.personId,
    this.statusReason,
    this.sectionId,
    this.sectionLabel,
    this.sectionTermNumber,
  });

  final String id;
  final String fullName;
  final String? email;

  /// Where their sign-in code can go, with the email (AD-82).
  final String? phone;

  /// The person behind the record, whose contact identity owns (OTP-6).
  final String? personId;
  final String enrolmentNumber;
  final String programId;
  final String programName;

  /// 'YYYY-MM-DD'.
  final String admittedOn;
  final String status;
  final String? statusReason;
  final String? sectionId;
  final String? sectionLabel;
  final int? sectionTermNumber;

  /// Where they sit now, or that they are not placed yet (normal at the start of a term).
  String get placement =>
      sectionId == null ? 'Not in a section' : 'Term $sectionTermNumber · section $sectionLabel';

  static const statuses = ['enrolled', 'on_leave', 'withdrawn', 'graduated'];

  static String statusLabel(String s) => switch (s) {
        'enrolled' => 'Enrolled',
        'on_leave' => 'On leave',
        'withdrawn' => 'Withdrawn',
        'graduated' => 'Graduated',
        _ => s,
      };

  /// The server requires a reason for these; it explains the record later.
  static bool needsReason(String to) => to == 'withdrawn' || to == 'on_leave';

  /// These end the student's section and course places, which the person must see first.
  static bool endsPlaces(String to) => to == 'withdrawn' || to == 'graduated';

  static Student fromJson(dynamic json) {
    final m = json as Map;
    final program = (m['program'] as Map?) ?? const {};
    final section = m['section'] as Map?;
    return Student(
      id: m['id'] as String,
      fullName: m['full_name'] as String,
      email: m['email'] as String?,
      phone: m['phone'] as String?,
      personId: m['person_id'] as String?,
      enrolmentNumber: m['enrolment_number'] as String? ?? '',
      programId: program['id'] as String? ?? '',
      programName: program['name'] as String? ?? '',
      admittedOn: '${m['admitted_on'] ?? ''}',
      status: m['status'] as String? ?? 'enrolled',
      statusReason: m['status_reason'] as String?,
      sectionId: section?['id'] as String?,
      sectionLabel: section?['label'] as String?,
      sectionTermNumber: (section?['term_number'] as num?)?.toInt(),
    );
  }
}

/// ST-1 (AD-69): a student's one-time code, shown once, to print or send.
class StudentAccessCode {
  const StudentAccessCode({required this.kind, required this.code, required this.expiresAt, required this.loginIdentifier});

  /// `activation` the first time; `reset` once the student has an account.
  final String kind;
  final String code;
  final DateTime expiresAt;
  final String loginIdentifier;

  bool get isReset => kind == 'reset';

  String message({required Student student, String? collegeCode, String? collegeName}) {
    final t = expiresAt.toLocal();
    return '${isReset ? 'Password reset' : 'App access'} for ${student.fullName}'
        '${collegeName == null ? '' : ' at $collegeName'}.\n'
        '${collegeCode == null ? '' : 'College code: $collegeCode\n'}'
        'Enrolment number: ${student.enrolmentNumber}\n'
        '${isReset ? 'Reset' : 'Activation'} code: $code\n'
        'Valid until: ${t.day}/${t.month}/${t.year}\n'
        'Open the College app, enter the college code, tap "Student? Activate your account", '
        'enter your enrolment number and this code, and set your own password.';
  }

  static StudentAccessCode fromJson(dynamic json) {
    final m = json as Map;
    return StudentAccessCode(
      kind: m['kind'] as String? ?? 'activation',
      code: m['code'] as String,
      expiresAt: DateTime.parse(m['expires_at'] as String),
      loginIdentifier: m['login_identifier'] as String? ?? '',
    );
  }
}

/// A time in one section, so a mid-term move stays explicable.
class Placement {
  const Placement({required this.id, required this.sectionId, required this.validFrom, this.validTo, this.endReason});

  final String id;
  final String sectionId;
  final String validFrom;
  final String? validTo;
  final String? endReason;

  bool get isCurrent => validTo == null;

  static Placement fromJson(dynamic json) {
    final m = json as Map;
    return Placement(
      id: m['id'] as String,
      sectionId: m['section_id'] as String,
      validFrom: '${m['valid_from']}',
      validTo: m['valid_to'] == null ? null : '${m['valid_to']}',
      endReason: m['end_reason'] as String?,
    );
  }
}
