import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/result.dart';
import '../data/staff_attendance_api.dart';

sealed class StaffAttendanceState {
  const StaffAttendanceState();
}

class StaffAttendanceLoading extends StaffAttendanceState {
  const StaffAttendanceLoading();
}

class StaffAttendanceFailed extends StaffAttendanceState {
  const StaffAttendanceFailed(this.message);
  final String message;
}

class StaffAttendanceReady extends StaffAttendanceState {
  const StaffAttendanceReady({required this.today, required this.history, this.acting = false, this.error});
  final StaffAttendanceDay? today;
  final List<StaffAttendanceDay> history;
  final bool acting;

  /// A punch that failed (e.g. already punched out); shown once, then cleared.
  final String? error;

  StaffAttendanceReady copyWith({
    StaffAttendanceDay? today, List<StaffAttendanceDay>? history, bool? acting, String? error,
  }) =>
      StaffAttendanceReady(
        today: today ?? this.today,
        history: history ?? this.history,
        acting: acting ?? this.acting,
        error: error,
      );
}

class StaffAttendanceCubit extends Cubit<StaffAttendanceState> {
  StaffAttendanceCubit(this._repository) : super(const StaffAttendanceLoading());
  final StaffAttendanceRepository _repository;

  Future<void> load() async {
    emit(const StaffAttendanceLoading());
    final result = await _repository.history();
    switch (result) {
      case Ok(:final value):
        emit(StaffAttendanceReady(today: _todayOf(value), history: value));
      case Err(:final failure):
        emit(StaffAttendanceFailed(failure.message));
    }
  }

  StaffAttendanceDay? _todayOf(List<StaffAttendanceDay> history) {
    final now = DateTime.now();
    final iso = '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    for (final day in history) {
      if (day.workDate == iso) return day;
    }
    return null;
  }

  Future<void> punchIn() async {
    final current = state;
    if (current is! StaffAttendanceReady || current.acting) return;
    emit(current.copyWith(acting: true));
    final result = await _repository.punchIn();
    switch (result) {
      case Ok(:final value):
        emit(StaffAttendanceReady(today: value, history: [value, ...current.history]));
      case Err(:final failure):
        emit(current.copyWith(acting: false, error: failure.message));
    }
  }

  Future<void> punchOut() async {
    final current = state;
    if (current is! StaffAttendanceReady || current.acting || current.today == null) return;
    emit(current.copyWith(acting: true));
    final result = await _repository.punchOut();
    switch (result) {
      case Ok(:final value):
        final history = [value, ...current.history.where((d) => d.id != value.id)];
        emit(StaffAttendanceReady(today: value, history: history));
      case Err(:final failure):
        emit(current.copyWith(acting: false, error: failure.message));
    }
  }
}
