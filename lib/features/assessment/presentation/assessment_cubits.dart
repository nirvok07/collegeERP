import 'dart:convert';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/widgets/screen_state.dart';
import '../domain/assessment.dart';
import '../domain/assessment_repository.dart';

/* ------------------------------------------------ one course's components -- */

class CourseAssessmentsState {
  const CourseAssessmentsState({
    this.status = LoadStatus.loading,
    this.components = const [],
    this.failure,
  });

  final LoadStatus status;
  final List<AssessmentComponent> components;
  final Failure? failure;
}

/// The components of one course the teacher teaches, read from their own feed
/// and narrowed on the device. Cancelled ones are left out: there is nothing a
/// teacher can do with a component that was never held.
class CourseAssessmentsCubit extends Cubit<CourseAssessmentsState> {
  CourseAssessmentsCubit(this._repository, this.offeringId) : super(const CourseAssessmentsState());

  final AssessmentRepository _repository;
  final String offeringId;

  Future<void> load({bool refresh = false}) async {
    if (!refresh) emit(const CourseAssessmentsState());
    final result = await _repository.myComponents();
    if (isClosed) return;
    result.when(
      ok: (all) {
        final mine = all
            .where((c) => c.offeringId == offeringId && c.status != 'cancelled')
            .toList();
        emit(
          CourseAssessmentsState(
            status: mine.isEmpty ? LoadStatus.empty : LoadStatus.success,
            components: mine,
          ),
        );
      },
      err: (failure) => emit(
        CourseAssessmentsState(
          status: refresh && state.components.isNotEmpty ? LoadStatus.success : LoadStatus.failure,
          components: state.components,
          failure: failure,
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------ one sheet -- */

class MarkSheetState {
  const MarkSheetState({
    this.status = LoadStatus.loading,
    this.draft,
    this.failure,
    this.busy = false,
  });

  final LoadStatus status;
  final MarkDraft? draft;
  final Failure? failure;
  final bool busy;

  MarkSheetState copyWith({
    LoadStatus? status,
    MarkDraft? draft,
    Failure? failure,
    bool clearFailure = false,
    bool? busy,
  }) => MarkSheetState(
    status: status ?? this.status,
    draft: draft ?? this.draft,
    failure: clearFailure ? null : (failure ?? this.failure),
    busy: busy ?? this.busy,
  );
}

/// One mark sheet. Every keystroke lands in a local draft and nothing is sent
/// until the teacher saves; a failed save keeps everything on screen.
class MarkSheetCubit extends Cubit<MarkSheetState> {
  MarkSheetCubit(this._repository, this.componentId) : super(const MarkSheetState());

  final AssessmentRepository _repository;
  final String componentId;

  // One key per logical write, kept while that exact write is retried (AD-58).
  final _dating = IdempotentWrite();
  final _saving = IdempotentWrite();
  final _submitting = IdempotentWrite();

  Future<void> load({bool refresh = false}) async {
    emit(
      state.copyWith(
        status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
        clearFailure: true,
      ),
    );
    final result = await _repository.readSheet(componentId);
    if (isClosed) return;
    result.when(
      ok: (sheet) => emit(
        MarkSheetState(
          status: !sheet.needsDate && sheet.students.isEmpty
              ? LoadStatus.empty
              : LoadStatus.success,
          draft: MarkDraft(sheet),
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

  void setScore(String studentId, String text) {
    final draft = state.draft;
    if (draft == null || !draft.sheet.canMark) return;
    draft.setScore(studentId, text);
    emit(state.copyWith(clearFailure: true));
  }

  void setStatus(String studentId, MarkStatus status) {
    final draft = state.draft;
    if (draft == null || !draft.sheet.canMark) return;
    draft.setStatus(studentId, status);
    emit(state.copyWith(clearFailure: true));
  }

  /// Records when it was held, then re-reads: the class list depends on it.
  Future<String?> recordHeldOn(String heldOn) async {
    final draft = state.draft;
    if (draft == null) return null;
    final version = draft.sheet.component.version;
    return _write(
      _dating,
      '$version:$heldOn',
      (key) => _repository.recordHeldOn(
        componentId: componentId,
        version: version,
        heldOn: heldOn,
        idempotencyKey: key,
      ),
    );
  }

  Future<String?> save() async {
    final draft = state.draft;
    if (draft == null || !draft.canSave) return null;
    final version = draft.sheet.component.version;
    final payload = draft.payload();
    return _write(
      _saving,
      jsonEncode({'v': version, 'm': payload}),
      (key) => _repository.saveMarks(
        componentId: componentId,
        version: version,
        marks: payload,
        idempotencyKey: key,
      ),
    );
  }

  Future<String?> submit() async {
    final draft = state.draft;
    if (draft == null) return null;
    if (draft.isDirty) return 'Save your changes first.';
    final version = draft.sheet.component.version;
    return _write(
      _submitting,
      '$version',
      (key) => _repository.submit(componentId: componentId, version: version, idempotencyKey: key),
    );
  }

  /// Sends one write. On failure nothing local is cleared; on success the sheet
  /// is re-read rather than patched, so the screen shows what the server holds.
  ///
  /// The signature describes the request. Retried unchanged, it keeps its key,
  /// so a resend after a lost response gets the server's first outcome rather
  /// than a false conflict (AD-58).
  Future<String?> _write(
    IdempotentWrite write,
    String signature,
    Future<Result<void>> Function(String key) send,
  ) async {
    emit(state.copyWith(busy: true, clearFailure: true));
    final result = await send(write.keyFor(signature));
    if (isClosed) return null;
    final failure = result.failureOrNull;
    if (failure != null) {
      emit(state.copyWith(busy: false, failure: failure));
      return failure.message;
    }
    write.settle();
    emit(state.copyWith(busy: false));
    await load(refresh: true);
    return null;
  }
}
