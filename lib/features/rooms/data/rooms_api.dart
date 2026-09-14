import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../organisation/domain/org_unit.dart';
import '../domain/room.dart';

/// ADM-5 (AD-81): the endpoints the web console uses for rooms.
abstract interface class RoomsRepository {
  Future<Result<List<Room>>> rooms();
  Future<Result<List<Campus>>> campuses();
  Future<Result<void>> createRoom({
    required String campusId,
    required String code,
    required String name,
    required String kind,
    int? capacity,
  });
  Future<Result<void>> updateRoom(String id, {required String name, required String kind, int? capacity});
  Future<Result<void>> archiveRoom(String id);
}

class RoomsApi implements RoomsRepository {
  const RoomsApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}

  @override
  Future<Result<List<Room>>> rooms() => _client.get('/v1/rooms', (data) => (data as List).map(Room.fromJson).toList());

  @override
  Future<Result<List<Campus>>> campuses() =>
      _client.get('/v1/campuses', (data) => (data as List).map((j) => Campus.fromJson(j as Map)).toList());

  @override
  Future<Result<void>> createRoom({
    required String campusId,
    required String code,
    required String name,
    required String kind,
    int? capacity,
  }) => _client.post(
    '/v1/rooms',
    {'campus_id': campusId, 'code': code, 'name': name, 'kind': kind, 'capacity': capacity},
    _ignore,
  );

  @override
  Future<Result<void>> updateRoom(String id, {required String name, required String kind, int? capacity}) =>
      _client.patch('/v1/rooms/${Uri.encodeComponent(id)}', {'name': name, 'kind': kind, 'capacity': capacity}, _ignore);

  @override
  Future<Result<void>> archiveRoom(String id) =>
      _client.post('/v1/rooms/${Uri.encodeComponent(id)}/archive', const <String, Object?>{}, _ignore);
}
