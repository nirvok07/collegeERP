import 'dart:async';

import 'package:flutter/widgets.dart';

import '../error/failure.dart';
import '../error/result.dart';
import 'outbox.dart';

/// Sends one queued write through the existing API client and its renewal.
abstract interface class OutboxSender {
  /// The new version where the server returns one.
  Future<Result<int?>> send(OutboxItem item, int? version);
}

/// Drains the outbox: one pass at a time, in order within each record, with
/// bounded backoff (docs/03 §3.7, AD-59).
class OutboxReplayer {
  OutboxReplayer({
    required Outbox outbox,
    required OutboxSender sender,
    required OutboxScope? Function() scope,
    DateTime Function()? clock,
  }) : _outbox = outbox,
       _sender = sender,
       _scope = scope,
       _clock = clock ?? DateTime.now;

  final Outbox _outbox;
  final OutboxSender _sender;
  final OutboxScope? Function() _scope;
  final DateTime Function() _clock;

  static const backoff = [
    Duration(seconds: 2),
    Duration(seconds: 8),
    Duration(seconds: 30),
    Duration(minutes: 2),
    Duration(minutes: 10),
  ];

  /// A server that keeps failing needs a person. A missing network does not,
  /// so transport failures keep retrying at the longest interval.
  static const maxServerAttempts = 6;

  Future<void>? _running;
  bool _again = false;
  bool _paused = false;
  Timer? _wake;
  AppLifecycleListener? _lifecycle;

  static Duration delayFor(int attempts) =>
      backoff[(attempts - 1).clamp(0, backoff.length - 1)];

  Future<void> start({bool observeLifecycle = true}) async {
    await _outbox.recoverInterrupted();
    await _outbox.cleanup();
    if (observeLifecycle) {
      _lifecycle ??= AppLifecycleListener(onResume: () => unawaited(drain()));
    }
    await drain();
  }

  /// After a sign-in or a recovered session.
  Future<void> resume() {
    _paused = false;
    return drain();
  }

  void stop() {
    _wake?.cancel();
    _wake = null;
  }

  void dispose() {
    stop();
    _lifecycle?.dispose();
  }

  /// Single-flight. A request during a pass runs one more pass afterwards
  /// rather than a second pass alongside it.
  Future<void> drain() {
    final running = _running;
    if (running != null) {
      _again = true;
      return running;
    }
    return _running = _loop().whenComplete(() => _running = null);
  }

  Future<void> _loop() async {
    do {
      _again = false;
      await _pass();
    } while (_again);
    await _scheduleWake();
  }

  Future<void> _pass() async {
    if (_paused) return;
    final scope = _scope();
    if (scope == null) return;
    while (true) {
      final item = await _outbox.claimNext(scope);
      if (item == null) return;
      if (!await _send(item)) return;
    }
  }

  /// Returns whether the pass should continue.
  Future<bool> _send(OutboxItem item) async {
    int? version;
    if (item.kind.needsVersion) {
      version = await _outbox.versionFor(item);
      if (version == null) {
        await _outbox.markFailed(
          item.id,
          'This change depended on an earlier one that did not go through. '
          'Discard it and enter it again.',
        );
        return true;
      }
    }

    final result = await _sender.send(item, version);
    switch (result) {
      case Ok(:final value):
        await _outbox.markSynced(item.id, value);
        return true;
      case Err(:final failure):
        return _handle(item, failure);
    }
  }

  Future<bool> _handle(OutboxItem item, Failure failure) async {
    final attempts = item.attempts + 1;
    switch (failure.code) {
      case FailureCode.network:
        await _outbox.retryLater(
          item.id,
          attempts: attempts,
          at: _clock().add(delayFor(attempts)),
          message: failure.message,
        );
        // No network for this write means none for the next either.
        return false;
      case FailureCode.server:
        if (attempts >= maxServerAttempts) {
          await _outbox.markFailed(item.id, failure.message, attempts: attempts);
        } else {
          await _outbox.retryLater(
            item.id,
            attempts: attempts,
            at: _clock().add(delayFor(attempts)),
            message: failure.message,
          );
        }
        return true;
      case FailureCode.unauthenticated:
        // The client already tried to renew. Wait for a sign-in by the same
        // person; never drop the write and never sign anybody out from here.
        await _outbox.release(item.id);
        _paused = true;
        return false;
      case FailureCode.conflict:
        await _outbox.markConflict(item.id, failure.message);
        return true;
      default:
        await _outbox.markFailed(item.id, failure.message, attempts: attempts);
        return true;
    }
  }

  Future<void> _scheduleWake() async {
    _wake?.cancel();
    _wake = null;
    final scope = _scope();
    if (_paused || scope == null) return;
    final due = await _outbox.nextDue(scope);
    if (due == null) return;
    final wait = due.difference(_clock());
    _wake = Timer(wait.isNegative ? Duration.zero : wait, () => unawaited(drain()));
  }
}
