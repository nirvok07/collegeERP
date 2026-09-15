import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/widgets/screen_state.dart';
import '../../academic/data/academic_api.dart';
import '../../academic/domain/academic.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';

class FeeStructuresState {
  const FeeStructuresState({
    this.status = LoadStatus.loading,
    this.structures = const [],
    this.programs = const [],
    this.years = const [],
    this.failure,
  });

  final LoadStatus status;
  final List<FeeStructure> structures;
  final List<Program> programs;
  final List<AcademicYear> years;
  final Failure? failure;

  FeeStructuresState copyWith({
    LoadStatus? status,
    List<FeeStructure>? structures,
    List<Program>? programs,
    List<AcademicYear>? years,
    Failure? failure,
    bool clearFailure = false,
  }) =>
      FeeStructuresState(
        status: status ?? this.status,
        structures: structures ?? this.structures,
        programs: programs ?? this.programs,
        years: years ?? this.years,
        failure: clearFailure ? null : (failure ?? this.failure),
      );
}

/// FEE-1: fee structures, one per program and academic year.
class FeeStructuresCubit extends Cubit<FeeStructuresState> {
  FeeStructuresCubit(this._fees, this._academic) : super(const FeeStructuresState());

  final FeesRepository _fees;
  final AcademicRepository _academic;

  Future<void> load() async {
    emit(state.copyWith(status: LoadStatus.loading, clearFailure: true));
    final results = await Future.wait<Object?>([_fees.structures(), _academic.programs(), _academic.years()]);
    if (isClosed) return;
    final structures = results[0] as Result<List<FeeStructure>>;
    final programs = results[1] as Result<List<Program>>;
    final years = results[2] as Result<List<AcademicYear>>;
    final failure = structures.failureOrNull ?? programs.failureOrNull ?? years.failureOrNull;
    if (failure != null) {
      emit(state.copyWith(status: LoadStatus.failure, failure: failure));
      return;
    }
    final list = structures.valueOrNull!;
    emit(state.copyWith(
      status: list.isEmpty ? LoadStatus.empty : LoadStatus.success,
      structures: list,
      programs: programs.valueOrNull!,
      years: years.valueOrNull!,
      clearFailure: true,
    ));
  }

  Future<Failure?> create({required String programId, required String academicYearId}) async {
    final result = await _fees.createStructure(programId: programId, academicYearId: academicYearId);
    if (isClosed) return null;
    return result.when(
      ok: (_) {
        load();
        return null;
      },
      err: (f) => f,
    );
  }
}
