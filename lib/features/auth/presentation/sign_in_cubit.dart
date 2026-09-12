import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/session/session_manager.dart';

class SignInState {
  const SignInState({this.submitting = false, this.failure});

  final bool submitting;
  final Failure? failure;
}

/// The screen reports failure; the session manager owns the tokens. No
/// credential ever passes through widget state.
class SignInCubit extends Cubit<SignInState> {
  SignInCubit(this._session) : super(const SignInState());

  final SessionManager _session;

  Future<void> submit({
    required String institutionCode,
    required String identifier,
    required String password,
  }) async {
    emit(const SignInState(submitting: true));
    final result = await _session.signIn(
      institutionCode: institutionCode.trim().toLowerCase(),
      identifier: identifier.trim().toLowerCase(),
      password: password,
    );
    if (isClosed) return;
    result.when(
      ok: (_) => emit(const SignInState()),
      err: (failure) => emit(SignInState(failure: failure)),
    );
  }
}
