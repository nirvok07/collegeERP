import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';

class FeeHeadsState {
  const FeeHeadsState({this.status = LoadStatus.loading, this.heads = const [], this.failure});

  final LoadStatus status;
  final List<FeeHead> heads;
  final Failure? failure;

  FeeHeadsState copyWith({LoadStatus? status, List<FeeHead>? heads, Failure? failure, bool clearFailure = false}) =>
      FeeHeadsState(
        status: status ?? this.status,
        heads: heads ?? this.heads,
        failure: clearFailure ? null : (failure ?? this.failure),
      );
}

/// FEE-1: fee heads (Tuition, Exam, Lab, ...), what `fee_structure_lines` are
/// priced against.
class FeeHeadsCubit extends Cubit<FeeHeadsState> {
  FeeHeadsCubit(this._repository) : super(const FeeHeadsState());

  final FeesRepository _repository;

  /// Opens on what was saved; the network is asked only when nothing was
  /// saved, or on an explicit refresh (feedbackchanges.md: no call on every open).
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    emit(state.copyWith(status: LoadStatus.loading, clearFailure: true));
    final result = await _repository.heads();
    if (isClosed) return;
    result.when(
      ok: (heads) => emit(state.copyWith(
        status: heads.isEmpty ? LoadStatus.empty : LoadStatus.success, heads: heads, clearFailure: true,
      )),
      err: (f) => emit(state.copyWith(status: LoadStatus.failure, failure: f)),
    );
  }

  Future<Failure?> create({required String name, required String code}) async {
    final result = await _repository.createHead(name: name, code: code);
    if (isClosed) return null;
    return result.when(
      ok: (_) {
        load(refresh: true);
        return null;
      },
      err: (f) => f,
    );
  }

  Future<Failure?> archive(String id) async {
    final result = await _repository.archiveHead(id);
    if (isClosed) return null;
    return result.when(
      ok: (_) {
        load(refresh: true);
        return null;
      },
      err: (f) => f,
    );
  }
}
