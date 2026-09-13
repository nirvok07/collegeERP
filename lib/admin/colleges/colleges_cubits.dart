import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/error/failure.dart';
import '../../core/widgets/screen_state.dart';
import 'college_models.dart';
import 'colleges_api.dart';

class CollegesState {
  const CollegesState({this.status = LoadStatus.loading, this.colleges = const [], this.failure});

  final LoadStatus status;
  final List<CollegeSummary> colleges;
  final Failure? failure;

  int count(String status) => colleges.where((c) => c.status == status).length;
}

class CollegesCubit extends Cubit<CollegesState> {
  CollegesCubit(this._repository) : super(const CollegesState());

  final CollegesRepository _repository;

  Future<void> load({bool refresh = false}) async {
    emit(CollegesState(
      status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
      colleges: state.colleges,
    ));
    final result = await _repository.list();
    if (isClosed) return;
    result.when(
      ok: (colleges) => emit(CollegesState(
        status: colleges.isEmpty ? LoadStatus.empty : LoadStatus.success,
        colleges: colleges,
      )),
      // A failed refresh keeps the list on screen with a warning.
      err: (failure) => emit(CollegesState(
        status: refresh ? LoadStatus.success : LoadStatus.failure,
        colleges: state.colleges,
        failure: failure,
      )),
    );
  }
}

class CollegeDetailState {
  const CollegeDetailState({this.status = LoadStatus.loading, this.detail, this.failure});

  final LoadStatus status;
  final CollegeDetail? detail;
  final Failure? failure;
}

class CollegeDetailCubit extends Cubit<CollegeDetailState> {
  CollegeDetailCubit(this._repository, this._id) : super(const CollegeDetailState());

  final CollegesRepository _repository;
  final String _id;

  Future<void> load() async {
    emit(CollegeDetailState(status: LoadStatus.loading, detail: state.detail));
    final result = await _repository.detail(_id);
    if (isClosed) return;
    result.when(
      ok: (detail) => emit(CollegeDetailState(status: LoadStatus.success, detail: detail)),
      err: (failure) => emit(CollegeDetailState(status: LoadStatus.failure, failure: failure)),
    );
  }
}

class ProvisionState {
  const ProvisionState({this.submitting = false, this.failure});

  final bool submitting;
  final Failure? failure;
}

class ProvisionCubit extends Cubit<ProvisionState> {
  ProvisionCubit(this._repository) : super(const ProvisionState());

  final CollegesRepository _repository;

  /// The created college, or null with the reason in the state.
  Future<ProvisionedCollege?> submit(ProvisionInput input) async {
    final problem = provisionFormError(input);
    if (problem != null) {
      emit(ProvisionState(failure: Failure(code: FailureCode.validationFailed, message: problem)));
      return null;
    }
    emit(const ProvisionState(submitting: true));
    final result = await _repository.provision(input);
    if (isClosed) return null;
    return result.when(
      ok: (created) {
        emit(const ProvisionState());
        return created;
      },
      err: (failure) {
        emit(ProvisionState(failure: failure));
        return null;
      },
    );
  }
}
