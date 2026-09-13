import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../data/onboarding_api.dart';
import '../domain/onboarding.dart';

/// A form that first loads its choices (departments or programs), then sends.
class OnboardingFormState<T> {
  const OnboardingFormState({
    this.loading = true,
    this.options = const [],
    this.loadFailure,
    this.submitting = false,
    this.failure,
  });

  final bool loading;
  final List<T> options;
  final Failure? loadFailure;
  final bool submitting;
  final Failure? failure;

  OnboardingFormState<T> copyWith({
    bool? loading,
    List<T>? options,
    Failure? loadFailure,
    bool clearLoadFailure = false,
    bool? submitting,
    Failure? failure,
    bool clearFailure = false,
  }) => OnboardingFormState<T>(
    loading: loading ?? this.loading,
    options: options ?? this.options,
    loadFailure: clearLoadFailure ? null : (loadFailure ?? this.loadFailure),
    submitting: submitting ?? this.submitting,
    failure: clearFailure ? null : (failure ?? this.failure),
  );
}

Failure _invalid(String message) => Failure(code: FailureCode.validationFailed, message: message);

class AppointTeacherCubit extends Cubit<OnboardingFormState<DepartmentOption>> {
  AppointTeacherCubit(this._repository) : super(const OnboardingFormState());

  final OnboardingRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearLoadFailure: true));
    final result = await _repository.departments();
    if (isClosed) return;
    result.when(
      ok: (departments) => emit(state.copyWith(loading: false, options: departments)),
      err: (f) => emit(state.copyWith(loading: false, loadFailure: f)),
    );
  }

  /// The appointed teacher with their invitation, or null with the reason in the state.
  Future<AppointedTeacher?> submit(TeacherInput input) async {
    final problem = teacherFormError(input);
    if (problem != null) {
      emit(state.copyWith(failure: _invalid(problem)));
      return null;
    }
    emit(state.copyWith(submitting: true, clearFailure: true));
    final result = await _repository.appointTeacher(input);
    if (isClosed) return null;
    return result.when(
      ok: (teacher) {
        emit(state.copyWith(submitting: false));
        return teacher;
      },
      err: (f) {
        emit(state.copyWith(submitting: false, failure: f));
        return null;
      },
    );
  }
}

class AdmitStudentCubit extends Cubit<OnboardingFormState<ProgramOption>> {
  AdmitStudentCubit(this._repository) : super(const OnboardingFormState());

  final OnboardingRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearLoadFailure: true));
    final result = await _repository.programs();
    if (isClosed) return;
    result.when(
      ok: (programs) => emit(state.copyWith(loading: false, options: programs)),
      err: (f) => emit(state.copyWith(loading: false, loadFailure: f)),
    );
  }

  /// True once the student is admitted; false with the reason in the state.
  Future<bool> submit(StudentInput input) async {
    final problem = studentFormError(input);
    if (problem != null) {
      emit(state.copyWith(failure: _invalid(problem)));
      return false;
    }
    emit(state.copyWith(submitting: true, clearFailure: true));
    final result = await _repository.admitStudent(input);
    if (isClosed) return false;
    return result.when(
      ok: (_) {
        emit(state.copyWith(submitting: false));
        return true;
      },
      err: (f) {
        emit(state.copyWith(submitting: false, failure: f));
        return false;
      },
    );
  }
}
