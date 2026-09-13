import 'dart:async';

import 'package:flutter/foundation.dart';

import '../error/result.dart';
import '../outbox/offline_writes.dart';
import '../outbox/outbox.dart';
import '../outbox/outbox_replayer.dart';
import '../outbox/outbox_storage.dart';
import '../session/session_manager.dart';
import '../../features/assessment/domain/assessment_repository.dart';
import '../../features/attendance/domain/attendance_repository.dart';
import '../../features/delivery/domain/delivery_repository.dart';
import 'locator.dart';

/// Replays a queued write through the same repositories, and so the same API
/// client, renewal and idempotency header, as the screen that made it.
class RepositoryOutboxSender implements OutboxSender {
  RepositoryOutboxSender({
    required AttendanceRepository attendance,
    required DeliveryRepository delivery,
    required AssessmentRepository assessment,
  }) : _attendance = attendance,
       _delivery = delivery,
       _assessment = assessment;

  final AttendanceRepository _attendance;
  final DeliveryRepository _delivery;
  final AssessmentRepository _assessment;

  @override
  Future<Result<int?>> send(OutboxItem item, int? version) async {
    final id = item.targetId;
    final key = item.idempotencyKey;
    return switch (item.kind) {
      OutboxKind.attendanceSave => _version(
        await _attendance.saveMarks(
          sessionId: id,
          version: version!,
          marks: _marks(item),
          idempotencyKey: key,
        ),
      ),
      OutboxKind.attendanceSubmit => _none(
        await _attendance.submit(sessionId: id, version: version!, idempotencyKey: key),
      ),
      OutboxKind.sessionTaught => _none(await _delivery.markTaught(id, idempotencyKey: key)),
      OutboxKind.assessmentHeldOn => _version(
        await _assessment.recordHeldOn(
          componentId: id,
          version: version!,
          heldOn: item.payload['held_on']! as String,
          idempotencyKey: key,
        ),
      ),
      OutboxKind.assessmentMarks => _version(
        await _assessment.saveMarks(
          componentId: id,
          version: version!,
          marks: _marks(item),
          idempotencyKey: key,
        ),
      ),
      OutboxKind.assessmentSubmit => _none(
        await _assessment.submit(componentId: id, version: version!, idempotencyKey: key),
      ),
    };
  }

  static List<Map<String, Object?>> _marks(OutboxItem item) => (item.payload['marks']! as List)
      .whereType<Map>()
      .map((m) => m.cast<String, Object?>())
      .toList();

  static Result<int?> _version(Result<int> r) =>
      r.when(ok: (v) => Ok<int?>(v), err: (f) => Err<int?>(f));

  static Result<int?> _none(Result<void> r) =>
      r.when(ok: (_) => const Ok<int?>(null), err: (f) => Err<int?>(f));
}

/// Opens the encrypted outbox and registers it (AD-59).
///
/// If it cannot be opened, nothing is registered and every write behaves
/// exactly as it did before the outbox existed: online, with its failure shown.
Future<void> configureOutbox() async {
  try {
    final opened = await openOutboxDatabase(
      keys: SecureDatabaseKeyStore(),
      file: await defaultOutboxFile(),
    );
    final outbox = Outbox(opened.database);
    final session = locator<SessionManager>();

    OutboxScope? scope() {
      final actor = session.actor;
      final tenantId = actor?.tenantId;
      if (actor == null || tenantId == null) return null;
      return OutboxScope(tenantId: tenantId, personId: actor.id);
    }

    final replayer = OutboxReplayer(
      outbox: outbox,
      scope: scope,
      sender: RepositoryOutboxSender(
        attendance: locator<AttendanceRepository>(),
        delivery: locator<DeliveryRepository>(),
        assessment: locator<AssessmentRepository>(),
      ),
    );
    locator
      ..registerSingleton(outbox)
      ..registerSingleton(replayer)
      ..registerSingleton(
        OfflineWrites(
          outbox: outbox,
          replayer: replayer,
          scope: scope,
          clearedOnOpen: opened.recreated,
        ),
      );

    session.events.listen((event) {
      switch (event) {
        case SignedIn() || SessionRecovered():
          unawaited(replayer.resume());
        case SignedOut():
          replayer.stop();
        default:
          break;
      }
    });
    unawaited(replayer.start());
  } catch (e) {
    // The type only: the message could carry a path, and nothing here is
    // worth a payload in a log.
    debugPrint('Offline outbox unavailable: ${e.runtimeType}');
  }
}

/// The outbox when it opened, else null: writes then behave exactly as they
/// did before it existed.
OfflineWrites? get offlineWrites =>
    locator.isRegistered<OfflineWrites>() ? locator<OfflineWrites>() : null;
