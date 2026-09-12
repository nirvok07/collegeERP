import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/people_api.dart';
import '../domain/person.dart';

/// State shape matches the web client's rule: a status enum, not a union.
///
/// A union forces the UI to discard data when moving into a loading state,
/// which is wrong when a refresh should leave rows on screen.
class PeopleState {
  const PeopleState({
    this.status = LoadStatus.loading,
    this.people = const [],
    this.failure,
    this.search = '',
  });

  final LoadStatus status;
  final List<Person> people;
  final Failure? failure;
  final String search;

  PeopleState copyWith({
    LoadStatus? status,
    List<Person>? people,
    Failure? failure,
    bool clearFailure = false,
    String? search,
  }) =>
      PeopleState(
        status: status ?? this.status,
        people: people ?? this.people,
        failure: clearFailure ? null : (failure ?? this.failure),
        search: search ?? this.search,
      );
}

class PeopleCubit extends Cubit<PeopleState> {
  PeopleCubit(this._api) : super(const PeopleState());

  final PeopleApi _api;

  Future<void> load({bool refresh = false}) async {
    emit(state.copyWith(
      status: refresh ? LoadStatus.refreshing : LoadStatus.loading,
      clearFailure: true,
    ));

    final result = await _api.list(search: state.search);
    if (isClosed) return;

    result.when(
      ok: (people) => emit(state.copyWith(
        status: people.isEmpty ? LoadStatus.empty : LoadStatus.success,
        people: people,
        clearFailure: true,
      )),
      // A refresh failure keeps what is on screen; only a cold load surrenders
      // the whole surface to an error state.
      err: (failure) => emit(state.copyWith(
        status: refresh ? LoadStatus.success : LoadStatus.failure,
        failure: failure,
      )),
    );
  }

  void searchChanged(String value) {
    emit(state.copyWith(search: value));
  }
}
