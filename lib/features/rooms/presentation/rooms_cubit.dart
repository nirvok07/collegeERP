import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../../organisation/domain/org_unit.dart';
import '../data/rooms_api.dart';
import '../domain/room.dart';

class RoomsState {
  const RoomsState({this.status = LoadStatus.loading, this.rooms = const [], this.campuses = const [], this.failure});

  final LoadStatus status;
  final List<Room> rooms;
  final List<Campus> campuses;
  final Failure? failure;

  /// Rooms by campus, campuses and rooms in a stable order.
  Map<String, List<Room>> get byCampus {
    final sorted = [...rooms]..sort((a, b) {
        final c = a.campusName.compareTo(b.campusName);
        return c != 0 ? c : a.code.compareTo(b.code);
      });
    final grouped = <String, List<Room>>{};
    for (final r in sorted) {
      grouped.putIfAbsent(r.campusName, () => []).add(r);
    }
    return grouped;
  }
}

/// Rooms, and for whoever may manage them, the campuses to put new ones on.
/// Campuses are read only then: their endpoint needs `person.read`, which a
/// reader of rooms may not have.
class RoomsCubit extends Cubit<RoomsState> {
  RoomsCubit(this._repository, {required bool manage})
      : _manage = manage,
        super(const RoomsState());

  final RoomsRepository _repository;
  final bool _manage;

  /// Opens on what was saved; the network is asked only when nothing was
  /// saved, or on an explicit refresh (feedbackchanges.md: no call on every open).
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(() => _read(refresh: false))) return;
    return _read(refresh: refresh);
  }

  Future<void> _read({required bool refresh}) async {
    final rooms = _repository.rooms();
    final campuses = _manage ? _repository.campuses() : Future.value(const Ok(<Campus>[]));
    final r = await rooms, c = await campuses;
    if (isClosed) return;
    final failure = r.failureOrNull ?? c.failureOrNull;
    if (failure != null) {
      return emit(RoomsState(
        status: refresh ? LoadStatus.success : LoadStatus.failure,
        rooms: state.rooms,
        campuses: state.campuses,
        failure: failure,
      ));
    }
    emit(RoomsState(status: LoadStatus.success, rooms: r.valueOrNull!, campuses: c.valueOrNull!));
  }

  Future<Failure?> _write(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load(refresh: true);
    return failure;
  }

  Future<Failure?> create({
    required String campusId,
    required String code,
    required String name,
    required String kind,
    int? capacity,
  }) => _write(_repository.createRoom(
    campusId: campusId,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    kind: kind,
    capacity: capacity,
  ));

  Future<Failure?> update(String id, {required String name, required String kind, int? capacity}) =>
      _write(_repository.updateRoom(id, name: name.trim(), kind: kind, capacity: capacity));

  Future<Failure?> archive(String id) => _write(_repository.archiveRoom(id));
}
