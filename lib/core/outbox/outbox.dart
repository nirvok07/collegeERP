import 'dart:convert';

import 'package:drift/drift.dart';

import 'outbox_database.dart';

/// The six writes that may wait on a phone (AD-59). Closed on purpose: nothing
/// else can be queued, by type.
enum OutboxKind {
  attendanceSave(OutboxLane.attendance),
  attendanceSubmit(OutboxLane.attendance),
  sessionTaught(OutboxLane.session),
  assessmentHeldOn(OutboxLane.assessment),
  assessmentMarks(OutboxLane.assessment),
  assessmentSubmit(OutboxLane.assessment);

  const OutboxKind(this.lane);
  final OutboxLane lane;

  /// Recording a class as taught is guarded by its state, not a version.
  bool get needsVersion => this != sessionTaught;

  bool get isSubmission => this == attendanceSubmit || this == assessmentSubmit;
}

/// The record a write changes. Taught and attendance share a class session but
/// are separate records, so they never wait on each other.
enum OutboxLane { attendance, session, assessment }

enum OutboxState {
  pending,
  sending,
  synced,
  failed,
  conflict;

  bool get needsAttention => this == failed || this == conflict;
}

/// Whose writes these are. Writes are only ever sent under the same person in
/// the same college, so one teacher's queue can never replay as another's.
class OutboxScope {
  const OutboxScope({required this.tenantId, required this.personId});
  final String tenantId;
  final String personId;
}

class OutboxItem {
  const OutboxItem({
    required this.id,
    required this.kind,
    required this.targetId,
    required this.payload,
    required this.baseVersion,
    required this.predecessorId,
    required this.idempotencyKey,
    required this.label,
    required this.state,
    required this.attempts,
    required this.errorMessage,
    required this.createdAt,
  });

  final int id;
  final OutboxKind kind;
  final String targetId;
  final Map<String, Object?> payload;
  final int? baseVersion;
  final int? predecessorId;
  final String idempotencyKey;
  final String label;
  final OutboxState state;
  final int attempts;
  final String? errorMessage;
  final DateTime createdAt;

  static OutboxItem fromRow(OutboxRow row) => OutboxItem(
    id: row.id,
    kind: OutboxKind.values.byName(row.kind),
    targetId: row.targetId,
    payload: (jsonDecode(row.payload) as Map).cast<String, Object?>(),
    baseVersion: row.baseVersion,
    predecessorId: row.predecessorId,
    idempotencyKey: row.idempotencyKey,
    label: row.label,
    state: OutboxState.values.byName(row.state),
    attempts: row.attempts,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  );

  /// Deliberately without the payload: this is what may reach a log.
  @override
  String toString() => 'OutboxItem($id ${kind.name} ${state.name})';
}

String _lane(OutboxLane lane, String targetId) => '${lane.name}:$targetId';

/// The durable queue itself. Knows nothing about HTTP.
class Outbox {
  Outbox(this._db, {DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final OutboxDatabase _db;
  final DateTime Function() _clock;

  static const _unsynced = ['pending', 'sending', 'failed', 'conflict'];

  /// How long a sent write is kept, matching the server's key lifetime (AD-58).
  static const keepSynced = Duration(hours: 24);

  $OutboxEntriesTable get _t => _db.outboxEntries;

  Expression<bool> _mine(OutboxScope s) =>
      _t.tenantId.equals(s.tenantId) & _t.personId.equals(s.personId);

  Future<int> enqueue(
    OutboxScope scope, {
    required OutboxKind kind,
    required String targetId,
    required Map<String, Object?> payload,
    required String idempotencyKey,
    required String label,
    int? baseVersion,
  }) {
    final lane = _lane(kind.lane, targetId);
    return _db.transaction(() async {
      final previous =
          await (_db.select(_t)
                ..where((t) => _mine(scope) & t.lane.equals(lane) & t.state.isIn(_unsynced))
                ..orderBy([(t) => OrderingTerm.desc(t.id)])
                ..limit(1))
              .getSingleOrNull();
      final now = _clock();
      return _db.into(_t).insert(
        OutboxEntriesCompanion.insert(
          kind: kind.name,
          tenantId: scope.tenantId,
          personId: scope.personId,
          lane: lane,
          targetId: targetId,
          payload: jsonEncode(payload),
          baseVersion: Value(previous == null ? baseVersion : null),
          predecessorId: Value(previous?.id),
          idempotencyKey: idempotencyKey,
          label: label,
          state: OutboxState.pending.name,
          createdAt: now,
          updatedAt: now,
        ),
      );
    });
  }

  Future<bool> hasUnsynced(OutboxScope scope, OutboxLane lane, String targetId) async =>
      (await unsynced(scope, lane: lane, targetId: targetId)).isNotEmpty;

  SimpleSelectStatement<$OutboxEntriesTable, OutboxRow> _unsyncedQuery(
    OutboxScope scope, {
    OutboxLane? lane,
    String? targetId,
  }) {
    return _db.select(_t)
      ..where((t) {
        var where = _mine(scope) & t.state.isIn(_unsynced);
        if (lane != null && targetId != null) where &= t.lane.equals(_lane(lane, targetId));
        return where;
      })
      ..orderBy([(t) => OrderingTerm.asc(t.id)]);
  }

  Future<List<OutboxItem>> unsynced(OutboxScope scope, {OutboxLane? lane, String? targetId}) async =>
      (await _unsyncedQuery(scope, lane: lane, targetId: targetId).get())
          .map(OutboxItem.fromRow)
          .toList();

  Stream<List<OutboxItem>> watchUnsynced(OutboxScope scope, {OutboxLane? lane, String? targetId}) =>
      _unsyncedQuery(scope, lane: lane, targetId: targetId)
          .watch()
          .map((rows) => rows.map(OutboxItem.fromRow).toList());

  /// Takes the next write that may be sent, marking it `sending` in the same
  /// transaction so no second drain can take it too.
  ///
  /// Only the oldest unsent write in each lane is eligible. A lane whose head
  /// failed or conflicted stops there: nothing behind it is sent on a guess.
  Future<OutboxItem?> claimNext(OutboxScope scope) => _db.transaction(() async {
    final now = _clock();
    final rows = await _unsyncedQuery(scope).get();
    final seen = <String>{};
    for (final row in rows) {
      if (!seen.add(row.lane)) continue;
      if (row.state != OutboxState.pending.name) continue;
      if (row.nextAttemptAt != null && row.nextAttemptAt!.isAfter(now)) continue;
      final claimed =
          await (_db.update(_t)..where(
                (t) => t.id.equals(row.id) & t.state.equals(OutboxState.pending.name),
              ))
              .write(
                OutboxEntriesCompanion(
                  state: Value(OutboxState.sending.name),
                  updatedAt: Value(now),
                ),
              );
      if (claimed == 1) return OutboxItem.fromRow(row.copyWith(state: OutboxState.sending.name));
    }
    return null;
  });

  /// When the next waiting write becomes due, for the replay timer.
  Future<DateTime?> nextDue(OutboxScope scope) async {
    final rows = await _unsyncedQuery(scope).get();
    final seen = <String>{};
    DateTime? earliest;
    for (final row in rows) {
      if (!seen.add(row.lane) || row.state != OutboxState.pending.name) continue;
      final due = row.nextAttemptAt ?? _clock();
      if (earliest == null || due.isBefore(earliest)) earliest = due;
    }
    return earliest;
  }

  /// The version to send: the lane's base for its first write, otherwise what
  /// the predecessor's response returned. Null when that cannot be known.
  Future<int?> versionFor(OutboxItem item) async {
    if (item.predecessorId == null) return item.baseVersion;
    final predecessor =
        await (_db.select(_t)..where((t) => t.id.equals(item.predecessorId!))).getSingleOrNull();
    if (predecessor == null || predecessor.state != OutboxState.synced.name) return null;
    return predecessor.resultVersion;
  }

  Future<void> markSynced(int id, int? resultVersion) => _set(
    id,
    OutboxEntriesCompanion(
      state: Value(OutboxState.synced.name),
      resultVersion: Value(resultVersion),
      errorMessage: const Value(null),
    ),
  );

  Future<void> retryLater(int id, {required int attempts, required DateTime at, String? message}) =>
      _set(
        id,
        OutboxEntriesCompanion(
          state: Value(OutboxState.pending.name),
          attempts: Value(attempts),
          nextAttemptAt: Value(at),
          errorMessage: Value(message),
        ),
      );

  Future<void> markFailed(int id, String message, {int? attempts}) => _set(
    id,
    OutboxEntriesCompanion(
      state: Value(OutboxState.failed.name),
      errorMessage: Value(message),
      attempts: attempts == null ? const Value.absent() : Value(attempts),
    ),
  );

  Future<void> markConflict(int id, String message) => _set(
    id,
    OutboxEntriesCompanion(state: Value(OutboxState.conflict.name), errorMessage: Value(message)),
  );

  /// Back to waiting without counting an attempt, e.g. while signed out.
  Future<void> release(int id) =>
      _set(id, OutboxEntriesCompanion(state: Value(OutboxState.pending.name)));

  /// A person asked to try a failed write again. A conflict is not retried: the
  /// server would give the same answer, and the key would replay it.
  Future<void> retry(OutboxScope scope, int id) async {
    await (_db.update(_t)..where(
          (t) => _mine(scope) & t.id.equals(id) & t.state.equals(OutboxState.failed.name),
        ))
        .write(
          OutboxEntriesCompanion(
            state: Value(OutboxState.pending.name),
            attempts: const Value(0),
            nextAttemptAt: const Value(null),
            errorMessage: const Value(null),
            updatedAt: Value(_clock()),
          ),
        );
  }

  /// "Send now": clears the wait on every waiting write.
  Future<void> clearBackoff(OutboxScope scope) async {
    await (_db.update(_t)..where((t) => _mine(scope) & t.state.equals(OutboxState.pending.name)))
        .write(const OutboxEntriesCompanion(nextAttemptAt: Value(null)));
  }

  /// A person discarded a write. Everything queued behind it in the same lane
  /// depended on it, so it goes too. Returns how many were removed.
  Future<int> discard(OutboxScope scope, int id) => _db.transaction(() async {
    final row =
        await (_db.select(_t)..where((t) => _mine(scope) & t.id.equals(id))).getSingleOrNull();
    if (row == null || row.state == OutboxState.sending.name) return 0;
    return (_db.delete(_t)..where(
          (t) =>
              _mine(scope) &
              t.lane.equals(row.lane) &
              t.id.isBiggerOrEqualValue(id) &
              t.state.isIn(_unsynced) &
              t.state.equals(OutboxState.sending.name).not(),
        ))
        .go();
  });

  /// After a crash or a kill mid-send. The persisted key makes the resend safe.
  Future<void> recoverInterrupted() async {
    await (_db.update(_t)..where((t) => t.state.equals(OutboxState.sending.name)))
        .write(OutboxEntriesCompanion(state: Value(OutboxState.pending.name)));
  }

  Future<int> unsyncedCount(OutboxScope scope) async => (await unsynced(scope)).length;

  /// Sign-out: this person's writes leave the device (docs/08).
  Future<void> purge(OutboxScope scope) => (_db.delete(_t)..where((_) => _mine(scope))).go();

  /// Sent writes are kept a day, unless a write still waiting needs their
  /// version. Unsent ones are never removed here.
  Future<void> cleanup() async {
    final cutoff = _clock().subtract(keepSynced);
    final needed = (await (_db.select(_t)..where((t) => t.state.isIn(_unsynced))).get())
        .map((r) => r.predecessorId)
        .whereType<int>()
        .toSet();
    await (_db.delete(_t)..where(
          (t) =>
              t.state.equals(OutboxState.synced.name) &
              t.updatedAt.isSmallerThanValue(cutoff) &
              t.id.isNotIn(needed),
        ))
        .go();
  }

  Future<void> _set(int id, OutboxEntriesCompanion values) async {
    await (_db.update(_t)..where((t) => t.id.equals(id)))
        .write(values.copyWith(updatedAt: Value(_clock())));
  }
}
