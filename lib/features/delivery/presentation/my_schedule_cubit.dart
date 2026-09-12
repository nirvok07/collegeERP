import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/network/idempotency.dart';
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
  MyScheduleCubit(this._repository, {String? today})
    : _today = today ?? todayDate(),
      super(const MyScheduleState());

  final DeliveryRepository _repository;
  final String _today;

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

  Future<void> load({bool refresh = false}) async {
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
    final result = await _repository.markTaught(
      session.id,
      idempotencyKey: _taught.keyFor(session.id),
    );
    if (isClosed) return null;

    final failure = result.failureOrNull;
    emit(state.copyWith(clearMarking: true));
    if (failure != null) return failure;
    _taught.settle();

    await load(refresh: true);
    return null;
  }
}
