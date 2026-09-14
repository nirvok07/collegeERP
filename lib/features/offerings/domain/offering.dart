/// ADM-7 (AD-81): a course taught to a section, its teachers and its roster,
/// as the phone needs them. Field names mirror the API.
class Instructor {
  const Instructor({required this.assignmentId, required this.personId, required this.fullName, required this.role});

  final String assignmentId;
  final String personId;
  final String fullName;
  final String role;

  static String roleLabel(String role) => switch (role) {
        'lead' => 'Lead',
        'co' => 'Co-instructor',
        'assistant' => 'Assistant',
        _ => role,
      };

  static Instructor fromJson(dynamic json) {
    final m = json as Map;
    return Instructor(
      assignmentId: m['assignment_id'] as String,
      personId: m['person_id'] as String,
      fullName: m['full_name'] as String,
      role: m['role'] as String? ?? 'lead',
    );
  }
}

class Offering {
  const Offering({
    required this.id,
    required this.component,
    required this.status,
    required this.courseId,
    required this.courseCode,
    required this.courseTitle,
    required this.sectionId,
    required this.sectionLabel,
    required this.sectionStatus,
    required this.termNumber,
    required this.programName,
    required this.termName,
    required this.instructors,
    required this.allowedTransitions,
    required this.canActivate,
    this.cancelledReason,
  });

  final String id;
  final String component;
  final String status;
  final String? cancelledReason;
  final String courseId;
  final String courseCode;
  final String courseTitle;
  final String sectionId;
  final String sectionLabel;
  final String sectionStatus;
  final int termNumber;
  final String programName;
  final String termName;
  final List<Instructor> instructors;

  /// Stated by the server, so the phone never reimplements the lifecycle.
  final List<String> allowedTransitions;

  /// An offering cannot start unstaffed, nor before its section is active.
  final bool canActivate;

  String get title => '$courseCode · $courseTitle';

  bool get hasLead => instructors.any((i) => i.role == 'lead');

  bool get changeable => status == 'planned' || status == 'active';

  /// Why "Start teaching" is not available yet, in the order to fix it.
  String? get activationBlocker {
    if (status != 'planned' || canActivate) return null;
    if (sectionStatus != 'active') return 'The section starts teaching first.';
    if (instructors.isEmpty) return 'Assign a teacher first.';
    return null;
  }

  static String componentLabel(String c) => switch (c) {
        'lab' => 'Lab',
        'tutorial' => 'Tutorial',
        _ => 'Lecture',
      };

  static String statusLabel(String s) => switch (s) {
        'planned' => 'Planned',
        'active' => 'Teaching',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
        _ => s,
      };

  static String actionLabel(String to) => switch (to) {
        'active' => 'Start teaching',
        'completed' => 'Complete',
        'cancelled' => 'Cancel course',
        _ => to,
      };

  static Offering fromJson(dynamic json) {
    final m = json as Map;
    final course = (m['course'] as Map?) ?? const {};
    final section = (m['section'] as Map?) ?? const {};
    final program = (m['program'] as Map?) ?? const {};
    final term = (m['term'] as Map?) ?? const {};
    return Offering(
      id: m['id'] as String,
      component: m['component'] as String? ?? 'lecture',
      status: m['status'] as String,
      cancelledReason: m['cancelled_reason'] as String?,
      courseId: course['id'] as String? ?? '',
      courseCode: course['code'] as String? ?? '',
      courseTitle: course['title'] as String? ?? '',
      sectionId: section['id'] as String? ?? '',
      sectionLabel: section['label'] as String? ?? '',
      sectionStatus: section['status'] as String? ?? '',
      termNumber: (section['term_number'] as num?)?.toInt() ?? 0,
      programName: program['name'] as String? ?? '',
      termName: term['name'] as String? ?? '',
      instructors: ((m['instructors'] as List?) ?? const []).map(Instructor.fromJson).toList(),
      allowedTransitions: ((m['allowed_transitions'] as List?) ?? const []).map((e) => '$e').toList(),
      canActivate: m['can_activate'] as bool? ?? false,
    );
  }
}

/// A student on a course's roster today.
class RosterStudent {
  const RosterStudent({required this.studentId, required this.fullName, required this.enrolmentNumber});

  final String studentId;
  final String fullName;
  final String enrolmentNumber;

  static RosterStudent fromJson(dynamic json) {
    final m = json as Map;
    return RosterStudent(
      studentId: m['student_id'] as String,
      fullName: m['full_name'] as String,
      enrolmentNumber: m['enrolment_number'] as String? ?? '',
    );
  }
}

/// A member of staff who could be assigned to teach.
class StaffOption {
  const StaffOption({required this.personId, required this.fullName, this.email});

  final String personId;
  final String fullName;
  final String? email;

  static StaffOption fromJson(dynamic json) {
    final m = json as Map;
    return StaffOption(
      personId: m['person_id'] as String,
      fullName: m['full_name'] as String,
      email: m['email'] as String?,
    );
  }
}
