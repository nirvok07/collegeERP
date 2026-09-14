/// ADM-6 (AD-81): a cohort section and its members, as the phone needs them.
/// Field names mirror the API.
class Section {
  const Section({
    required this.id,
    required this.label,
    required this.status,
    required this.termNumber,
    required this.programId,
    required this.programName,
    required this.termId,
    required this.termName,
    required this.yearName,
    required this.allowedTransitions,
    this.capacity,
    this.cancelledReason,
    this.departmentName = '',
    this.campusName = '',
  });

  final String id;
  final String label;
  final String status;
  final int termNumber;
  final int? capacity;
  final String? cancelledReason;
  final String programId;
  final String programName;
  final String departmentName;
  final String campusName;
  final String termId;
  final String termName;
  final String yearName;

  /// Stated by the server, so the phone never reimplements the lifecycle to draw a button.
  final List<String> allowedTransitions;

  /// How people name a section: "BTech CSE · term 3 · A".
  String get title => '$programName · term $termNumber · $label';

  bool get capacityEditable => status == 'planned' || status == 'open' || status == 'active';

  static String statusLabel(String status) => switch (status) {
        'planned' => 'Planned',
        'open' => 'Open',
        'active' => 'Active',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
        _ => status,
      };

  /// The button that moves a section to [to].
  static String actionLabel(String to) => switch (to) {
        'planned' => 'Back to planned',
        'open' => 'Open',
        'active' => 'Start teaching',
        'completed' => 'Complete',
        'cancelled' => 'Cancel section',
        _ => to,
      };

  static Section fromJson(dynamic json) {
    final m = json as Map;
    final program = (m['program'] as Map?) ?? const {};
    final term = (m['term'] as Map?) ?? const {};
    final year = (m['academic_year'] as Map?) ?? const {};
    return Section(
      id: m['id'] as String,
      label: m['label'] as String,
      status: m['status'] as String,
      termNumber: (m['term_number'] as num).toInt(),
      capacity: (m['capacity'] as num?)?.toInt(),
      cancelledReason: m['cancelled_reason'] as String?,
      programId: program['id'] as String? ?? '',
      programName: program['name'] as String? ?? '',
      departmentName: m['department_name'] as String? ?? '',
      campusName: m['campus_name'] as String? ?? '',
      termId: term['id'] as String? ?? '',
      termName: term['name'] as String? ?? '',
      yearName: year['name'] as String? ?? '',
      allowedTransitions: ((m['allowed_transitions'] as List?) ?? const []).map((e) => '$e').toList(),
    );
  }
}

/// A student as a section's member list and the placement picker need them.
class Member {
  const Member({required this.id, required this.fullName, required this.enrolmentNumber, required this.status});

  final String id;
  final String fullName;
  final String enrolmentNumber;
  final String status;

  static Member fromJson(dynamic json) {
    final m = json as Map;
    return Member(
      id: m['id'] as String,
      fullName: m['full_name'] as String,
      enrolmentNumber: m['enrolment_number'] as String? ?? '',
      status: m['status'] as String? ?? 'enrolled',
    );
  }
}

/// The next free label for a new section of the same program, term and year: A, B, C…
String nextSectionLabel(Iterable<String> taken) {
  final used = taken.map((l) => l.toUpperCase()).toSet();
  for (var c = 'A'.codeUnitAt(0); c <= 'Z'.codeUnitAt(0); c++) {
    final label = String.fromCharCode(c);
    if (!used.contains(label)) return label;
  }
  return '';
}
