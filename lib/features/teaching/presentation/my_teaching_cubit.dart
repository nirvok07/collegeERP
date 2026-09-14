import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../domain/teaching_offering.dart';
import '../domain/teaching_repository.dart';

class MyTeachingState {
  const MyTeachingState({
    this.status = LoadStatus.loading,
    this.cohorts = const [],
    this.past = const [],
    this.failure,
    this.showPast = false,
  });

  final LoadStatus status;

  /// Courses still to teach or being taught, grouped by the class they belong to.
  final List<TeachingCohort> cohorts;

  /// Finished and cancelled teaching, kept out of the way but never hidden:
  /// a teacher looking for last term's class should still find it.
  final List<TeachingOffering> past;

  final Failure? failure;
  final bool showPast;

  MyTeachingState copyWith({
    LoadStatus? status,
    List<TeachingCohort>? cohorts,
    List<TeachingOffering>? past,
    Failure? failure,
    bool clearFailure = false,
    bool? showPast,
  }) => MyTeachingState(
    status: status ?? this.status,
    cohorts: cohorts ?? this.cohorts,
    past: past ?? this.past,
    failure: clearFailure ? null : (failure ?? this.failure),
    showPast: showPast ?? this.showPast,
  );
}

class MyTeachingCubit extends Cubit<MyTeachingState> {
  MyTeachingCubit(this._api) : super(const MyTeachingState());

  final TeachingRepository _api;

  /// AD-9 (amended): what was saved first, then the server's answer.
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(() => _read(refresh: false))) return _read(refresh: true);
    return _read(refresh: refresh);
  }

  Future<void> _read({required bool refresh}) async {
    emit(
      state.copyWith(
        status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
        clearFailure: true,
      ),
    );

    final result = await _api.myTeaching();
    if (isClosed) return;

    result.when(
      ok: (offerings) {
        final live = offerings.where((o) => !o.isOver).toList();
        final over = offerings.where((o) => o.isOver).toList();
        emit(
          state.copyWith(
            status: offerings.isEmpty ? LoadStatus.empty : LoadStatus.success,
            cohorts: groupByCohort(live),
            past: over,
            clearFailure: true,
          ),
        );
      },
      // A failed refresh keeps the timetable on screen. Losing it because one
      // poll failed is worse than showing it with a warning.
      err: (failure) => emit(
        state.copyWith(status: refresh ? LoadStatus.success : LoadStatus.failure, failure: failure),
      ),
    );
  }

  void togglePast() => emit(state.copyWith(showPast: !state.showPast));
}
