import 'dart:async';

import '../error/failure.dart';
import '../error/result.dart';
import 'outbox.dart';
import 'outbox_replayer.dart';

/// What happened to a write the teacher made.
sealed class WriteOutcome<T> {
  const WriteOutcome();
}

/// The server has it.
final class Sent<T> extends WriteOutcome<T> {
  const Sent(this.value);
  final T value;
}

/// Saved on this phone, to be sent when the server can be reached.
final class Queued<T> extends WriteOutcome<T> {
  const Queued();
}

/// The server said no. Nothing was queued.
final class Refused<T> extends WriteOutcome<T> {
  const Refused(this.failure);
  final Failure failure;
}

/// The online-or-queue decision for the six approved writes.
///
/// Online first, exactly as before. A write is queued only when the server
/// cannot be reached, or when an earlier write to the same record is still
/// waiting, because sending past it would arrive out of order.
class OfflineWrites {
  OfflineWrites({
    required Outbox outbox,
    required OutboxReplayer replayer,
    required OutboxScope? Function() scope,
    this.clearedOnOpen = false,
  }) : _outbox = outbox,
       _replayer = replayer,
       _scope = scope;

  /// The stored key could not read the existing file, so it was replaced and
  /// anything it held is gone. Said once, never silently.
  final bool clearedOnOpen;

  final Outbox _outbox;
  final OutboxReplayer _replayer;
  final OutboxScope? Function() _scope;

  Future<WriteOutcome<T>> run<T>({
    required OutboxKind kind,
    required String targetId,
    required Map<String, Object?> payload,
    required String idempotencyKey,
    required String label,
    required Future<Result<T>> Function() online,
    int? baseVersion,
  }) async {
    final scope = _scope();
    if (scope != null && await _outbox.hasUnsynced(scope, kind.lane, targetId)) {
      return _queue(scope, kind, targetId, payload, idempotencyKey, label, baseVersion);
    }

    final result = await online();
    switch (result) {
      case Ok(:final value):
        return Sent(value);
      case Err(:final failure):
        if (scope == null || !failure.isTransient) return Refused(failure);
        // The same key as the attempt that just failed: if that request did
        // reach the server, the replay returns its outcome (AD-58).
        return _queue(scope, kind, targetId, payload, idempotencyKey, label, baseVersion);
    }
  }

  Future<WriteOutcome<T>> _queue<T>(
    OutboxScope scope,
    OutboxKind kind,
    String targetId,
    Map<String, Object?> payload,
    String idempotencyKey,
    String label,
    int? baseVersion,
  ) async {
    await _outbox.enqueue(
      scope,
      kind: kind,
      targetId: targetId,
      payload: payload,
      idempotencyKey: idempotencyKey,
      label: label,
      baseVersion: baseVersion,
    );
    unawaited(_replayer.drain());
    return const Queued();
  }

  Stream<List<OutboxItem>> watch(OutboxLane lane, String targetId) {
    final scope = _scope();
    if (scope == null) return Stream.value(const []);
    return _outbox.watchUnsynced(scope, lane: lane, targetId: targetId);
  }

  Stream<List<OutboxItem>> watchAll() {
    final scope = _scope();
    if (scope == null) return Stream.value(const []);
    return _outbox.watchUnsynced(scope);
  }

  Future<List<OutboxItem>> waiting(OutboxLane lane, String targetId) async {
    final scope = _scope();
    if (scope == null) return const [];
    return _outbox.unsynced(scope, lane: lane, targetId: targetId);
  }

  Future<int> waitingCount() async {
    final scope = _scope();
    return scope == null ? 0 : _outbox.unsyncedCount(scope);
  }

  Future<void> sendNow() async {
    final scope = _scope();
    if (scope == null) return;
    await _outbox.clearBackoff(scope);
    await _replayer.resume();
  }

  Future<void> retry(int id) async {
    final scope = _scope();
    if (scope == null) return;
    await _outbox.retry(scope, id);
    await _replayer.resume();
  }

  Future<int> discard(int id) async {
    final scope = _scope();
    return scope == null ? 0 : _outbox.discard(scope, id);
  }

  /// Explicit sign-out only. An expired session keeps the queue for the same
  /// person's next sign-in.
  Future<void> purgeCurrent() async {
    final scope = _scope();
    if (scope != null) await _outbox.purge(scope);
  }
}
