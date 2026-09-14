/// ADM-3 (AD-81): programs and the academic calendar, as the phone needs them.
/// Field names mirror the API so a reader moves between clients without translating.
class Program {
  const Program({
    required this.id,
    required this.name,
    required this.code,
    required this.award,
    required this.departmentId,
    required this.departmentName,
    required this.durationYears,
    required this.termType,
    required this.publishedVersions,
  });

  final String id;
  final String name;
  final String code;
  final String? award;
  final String departmentId;
  final String departmentName;
  final num durationYears;
  final String termType;
  final int publishedVersions;

  String get durationLabel {
    final years = durationYears == durationYears.roundToDouble() ? durationYears.toInt().toString() : '$durationYears';
    return '$years ${durationYears == 1 ? 'year' : 'years'}, ${termType == 'annual' ? 'annual' : 'semesters'}';
  }

  static Program fromJson(dynamic json) {
    final m = json as Map;
    return Program(
      id: m['id'] as String,
      name: m['name'] as String,
      code: m['code'] as String,
      award: m['award'] as String?,
      departmentId: m['department_id'] as String,
      departmentName: m['department_name'] as String? ?? '',
      durationYears: m['duration_years'] as num? ?? 0,
      termType: m['term_type'] as String? ?? 'semester',
      publishedVersions: (m['published_versions'] as num?)?.toInt() ?? 0,
    );
  }
}

class ProgramInput {
  const ProgramInput({
    required this.departmentId,
    required this.name,
    required this.code,
    required this.durationYears,
    required this.termType,
    this.award,
  });

  final String departmentId;
  final String name;
  final String code;
  final String? award;
  final num durationYears;
  final String termType;

  Map<String, Object?> toJson() => {
        'department_id': departmentId,
        'name': name.trim(),
        'code': code.trim(),
        if (award != null && award!.trim().isNotEmpty) 'award': award!.trim(),
        'duration_years': durationYears,
        'term_type': termType,
      };
}

class AcademicYear {
  const AcademicYear({
    required this.id,
    required this.name,
    required this.startsOn,
    required this.endsOn,
    required this.isCurrent,
    required this.status,
  });

  final String id;
  final String name;
  final DateTime startsOn;
  final DateTime endsOn;
  final bool isCurrent;
  final String status;

  static AcademicYear fromJson(dynamic json) {
    final m = json as Map;
    return AcademicYear(
      id: m['id'] as String,
      name: m['name'] as String,
      startsOn: DateTime.parse(m['starts_on'] as String),
      endsOn: DateTime.parse(m['ends_on'] as String),
      isCurrent: m['is_current'] as bool? ?? false,
      status: m['status'] as String? ?? '',
    );
  }
}

class Term {
  const Term({
    required this.id,
    required this.academicYearId,
    required this.sequence,
    required this.name,
    required this.startsOn,
    required this.endsOn,
  });

  final String id;
  final String academicYearId;
  final int sequence;
  final String name;
  final DateTime startsOn;
  final DateTime endsOn;

  static Term fromJson(dynamic json) {
    final m = json as Map;
    return Term(
      id: m['id'] as String,
      academicYearId: m['academic_year_id'] as String,
      sequence: (m['sequence'] as num).toInt(),
      name: m['name'] as String,
      startsOn: DateTime.parse(m['starts_on'] as String),
      endsOn: DateTime.parse(m['ends_on'] as String),
    );
  }
}

/// The API's date shape, YYYY-MM-DD, with no time zone to shift it.
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// How a date reads on screen: 1 Jun 2026.
String shortDate(DateTime d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${months[d.month - 1]} ${d.year}';
}

/// Smart defaults for a new academic year: June to May, the usual Indian college year.
({String name, DateTime startsOn, DateTime endsOn}) suggestYear(DateTime today, List<AcademicYear> years) {
  final latest = years.isEmpty ? null : years.reduce((a, b) => a.endsOn.isAfter(b.endsOn) ? a : b);
  final start = latest != null
      ? latest.endsOn.add(const Duration(days: 1))
      : DateTime(today.month >= 6 ? today.year : today.year - 1, 6, 1);
  final end = DateTime(start.year + 1, start.month, start.day).subtract(const Duration(days: 1));
  return (name: '${start.year}-${(end.year % 100).toString().padLeft(2, '0')}', startsOn: start, endsOn: end);
}

/// Smart defaults for the next term of a year: it starts where the last one
/// ended and runs half the year, never past the year's end.
({int sequence, String name, DateTime startsOn, DateTime endsOn}) suggestTerm(AcademicYear year, List<Term> terms) {
  final sequence = terms.length + 1;
  final last = terms.isEmpty ? null : terms.reduce((a, b) => a.sequence > b.sequence ? a : b);
  final start = last == null ? year.startsOn : last.endsOn.add(const Duration(days: 1));
  var end = DateTime(start.year, start.month + 6, start.day).subtract(const Duration(days: 1));
  if (end.isAfter(year.endsOn) || sequence >= 2) end = year.endsOn;
  return (sequence: sequence, name: 'Semester $sequence', startsOn: start, endsOn: end);
}
