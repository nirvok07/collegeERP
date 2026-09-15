/// The organisational tree, assembled on the client.
///
/// The API returns two flat lists by design (AD-29), so each client arranges
/// them for its own layout: the web console nests everything at once, a phone
/// drills down one level at a time.
class Campus {
  const Campus({
    required this.id,
    required this.name,
    required this.code,
    required this.isDefault,
    required this.departmentCount,
    this.fence,
  });

  final String id;
  final String name;
  final String code;
  final bool isDefault;
  final int departmentCount;

  /// SA-A1 (AD-83): where staff punch in and out; null when not set.
  final CampusFence? fence;

  static Campus fromJson(Map json) => Campus(
        id: json['id'] as String,
        name: json['name'] as String,
        code: json['code'] as String,
        isDefault: json['is_default'] as bool? ?? false,
        departmentCount: json['department_count'] as int? ?? 0,
        fence: CampusFence.fromJson(json['fence']),
      );
}

/// SA-A1: a circle around the campus's own location, radius in metres.
class CampusFence {
  const CampusFence({required this.latitude, required this.longitude, required this.radiusM});

  final double latitude;
  final double longitude;
  final int radiusM;

  static const minRadius = 25;
  static const maxRadius = 2000;
  static const defaultRadius = 200;

  Map<String, Object> toJson() => {'latitude': latitude, 'longitude': longitude, 'radius_m': radiusM};

  static CampusFence? fromJson(Object? json) {
    if (json is! Map) return null;
    return CampusFence(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      radiusM: (json['radius_m'] as num).toInt(),
    );
  }
}

class Department {
  const Department({
    required this.id,
    required this.name,
    required this.code,
    required this.campusId,
    required this.campusName,
  });

  final String id;
  final String name;
  final String code;
  final String campusId;
  final String campusName;

  static Department fromJson(Map json) => Department(
        id: json['id'] as String,
        name: json['name'] as String,
        code: json['code'] as String,
        campusId: json['campus_id'] as String,
        campusName: json['campus_name'] as String? ?? '',
      );
}

class OrgTree {
  const OrgTree({required this.campuses, required this.departments});

  final List<Campus> campuses;
  final List<Department> departments;

  List<Department> departmentsOf(String campusId) =>
      departments.where((d) => d.campusId == campusId).toList();

  int get totalDepartments => departments.length;
}
