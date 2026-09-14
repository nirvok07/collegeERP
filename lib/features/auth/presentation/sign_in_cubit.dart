import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/network/auth_api.dart';
import '../../../core/session/session_manager.dart';

enum SignInStep { identifier, code }

class SignInState {
  const SignInState({
    this.step = SignInStep.identifier,
    this.identifier = '',
    this.challenge,
    this.submitting = false,
    this.failure,
    this.notice,
  });

  final SignInStep step;

  /// What was typed: an email, a mobile number, or an enrolment number.
  final String identifier;
  final CodeChallenge? challenge;
  final bool submitting;
  final Failure? failure;

  /// Said after a new code is sent, so the earlier one is not typed in vain.
  final String? notice;
}

/// AD-82: sign-in in two steps, who and then the code sent to them. There is
/// no password. The session manager owns the tokens; the code passes through
/// here only on its way to the server.
class SignInCubit extends Cubit<SignInState> {
  SignInCubit(this._session, this._institutionCode) : super(const SignInState());

  final SessionManager _session;
  final String _institutionCode;

  static final _sixDigits = RegExp(r'^\d{6}$');

  /// Digits only, at most six, whatever was pasted ("123 456", "Code: 123456").
  static String normaliseCode(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    return digits.length > 6 ? digits.substring(0, 6) : digits;
  }

  static Failure _invalid(String message) => Failure(code: FailureCode.validationFailed, message: message);

  /// [again] is "send a new code" from the code step.
  Future<void> requestCode(String identifier, {bool again = false}) async {
    final who = identifier.trim();
    if (who.isEmpty) {
      return emit(SignInState(failure: _invalid('Enter your email or mobile number.')));
    }
    emit(SignInState(step: state.step, identifier: who, challenge: state.challenge, submitting: true));
    final result = await _session.requestCode(institutionCode: _institutionCode, identifier: who);
    if (isClosed) return;
    result.when(
      ok: (challenge) => emit(SignInState(
        step: SignInStep.code,
        identifier: who,
        challenge: challenge,
        notice: again ? 'A new code is on its way. The earlier one no longer works.' : null,
      )),
      err: (failure) => emit(SignInState(step: state.step, identifier: who, challenge: state.challenge, failure: failure)),
    );
  }

  Future<void> submitCode(String raw) async {
    final challenge = state.challenge;
    if (challenge == null) return changeIdentifier();
    final code = normaliseCode(raw);
    if (!_sixDigits.hasMatch(code)) {
      return emit(SignInState(
        step: SignInStep.code,
        identifier: state.identifier,
        challenge: challenge,
        failure: _invalid('Enter the six-digit code.'),
      ));
    }
    emit(SignInState(step: SignInStep.code, identifier: state.identifier, challenge: challenge, submitting: true));
    final result = await _session.signInWithCode(
      institutionCode: _institutionCode,
      challenge: challenge.token,
      code: code,
    );
    if (isClosed) return;
    // On success the app changes screens on the session's SignedIn event.
    emit(SignInState(
      step: SignInStep.code,
      identifier: state.identifier,
      challenge: challenge,
      failure: result.failureOrNull,
    ));
  }

  /// Back to the first step, keeping what was typed.
  void changeIdentifier() => emit(SignInState(identifier: state.identifier));
}
