import 'dart:async';
import 'dart:convert';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/outbox/offline_writes.dart';
import '../../../core/outbox/outbox.dart';
import '../../../core/widgets/screen_state.dart';
import '../domain/attendance_repository.dart';
import '../domain/attendance_sheet.dart';

class AttendanceState {
  const AttendanceState({
    this.status = LoadStatus.loading,
    this.draft,
    this.failure,
    this.saving = false,
    this.submitting = false,
    this.waiting = const [],
    this.lastQueued = false,
  });

  final LoadStatus status;

  /// The server's register plus whatever the teacher has tapped since.
  final SheetDraft? draft;
  final Failure? failure;
  final bool saving;
  final bool submitting;

  bool get busy => saving || submitting;

  /// Writes for this register still on the phone (AD-59).
  final List<OutboxItem> waiting;

  /// The last save or submit went to the outbox rather than the server.
  final bool lastQueued;

  /// A queued submission closes the register here too: nothing may be marked
  /// behind it.
  bool get submissionQueued => waiting.any((i) => i.kind.isSubmission);

  AttendanceState copyWith({
    LoadStatus? status,
    SheetDraft? draft,
    Failure? failure,
    bool clearFailure = false,
    bool? saving,
    bool? submitting,
    List<OutboxItem>? waiting,
    bool? lastQueued,
  }) => AttendanceState(
    status: status ?? this.status,
    draft: draft ?? this.draft,
    failure: clearFailure ? null : (failure ?? this.failure),
    saving: saving ?? this.saving,
    submitting: submitting ?? this.submitting,
    waiting: waiting ?? this.waiting,
    lastQueued: lastQueued ?? this.lastQueued,
  );
}

/// Taking attendance for one class.
///
/// Every tap lands in a local draft and nothing is sent until the teacher saves,
/// because a classroom is exactly where the network is worst and a lost tap is
/// a wrong academic record. A failed save keeps every mark on screen.
class AttendanceCubit extends Cubit<AttendanceState> {
  AttendanceCubit(this._repository, this.sessionId, {OfflineWrites? offline})
    : _offline = offline,
      super(const AttendanceState()) {
    _watch = offline?.watch(OutboxLane.attendance, sessionId).listen(_onWaiting);
  }

  final AttendanceRepository _repository;
  final String sessionId;
  final OfflineWrites? _offline;
  StreamSubscription<List<OutboxItem>>? _watch;

  // One key per logical write, kept while that exact write is retried (AD-58).
  final _saving = IdempotentWrite();
  final _submitting = IdempotentWrite();

  Future<void> load({bool refresh = false}) async {
    emit(
      state.copyWith(
        status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
        clearFailure: true,
      ),
    );

    final result = await _repository.readSheet(sessionId);
    if (isClosed) return;
    final waiting = await _offline?.waiting(OutboxLane.attendance, sessionId) ?? const [];
    if (isClosed) return;

    result.when(
      ok: (sheet) {
        // Marks still on the phone are shown as saved here, not lost.
        final draft = SheetDraft(sheet);
        for (final item in waiting.where((i) => i.kind == OutboxKind.attendanceSave)) {
          draft.applyQueued((item.payload['marks'] as List?) ?? const []);
        }
        emit(
          AttendanceState(
            status: sheet.students.isEmpty ? LoadStatus.empty : LoadStatus.success,
            draft: draft,
            waiting: waiting,
          ),
        );
      },
      err: (failure) => emit(
        state.copyWith(
          status: state.draft == null ? LoadStatus.failure : LoadStatus.success,
          failure: failure,
        ),
      ),
    );
  }

  void mark(String studentId, AttendanceMark mark) {
    final draft = state.draft;
    if (draft == null || !draft.sheet.canMark || state.submissionQueued) return;
    draft.mark(studentId, mark);
    // The draft is mutable and identity-stable, so the emit carries the change
    // rather than a copy. A new state object keeps the rebuild explicit.
    emit(state.copyWith(clearFailure: true));
  }

  void markAll(AttendanceMark mark) {
    final draft = state.draft;
    if (draft == null || !draft.sheet.canMark || state.submissionQueued) return;
    draft.markAll(mark);
    emit(state.copyWith(clearFailure: true));
  }

  /// Sends the batch. Returns an error message, or null when it landed.
  Future<String?> save() async {
    final draft = state.draft;
    if (draft == null || !draft.isDirty) return null;

    emit(state.copyWith(saving: true, clearFailure: true, lastQueued: false));
    final payload = draft.payload();
    final version = draft.sheet.version;
    // The same batch on the same version is the same write, so a retry after a
    // lost response reuses its key and cannot be refused as a conflict.
    final key = _saving.keyFor(jsonEncode({'v': version, 'm': payload}));
    final outcome = await _run<int>(
      OutboxKind.attendanceSave,
      {'marks': payload},
      version,
      key,
      () => _repository.saveMarks(
        sessionId: sessionId,
        version: version,
        marks: payload,
        idempotencyKey: key,
      ),
    );
    if (isClosed) return null;

    switch (outcome) {
      case Refused(:final failure):
        // Nothing is cleared: every tap stays on screen for another attempt.
        emit(state.copyWith(saving: false, failure: failure));
        return failure.message;
      case Queued():
        _saving.settle();
        draft.queuePending();
        emit(state.copyWith(saving: false, lastQueued: true));
        return null;
      case Sent():
        _saving.settle();
        // Re-read rather than patching a version number locally, so the screen
        // always shows what the server actually holds.
        emit(state.copyWith(saving: false));
        await load(refresh: true);
        return null;
    }
  }

  /// Submits the register, which closes it. Returns an error message or null.
  Future<String?> submit() async {
    final draft = state.draft;
    if (draft == null) return null;
    if (draft.isDirty) return 'Save your changes first.';

    emit(state.copyWith(submitting: true, clearFailure: true, lastQueued: false));
    final version = draft.sheet.version;
    final key = _submitting.keyFor('$version');
    final outcome = await _run<void>(
      OutboxKind.attendanceSubmit,
      const {},
      version,
      key,
      () => _repository.submit(sessionId: sessionId, version: version, idempotencyKey: key),
    );
    if (isClosed) return null;

    switch (outcome) {
      case Refused(:final failure):
        emit(state.copyWith(submitting: false, failure: failure));
        return failure.message;
      case Queued():
        _submitting.settle();
        emit(state.copyWith(submitting: false, lastQueued: true));
        return null;
      case Sent():
        _submitting.settle();
        emit(state.copyWith(submitting: false));
        await load(refresh: true);
        return null;
    }
  }

  /// Online first; queued only when the server cannot be reached or an earlier
  /// write to this register is still waiting (AD-59).
  Future<WriteOutcome<T>> _run<T>(
    OutboxKind kind,
    Map<String, Object?> payload,
    int version,
    String key,
    Future<Result<T>> Function() online,
  ) async {
    final offline = _offline;
    if (offline == null) {
      final result = await online();
      return result.when(ok: (v) => Sent<T>(v), err: (f) => Refused<T>(f));
    }
    final session = state.draft?.sheet.session;
    return offline.run<T>(
      kind: kind,
      targetId: sessionId,
      payload: payload,
      baseVersion: version,
      idempotencyKey: key,
      label: session == null ? 'Attendance' : 'Attendance · ${session.courseCode} · ${session.date}',
      online: online,
    );
  }

  void _onWaiting(List<OutboxItem> items) {
    if (isClosed) return;
    final drained = state.waiting.isNotEmpty && items.isEmpty;
    emit(state.copyWith(waiting: items));
    // Everything this register was waiting on is settled: show what the server
    // holds now rather than what the phone assumed.
    if (drained) unawaited(load(refresh: true));
  }

  Future<void> sendNow() async => _offline?.sendNow();

  Future<void> retry(OutboxItem item) async => _offline?.retry(item.id);

  Future<void> discard(OutboxItem item) async => _offline?.discard(item.id);

  @override
  Future<void> close() async {
    await _watch?.cancel();
    return super.close();
  }
}
