import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/organisation_api.dart';
import '../domain/org_unit.dart';

class OrganisationState {
  const OrganisationState({
    this.status = LoadStatus.loading,
    this.tree,
    this.failure,
  });

  final LoadStatus status;
  final OrgTree? tree;
  final Failure? failure;

  OrganisationState copyWith({
    LoadStatus? status,
    OrgTree? tree,
    Failure? failure,
    bool clearFailure = false,
  }) =>
      OrganisationState(
        status: status ?? this.status,
        tree: tree ?? this.tree,
        failure: clearFailure ? null : (failure ?? this.failure),
      );
}

class OrganisationCubit extends Cubit<OrganisationState> {
  OrganisationCubit(this._api) : super(const OrganisationState());

  final OrganisationApi _api;

  Future<void> load({bool refresh = false}) async {
    emit(state.copyWith(
      status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
      clearFailure: true,
    ));

    final result = await _api.loadTree();
    if (isClosed) return;

    result.when(
      ok: (tree) => emit(state.copyWith(
        status: tree.campuses.isEmpty ? LoadStatus.empty : LoadStatus.success,
        tree: tree,
        clearFailure: true,
      )),
      err: (failure) => emit(state.copyWith(
        status: refresh ? LoadStatus.success : LoadStatus.failure,
        failure: failure,
      )),
    );
  }
}
