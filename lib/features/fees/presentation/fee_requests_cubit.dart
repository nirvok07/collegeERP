import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';

class FeeRequestsState {
  const FeeRequestsState({this.status = LoadStatus.loading, this.requests = const [], this.showAll = false, this.failure});

  final LoadStatus status;
  final List<FeeRequest> requests;

  /// False: only what is still awaiting a decision.
  final bool showAll;
  final Failure? failure;

  FeeRequestsState copyWith({LoadStatus? status, List<FeeRequest>? requests, bool? showAll, Failure? failure, bool clearFailure = false}) =>
      FeeRequestsState(
        status: status ?? this.status,
        requests: requests ?? this.requests,
        showAll: showAll ?? this.showAll,
        failure: clearFailure ? null : (failure ?? this.failure),
      );
}

/// FEE-3/FEE-5: concession and waiver requests, awaiting the College Admin's
/// decision (`fee.approve`) — never the Accountant who asked for them.
class FeeRequestsCubit extends Cubit<FeeRequestsState> {
  FeeRequestsCubit(this._repository) : super(const FeeRequestsState());

  final FeesRepository _repository;

  /// Opens on what was saved; the network is asked only when nothing was
  /// saved, or on an explicit refresh (feedbackchanges.md: no call on every
  /// open). Toggling the filter always asks, since it changes what "saved"
  /// even means here.
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    emit(state.copyWith(status: LoadStatus.loading, clearFailure: true));
    final result = await _repository.requests(status: state.showAll ? null : 'requested');
    if (isClosed) return;
    result.when(
      ok: (requests) => emit(state.copyWith(status: requests.isEmpty ? LoadStatus.empty : LoadStatus.success, requests: requests, clearFailure: true)),
      err: (f) => emit(state.copyWith(status: LoadStatus.failure, failure: f)),
    );
  }

  Future<void> toggleShowAll() async {
    emit(state.copyWith(showAll: !state.showAll));
    await load(refresh: true);
  }

  Future<Failure?> approve(String id, {String? reason}) async {
    final result = await _repository.approveRequest(id, reason: reason);
    if (isClosed) return null;
    return result.when(ok: (_) { load(refresh: true); return null; }, err: (f) => f);
  }

  Future<Failure?> reject(String id, {required String reason}) async {
    final result = await _repository.rejectRequest(id, reason: reason);
    if (isClosed) return null;
    return result.when(ok: (_) { load(refresh: true); return null; }, err: (f) => f);
  }
}
