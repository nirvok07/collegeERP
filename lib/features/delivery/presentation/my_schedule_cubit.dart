import 'package:flutter_bloc/flutter_bloc.dart';

import 'dart:async';

import '../../../core/error/failure.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/outbox/offline_writes.dart';
import '../../../core/outbox/outbox.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../domain/class_session.dart';
import '../domain/delivery_repository.dart';

class MyScheduleState {
  const MyScheduleState({
    this.status = LoadStatus.loading,
    this.schedule = Schedule.empty,
    this.failure,
    this.marking,
  });

  final LoadStatus status;
  final Schedule schedule;
  final Failure? failure;

  /// The class currently being recorded, so one row shows progress rather than
  /// the whole screen going blank.
  final String? marking;

  MyScheduleState copyWith({
    LoadStatus? status,
    Schedule? schedule,
    Failure? failure,
    bool clearFailure = false,
    String? marking,
    bool clearMarking = false,
  }) => MyScheduleState(
    status: status ?? this.status,
    schedule: schedule ?? this.schedule,
    failure: clearFailure ? null : (failure ?? this.failure),
    marking: clearMarking ? null : (marking ?? this.marking),
  );
}

class MyScheduleCubit extends Cubit<MyScheduleState> {
  MyScheduleCubit(this._repository, {String? today, OfflineWrites? offline})
    : _today = today ?? todayDate(),
      _offline = offline,
      super(const MyScheduleState()) {
    // A queued "taught" that reaches the server changes this screen.
    _watch = offline?.watchAll().listen((items) {
      final settled = items.length < _waiting;
      _waiting = items.length;
      if (settled && !isClosed) unawaited(load(refresh: true));
    });
  }

  StreamSubscription<List<OutboxItem>>? _watch;
  var _waiting = 0;

  @override
  Future<void> close() async {
    await _watch?.cancel();
    return super.close();
  }

  final DeliveryRepository _repository;
  final String _today;
  final OfflineWrites? _offline;

  // One key per class being recorded, kept while that write is retried (AD-58).
  final _taught = IdempotentWrite();

  String get today => _today;

  /// A week back and a fortnight forward.
  ///
  /// Back, because a class somebody forgot to mark is the one thing in this
  /// screen that another person is waiting on. Forward, because a teacher plans
  /// in days, not months, and a longer window is a slower screen for nothing.
  static const lookBackDays = 7;
  static const lookAheadDays = 14;

  /// CR-1 (AD-9 amended again): opens on what was saved; the network is asked
  /// only when nothing was saved, or on an explicit refresh.
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(() => _read(refresh: false))) return;
    return _read(refresh: refresh);
  }

  Future<void> _read({required bool refresh}) async {
    emit(
      state.copyWith(
        status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
        clearFailure: true,
      ),
    );

    final result = await _repository.mySessions(
      from: shiftDate(_today, -lookBackDays),
      to: shiftDate(_today, lookAheadDays),
    );
    if (isClosed) return;

    result.when(
      ok: (sessions) {
        final schedule = buildSchedule(sessions, _today);
        emit(
          state.copyWith(
            status: schedule.isEmpty ? LoadStatus.empty : LoadStatus.success,
            schedule: schedule,
            clearFailure: true,
          ),
        );
      },
      // A failed refresh keeps the day on screen. Losing today's classes
      // because one poll failed is worse than showing them with a warning.
      err: (failure) => emit(
        state.copyWith(status: refresh ? LoadStatus.success : LoadStatus.failure, failure: failure),
      ),
    );
  }

  /// Records that a class was taught, then re-reads rather than patching local
  /// state, so the screen always shows what the server actually holds.
  Future<Failure?> markTaught(ClassSession session) async {
    emit(state.copyWith(marking: session.id, clearFailure: true));
    final key = _taught.keyFor(session.id);
    final offline = _offline;
    final WriteOutcome<void> outcome = offline == null
        ? (await _repository.markTaught(session.id, idempotencyKey: key))
              .when(ok: (_) => const Sent<void>(null), err: (f) => Refused<void>(f))
        : await offline.run<void>(
            kind: OutboxKind.sessionTaught,
            targetId: session.id,
            payload: const {},
            idempotencyKey: key,
            label: 'Taught · ${session.courseCode} · ${session.date}',
            online: () => _repository.markTaught(session.id, idempotencyKey: key),
          );
    if (isClosed) return null;

    emit(state.copyWith(clearMarking: true));
    switch (outcome) {
      case Refused(:final failure):
        return failure;
      case Queued():
        // Saved on this phone; the schedule's bar shows it waiting.
        _taught.settle();
        return null;
      case Sent():
        _taught.settle();
        await load(refresh: true);
        return null;
    }
  }
}
