/// What a teacher teaches.
///
/// Read from `GET /v1/me/teaching`, which derives the set from the signed-in
/// person on the server. The client never says which sections it belongs to,
/// because a client that could ask that question could ask it about somebody
/// else. See docs/blueprint/modules/m3-course-offering.md.
class TeachingInstructor {
  const TeachingInstructor({required this.personId, required this.fullName, required this.role});

  final String personId;
  final String fullName;
  final String role;

  String get roleLabel => switch (role) {
    'lead' => 'Lead',
    'co' => 'Co-teacher',
    'assistant' => 'Assistant',
    _ => role,
  };

  static TeachingInstructor fromJson(Map json) => TeachingInstructor(
    personId: json['person_id'] as String,
    fullName: json['full_name'] as String,
    role: json['role'] as String,
  );
}

class TeachingOffering {
  const TeachingOffering({
    required this.id,
    required this.component,
    required this.status,
    required this.courseCode,
    required this.courseTitle,
    required this.sectionId,
    required this.sectionLabel,
    required this.sectionStatus,
    required this.termNumber,
    required this.programName,
    required this.departmentName,
    required this.termName,
    required this.academicYearName,
    required this.myRole,
    required this.instructors,
  });

  final String id;
  final String component;
  final String status;
  final String courseCode;
  final String courseTitle;
  final String sectionId;
  final String sectionLabel;
  final String sectionStatus;
  final int termNumber;
  final String programName;
  final String departmentName;
  final String termName;
  final String academicYearName;

  /// Which role the reader holds here, stated by the server so the app does not
  /// have to find itself in the instructor list.
  final String? myRole;
  final List<TeachingInstructor> instructors;

  bool get isTeachingNow => status == 'active';
  bool get isOver => status == 'completed' || status == 'cancelled';
  bool get isLead => myRole == 'lead';

  /// The state in a teacher's words. An administrator cares that an offering is
  /// `planned`; a teacher cares that the class has not started yet.
  String get stateLabel => switch (status) {
    'planned' => 'Not started',
    'active' => 'Teaching',
    'completed' => 'Finished',
    'cancelled' => 'Cancelled',
    _ => status,
  };

  String get componentLabel => switch (component) {
    'lecture' => 'Lecture',
    'lab' => 'Lab',
    'tutorial' => 'Tutorial',
    _ => component,
  };

  String get myRoleLabel => switch (myRole) {
    'lead' => 'Lead',
    'co' => 'Co-teacher',
    'assistant' => 'Assistant',
    _ => 'Assigned',
  };

  /// Everyone else teaching this course, so a co-taught lab shows who shares it.
  List<TeachingInstructor> colleagues(String? myPersonId) =>
      instructors.where((i) => i.personId != myPersonId).toList();

  static TeachingOffering fromJson(Map json) {
    final course = json['course'] as Map;
    final section = json['section'] as Map;
    final program = json['program'] as Map;
    final term = json['term'] as Map;
    return TeachingOffering(
      id: json['id'] as String,
      component: json['component'] as String,
      status: json['status'] as String,
      courseCode: course['code'] as String,
      courseTitle: course['title'] as String,
      sectionId: section['id'] as String,
      sectionLabel: section['label'] as String,
      sectionStatus: section['status'] as String,
      termNumber: (section['term_number'] as num).toInt(),
      programName: program['name'] as String,
      departmentName: json['department_name'] as String? ?? '',
      termName: term['name'] as String,
      academicYearName: json['academic_year_name'] as String? ?? '',
      myRole: json['my_role'] as String?,
      instructors: ((json['instructors'] as List?) ?? const [])
          .map((e) => TeachingInstructor.fromJson(e as Map))
          .toList(),
    );
  }
}

/// A cohort and what this teacher teaches it.
class TeachingCohort {
  const TeachingCohort({
    required this.sectionId,
    required this.sectionLabel,
    required this.programName,
    required this.termName,
    required this.termNumber,
    required this.offerings,
  });

  final String sectionId;
  final String sectionLabel;
  final String programName;
  final String termName;
  final int termNumber;
  final List<TeachingOffering> offerings;

  String get title => '$programName · $sectionLabel';
}

/// Cohort first, then the courses inside it.
///
/// A teacher thinks in classes they walk into, not in offering records, and the
/// same cohort usually appears two or three times across different courses.
/// Order follows the server's, so both clients agree on what comes first.
List<TeachingCohort> groupByCohort(List<TeachingOffering> offerings) {
  final order = <String>[];
  final grouped = <String, List<TeachingOffering>>{};
  for (final offering in offerings) {
    if (!grouped.containsKey(offering.sectionId)) {
      order.add(offering.sectionId);
      grouped[offering.sectionId] = [];
    }
    grouped[offering.sectionId]!.add(offering);
  }
  return order.map((id) {
    final rows = grouped[id]!;
    final first = rows.first;
    return TeachingCohort(
      sectionId: id,
      sectionLabel: first.sectionLabel,
      programName: first.programName,
      termName: first.termName,
      termNumber: first.termNumber,
      offerings: rows,
    );
  }).toList();
}
