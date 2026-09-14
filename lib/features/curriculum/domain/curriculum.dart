/// ADM-4 (AD-81): the course catalogue and curriculum versions, as the phone
/// needs them. Field names mirror the API.
class Course {
  const Course({required this.id, required this.code, required this.title, this.description, this.usedInVersions = 0});

  final String id;
  final String code;
  final String title;
  final String? description;
  final int usedInVersions;

  static Course fromJson(dynamic json) {
    final m = json as Map;
    return Course(
      id: m['id'] as String,
      code: m['code'] as String,
      title: m['title'] as String,
      description: m['description'] as String?,
      usedInVersions: (m['used_in_versions'] as num?)?.toInt() ?? 0,
    );
  }
}

class CurriculumVersion {
  const CurriculumVersion({
    required this.id,
    required this.programId,
    required this.programName,
    required this.regulationYear,
    required this.revision,
    required this.status,
    required this.totalTerms,
    required this.editable,
    this.title,
    this.courseCount = 0,
    this.totalCredits = 0,
  });

  final String id;
  final String programId;
  final String programName;
  final int regulationYear;
  final int revision;
  final String? title;
  final String status;
  final int totalTerms;
  final int courseCount;
  final num totalCredits;

  /// Stated by the server, never inferred, so no client offers an edit the database refuses.
  final bool editable;

  String get label => 'Regulation $regulationYear${revision > 1 ? ', revision $revision' : ''}';

  String get statusLabel => switch (status) {
        'draft' => 'Draft',
        'published' => 'Published',
        'superseded' => 'Superseded',
        'discarded' => 'Discarded',
        _ => status,
      };

  /// Why it cannot be edited, in words a registrar would use.
  String? get readOnlyReason => editable
      ? null
      : switch (status) {
          'published' =>
            'Published curricula cannot be changed: students admitted under it follow exactly these requirements. '
                'To correct or change it, start a new version.',
          'superseded' => 'Superseded, but it still governs the students admitted under it, so it stays as published.',
          _ => 'This version cannot be edited.',
        };

  static CurriculumVersion fromJson(dynamic json) {
    final m = json as Map;
    return CurriculumVersion(
      id: m['id'] as String,
      programId: m['program_id'] as String,
      programName: m['program_name'] as String? ?? '',
      regulationYear: (m['regulation_year'] as num).toInt(),
      revision: (m['revision'] as num?)?.toInt() ?? 1,
      title: m['title'] as String?,
      status: m['status'] as String,
      totalTerms: (m['total_terms'] as num).toInt(),
      courseCount: (m['course_count'] as num?)?.toInt() ?? 0,
      totalCredits: m['total_credits'] as num? ?? 0,
      editable: m['editable'] as bool? ?? false,
    );
  }
}

class TermEntry {
  const TermEntry({
    required this.id,
    required this.courseId,
    required this.code,
    required this.title,
    required this.credits,
    required this.requirement,
    this.electiveGroup,
  });

  final String id;
  final String courseId;
  final String code;
  final String title;
  final num credits;
  final String requirement;
  final String? electiveGroup;

  static TermEntry fromJson(dynamic json) {
    final m = json as Map;
    return TermEntry(
      id: m['id'] as String,
      courseId: m['course_id'] as String,
      code: m['code'] as String,
      title: m['title'] as String,
      credits: m['credits'] as num? ?? 0,
      requirement: m['requirement'] as String? ?? 'core',
      electiveGroup: m['elective_group'] as String?,
    );
  }
}

class CurriculumTerm {
  const CurriculumTerm({required this.number, required this.courses, required this.credits});

  final int number;
  final List<TermEntry> courses;
  final num credits;

  static CurriculumTerm fromJson(dynamic json) {
    final m = json as Map;
    return CurriculumTerm(
      number: (m['term_number'] as num).toInt(),
      courses: ((m['courses'] as List?) ?? const []).map(TermEntry.fromJson).toList(),
      credits: m['credits'] as num? ?? 0,
    );
  }
}

class VersionDetail {
  const VersionDetail({required this.version, required this.terms});

  final CurriculumVersion version;
  final List<CurriculumTerm> terms;

  /// Terms with no courses. The server refuses publication while any remain.
  List<int> get emptyTerms => [for (final t in terms) if (t.courses.isEmpty) t.number];

  Set<String> get courseIds => {for (final t in terms) for (final c in t.courses) c.courseId};

  static VersionDetail fromJson(dynamic json) => VersionDetail(
        version: CurriculumVersion.fromJson(json),
        terms: (((json as Map)['terms'] as List?) ?? const []).map(CurriculumTerm.fromJson).toList(),
      );
}

/// A credit count as people write it: 3, or 1.5.
String creditsLabel(num credits) =>
    '${credits == credits.roundToDouble() ? credits.toInt() : credits} ${credits == 1 ? 'credit' : 'credits'}';
