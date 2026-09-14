import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../../delivery/domain/class_session.dart';
import '../../delivery/domain/delivery_repository.dart';
import '../../teaching/domain/teaching_offering.dart';
import '../../teaching/domain/teaching_repository.dart';
import '../data/overview_api.dart';
import '../domain/dashboard_summary.dart';

class DashboardState {
  const DashboardState({
    this.status = LoadStatus.loading,
    this.summary = DashboardSummary.empty,
    this.overview,
    this.failure,
  });

  final LoadStatus status;
  final DashboardSummary summary;

  /// ADM-1: the college's numbers, for someone who may read the college.
  final CollegeOverview? overview;
  final Failure? failure;

  DashboardState copyWith({
    LoadStatus? status,
    DashboardSummary? summary,
    CollegeOverview? overview,
    Failure? failure,
    bool clearFailure = false,
  }) => DashboardState(
    status: status ?? this.status,
    summary: summary ?? this.summary,
    overview: overview ?? this.overview,
    failure: clearFailure ? null : (failure ?? this.failure),
  );
}

/// Reads the teacher's own sessions and teaching, and for an administrator the
/// college's numbers; nothing else.
///
/// A repository is null when the person has no authority for that surface:
/// the dashboard then asks nothing of it, rather than asking and being refused.
class DashboardCubit extends Cubit<DashboardState> {
  DashboardCubit({
    DeliveryRepository? delivery,
    TeachingRepository? teaching,
    OverviewRepository? overview,
    String? today,
    String Function()? clock,
  }) : _delivery = delivery,
       _teaching = teaching,
       _overview = overview,
       _today = today ?? todayDate(),
       _clock = clock ?? clockNow,
       super(const DashboardState());

  final DeliveryRepository? _delivery;
  final TeachingRepository? _teaching;
  final OverviewRepository? _overview;
  final String _today;
  final String Function() _clock;

  /// Four weeks back, so the teaching record covers enough classes to mean
  /// something; a week forward, which is the horizon the load chart shows.
  static const lookBackDays = 28;
  static const lookAheadDays = 7;

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

    final sessionsRead =
        _delivery?.mySessions(
          from: shiftDate(_today, -lookBackDays),
          to: shiftDate(_today, lookAheadDays - 1),
        ) ??
        Future.value(const Ok(<ClassSession>[]));
    final teachingRead = _teaching?.myTeaching() ?? Future.value(const Ok(<TeachingOffering>[]));
    final overviewRead = _overview?.load();
    final sessions = await sessionsRead;
    final teaching = await teachingRead;
    final overview = overviewRead == null ? null : await overviewRead;
    if (isClosed) return;

    final failure = sessions.failureOrNull ?? teaching.failureOrNull ?? overview?.failureOrNull;
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
        overview: overview?.valueOrNull,
        clearFailure: true,
      ),
    );
  }
}
