import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/org_unit.dart';

/// The organisation's reads and, for ADM-2 (AD-79), its writes: the same
/// endpoints the web console uses, so both clients obey one set of rules.
abstract interface class OrganisationRepository {
  Future<Result<OrgTree>> loadTree();
  Future<Result<void>> createCampus({required String name, required String code});
  Future<Result<void>> createDepartment({required String campusId, required String name, required String code});
  Future<Result<void>> renameDepartment(String id, String name);
  Future<Result<void>> archiveCampus(String id, String reason);
  Future<Result<void>> archiveDepartment(String id, String reason);
}

class OrganisationApi implements OrganisationRepository {
  const OrganisationApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}

  /// Both lists in parallel: two small requests beat one bespoke mobile endpoint
  /// that would fork the API contract between clients.
  @override
  Future<Result<OrgTree>> loadTree() async {
    final results = await Future.wait([
      _client.get('/v1/campuses', (data) =>
          (data as List).map((j) => Campus.fromJson(j as Map)).toList()),
      _client.get('/v1/departments', (data) =>
          (data as List).map((j) => Department.fromJson(j as Map)).toList()),
    ]);

    final campuses = results[0] as Result<List<Campus>>;
    final departments = results[1] as Result<List<Department>>;

    return campuses.when(
      ok: (c) => departments.when(
        ok: (d) => Ok(OrgTree(campuses: c, departments: d)),
        err: (f) => Err(f),
      ),
      err: (f) => Err(f),
    );
  }

  @override
  Future<Result<void>> createCampus({required String name, required String code}) =>
      _client.post('/v1/campuses', {'name': name, 'code': code}, _ignore);

  @override
  Future<Result<void>> createDepartment({required String campusId, required String name, required String code}) =>
      _client.post('/v1/departments', {'campus_id': campusId, 'name': name, 'code': code}, _ignore);

  @override
  Future<Result<void>> renameDepartment(String id, String name) =>
      _client.patch('/v1/departments/${Uri.encodeComponent(id)}', {'name': name}, _ignore);

  @override
  Future<Result<void>> archiveCampus(String id, String reason) =>
      _client.post('/v1/campuses/${Uri.encodeComponent(id)}/archive', {'reason': reason}, _ignore);

  @override
  Future<Result<void>> archiveDepartment(String id, String reason) =>
      _client.post('/v1/departments/${Uri.encodeComponent(id)}/archive', {'reason': reason}, _ignore);
}
