import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/widgets/screen_state.dart';
import '../../delivery/domain/class_session.dart';
import '../../delivery/domain/delivery_repository.dart';
import '../../teaching/domain/teaching_offering.dart';
import '../../teaching/domain/teaching_repository.dart';
import '../domain/dashboard_summary.dart';

class DashboardState {
  const DashboardState({
    this.status = LoadStatus.loading,
    this.summary = DashboardSummary.empty,
    this.failure,
  });

  final LoadStatus status;
  final DashboardSummary summary;
  final Failure? failure;

  DashboardState copyWith({
    LoadStatus? status,
    DashboardSummary? summary,
    Failure? failure,
    bool clearFailure = false,
  }) => DashboardState(
    status: status ?? this.status,
    summary: summary ?? this.summary,
    failure: clearFailure ? null : (failure ?? this.failure),
  );
}

/// Reads the teacher's own sessions and teaching, and nothing else.
///
/// A repository is null when the person has no authority for that surface:
/// the dashboard then asks nothing of it, rather than asking and being refused.
class DashboardCubit extends Cubit<DashboardState> {
  DashboardCubit({
    DeliveryRepository? delivery,
    TeachingRepository? teaching,
    String? today,
    String Function()? clock,
  }) : _delivery = delivery,
       _teaching = teaching,
       _today = today ?? todayDate(),
       _clock = clock ?? clockNow,
       super(const DashboardState());

  final DeliveryRepository? _delivery;
  final TeachingRepository? _teaching;
  final String _today;
  final String Function() _clock;

  /// Four weeks back, so the teaching record covers enough classes to mean
  /// something; a week forward, which is the horizon the load chart shows.
  static const lookBackDays = 28;
  static const lookAheadDays = 7;

  Future<void> load({bool refresh = false}) async {
    emit(
      state.copyWith(
        status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
        clearFailure: true,
      ),
    );

    final sessionsRead =
        _delivery?.mySessions(
          from: shiftDate(_today, -lookBackDays),
          to: shiftDate(_today, lookAheadDays - 1),
        ) ??
        Future.value(const Ok(<ClassSession>[]));
    final teachingRead = _teaching?.myTeaching() ?? Future.value(const Ok(<TeachingOffering>[]));
    final sessions = await sessionsRead;
    final teaching = await teachingRead;
    if (isClosed) return;

    final failure = sessions.failureOrNull ?? teaching.failureOrNull;
    if (failure != null) {
      // A failed refresh keeps the dashboard on screen with a warning.
      emit(
        state.copyWith(status: refresh ? LoadStatus.success : LoadStatus.failure, failure: failure),
      );
      return;
    }

    emit(
      state.copyWith(
        status: LoadStatus.success,
        summary: buildDashboard(
          sessions: sessions.valueOrNull!,
          offerings: teaching.valueOrNull!,
          today: _today,
          now: _clock(),
          weekDays: lookAheadDays,
        ),
        clearFailure: true,
      ),
    );
  }
}
