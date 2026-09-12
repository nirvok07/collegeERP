import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/attendance_repository.dart';
import '../domain/attendance_sheet.dart';

class AttendanceApi implements AttendanceRepository {
  const AttendanceApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<AttendanceSheet>> readSheet(String sessionId) =>
      _client.get('/v1/sessions/$sessionId/attendance', AttendanceSheet.fromJson);

  @override
  Future<Result<int>> saveMarks({
    required String sessionId,
    required int version,
    required List<Map<String, Object?>> marks,
    required String idempotencyKey,
  }) => _client.put(
    '/v1/sessions/$sessionId/attendance',
    {'version': version, 'marks': marks},
    (data) => ((data as Map)['version'] as num).toInt(),
    idempotencyKey: idempotencyKey,
  );

  @override
  Future<Result<void>> submit({
    required String sessionId,
    required int version,
    required String idempotencyKey,
  }) => _client.post(
    '/v1/sessions/$sessionId/attendance/submit',
    {'version': version},
    (_) {},
    idempotencyKey: idempotencyKey,
  );
}
