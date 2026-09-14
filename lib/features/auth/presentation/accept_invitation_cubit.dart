import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';

typedef AcceptInvitation =
    Future<Result<void>> Function({required String institutionCode, required String token, required String password});

class AcceptInvitationState {
  const AcceptInvitationState({this.busy = false, this.failure, this.done = false});

  final bool busy;
  final Failure? failure;

  /// The password is set; the person signs in next.
  final bool done;
}

/// A college invitation on the phone (ACC-1): the invitation code from the
/// message, and a password only this person knows.
class AcceptInvitationCubit extends Cubit<AcceptInvitationState> {
  AcceptInvitationCubit(this._accept, this._institutionCode) : super(const AcceptInvitationState());

  final AcceptInvitation _accept;
  final String _institutionCode;

  static Failure _invalid(String message) => Failure(code: FailureCode.validationFailed, message: message);

  Future<void> submit({required String token, required String password, required String again}) async {
    final code = token.trim();
    if (code.isEmpty) return emit(AcceptInvitationState(failure: _invalid('Enter the code from your message.')));
    if (password.length < 10 || !RegExp('[a-zA-Z]').hasMatch(password) || !RegExp('[0-9]').hasMatch(password)) {
      return emit(AcceptInvitationState(failure: _invalid('Use at least ten characters, with a letter and a number.')));
    }
    if (password != again) return emit(AcceptInvitationState(failure: _invalid('The passwords do not match.')));

    emit(const AcceptInvitationState(busy: true));
    final result = await _accept(institutionCode: _institutionCode, token: code, password: password);
    if (isClosed) return;
    result.when(
      ok: (_) => emit(const AcceptInvitationState(done: true)),
      err: (failure) => emit(AcceptInvitationState(failure: failure)),
    );
  }
}
