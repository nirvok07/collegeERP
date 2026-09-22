import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/offerings_api.dart';
import '../domain/offering.dart';

class SectionOfferingsState {
  const SectionOfferingsState({this.status = LoadStatus.loading, this.offerings = const [], this.failure});

  final LoadStatus status;
  final List<Offering> offerings;
  final Failure? failure;
}

/// The courses taught to one section, and new ones.
class SectionOfferingsCubit extends Cubit<SectionOfferingsState> {
  SectionOfferingsCubit(this.repository, this.sectionId) : super(const SectionOfferingsState());

  final OfferingsRepository repository;
  final String sectionId;

  /// Opens on what was saved; the network is asked only when nothing was
  /// saved, or on an explicit refresh (feedbackchanges.md: no call on every open).
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    final result = await repository.forSection(sectionId);
    if (isClosed) return;
    result.when(
      ok: (list) => emit(SectionOfferingsState(
        status: LoadStatus.success,
        offerings: [...list]..sort((a, b) => a.courseCode.compareTo(b.courseCode)),
      )),
      err: (f) => emit(SectionOfferingsState(status: LoadStatus.failure, offerings: state.offerings, failure: f)),
    );
  }

  Future<Failure?> create(String courseId, String component) async {
    final failure = (await repository.create(sectionId: sectionId, courseId: courseId, component: component)).failureOrNull;
    if (failure == null && !isClosed) await load(refresh: true);
    return failure;
  }
}

class OfferingState {
  const OfferingState({this.status = LoadStatus.loading, this.offering, this.roster = const [], this.failure});

  final LoadStatus status;
  final Offering? offering;
  final List<RosterStudent> roster;
  final Failure? failure;
}

/// One offering: its lifecycle, teachers and roster.
class OfferingCubit extends Cubit<OfferingState> {
  OfferingCubit(this.repository, this.offeringId) : super(const OfferingState());

  final OfferingsRepository repository;
  final String offeringId;

  Future<void> load() async {
    final offering = repository.offering(offeringId);
    final roster = repository.roster(offeringId);
    final o = await offering, r = await roster;
    if (isClosed) return;
    final failure = o.failureOrNull ?? r.failureOrNull;
    if (failure != null) {
      return emit(OfferingState(
        status: state.offering == null ? LoadStatus.failure : LoadStatus.success,
        offering: state.offering,
        roster: state.roster,
        failure: failure,
      ));
    }
    emit(OfferingState(
      status: LoadStatus.success,
      offering: o.valueOrNull,
      roster: [...r.valueOrNull!]..sort((a, b) => a.enrolmentNumber.compareTo(b.enrolmentNumber)),
    ));
  }

  Future<Failure?> _thenReload(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }

  Future<Failure?> transition(String to, {String? reason}) =>
      _thenReload(repository.transition(offeringId, to, reason: reason?.trim()));

  Future<Failure?> assign(String personId, String role) => _thenReload(repository.assign(offeringId, personId, role));

  Future<Failure?> endAssignment(String assignmentId, String reason) =>
      _thenReload(repository.endAssignment(assignmentId, reason.trim()));

  /// The count enrolled when the server says, for the message.
  Future<({Failure? failure, int? count})> enrolSection() async {
    final result = await repository.enrolSection(offeringId);
    if (result.failureOrNull == null && !isClosed) await load();
    return (failure: result.failureOrNull, count: result.valueOrNull);
  }

  Future<Failure?> enrol(List<String> studentIds) async {
    for (final id in studentIds) {
      final failure = (await repository.enrol(offeringId, id)).failureOrNull;
      if (failure != null) {
        if (!isClosed) await load();
        return failure;
      }
    }
    if (!isClosed) await load();
    return null;
  }

  Future<Failure?> drop(String studentId, String reason) =>
      _thenReload(repository.drop(offeringId, studentId, reason.trim()));
}
