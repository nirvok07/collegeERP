import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';

enum FeeReportKind { collection, outstanding, defaulters, register }

class FeeReportsState {
  const FeeReportsState({
    this.status = LoadStatus.loading,
    this.tab = FeeReportKind.collection,
    this.collection = const [],
    this.outstanding = const [],
    this.defaulters = const [],
    this.register = const [],
    this.defaulterDays = 30,
    this.failure,
  });

  final LoadStatus status;
  final FeeReportKind tab;
  final List<FeeCollectionRow> collection;
  final List<FeeOutstandingRow> outstanding;
  final List<FeeOutstandingRow> defaulters;
  final List<FeeRegisterRow> register;
  final int defaulterDays;
  final Failure? failure;

  FeeReportsState copyWith({
    LoadStatus? status,
    FeeReportKind? tab,
    List<FeeCollectionRow>? collection,
    List<FeeOutstandingRow>? outstanding,
    List<FeeOutstandingRow>? defaulters,
    List<FeeRegisterRow>? register,
    int? defaulterDays,
    Failure? failure,
    bool clearFailure = false,
  }) =>
      FeeReportsState(
        status: status ?? this.status,
        tab: tab ?? this.tab,
        collection: collection ?? this.collection,
        outstanding: outstanding ?? this.outstanding,
        defaulters: defaulters ?? this.defaulters,
        register: register ?? this.register,
        defaulterDays: defaulterDays ?? this.defaulterDays,
        failure: clearFailure ? null : (failure ?? this.failure),
      );
}

/// G2: daily collection, outstanding, defaulters, concession/waiver
/// register — each tab reads only when it is first opened, not all four up
/// front (R73, the M11 Student Finance contract).
class FeeReportsCubit extends Cubit<FeeReportsState> {
  FeeReportsCubit(this._repository) : super(const FeeReportsState());

  final FeesRepository _repository;

  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(() => _read(state.tab))) return;
    return _read(state.tab);
  }

  Future<void> selectTab(FeeReportKind tab) async {
    emit(state.copyWith(tab: tab));
    if (!await fromSaved(() => _read(tab))) await _read(tab);
  }

  Future<void> _read(FeeReportKind tab) async {
    emit(state.copyWith(status: LoadStatus.loading, clearFailure: true));
    switch (tab) {
      case FeeReportKind.collection:
        final today = DateTime.now().toUtc();
        final from = _isoDate(today.subtract(const Duration(days: 6)));
        final to = _isoDate(today);
        final result = await _repository.collectionReport(from: from, to: to);
        if (isClosed) return;
        result.when(
          ok: (rows) => emit(state.copyWith(
              status: rows.isEmpty ? LoadStatus.empty : LoadStatus.success, collection: rows, clearFailure: true)),
          err: (f) => emit(state.copyWith(status: LoadStatus.failure, failure: f)),
        );
      case FeeReportKind.outstanding:
        final result = await _repository.outstandingReport();
        if (isClosed) return;
        result.when(
          ok: (rows) => emit(state.copyWith(
              status: rows.isEmpty ? LoadStatus.empty : LoadStatus.success, outstanding: rows, clearFailure: true)),
          err: (f) => emit(state.copyWith(status: LoadStatus.failure, failure: f)),
        );
      case FeeReportKind.defaulters:
        final result = await _repository.defaultersReport(days: state.defaulterDays);
        if (isClosed) return;
        result.when(
          ok: (rows) => emit(state.copyWith(
              status: rows.isEmpty ? LoadStatus.empty : LoadStatus.success, defaulters: rows, clearFailure: true)),
          err: (f) => emit(state.copyWith(status: LoadStatus.failure, failure: f)),
        );
      case FeeReportKind.register:
        final result = await _repository.requestsRegisterReport();
        if (isClosed) return;
        result.when(
          ok: (rows) => emit(state.copyWith(
              status: rows.isEmpty ? LoadStatus.empty : LoadStatus.success, register: rows, clearFailure: true)),
          err: (f) => emit(state.copyWith(status: LoadStatus.failure, failure: f)),
        );
    }
  }

  Future<void> setDefaulterDays(int days) async {
    emit(state.copyWith(defaulterDays: days));
    await _read(FeeReportKind.defaulters);
  }

  static String _isoDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}
