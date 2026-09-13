import 'dart:async';
import 'dart:convert';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/outbox/offline_writes.dart';
import '../../../core/outbox/outbox.dart';
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
    this.waiting = const [],
    this.lastQueued = false,
  });

  final LoadStatus status;
  final MarkDraft? draft;
  final Failure? failure;
  final bool busy;

  /// Writes for this sheet still on the phone (AD-59).
  final List<OutboxItem> waiting;

  /// The last write went to the outbox rather than the server.
  final bool lastQueued;

  bool get submissionQueued => waiting.any((i) => i.kind.isSubmission);
  bool get dateQueued => waiting.any((i) => i.kind == OutboxKind.assessmentHeldOn);

  MarkSheetState copyWith({
    LoadStatus? status,
    MarkDraft? draft,
    Failure? failure,
    bool clearFailure = false,
    bool? busy,
    List<OutboxItem>? waiting,
    bool? lastQueued,
  }) => MarkSheetState(
    status: status ?? this.status,
    draft: draft ?? this.draft,
    failure: clearFailure ? null : (failure ?? this.failure),
    busy: busy ?? this.busy,
    waiting: waiting ?? this.waiting,
    lastQueued: lastQueued ?? this.lastQueued,
  );
}

/// One mark sheet. Every keystroke lands in a local draft and nothing is sent
/// until the teacher saves; a failed save keeps everything on screen.
class MarkSheetCubit extends Cubit<MarkSheetState> {
  MarkSheetCubit(this._repository, this.componentId, {OfflineWrites? offline})
    : _offline = offline,
      super(const MarkSheetState()) {
    _watch = offline?.watch(OutboxLane.assessment, componentId).listen(_onWaiting);
  }

  final AssessmentRepository _repository;
  final String componentId;
  final OfflineWrites? _offline;
  StreamSubscription<List<OutboxItem>>? _watch;

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
    final waiting = await _offline?.waiting(OutboxLane.assessment, componentId) ?? const [];
    if (isClosed) return;
    result.when(
      ok: (sheet) {
        // Results still on the phone are shown as saved here, not lost.
        final draft = MarkDraft(sheet);
        for (final item in waiting.where((i) => i.kind == OutboxKind.assessmentMarks)) {
          draft.applyQueued((item.payload['marks'] as List?) ?? const []);
        }
        emit(
          MarkSheetState(
            status: !sheet.needsDate && sheet.students.isEmpty
                ? LoadStatus.empty
                : LoadStatus.success,
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

  void setScore(String studentId, String text) {
    final draft = state.draft;
    if (draft == null || !draft.sheet.canMark || state.submissionQueued) return;
    draft.setScore(studentId, text);
    emit(state.copyWith(clearFailure: true));
  }

  void setStatus(String studentId, MarkStatus status) {
    final draft = state.draft;
    if (draft == null || !draft.sheet.canMark || state.submissionQueued) return;
    draft.setStatus(studentId, status);
    emit(state.copyWith(clearFailure: true));
  }

  /// Records when it was held, then re-reads: the class list depends on it.
  Future<String?> recordHeldOn(String heldOn) async {
    final draft = state.draft;
    if (draft == null) return null;
    final version = draft.sheet.component.version;
    return _write<int>(
      _dating,
      '$version:$heldOn',
      kind: OutboxKind.assessmentHeldOn,
      payload: {'held_on': heldOn},
      version: version,
      send: (key) => _repository.recordHeldOn(
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
    return _write<int>(
      _saving,
      jsonEncode({'v': version, 'm': payload}),
      kind: OutboxKind.assessmentMarks,
      payload: {'marks': payload},
      version: version,
      send: (key) => _repository.saveMarks(
        componentId: componentId,
        version: version,
        marks: payload,
        idempotencyKey: key,
      ),
      onQueued: (draft) => draft.queuePending(),
    );
  }

  Future<String?> submit() async {
    final draft = state.draft;
    if (draft == null) return null;
    if (draft.isDirty) return 'Save your changes first.';
    final version = draft.sheet.component.version;
    return _write<void>(
      _submitting,
      '$version',
      kind: OutboxKind.assessmentSubmit,
      payload: const {},
      version: version,
      send: (key) =>
          _repository.submit(componentId: componentId, version: version, idempotencyKey: key),
    );
  }

  /// Sends one write, online first and queued only when the server cannot be
  /// reached or an earlier write to this sheet is still waiting (AD-59).
  ///
  /// On a refusal nothing local is cleared. On success the sheet is re-read
  /// rather than patched, so the screen shows what the server holds. The
  /// signature describes the request: retried unchanged, it keeps its key, so a
  /// resend after a lost response gets the first outcome (AD-58).
  Future<String?> _write<T>(
    IdempotentWrite write,
    String signature, {
    required OutboxKind kind,
    required Map<String, Object?> payload,
    required int version,
    required Future<Result<T>> Function(String key) send,
    void Function(MarkDraft draft)? onQueued,
  }) async {
    emit(state.copyWith(busy: true, clearFailure: true, lastQueued: false));
    final key = write.keyFor(signature);
    final offline = _offline;
    final component = state.draft?.sheet.component;
    final WriteOutcome<T> outcome = offline == null
        ? (await send(key)).when(ok: (v) => Sent<T>(v), err: (f) => Refused<T>(f))
        : await offline.run<T>(
            kind: kind,
            targetId: componentId,
            payload: payload,
            baseVersion: version,
            idempotencyKey: key,
            label: component == null
                ? 'Assessment'
                : '${component.name} · ${component.courseCode}',
            online: () => send(key),
          );
    if (isClosed) return null;

    switch (outcome) {
      case Refused(:final failure):
        emit(state.copyWith(busy: false, failure: failure));
        return failure.message;
      case Queued():
        write.settle();
        final draft = state.draft;
        if (draft != null) onQueued?.call(draft);
        emit(state.copyWith(busy: false, lastQueued: true));
        return null;
      case Sent():
        write.settle();
        emit(state.copyWith(busy: false));
        await load(refresh: true);
        return null;
    }
  }

  void _onWaiting(List<OutboxItem> items) {
    if (isClosed) return;
    final drained = state.waiting.isNotEmpty && items.isEmpty;
    emit(state.copyWith(waiting: items));
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
