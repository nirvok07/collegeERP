import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';

/// ADM-1: the College Admin dashboard's numbers, from `GET /v1/college/overview`.
class CollegeOverview {
  const CollegeOverview({
    required this.staff,
    required this.students,
    required this.departments,
    required this.programs,
    required this.sections,
    required this.offerings,
    required this.rooms,
    required this.pendingInvitations,
  });

  final int staff;
  final int students;
  final int departments;
  final int programs;
  final int sections;
  final int offerings;
  final int rooms;
  final int pendingInvitations;

  static CollegeOverview fromJson(dynamic json) {
    final m = json as Map;
    int n(String k) => (m[k] as num?)?.toInt() ?? 0;
    return CollegeOverview(
      staff: n('staff'),
      students: n('students'),
      departments: n('departments'),
      programs: n('programs'),
      sections: n('sections'),
      offerings: n('offerings'),
      rooms: n('rooms'),
      pendingInvitations: n('pending_invitations'),
    );
  }
}

abstract interface class OverviewRepository {
  Future<Result<CollegeOverview>> load();
}

class OverviewApi implements OverviewRepository {
  const OverviewApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<CollegeOverview>> load() => _client.get('/v1/college/overview', CollegeOverview.fromJson);
}
