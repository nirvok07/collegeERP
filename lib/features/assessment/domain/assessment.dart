/// Internal assessment as a teacher needs it: the components of the courses
/// they teach, and one component's mark sheet.
///
/// The plan is set by the department on the web. A teacher records when a
/// component was held, enters results, and submits. See
/// docs/blueprint/modules/m7-internal-assessment.md.
enum MarkStatus {
  scored,
  absent,
  exempt;

  String get wire => name;

  String get label => switch (this) {
    MarkStatus.scored => 'Scored',
    MarkStatus.absent => 'Absent',
    MarkStatus.exempt => 'Exempt',
  };

  static MarkStatus? fromWire(String? value) => switch (value) {
    'scored' => MarkStatus.scored,
    'absent' => MarkStatus.absent,
    'exempt' => MarkStatus.exempt,
    _ => null,
  };
}

/// Reads a JSON number that PostgreSQL may send as either a number or text.
double? _decimal(Object? value) => switch (value) {
  null => null,
  num n => n.toDouble(),
  String s => double.tryParse(s),
  _ => null,
};

/// Formats a score or maximum without a trailing ".0", because "42" is what a
/// teacher wrote, and "42.0" is what a computer thinks they meant.
String formatMarks(double value) =>
    value == value.roundToDouble() ? value.toInt().toString() : value.toString();

class AssessmentComponent {
  const AssessmentComponent({
    required this.id,
    required this.offeringId,
    required this.name,
    required this.kind,
    required this.maxMarks,
    required this.weight,
    required this.heldOn,
    required this.status,
    required this.version,
    required this.markCount,
    required this.courseCode,
    required this.courseTitle,
    required this.sectionLabel,
  });

  final String id;
  final String offeringId;
  final String name;
  final String kind;
  final double maxMarks;
  final double weight;

  /// A calendar date, 'YYYY-MM-DD'. Never parsed into a local DateTime for
  /// display, which would shift the day east of UTC (AD-49).
  final String? heldOn;
  final String status;
  final int version;
  final int markCount;
  final String courseCode;
  final String courseTitle;
  final String sectionLabel;

  bool get isOpen => status == 'draft';
  bool get isClosed => status == 'submitted' || status == 'verified';

  /// The stage in a teacher's words, not the stored status.
  String get stageLabel => switch (status) {
    'submitted' => 'Submitted',
    'verified' => 'Verified',
    'cancelled' => 'Cancelled',
    _ =>
      heldOn == null ? 'Not held yet' : (markCount == 0 ? 'Nothing entered' : '$markCount entered'),
  };

  String get outOf => 'out of ${formatMarks(maxMarks)}';

  static AssessmentComponent fromJson(Map json) {
    final course = json['course'] as Map;
    final section = json['section'] as Map;
    return AssessmentComponent(
      id: json['id'] as String,
      offeringId: json['offering_id'] as String,
      name: json['name'] as String,
      kind: json['kind'] as String? ?? 'test',
      maxMarks: _decimal(json['max_marks']) ?? 0,
      weight: _decimal(json['weight']) ?? 0,
      heldOn: json['held_on'] as String?,
      status: json['status'] as String,
      version: (json['version'] as num).toInt(),
      markCount: (json['mark_count'] as num?)?.toInt() ?? 0,
      courseCode: course['code'] as String,
      courseTitle: course['title'] as String,
      sectionLabel: section['label'] as String,
    );
  }
}

class SheetStudent {
  const SheetStudent({
    required this.studentId,
    required this.fullName,
    required this.enrolmentNumber,
    required this.status,
    required this.score,
  });

  final String studentId;
  final String fullName;
  final String enrolmentNumber;

  /// Null means nobody has recorded a result, which is not absent.
  final MarkStatus? status;
  final double? score;

  static SheetStudent fromJson(Map json) => SheetStudent(
    studentId: json['student_id'] as String,
    fullName: json['full_name'] as String,
    enrolmentNumber: json['enrolment_number'] as String,
    status: MarkStatus.fromWire(json['status'] as String?),
    score: _decimal(json['score']),
  );
}

class AssessmentSheet {
  const AssessmentSheet({
    required this.component,
    required this.needsDate,
    required this.students,
    required this.canMark,
    required this.canSubmit,
  });

  final AssessmentComponent component;

  /// No date, no class list: who was expected depends on the day it was held.
  final bool needsDate;
  final List<SheetStudent> students;

  /// Stated by the server, so the app never reimplements the rules.
  final bool canMark;
  final bool canSubmit;

  static AssessmentSheet fromJson(dynamic json) {
    final map = json as Map;
    return AssessmentSheet(
      component: AssessmentComponent.fromJson(map['component'] as Map),
      needsDate: map['needs_date'] as bool? ?? false,
      students: ((map['students'] as List?) ?? const [])
          .map((e) => SheetStudent.fromJson(e as Map))
          .toList(),
      canMark: map['can_mark'] as bool? ?? false,
      canSubmit: map['can_submit'] as bool? ?? false,
    );
  }
}

/// What the teacher has changed but not yet sent, one entry per student.
class PendingMark {
  const PendingMark(this.status, this.text);
  final MarkStatus status;

  /// The score exactly as typed, validated separately so the field can say
  /// what is wrong while it is being typed.
  final String text;
}

/// A mark sheet held on the device until it is saved.
///
/// A tap or a keystroke is never lost to a failed request: the draft keeps
/// everything until the batch succeeds. Results saved on this phone but not yet
/// sent (AD-59) are held apart: not unsaved, and not the server's yet.
class MarkDraft {
  MarkDraft(this.sheet);

  final AssessmentSheet sheet;
  final Map<String, PendingMark> _pending = {};
  final Map<String, PendingMark> _queued = {};

  bool get hasQueued => _queued.isNotEmpty;

  /// The save went to the outbox: those results are no longer unsaved.
  void queuePending() {
    _queued.addAll(_pending);
    _pending.clear();
  }

  /// Restores results still waiting in the outbox onto a freshly read sheet.
  void applyQueued(List<Object?> marks) {
    final known = {for (final s in sheet.students) s.studentId};
    for (final entry in marks.whereType<Map>()) {
      final id = entry['student_id'] as String?;
      final status = MarkStatus.fromWire(entry['status'] as String?);
      final score = entry['score'];
      if (id == null || status == null || !known.contains(id)) continue;
      _queued[id] = PendingMark(status, score is num ? formatMarks(score.toDouble()) : '');
    }
  }

  static final _scorePattern = RegExp(r'^\d+(\.\d{1,2})?$');

  SheetStudent _student(String id) => sheet.students.firstWhere((s) => s.studentId == id);

  MarkStatus? statusFor(String id) =>
      _pending[id]?.status ?? _queued[id]?.status ?? _student(id).status;

  /// The text to show in a student's score field.
  String textFor(String id) {
    final pending = _pending[id] ?? _queued[id];
    if (pending != null) return pending.text;
    final student = _student(id);
    return student.status == MarkStatus.scored && student.score != null
        ? formatMarks(student.score!)
        : '';
  }

  bool get isDirty => _pending.isNotEmpty;
  int get pendingCount => _pending.length;

  void setScore(String id, String text) => _set(id, PendingMark(MarkStatus.scored, text));

  void setStatus(String id, MarkStatus status) =>
      _set(id, PendingMark(status, status == MarkStatus.scored ? textFor(id) : ''));

  void _set(String id, PendingMark next) {
    final student = _student(id);
    final queued = _queued[id];
    final savedStatus = queued?.status ?? student.status;
    final savedText =
        queued?.text ??
        (student.status == MarkStatus.scored && student.score != null
            ? formatMarks(student.score!)
            : '');
    final same =
        next.status == savedStatus &&
        (next.status != MarkStatus.scored || next.text.trim() == savedText.trim());
    // Back to what is already saved is not a change, so "unsaved" is honest.
    if (same) {
      _pending.remove(id);
    } else {
      _pending[id] = next;
    }
  }

  void clearPending() => _pending.clear();

  /// What is wrong with a student's pending score, or null. Guidance only: the
  /// server refuses the same values regardless.
  String? errorFor(String id) {
    final pending = _pending[id];
    if (pending == null || pending.status != MarkStatus.scored) return null;
    final text = pending.text.trim();
    if (text.isEmpty) return 'Enter a score, or mark absent or exempt';
    if (!_scorePattern.hasMatch(text)) return 'At most two decimal places';
    if (double.parse(text) > sheet.component.maxMarks) return sheet.component.outOf;
    return null;
  }

  bool get hasErrors => _pending.keys.any((id) => errorFor(id) != null);

  bool get canSave => isDirty && !hasErrors;

  /// Only what changed, so a save cannot overwrite a result somebody else made.
  List<Map<String, Object?>> payload() => _pending.entries.map((e) {
    final scored = e.value.status == MarkStatus.scored;
    return {
      'student_id': e.key,
      'status': e.value.status.wire,
      'score': scored ? double.parse(e.value.text.trim()) : null,
    };
  }).toList();

  int get unmarkedCount => sheet.students.where((s) => statusFor(s.studentId) == null).length;

  /// Why submit is not available, in words rather than a dead button.
  String? get submitBlockedReason {
    if (!sheet.component.isOpen) {
      return 'This sheet has been ${sheet.component.stageLabel.toLowerCase()}.';
    }
    if (!sheet.canSubmit) return 'You cannot submit this sheet.';
    if (sheet.needsDate) return 'Record when this was held first.';
    if (isDirty) {
      return 'Save your $pendingCount unsaved ${pendingCount == 1 ? 'change' : 'changes'} first.';
    }
    if (unmarkedCount > 0) {
      return '$unmarkedCount ${unmarkedCount == 1 ? 'student has' : 'students have'} no result yet.';
    }
    return null;
  }
}
