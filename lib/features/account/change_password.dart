import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/error/failure.dart';
import '../../core/error/result.dart';
import '../../core/network/api_client.dart';

/// ADM-1: changing one's own password. The server checks the current one,
/// applies the policy, and ends every session, this phone's included.
class AccountApi {
  const AccountApi(this._client);
  final ApiClient _client;

  Future<Result<void>> changePassword({required String current, required String next}) =>
      _client.post('/v1/auth/password', {'current_password': current, 'new_password': next}, (_) {});
}

typedef ChangePasswordCall = Future<Result<void>> Function({required String current, required String next});

class ChangePasswordState {
  const ChangePasswordState({this.busy = false, this.failure, this.done = false});

  final bool busy;
  final Failure? failure;

  /// Changed; every session has ended and the person signs in again.
  final bool done;
}

class ChangePasswordCubit extends Cubit<ChangePasswordState> {
  ChangePasswordCubit(this._change) : super(const ChangePasswordState());

  final ChangePasswordCall _change;

  static Failure _invalid(String message, [String? field]) => Failure(
    code: FailureCode.validationFailed,
    message: message,
    fieldErrors: field == null ? const {} : {field: message},
  );

  Future<void> submit({required String current, required String next, required String again}) async {
    if (current.isEmpty) return emit(ChangePasswordState(failure: _invalid('Enter your current password.', 'current_password')));
    if (next.length < 10 || !RegExp('[a-zA-Z]').hasMatch(next) || !RegExp('[0-9]').hasMatch(next)) {
      return emit(ChangePasswordState(
        failure: _invalid('Use at least ten characters, with a letter and a number.', 'new_password'),
      ));
    }
    if (next == current) {
      return emit(ChangePasswordState(failure: _invalid('Choose a new password, not the current one.', 'new_password')));
    }
    if (next != again) return emit(ChangePasswordState(failure: _invalid('The passwords do not match.', 'again')));

    emit(const ChangePasswordState(busy: true));
    final result = await _change(current: current, next: next);
    if (isClosed) return;
    result.when(
      ok: (_) => emit(const ChangePasswordState(done: true)),
      err: (f) => emit(ChangePasswordState(failure: f)),
    );
  }
}
