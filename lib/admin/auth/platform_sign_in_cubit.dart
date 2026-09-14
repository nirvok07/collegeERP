import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/error/failure.dart';
import '../../core/network/auth_api.dart';
import 'platform_auth_api.dart';

enum PlatformSignInStep { email, code }

class PlatformSignInState {
  const PlatformSignInState({
    this.step = PlatformSignInStep.email,
    this.email = '',
    this.challenge,
    this.busy = false,
    this.failure,
    this.notice,
  });

  final PlatformSignInStep step;
  final String email;
  final CodeChallenge? challenge;
  final bool busy;
  final Failure? failure;

  /// Said after a new code is sent, so the earlier one is not typed in vain.
  final String? notice;
}

/// Platform sign-in in two steps (AD-82): the email, then the code sent to
/// it. No password, no authenticator. The session is adopted by the shared
/// session manager and kept exactly like a college session.
class PlatformSignInCubit extends Cubit<PlatformSignInState> {
  PlatformSignInCubit(this._api, this._adopt) : super(const PlatformSignInState());

  final PlatformAuthApi _api;
  final Future<void> Function(AuthSession session) _adopt;

  static final _codePattern = RegExp(r'^\d{6}$');

  /// Digits only, at most six, whatever was pasted.
  static String normaliseCode(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    return digits.length > 6 ? digits.substring(0, 6) : digits;
  }

  static Failure _invalid(String message) => Failure(code: FailureCode.validationFailed, message: message);

  /// [again] is "send a new code" from the code step.
  Future<void> requestCode(String email, {bool again = false}) async {
    final address = email.trim().toLowerCase();
    if (!address.contains('@')) {
      return emit(PlatformSignInState(email: address, failure: _invalid('Enter your email.')));
    }
    emit(PlatformSignInState(step: state.step, email: address, challenge: state.challenge, busy: true));
    final result = await _api.requestCode(address);
    if (isClosed) return;
    result.when(
      ok: (challenge) => emit(PlatformSignInState(
        step: PlatformSignInStep.code,
        email: address,
        challenge: challenge,
        notice: again ? 'A new code is on its way. The earlier one no longer works.' : null,
      )),
      err: (failure) => emit(PlatformSignInState(step: state.step, email: address, challenge: state.challenge, failure: failure)),
    );
  }

  Future<void> submitCode(String raw) async {
    final challenge = state.challenge;
    if (challenge == null) return changeEmail();
    final code = normaliseCode(raw);
    if (!_codePattern.hasMatch(code)) {
      return emit(PlatformSignInState(
        step: PlatformSignInStep.code,
        email: state.email,
        challenge: challenge,
        failure: _invalid('Enter the six-digit code.'),
      ));
    }
    emit(PlatformSignInState(step: PlatformSignInStep.code, email: state.email, challenge: challenge, busy: true));
    final result = await _api.verifyCode(challenge: challenge.token, code: code);
    if (isClosed) return;
    final session = result.valueOrNull;
    if (session != null) {
      // The app switches screens on the session's SignedIn event.
      await _adopt(session);
      return;
    }
    emit(PlatformSignInState(
      step: PlatformSignInStep.code,
      email: state.email,
      challenge: challenge,
      failure: result.failureOrNull,
    ));
  }

  /// Back to the first step, keeping what was typed.
  void changeEmail() => emit(PlatformSignInState(email: state.email));
}
