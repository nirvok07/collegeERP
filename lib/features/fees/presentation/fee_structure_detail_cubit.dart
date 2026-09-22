import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';

class FeeStructureDetailState {
  const FeeStructureDetailState({this.status = LoadStatus.loading, this.structure, this.heads = const [], this.failure});

  final LoadStatus status;
  final FeeStructure? structure;

  /// For the "add a line" picker.
  final List<FeeHead> heads;
  final Failure? failure;

  FeeStructureDetailState copyWith({
    LoadStatus? status,
    FeeStructure? structure,
    List<FeeHead>? heads,
    Failure? failure,
    bool clearFailure = false,
  }) =>
      FeeStructureDetailState(
        status: status ?? this.status,
        structure: structure ?? this.structure,
        heads: heads ?? this.heads,
        failure: clearFailure ? null : (failure ?? this.failure),
      );
}

/// FEE-1/FEE-2/FEE-5: one fee structure — its instalments and lines, and the
/// actions on it (publish, generate invoices, apply a late fee).
class FeeStructureDetailCubit extends Cubit<FeeStructureDetailState> {
  FeeStructureDetailCubit(this._repository, this.structureId) : super(const FeeStructureDetailState());

  final FeesRepository _repository;
  final String structureId;

  /// Opens on what was saved; the network is asked only when nothing was
  /// saved, or on an explicit refresh (feedbackchanges.md: no call on every open).
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    emit(state.copyWith(status: LoadStatus.loading, clearFailure: true));
    final results = await Future.wait([_repository.structure(structureId), _repository.heads()]);
    if (isClosed) return;
    final structure = results[0];
    final heads = results[1];
    final failure = structure.failureOrNull ?? heads.failureOrNull;
    if (failure != null) {
      emit(state.copyWith(status: LoadStatus.failure, failure: failure));
      return;
    }
    emit(state.copyWith(status: LoadStatus.success, structure: structure.valueOrNull as FeeStructure, heads: heads.valueOrNull as List<FeeHead>, clearFailure: true));
  }

  Future<Failure?> addInstalment({required String dueDate, int? lateFeePaise}) async {
    final nextSeq = (state.structure?.instalments.map((i) => i.seq).fold(0, (a, b) => a > b ? a : b) ?? 0) + 1;
    final result = await _repository.addInstalment(structureId, seq: nextSeq, dueDate: dueDate, lateFeePaise: lateFeePaise);
    if (isClosed) return null;
    return result.when(ok: (_) { load(refresh: true); return null; }, err: (f) => f);
  }

  Future<Failure?> addLine(String instalmentId, {required String feeHeadId, required int amountPaise}) async {
    final result = await _repository.addLine(instalmentId, feeHeadId: feeHeadId, amountPaise: amountPaise);
    if (isClosed) return null;
    return result.when(ok: (_) { load(refresh: true); return null; }, err: (f) => f);
  }

  Future<Failure?> publish() async {
    final result = await _repository.publishStructure(structureId);
    if (isClosed) return null;
    return result.when(ok: (_) { load(refresh: true); return null; }, err: (f) => f);
  }

  Future<Failure?> generateInvoices() async {
    final result = await _repository.generateInvoices(structureId);
    if (isClosed) return null;
    return result.when(ok: (_) => null, err: (f) => f);
  }

  Future<Failure?> applyLateFees(String instalmentId) async {
    final result = await _repository.applyLateFees(instalmentId);
    if (isClosed) return null;
    return result.when(ok: (_) => null, err: (f) => f);
  }
}
