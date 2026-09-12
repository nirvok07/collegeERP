import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/org_unit.dart';

class OrganisationApi {
  const OrganisationApi(this._client);
  final ApiClient _client;

  /// Both lists in parallel: two small requests beat one bespoke mobile endpoint
  /// that would fork the API contract between clients.
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
}
