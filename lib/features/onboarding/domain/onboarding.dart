/// College Admin onboarding on the phone (ONB-1, AD-76): appointing a teacher
/// and admitting a student, through the same endpoints the web console uses.
/// The server owns every rule; these shapes only carry the forms.
class DepartmentOption {
  const DepartmentOption({required this.id, required this.name, required this.campusName});

  final String id;
  final String name;
  final String campusName;

  static DepartmentOption fromJson(dynamic json) {
    final map = json as Map;
    return DepartmentOption(
      id: map['id'] as String,
      name: map['name'] as String,
      campusName: map['campus_name'] as String? ?? '',
    );
  }
}

class ProgramOption {
  const ProgramOption({required this.id, required this.name, required this.code, required this.departmentName});

  final String id;
  final String name;
  final String code;
  final String departmentName;

  static ProgramOption fromJson(dynamic json) {
    final map = json as Map;
    return ProgramOption(
      id: map['id'] as String,
      name: map['name'] as String,
      code: map['code'] as String? ?? '',
      departmentName: map['department_name'] as String? ?? '',
    );
  }
}

/// A teacher is a staff person invited with the Faculty role (or Head of
/// Department) in one department: the role's own allowed scope.
class TeacherInput {
  const TeacherInput({
    required this.fullName,
    required this.email,
    required this.departmentId,
    this.phone = '',
    this.asHead = false,
  });

  final String fullName;
  final String email;
  final String phone;
  final String? departmentId;
  final bool asHead;

  Map<String, Object?> toJson() => {
    'full_name': fullName.trim(),
    'email': email.trim().toLowerCase(),
    if (phone.trim().isNotEmpty) 'phone': phone.trim(),
    'person_type': 'staff',
    'role': {
      'role_key': asHead ? 'department_head' : 'faculty',
      'scope_type': 'department',
      'scope_ref_id': departmentId,
    },
  };
}

/// The one moment a teacher's invitation exists outside the server.
class AppointedTeacher {
  const AppointedTeacher({required this.personId, required this.invitationToken, required this.expiresAt});

  final String personId;
  final String invitationToken;
  final DateTime expiresAt;

  static AppointedTeacher fromJson(dynamic json) {
    final map = json as Map;
    final invitation = map['invitation'] as Map;
    return AppointedTeacher(
      personId: map['person_id'] as String,
      invitationToken: invitation['token'] as String,
      expiresAt: DateTime.parse(invitation['expires_at'] as String),
    );
  }
}

/// A student record: no login yet. Once given app access, the student signs
/// in with a code sent to this email or mobile (AD-82).
class StudentInput {
  const StudentInput({
    required this.fullName,
    required this.enrolmentNumber,
    required this.programId,
    required this.admittedOn,
    this.email = '',
    this.phone = '',
  });

  final String fullName;
  final String enrolmentNumber;
  final String? programId;

  /// 'YYYY-MM-DD', a calendar date (AD-49).
  final String admittedOn;
  final String email;
  final String phone;

  Map<String, Object?> toJson() => {
    'full_name': fullName.trim(),
    if (email.trim().isNotEmpty) 'email': email.trim().toLowerCase(),
    if (phone.trim().isNotEmpty) 'phone': phone.trim(),
    'enrolment_number': enrolmentNumber.trim(),
    'program_id': programId,
    'admitted_on': admittedOn,
  };
}

final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

/// Guidance before sending; the server is the authority and names the field.
String? teacherFormError(TeacherInput input) {
  if (input.fullName.trim().length < 2) return "Enter the teacher's name.";
  if (!_email.hasMatch(input.email.trim())) return "Enter the teacher's email address.";
  if (input.departmentId == null) return 'Choose the department they teach in.';
  return null;
}

String? studentFormError(StudentInput input) {
  if (input.fullName.trim().length < 2) return "Enter the student's name.";
  if (input.enrolmentNumber.trim().isEmpty) return 'Enter the enrolment number.';
  if (input.programId == null) return 'Choose the program.';
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(input.admittedOn)) return 'Choose the admission date.';
  if (input.email.trim().isNotEmpty && !_email.hasMatch(input.email.trim())) return 'Check the email address.';
  return null;
}
