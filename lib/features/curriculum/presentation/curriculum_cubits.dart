import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/widgets/screen_state.dart';
import '../../academic/domain/academic.dart';
import '../data/curriculum_api.dart';
import '../domain/curriculum.dart';

class CurriculumState {
  const CurriculumState({
    this.status = LoadStatus.loading,
    this.programs = const [],
    this.programId,
    this.versions = const [],
    this.courses = const [],
    this.failure,
  });

  final LoadStatus status;
  final List<Program> programs;
  final String? programId;
  final List<CurriculumVersion> versions;
  final List<Course> courses;
  final Failure? failure;

  Program? get program => programs.where((p) => p.id == programId).firstOrNull;

  CurriculumState copyWith({
    LoadStatus? status,
    List<Program>? programs,
    String? programId,
    List<CurriculumVersion>? versions,
    List<Course>? courses,
    Failure? failure,
    bool clearFailure = false,
  }) => CurriculumState(
    status: status ?? this.status,
    programs: programs ?? this.programs,
    programId: programId ?? this.programId,
    versions: versions ?? this.versions,
    courses: courses ?? this.courses,
    failure: clearFailure ? null : (failure ?? this.failure),
  );
}

/// Programs, the chosen program's regulations, and the course catalogue.
class CurriculumCubit extends Cubit<CurriculumState> {
  CurriculumCubit(this.repository) : super(const CurriculumState());

  final CurriculumRepository repository;

  Future<void> load() async {
    final programs = repository.programs();
    final courses = repository.courses();
    final p = await programs, c = await courses;
    if (isClosed) return;
    final failure = p.failureOrNull ?? c.failureOrNull;
    if (failure != null) return emit(state.copyWith(status: LoadStatus.failure, failure: failure));
    final list = p.valueOrNull!;
    final chosen = list.any((x) => x.id == state.programId) ? state.programId : list.firstOrNull?.id;
    emit(state.copyWith(
      status: LoadStatus.success,
      programs: list,
      programId: chosen,
      courses: _sorted(c.valueOrNull!),
      clearFailure: true,
    ));
    if (chosen != null) await _loadVersions(chosen);
  }

  static List<Course> _sorted(List<Course> courses) => [...courses]..sort((a, b) => a.code.compareTo(b.code));

  Future<void> selectProgram(String id) async {
    emit(state.copyWith(programId: id, versions: const []));
    await _loadVersions(id);
  }

  Future<void> _loadVersions(String programId) async {
    final result = await repository.versions(programId);
    if (isClosed || state.programId != programId) return;
    result.when(
      ok: (v) => emit(state.copyWith(versions: [...v]..sort((a, b) => b.regulationYear.compareTo(a.regulationYear)))),
      err: (f) => emit(state.copyWith(failure: f)),
    );
  }

  Future<void> refresh() => load();

  Future<Failure?> _thenReload(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }

  Future<Failure?> createCourse(String code, String title, String description) => _thenReload(
    repository.createCourse(code: code.trim().toUpperCase(), title: title.trim(), description: description.trim()),
  );

  Future<Failure?> retitleCourse(String id, String title, String description) =>
      _thenReload(repository.retitleCourse(id, title: title.trim(), description: description.trim()));

  /// The new draft's id, to open it straight away.
  Future<({Failure? failure, String? id})> createDraft(int year, int terms, String title) async {
    final programId = state.programId;
    if (programId == null) return (failure: null, id: null);
    final result = await repository.createDraft(
      programId: programId,
      regulationYear: year,
      totalTerms: terms,
      title: title.trim(),
    );
    if (result.failureOrNull == null && !isClosed) await _loadVersions(programId);
    return (failure: result.failureOrNull, id: result.valueOrNull);
  }
}

class VersionState {
  const VersionState({this.status = LoadStatus.loading, this.detail, this.failure});

  final LoadStatus status;
  final VersionDetail? detail;
  final Failure? failure;
}

/// One curriculum version: its terms and, while it is a draft, its changes.
class VersionCubit extends Cubit<VersionState> {
  VersionCubit(this.repository, this.versionId) : super(const VersionState());

  final CurriculumRepository repository;
  final String versionId;

  Future<void> load() async {
    final result = await repository.version(versionId);
    if (isClosed) return;
    result.when(
      ok: (d) => emit(VersionState(status: LoadStatus.success, detail: d)),
      err: (f) => emit(VersionState(
        status: state.detail == null ? LoadStatus.failure : LoadStatus.success,
        detail: state.detail,
        failure: f,
      )),
    );
  }

  Future<Failure?> _thenReload(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }

  Future<Failure?> addEntry({
    required String courseId,
    required int term,
    required num credits,
    required String requirement,
    String? electiveGroup,
  }) => _thenReload(repository.addEntry(
    versionId,
    courseId: courseId,
    termNumber: term,
    credits: credits,
    requirement: requirement,
    electiveGroup: requirement == 'elective' ? electiveGroup?.trim() : null,
  ));

  Future<Failure?> removeEntry(String entryId) => _thenReload(repository.removeEntry(versionId, entryId));

  Future<Failure?> publish() => _thenReload(repository.publish(versionId));

  Future<({Failure? failure, String? id})> successor(String kind, String reason, int? year) async {
    final result = await repository.successor(versionId, kind: kind, reason: reason.trim(), regulationYear: year);
    return (failure: result.failureOrNull, id: result.valueOrNull);
  }
}
