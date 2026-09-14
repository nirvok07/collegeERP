import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/error/failure.dart';
import '../../core/error/result.dart';
import '../../core/network/auth_api.dart';
import 'platform_auth_api.dart';

enum PlatformSignInStep { password, code, enrol }

class PlatformSignInState {
  const PlatformSignInState({
    this.step = PlatformSignInStep.password,
    this.challenge,
    this.enrolment,
    this.busy = false,
    this.failure,
    this.notice,
  });

  final PlatformSignInStep step;
  final String? challenge;

  /// Present only while setting up the authenticator, and only in memory.
  final TotpEnrolment? enrolment;
  final bool busy;
  final Failure? failure;
  final String? notice;
}

/// Platform sign-in in two steps (AD-62): the password never signs anybody in
/// on its own. It leads to a code from the authenticator, or to setting one up
/// first. The flow is the web console's, step for step.
class PlatformSignInCubit extends Cubit<PlatformSignInState> {
  PlatformSignInCubit(this._api, this._adopt) : super(const PlatformSignInState());

  final PlatformAuthApi _api;
  final Future<void> Function(AuthSession session) _adopt;

  static final _codePattern = RegExp(r'^\d{6}$');

  /// An expired or used step cannot be retried; it goes back to the password.
  static bool _stepGone(Failure f) =>
      f.code == FailureCode.accountLocked || RegExp('expired|start again', caseSensitive: false).hasMatch(f.message);

  /// Digits only, at most six, whatever was pasted.
  static String normaliseCode(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    return digits.length > 6 ? digits.substring(0, 6) : digits;
  }

  Future<void> submitPassword({required String email, required String password}) async {
    if (email.trim().isEmpty || password.isEmpty) {
      emit(const PlatformSignInState(
        failure: Failure(code: FailureCode.validationFailed, message: 'Enter your email and password.'),
      ));
      return;
    }
    emit(const PlatformSignInState(busy: true));
    final result = await _api.signIn(email: email.trim().toLowerCase(), password: password);
    if (isClosed) return;
    await _continue(result);
  }

  /// SAM-3: an invitation from an Owner, accepted here with a password only
  /// this person knows. It continues exactly as a first sign-in does.
  Future<void> acceptInvitation({required String token, required String password, required String again}) async {
    Failure invalid(String m) => Failure(code: FailureCode.validationFailed, message: m);
    if (token.trim().isEmpty) return emit(PlatformSignInState(failure: invalid('Enter the invitation code from your message.')));
    if (password.length < 10 || !RegExp('[a-zA-Z]').hasMatch(password) || !RegExp('[0-9]').hasMatch(password)) {
      return emit(PlatformSignInState(failure: invalid('Use at least ten characters, with a letter and a number.')));
    }
    if (password != again) return emit(PlatformSignInState(failure: invalid('The passwords do not match.')));
    emit(const PlatformSignInState(busy: true));
    final result = await _api.acceptInvitation(token: token.trim(), password: password);
    if (isClosed) return;
    await _continue(result);
  }

  Future<void> _continue(Result<PlatformStep> result) async {
    final step = result.valueOrNull;
    if (step == null) {
      emit(PlatformSignInState(failure: result.failureOrNull));
      return;
    }
    if (step.kind == PlatformStepKind.secondFactor) {
      emit(PlatformSignInState(step: PlatformSignInStep.code, challenge: step.challenge));
      return;
    }
    // Enrolment: fetch the secret now, so the screen can show it at once.
    emit(PlatformSignInState(step: PlatformSignInStep.enrol, challenge: step.challenge, busy: true));
    final enrolment = await _api.beginEnrolment(step.challenge);
    if (isClosed) return;
    enrolment.when(
      ok: (e) => emit(PlatformSignInState(step: PlatformSignInStep.enrol, challenge: step.challenge, enrolment: e)),
      err: (f) => emit(PlatformSignInState(failure: f)),
    );
  }

  Future<void> submitCode(String raw) async {
    final challenge = state.challenge;
    final code = normaliseCode(raw);
    if (challenge == null) return restart();
    if (!_codePattern.hasMatch(code)) {
      emit(PlatformSignInState(
        step: PlatformSignInStep.code,
        challenge: challenge,
        failure: const Failure(code: FailureCode.validationFailed, message: 'Enter the six-digit code.'),
      ));
      return;
    }
    emit(PlatformSignInState(step: PlatformSignInStep.code, challenge: challenge, busy: true));
    final result = await _api.verifyCode(challenge: challenge, code: code);
    if (isClosed) return;
    final session = result.valueOrNull;
    if (session != null) {
      // The app switches screens on the session's SignedIn event.
      await _adopt(session);
      return;
    }
    final failure = result.failureOrNull!;
    if (_stepGone(failure)) {
      emit(PlatformSignInState(failure: failure));
    } else {
      emit(PlatformSignInState(step: PlatformSignInStep.code, challenge: challenge, failure: failure));
    }
  }

  Future<void> confirmEnrolment(String raw) async {
    final challenge = state.challenge;
    final enrolment = state.enrolment;
    final code = normaliseCode(raw);
    if (challenge == null || enrolment == null) return restart();
    if (!_codePattern.hasMatch(code)) {
      emit(PlatformSignInState(
        step: PlatformSignInStep.enrol,
        challenge: challenge,
        enrolment: enrolment,
        failure: const Failure(code: FailureCode.validationFailed, message: 'Enter the six-digit code.'),
      ));
      return;
    }
    emit(PlatformSignInState(step: PlatformSignInStep.enrol, challenge: challenge, enrolment: enrolment, busy: true));
    final result = await _api.confirmEnrolment(challenge: challenge, code: code);
    if (isClosed) return;
    result.when(
      ok: (_) => restart(notice: 'Your authenticator is set up. Sign in with your password and a code.'),
      err: (failure) => emit(_stepGone(failure)
          ? PlatformSignInState(failure: failure)
          : PlatformSignInState(
              step: PlatformSignInStep.enrol,
              challenge: challenge,
              enrolment: enrolment,
              failure: failure,
            )),
    );
  }

  void restart({String? notice}) => emit(PlatformSignInState(notice: notice));
}
