import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/widgets/screen_state.dart';
import '../../academic/domain/academic.dart';
import '../data/sections_api.dart';
import '../domain/section.dart';

class SectionsState {
  const SectionsState({
    this.status = LoadStatus.loading,
    this.sections = const [],
    this.programs = const [],
    this.terms = const [],
    this.termId,
    this.failure,
  });

  final LoadStatus status;
  final List<Section> sections;
  final List<Program> programs;
  final List<Term> terms;

  /// The term the list shows; null shows every term.
  final String? termId;
  final Failure? failure;

  List<Section> get shown => [
        for (final s in sections)
          if (termId == null || s.termId == termId) s,
      ]..sort((a, b) {
          final p = a.programName.compareTo(b.programName);
          if (p != 0) return p;
          final t = a.termNumber.compareTo(b.termNumber);
          return t != 0 ? t : a.label.compareTo(b.label);
        });

  SectionsState copyWith({
    LoadStatus? status,
    List<Section>? sections,
    List<Program>? programs,
    List<Term>? terms,
    String? termId,
    bool allTerms = false,
    Failure? failure,
  }) => SectionsState(
    status: status ?? this.status,
    sections: sections ?? this.sections,
    programs: programs ?? this.programs,
    terms: terms ?? this.terms,
    termId: allTerms ? null : (termId ?? this.termId),
    failure: failure,
  );
}

/// The college's sections, filtered by term, and new ones. It opens on the
/// term that contains [today], which is the one people are working in.
class SectionsCubit extends Cubit<SectionsState> {
  SectionsCubit(this.repository, {required DateTime today})
      : _today = today,
        super(const SectionsState());

  final SectionsRepository repository;
  final DateTime _today;

  Future<void> load() async {
    final sections = repository.sections();
    final programs = repository.programs();
    final terms = repository.terms();
    final s = await sections, p = await programs, t = await terms;
    if (isClosed) return;
    final failure = s.failureOrNull ?? p.failureOrNull ?? t.failureOrNull;
    if (failure != null) return emit(state.copyWith(status: LoadStatus.failure, failure: failure));
    final termList = [...t.valueOrNull!]..sort((a, b) => b.startsOn.compareTo(a.startsOn));
    final first = state.status == LoadStatus.loading;
    final current = termList
        .where((x) => !x.startsOn.isAfter(_today) && !x.endsOn.isBefore(_today))
        .firstOrNull;
    emit(state.copyWith(
      status: LoadStatus.success,
      sections: s.valueOrNull!,
      programs: p.valueOrNull!,
      terms: termList,
      termId: first ? current?.id : state.termId,
      allTerms: first && current == null,
    ));
  }

  void showTerm(String? termId) => emit(state.copyWith(termId: termId, allTerms: termId == null));

  Future<Failure?> create({
    required String programId,
    required String termId,
    required int termNumber,
    required String label,
    int? capacity,
  }) async {
    final failure = (await repository.createSection(
      programId: programId,
      termId: termId,
      termNumber: termNumber,
      label: label.trim().toUpperCase(),
      capacity: capacity,
    )).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }
}

class SectionState {
  const SectionState({this.status = LoadStatus.loading, this.section, this.members = const [], this.failure});

  final LoadStatus status;
  final Section? section;
  final List<Member> members;
  final Failure? failure;
}

/// One section: its lifecycle, capacity and members. Members are read only
/// by someone who may see students.
class SectionCubit extends Cubit<SectionState> {
  SectionCubit(this.repository, this.sectionId, {required bool members})
      : _members = members,
        super(const SectionState());

  final SectionsRepository repository;
  final String sectionId;
  final bool _members;

  Future<void> load() async {
    final section = repository.section(sectionId);
    final members = _members ? repository.members(sectionId) : Future.value(const Ok(<Member>[]));
    final s = await section, m = await members;
    if (isClosed) return;
    final failure = s.failureOrNull ?? m.failureOrNull;
    if (failure != null) {
      return emit(SectionState(
        status: state.section == null ? LoadStatus.failure : LoadStatus.success,
        section: state.section,
        members: state.members,
        failure: failure,
      ));
    }
    emit(SectionState(
      status: LoadStatus.success,
      section: s.valueOrNull,
      members: [...m.valueOrNull!]..sort((a, b) => a.enrolmentNumber.compareTo(b.enrolmentNumber)),
    ));
  }

  Future<Failure?> _thenReload(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }

  Future<Failure?> transition(String to, {String? reason}) =>
      _thenReload(repository.transition(sectionId, to, reason: reason?.trim()));

  Future<Failure?> setCapacity(int? capacity) => _thenReload(repository.setCapacity(sectionId, capacity));

  Future<Result<List<Member>>> unplaced({String? search}) =>
      repository.unplaced(state.section!.programId, search: search);

  /// Places each student in turn and stops at the first refusal, so what was
  /// done and what was refused are both clear.
  Future<Failure?> place(List<String> studentIds) async {
    for (final id in studentIds) {
      final failure = (await repository.place(sectionId, id)).failureOrNull;
      if (failure != null) {
        if (!isClosed) await load();
        return failure;
      }
    }
    if (!isClosed) await load();
    return null;
  }

  Future<Failure?> remove(String studentId, String reason) =>
      _thenReload(repository.endPlacement(sectionId, studentId, reason.trim()));
}
