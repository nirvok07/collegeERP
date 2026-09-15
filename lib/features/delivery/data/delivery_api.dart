import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/class_session.dart';
import '../domain/delivery_repository.dart';

/// The teacher's own classes, and nothing else.
///
/// There is no college-wide timetable call here on purpose: that is a
/// coordinator's screen and belongs to the web console.
class DeliveryApi implements DeliveryRepository {
  const DeliveryApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<List<ClassSession>>> mySessions({required String from, required String to}) =>
      _client.get(
        '/v1/me/sessions?from=$from&to=$to',
        (data) => (data as List).map((json) => ClassSession.fromJson(json as Map)).toList(),
        // Saved by the window's length, not its dates, so tomorrow's open finds
        // today's answer (AD-9 amended); the dashboard's and the schedule's differ.
        saveAs: '/v1/me/sessions?days=${DateTime.parse(to).difference(DateTime.parse(from)).inDays}',
      );

  @override
  Future<DateTime?> mySessionsSavedAt({required String from, required String to}) => _client.savedAt(
    '/v1/me/sessions?from=$from&to=$to',
    saveAs: '/v1/me/sessions?days=${DateTime.parse(to).difference(DateTime.parse(from)).inDays}',
  );

  @override
  Future<Result<void>> markTaught(String sessionId, {required String idempotencyKey}) =>
      _client.post(
        '/v1/sessions/$sessionId/complete',
        const {},
        (_) {},
        idempotencyKey: idempotencyKey,
      );
}
