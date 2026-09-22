import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/saved_reads/saved_reads.dart';
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

/// The organisation tree, and for ADM-2 its changes. Every write returns the
/// server's refusal, if any, to the form that asked, and re-reads on success,
/// so the screen always shows what the server holds.
class OrganisationCubit extends Cubit<OrganisationState> {
  OrganisationCubit(this._repository) : super(const OrganisationState());

  final OrganisationRepository _repository;

  /// Opens on what was saved; the network is asked only when nothing was
  /// saved, or on an explicit refresh (feedbackchanges.md: no call on every open).
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(() => _read(refresh: false))) return;
    return _read(refresh: refresh);
  }

  Future<void> _read({required bool refresh}) async {
    emit(state.copyWith(
      status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
      clearFailure: true,
    ));

    final result = await _repository.loadTree();
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

  Future<Failure?> _write(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load(refresh: true);
    return failure;
  }

  Future<Failure?> createCampus(String name, String code) =>
      _write(_repository.createCampus(name: name.trim(), code: code.trim().toLowerCase()));

  Future<Failure?> createDepartment(String campusId, String name, String code) =>
      _write(_repository.createDepartment(campusId: campusId, name: name.trim(), code: code.trim().toLowerCase()));

  Future<Failure?> renameDepartment(String id, String name) => _write(_repository.renameDepartment(id, name.trim()));

  Future<Failure?> archiveCampus(String id, String reason) => _write(_repository.archiveCampus(id, reason.trim()));

  Future<Failure?> archiveDepartment(String id, String reason) =>
      _write(_repository.archiveDepartment(id, reason.trim()));

  /// SA-A1: sets or (null) removes a campus's attendance fence.
  Future<Failure?> setFence(String campusId, CampusFence? fence) => _write(_repository.setFence(campusId, fence));
}

/// A code suggested from the name, in the server's shape: lowercase letters,
/// numbers and hyphens, at most 31 characters (the server's pattern, `[a-z0-9][a-z0-9-]{0,30}`).
String suggestCode(String name) {
  final slug = name.trim().toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-+|-+$'), '');
  return slug.length > 31 ? slug.substring(0, 31).replaceAll(RegExp(r'-+$'), '') : slug;
}
