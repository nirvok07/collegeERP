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
  });

  final String id;
  final String name;
  final String code;
  final bool isDefault;
  final int departmentCount;

  static Campus fromJson(Map json) => Campus(
        id: json['id'] as String,
        name: json['name'] as String,
        code: json['code'] as String,
        isDefault: json['is_default'] as bool? ?? false,
        departmentCount: json['department_count'] as int? ?? 0,
      );
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
