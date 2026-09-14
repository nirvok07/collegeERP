import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/widgets/screen_state.dart';
import '../../organisation/domain/org_unit.dart';
import '../data/academic_api.dart';
import '../domain/academic.dart';

class AcademicState {
  const AcademicState({
    this.status = LoadStatus.loading,
    this.programs = const [],
    this.departments = const [],
    this.years = const [],
    this.terms = const [],
    this.failure,
  });

  final LoadStatus status;
  final List<Program> programs;
  final List<Department> departments;
  final List<AcademicYear> years;
  final List<Term> terms;
  final Failure? failure;

  List<Term> termsOf(String yearId) =>
      terms.where((t) => t.academicYearId == yearId).toList()..sort((a, b) => a.sequence.compareTo(b.sequence));
}

/// Programs and the calendar, and their changes. The calendar is read only
/// for someone who may see sections, the permission its endpoints require.
/// Every write hands the server's refusal back to the form that asked, and
/// re-reads on success.
class AcademicCubit extends Cubit<AcademicState> {
  AcademicCubit(this._repository, {required bool calendar})
      : _calendar = calendar,
        super(const AcademicState());

  final AcademicRepository _repository;
  final bool _calendar;

  Future<void> load({bool refresh = false}) async {
    if (!refresh) emit(const AcademicState());
    final programs = _repository.programs();
    final departments = _repository.departments();
    final years = _calendar ? _repository.years() : Future.value(const Ok(<AcademicYear>[]));
    final terms = _calendar ? _repository.terms() : Future.value(const Ok(<Term>[]));
    final p = await programs, d = await departments, y = await years, t = await terms;
    if (isClosed) return;

    final failure = p.failureOrNull ?? d.failureOrNull ?? y.failureOrNull ?? t.failureOrNull;
    if (failure != null) {
      emit(AcademicState(
        status: refresh ? LoadStatus.success : LoadStatus.failure,
        programs: state.programs,
        departments: state.departments,
        years: state.years,
        terms: state.terms,
        failure: failure,
      ));
      return;
    }
    emit(AcademicState(
      status: LoadStatus.success,
      programs: p.valueOrNull!,
      departments: d.valueOrNull!,
      // A copy: the list read may be unmodifiable (a constant when there is no calendar).
      years: [...y.valueOrNull!]..sort((a, b) => b.startsOn.compareTo(a.startsOn)),
      terms: t.valueOrNull!,
    ));
  }

  Future<Failure?> _write(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load(refresh: true);
    return failure;
  }

  Future<Failure?> createProgram(ProgramInput input) => _write(_repository.createProgram(input));

  Future<Failure?> archiveProgram(String id, String reason) => _write(_repository.archiveProgram(id, reason.trim()));

  Future<Failure?> createYear(String name, DateTime startsOn, DateTime endsOn, bool makeCurrent) => _write(
    _repository.createYear(name: name.trim(), startsOn: startsOn, endsOn: endsOn, makeCurrent: makeCurrent),
  );

  Future<Failure?> createTerm(String yearId, int sequence, String name, DateTime startsOn, DateTime endsOn) => _write(
    _repository.createTerm(yearId: yearId, sequence: sequence, name: name.trim(), startsOn: startsOn, endsOn: endsOn),
  );

  // FB-2: correcting and removing. The server decides what may change; its
  // refusal comes back to the form that asked.

  Future<Failure?> renameProgram(String id, String name, String? award) =>
      _write(_repository.renameProgram(id, name: name.trim(), award: award?.trim()));

  Future<Failure?> updateYear(String id, String name, DateTime startsOn, DateTime endsOn, bool makeCurrent) => _write(
    _repository.updateYear(id, name: name.trim(), startsOn: startsOn, endsOn: endsOn, makeCurrent: makeCurrent),
  );

  Future<Failure?> archiveYear(String id, String reason) => _write(_repository.archiveYear(id, reason.trim()));

  Future<Failure?> updateTerm(String id, String name, DateTime startsOn, DateTime endsOn) =>
      _write(_repository.updateTerm(id, name: name.trim(), startsOn: startsOn, endsOn: endsOn));

  Future<Failure?> archiveTerm(String id, String reason) => _write(_repository.archiveTerm(id, reason.trim()));
}
