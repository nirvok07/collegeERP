import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../delivery/domain/class_session.dart';
import '../../rooms/domain/room.dart';
import '../domain/timetable.dart';

/// ADM-8 (AD-81): the endpoints the web console uses for the timetable,
/// classes and non-teaching days. One contract, one set of rules.
abstract interface class TimetableRepository {
  Future<Result<List<Slot>>> slots(String offeringId);
  Future<Result<void>> addSlot(String offeringId, {required int day, required String startsAt, required String endsAt, String? roomId});
  Future<Result<void>> removeSlot(String slotId);

  /// With [preview], nothing is written and the report says exactly what would happen.
  Future<Result<GenerationReport>> generate(String offeringId, {required bool preview});
  Future<Result<List<Room>>> rooms();
  Future<Result<List<ClassSession>>> sessions({required String from, required String to});
  Future<Result<void>> reschedule(
    String sessionId, {
    required String date,
    required String startsAt,
    required String endsAt,
    String? roomId,
    String? reason,
  });
  Future<Result<void>> cancel(String sessionId, String reason);
  Future<Result<List<Holiday>>> holidays();
  Future<Result<void>> addHoliday(String onDate, String label);
  Future<Result<void>> removeHoliday(String id);
}

class TimetableApi implements TimetableRepository {
  const TimetableApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}
  static String _enc(String s) => Uri.encodeComponent(s);

  @override
  Future<Result<List<Slot>>> slots(String offeringId) =>
      _client.get('/v1/slots?offering_id=${_enc(offeringId)}', (data) => (data as List).map(Slot.fromJson).toList());

  @override
  Future<Result<void>> addSlot(String offeringId, {required int day, required String startsAt, required String endsAt, String? roomId}) =>
      _client.post(
        '/v1/offerings/${_enc(offeringId)}/slots',
        {'day_of_week': day, 'starts_at': startsAt, 'ends_at': endsAt, 'room_id': roomId},
        _ignore,
      );

  @override
  Future<Result<void>> removeSlot(String slotId) => _client.delete('/v1/slots/${_enc(slotId)}', _ignore);

  @override
  Future<Result<GenerationReport>> generate(String offeringId, {required bool preview}) =>
      _client.post('/v1/offerings/${_enc(offeringId)}/sessions', {'preview': preview}, GenerationReport.fromJson);

  @override
  Future<Result<List<Room>>> rooms() => _client.get('/v1/rooms', (data) => (data as List).map(Room.fromJson).toList());

  @override
  Future<Result<List<ClassSession>>> sessions({required String from, required String to}) => _client.get(
    '/v1/sessions?from=$from&to=$to',
    (data) => (data as List).map((j) => ClassSession.fromJson(j as Map)).toList(),
  );

  @override
  Future<Result<void>> reschedule(
    String sessionId, {
    required String date,
    required String startsAt,
    required String endsAt,
    String? roomId,
    String? reason,
  }) => _client.post(
    '/v1/sessions/${_enc(sessionId)}/reschedule',
    {'session_date': date, 'starts_at': startsAt, 'ends_at': endsAt, 'room_id': roomId, 'reason': ?reason},
    _ignore,
  );

  @override
  Future<Result<void>> cancel(String sessionId, String reason) =>
      _client.post('/v1/sessions/${_enc(sessionId)}/cancel', {'reason': reason}, _ignore);

  @override
  Future<Result<List<Holiday>>> holidays() =>
      _client.get('/v1/non-teaching-days', (data) => (data as List).map(Holiday.fromJson).toList());

  @override
  Future<Result<void>> addHoliday(String onDate, String label) =>
      _client.post('/v1/non-teaching-days', {'on_date': onDate, 'label': label}, _ignore);

  @override
  Future<Result<void>> removeHoliday(String id) => _client.delete('/v1/non-teaching-days/${_enc(id)}', _ignore);
}
