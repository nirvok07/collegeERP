import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/widgets/screen_state.dart';
import '../../delivery/domain/class_session.dart';
import '../../rooms/domain/room.dart';
import '../data/timetable_api.dart';
import '../domain/timetable.dart';

class OfferingTimetableState {
  const OfferingTimetableState({this.status = LoadStatus.loading, this.slots = const [], this.rooms = const [], this.failure});

  final LoadStatus status;
  final List<Slot> slots;
  final List<Room> rooms;
  final Failure? failure;
}

/// One course's weekly pattern, and generating its classes from it.
class OfferingTimetableCubit extends Cubit<OfferingTimetableState> {
  OfferingTimetableCubit(this.repository, this.offeringId, {required bool manage})
      : _manage = manage,
        super(const OfferingTimetableState());

  final TimetableRepository repository;
  final String offeringId;
  final bool _manage;

  Future<void> load() async {
    final slots = repository.slots(offeringId);
    final rooms = _manage ? repository.rooms() : Future.value(const Ok(<Room>[]));
    final s = await slots, r = await rooms;
    if (isClosed) return;
    final failure = s.failureOrNull ?? r.failureOrNull;
    if (failure != null) {
      return emit(OfferingTimetableState(status: LoadStatus.failure, slots: state.slots, rooms: state.rooms, failure: failure));
    }
    emit(OfferingTimetableState(
      status: LoadStatus.success,
      slots: [...s.valueOrNull!]..sort((a, b) {
          final d = a.dayOfWeek.compareTo(b.dayOfWeek);
          return d != 0 ? d : a.startsAt.compareTo(b.startsAt);
        }),
      rooms: r.valueOrNull!,
    ));
  }

  Future<Failure?> _thenReload(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }

  Future<Failure?> addSlot(int day, String startsAt, String endsAt, String? roomId) =>
      _thenReload(repository.addSlot(offeringId, day: day, startsAt: startsAt, endsAt: endsAt, roomId: roomId));

  Future<Failure?> removeSlot(String id) => _thenReload(repository.removeSlot(id));

  Future<Result<GenerationReport>> preview() => repository.generate(offeringId, preview: true);

  Future<Result<GenerationReport>> generate() => repository.generate(offeringId, preview: false);
}

class TimetableState {
  const TimetableState({
    this.status = LoadStatus.loading,
    required this.weekFrom,
    this.sessions = const [],
    this.holidays = const [],
    this.rooms = const [],
    this.failure,
  });

  final LoadStatus status;

  /// The Monday of the week shown.
  final String weekFrom;
  final List<ClassSession> sessions;
  final List<Holiday> holidays;
  final List<Room> rooms;
  final Failure? failure;

  String get weekTo => shiftDate(weekFrom, 6);

  /// The week's classes by day, in time order.
  Map<String, List<ClassSession>> get byDay {
    final sorted = [...sessions]..sort((a, b) {
        final d = a.date.compareTo(b.date);
        return d != 0 ? d : a.startsAt.compareTo(b.startsAt);
      });
    final days = <String, List<ClassSession>>{};
    for (final s in sorted) {
      days.putIfAbsent(s.date, () => []).add(s);
    }
    return days;
  }

  TimetableState copyWith({
    LoadStatus? status,
    String? weekFrom,
    List<ClassSession>? sessions,
    List<Holiday>? holidays,
    List<Room>? rooms,
    Failure? failure,
  }) => TimetableState(
    status: status ?? this.status,
    weekFrom: weekFrom ?? this.weekFrom,
    sessions: sessions ?? this.sessions,
    holidays: holidays ?? this.holidays,
    rooms: rooms ?? this.rooms,
    failure: failure,
  );
}

/// The college's classes a week at a time, and its non-teaching days.
class TimetableCubit extends Cubit<TimetableState> {
  TimetableCubit(this._repository, {required String today, required bool manage})
      : _manage = manage,
        super(TimetableState(weekFrom: mondayOf(today)));

  final TimetableRepository _repository;
  final bool _manage;

  Future<void> load() async {
    final sessions = _repository.sessions(from: state.weekFrom, to: state.weekTo);
    final holidays = _repository.holidays();
    final rooms = _manage ? _repository.rooms() : Future.value(const Ok(<Room>[]));
    final s = await sessions, h = await holidays, r = await rooms;
    if (isClosed) return;
    final failure = s.failureOrNull ?? h.failureOrNull ?? r.failureOrNull;
    if (failure != null) {
      return emit(state.copyWith(status: state.status == LoadStatus.loading ? LoadStatus.failure : LoadStatus.success, failure: failure));
    }
    emit(state.copyWith(
      status: LoadStatus.success,
      sessions: s.valueOrNull,
      holidays: [...h.valueOrNull!]..sort((a, b) => a.onDate.compareTo(b.onDate)),
      rooms: r.valueOrNull,
    ));
  }

  Future<void> week(int delta) async {
    emit(state.copyWith(weekFrom: shiftDate(state.weekFrom, 7 * delta), sessions: const []));
    await load();
  }

  Future<Failure?> _thenReload(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }

  Future<Failure?> reschedule(ClassSession s, {required String date, required String startsAt, required String endsAt, String? roomId, String? reason}) =>
      _thenReload(_repository.reschedule(s.id, date: date, startsAt: startsAt, endsAt: endsAt, roomId: roomId, reason: reason));

  Future<Failure?> cancel(String sessionId, String reason) => _thenReload(_repository.cancel(sessionId, reason.trim()));

  Future<Failure?> addHoliday(String onDate, String label) => _thenReload(_repository.addHoliday(onDate, label.trim()));

  Future<Failure?> removeHoliday(String id) => _thenReload(_repository.removeHoliday(id));
}
