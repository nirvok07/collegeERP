import 'dart:convert';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/network/idempotency.dart';
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
  });

  final LoadStatus status;

  /// The server's register plus whatever the teacher has tapped since.
  final SheetDraft? draft;
  final Failure? failure;
  final bool saving;
  final bool submitting;

  bool get busy => saving || submitting;

  AttendanceState copyWith({
    LoadStatus? status,
    SheetDraft? draft,
    Failure? failure,
    bool clearFailure = false,
    bool? saving,
    bool? submitting,
  }) => AttendanceState(
    status: status ?? this.status,
    draft: draft ?? this.draft,
    failure: clearFailure ? null : (failure ?? this.failure),
    saving: saving ?? this.saving,
    submitting: submitting ?? this.submitting,
  );
}

/// Taking attendance for one class.
///
/// Every tap lands in a local draft and nothing is sent until the teacher saves,
/// because a classroom is exactly where the network is worst and a lost tap is
/// a wrong academic record. A failed save keeps every mark on screen.
class AttendanceCubit extends Cubit<AttendanceState> {
  AttendanceCubit(this._repository, this.sessionId) : super(const AttendanceState());

  final AttendanceRepository _repository;
  final String sessionId;

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

    result.when(
      ok: (sheet) => emit(
        AttendanceState(
          status: sheet.students.isEmpty ? LoadStatus.empty : LoadStatus.success,
          draft: SheetDraft(sheet),
        ),
      ),
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
    if (draft == null || !draft.sheet.canMark) return;
    draft.mark(studentId, mark);
    // The draft is mutable and identity-stable, so the emit carries the change
    // rather than a copy. A new state object keeps the rebuild explicit.
    emit(state.copyWith(clearFailure: true));
  }

  void markAll(AttendanceMark mark) {
    final draft = state.draft;
    if (draft == null || !draft.sheet.canMark) return;
    draft.markAll(mark);
    emit(state.copyWith(clearFailure: true));
  }

  /// Sends the batch. Returns an error message, or null when it landed.
  Future<String?> save() async {
    final draft = state.draft;
    if (draft == null || !draft.isDirty) return null;

    emit(state.copyWith(saving: true, clearFailure: true));
    final payload = draft.payload();
    final result = await _repository.saveMarks(
      sessionId: sessionId,
      version: draft.sheet.version,
      marks: payload,
      // The same batch on the same version is the same write, so a retry after
      // a lost response reuses its key and cannot be refused as a conflict.
      idempotencyKey: _saving.keyFor(jsonEncode({'v': draft.sheet.version, 'm': payload})),
    );
    if (isClosed) return null;

    final failure = result.failureOrNull;
    if (failure != null) {
      // Nothing is cleared: every tap stays on screen for another attempt.
      emit(state.copyWith(saving: false, failure: failure));
      return failure.message;
    }

    _saving.settle();
    // Re-read rather than patching a version number locally, so the screen
    // always shows what the server actually holds.
    emit(state.copyWith(saving: false));
    await load(refresh: true);
    return null;
  }

  /// Submits the register, which closes it. Returns an error message or null.
  Future<String?> submit() async {
    final draft = state.draft;
    if (draft == null) return null;
    if (draft.isDirty) return 'Save your changes first.';

    emit(state.copyWith(submitting: true, clearFailure: true));
    final result = await _repository.submit(
      sessionId: sessionId,
      version: draft.sheet.version,
      idempotencyKey: _submitting.keyFor('${draft.sheet.version}'),
    );
    if (isClosed) return null;

    final failure = result.failureOrNull;
    emit(state.copyWith(submitting: false, failure: failure));
    if (failure != null) return failure.message;

    _submitting.settle();
    await load(refresh: true);
    return null;
  }
}
