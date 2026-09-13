/// Attendance for one class session, as a teacher standing in front of the room
/// needs it.
///
/// Read from `GET /v1/sessions/:id/attendance`. The roster comes from the
/// server, resolved as of the class's own date, and the client never says who
/// should be in the room.
enum AttendanceMark {
  present,
  absent,
  late,
  excused;

  String get wire => name;

  /// One letter, because a row has to fit four of these and a name at phone
  /// width. The full word goes in the accessibility label.
  String get letter => switch (this) {
    AttendanceMark.present => 'P',
    AttendanceMark.absent => 'A',
    AttendanceMark.late => 'L',
    AttendanceMark.excused => 'E',
  };

  String get label => switch (this) {
    AttendanceMark.present => 'Present',
    AttendanceMark.absent => 'Absent',
    AttendanceMark.late => 'Late',
    AttendanceMark.excused => 'Excused',
  };

  static AttendanceMark? fromWire(String? value) => switch (value) {
    'present' => AttendanceMark.present,
    'absent' => AttendanceMark.absent,
    'late' => AttendanceMark.late,
    'excused' => AttendanceMark.excused,
    _ => null,
  };
}

/// One student on the register.
class RosterStudent {
  const RosterStudent({
    required this.studentId,
    required this.fullName,
    required this.enrolmentNumber,
    required this.recordId,
    required this.mark,
    required this.markedBy,
  });

  final String studentId;
  final String fullName;
  final String enrolmentNumber;

  /// Null until somebody marks them, which is not the same as absent.
  final String? recordId;
  final AttendanceMark? mark;
  final String? markedBy;

  static RosterStudent fromJson(Map json) => RosterStudent(
    studentId: json['student_id'] as String,
    fullName: json['full_name'] as String,
    enrolmentNumber: json['enrolment_number'] as String,
    recordId: json['record_id'] as String?,
    mark: AttendanceMark.fromWire(json['state'] as String?),
    markedBy: json['marked_by'] as String?,
  );
}

/// The class this register belongs to, with just enough to head the screen.
class SheetSession {
  const SheetSession({
    required this.id,
    required this.date,
    required this.startsAt,
    required this.courseCode,
    required this.courseTitle,
    required this.sectionLabel,
    required this.roomCode,
  });

  final String id;
  final String date;
  final String startsAt;
  final String courseCode;
  final String courseTitle;
  final String sectionLabel;
  final String? roomCode;

  static SheetSession fromJson(Map json) {
    final course = json['course'] as Map;
    final section = json['section'] as Map;
    final room = json['room'] as Map?;
    return SheetSession(
      id: json['id'] as String,
      date: '${json['date']}',
      startsAt: '${json['starts_at']}',
      courseCode: course['code'] as String,
      courseTitle: course['title'] as String,
      sectionLabel: section['label'] as String,
      roomCode: room?['code'] as String?,
    );
  }
}

/// A register as the server holds it.
class AttendanceSheet {
  const AttendanceSheet({
    required this.session,
    required this.students,
    required this.status,
    required this.version,
    required this.submittedBy,
    required this.canMark,
    required this.canSubmit,
  });

  final SheetSession session;
  final List<RosterStudent> students;

  /// `draft` or `submitted`. There is no unlock: a submitted register changes
  /// only by a correction, which a teacher does not hold the authority to make.
  final String status;

  /// Sent back with every write, so two teachers on one register cannot
  /// silently overwrite each other. Zero means no register exists yet.
  final int version;
  final String? submittedBy;

  /// Stated by the server, so the app never reimplements the rules to decide
  /// which controls to draw.
  final bool canMark;
  final bool canSubmit;

  bool get isSubmitted => status == 'submitted';

  static AttendanceSheet fromJson(dynamic json) {
    final map = json as Map;
    final sheet = map['sheet'] as Map;
    return AttendanceSheet(
      session: SheetSession.fromJson(map['session'] as Map),
      students: ((map['students'] as List?) ?? const [])
          .map((e) => RosterStudent.fromJson(e as Map))
          .toList(),
      status: sheet['status'] as String,
      version: (sheet['version'] as num).toInt(),
      submittedBy: sheet['submitted_by'] as String?,
      canMark: map['can_mark'] as bool? ?? false,
      canSubmit: map['can_submit'] as bool? ?? false,
    );
  }
}

/// What the teacher has marked but not yet sent.
///
/// Held apart from the server's copy on purpose. Attendance is taken in a room
/// where the network may not be, and a tap must never be lost to a failed
/// request: the draft keeps every mark until the batch succeeds.
///
/// Marks saved on this phone but not yet sent (AD-59) are held apart from both:
/// they are not unsaved, and they are not the server's yet.
class SheetDraft {
  SheetDraft(this.sheet);

  final AttendanceSheet sheet;
  final Map<String, AttendanceMark> _pending = {};
  final Map<String, AttendanceMark> _queued = {};

  /// The mark to show: what the teacher just tapped, else what is waiting on
  /// this phone, else what the server has.
  AttendanceMark? markFor(String studentId) =>
      _pending[studentId] ?? _queued[studentId] ?? _saved(studentId);

  AttendanceMark? _saved(String studentId) =>
      sheet.students.firstWhere((s) => s.studentId == studentId).mark;

  bool get hasQueued => _queued.isNotEmpty;

  /// The save went to the outbox: those marks are no longer unsaved.
  void queuePending() {
    _queued.addAll(_pending);
    _pending.clear();
  }

  /// Restores marks still waiting in the outbox onto a freshly read register.
  void applyQueued(List<Object?> marks) {
    final known = {for (final s in sheet.students) s.studentId};
    for (final entry in marks.whereType<Map>()) {
      final id = entry['student_id'] as String?;
      final mark = AttendanceMark.fromWire(entry['state'] as String?);
      if (id != null && mark != null && known.contains(id)) _queued[id] = mark;
    }
  }

  bool get isDirty => _pending.isNotEmpty;
  int get pendingCount => _pending.length;

  void mark(String studentId, AttendanceMark mark) {
    final baseline = _queued[studentId] ?? _saved(studentId);
    // Tapping back to what is already saved is not a change. Keeping it out
    // means "3 unsaved" always means three real differences.
    if (baseline == mark) {
      _pending.remove(studentId);
    } else {
      _pending[studentId] = mark;
    }
  }

  /// The common case in a full classroom: everybody is here, then tap the few
  /// who are not.
  void markAll(AttendanceMark mark) {
    for (final student in sheet.students) {
      this.mark(student.studentId, mark);
    }
  }

  void clearPending() => _pending.clear();

  /// Only what changed. A sixty-student register is one request either way, and
  /// sending the unchanged rows would overwrite marks somebody else just made.
  List<Map<String, Object?>> payload() =>
      _pending.entries.map((e) => {'student_id': e.key, 'state': e.value.wire}).toList();

  int get unmarkedCount => sheet.students.where((s) => markFor(s.studentId) == null).length;

  Map<AttendanceMark, int> get counts {
    final counts = {for (final mark in AttendanceMark.values) mark: 0};
    for (final student in sheet.students) {
      final mark = markFor(student.studentId);
      if (mark != null) counts[mark] = counts[mark]! + 1;
    }
    return counts;
  }

  /// Submission is the teacher's statement about the whole room, so it needs the
  /// whole room accounted for.
  bool get canSubmit => sheet.canSubmit && !isDirty && unmarkedCount == 0;

  /// Why the submit button is not available, in words rather than a disabled
  /// control with no explanation.
  String? get submitBlockedReason {
    if (sheet.isSubmitted) return 'This register has been submitted.';
    if (!sheet.canSubmit) return 'You cannot submit this register.';
    if (isDirty) {
      return 'Save your $pendingCount unsaved '
          '${pendingCount == 1 ? 'change' : 'changes'} first.';
    }
    if (unmarkedCount > 0) {
      return '$unmarkedCount ${unmarkedCount == 1 ? 'student has' : 'students have'} '
          'no mark yet.';
    }
    return null;
  }
}
