import 'dart:async';

import '../error/failure.dart';
import '../error/result.dart';
import '../network/auth_api.dart';
import 'session_store.dart';

/// Who is signed in.
class Actor {
  const Actor({
    required this.id,
    required this.fullName,
    required this.tenantId,
  });

  final String id;
  final String fullName;
  final String? tenantId;
}

enum SessionPhase { restoring, signedOut, signedIn }

sealed class SessionEvent {
  const SessionEvent();
}

class SignedIn extends SessionEvent {
  const SignedIn(this.actor);
  final Actor actor;
}

class SignedOut extends SessionEvent {
  const SignedOut(this.reason);

  /// `user` for an explicit sign-out, `sessionEnded` when renewal was refused.
  final String reason;
}

class SessionDegraded extends SessionEvent {
  const SessionDegraded(this.failure);
  final Failure failure;
}

class SessionRecovered extends SessionEvent {
  const SessionRecovered();
}

/// Session lifetime on mobile, mirroring the web client's rules.
///
/// The user is not signed out because an access token expired, because the app
/// was closed for a week, or because the network dropped. Only an unrenewable
/// session, an explicit sign-out, or a revoked credential ends one.
///
/// The transport differs from web and nothing else does: there is no cookie jar
/// worth relying on, so the refresh token travels in the request body and rests
/// in platform secure storage.
class SessionManager {
  SessionManager({required AuthApi api, required SessionStore store})
      : _api = api,
        _store = store;
  // Named parameters are kept public-facing (`api`, `store`) while the fields
  // stay private, which the initializing-formal lint cannot express.


  final AuthApi _api;
  final SessionStore _store;
  final _events = StreamController<SessionEvent>.broadcast();

  Stream<SessionEvent> get events => _events.stream;

  Actor? _actor;
  String? _accessToken;
  DateTime? _expiresAt;
  Timer? _renewTimer;
  Future<bool>? _inFlight;
  int _retryIndex = 0;

  static const _renewMargin = Duration(seconds: 60);
  static const _retryDelays = [
    Duration(seconds: 2),
    Duration(seconds: 5),
    Duration(seconds: 15),
    Duration(seconds: 30),
    Duration(minutes: 1),
  ];

  Actor? get actor => _actor;

  /// A renewal failed for a transient reason and a retry is scheduled. The
  /// session is intact; only the network is missing (AD-25). A launch in this
  /// state must wait, never ask for a password.
  bool get renewalPending => _retryIndex > 0 && (_renewTimer?.isActive ?? false);

  /// Null when absent or expiring, which tells callers to renew first.
  String? get accessToken {
    final expiry = _expiresAt;
    if (_accessToken == null || expiry == null) return null;
    return expiry.isAfter(DateTime.now()) ? _accessToken : null;
  }

  /// Called once at launch. A stored refresh token means no sign-in screen.
  Future<bool> restore() async {
    final token = await _store.readRefreshToken();
    if (token == null) return false;
    return renew();
  }

  Future<Result<void>> signIn({
    required String institutionCode,
    required String identifier,
    required String password,
  }) async {
    final result = await _api.signIn(
      institutionCode: institutionCode,
      identifier: identifier,
      password: password,
    );
    return result.when(
      ok: (session) async {
        await _adopt(session);
        await _store.writeInstitutionCode(institutionCode);
        _events.add(SignedIn(_actor!));
        return const Ok<void>(null);
      },
      err: (failure) async => Err<void>(failure),
    );
  }

  Future<void> signOut() async {
    _renewTimer?.cancel();
    final token = await _store.readRefreshToken();
    _actor = null;
    _accessToken = null;
    _expiresAt = null;
    await _store.clear();
    // Best effort: the local session has already gone, so a network failure
    // here must not strand the user on a screen they have logically left.
    if (token != null) await _api.signOut(token).catchError((_) {});
    _events.add(const SignedOut('user'));
  }

  /// Single-flight: many simultaneous rejections cause one renewal.
  Future<bool> renew() {
    return _inFlight ??= _performRenew().whenComplete(() => _inFlight = null);
  }

  Future<bool> _performRenew() async {
    final token = await _store.readRefreshToken();
    if (token == null) {
      _endSession();
      return false;
    }

    final result = await _api.refresh(token);
    return result.when(
      ok: (session) async {
        await _adopt(session);
        if (_retryIndex > 0) {
          _retryIndex = 0;
          _events.add(const SessionRecovered());
        }
        return true;
      },
      err: (failure) async {
        // A transient failure keeps the session. Signing someone out because a
        // train went into a tunnel is exactly the behaviour being avoided.
        if (failure.isTransient) {
          _events.add(SessionDegraded(failure));
          _scheduleRetry();
          return false;
        }
        _endSession();
        return false;
      },
    );
  }

  Future<void> _adopt(AuthSession session) async {
    _accessToken = session.accessToken;
    _expiresAt = session.accessTokenExpiresAt;
    _actor = session.actor;
    await _store.writeRefreshToken(session.refreshToken);
    _scheduleRenew(session.accessTokenExpiresAt);
  }

  void _scheduleRenew(DateTime expiresAt) {
    _renewTimer?.cancel();
    final delay = expiresAt.difference(DateTime.now()) - _renewMargin;
    _renewTimer = Timer(
      delay.isNegative ? const Duration(seconds: 5) : delay,
      () => unawaited(renew()),
    );
  }

  void _scheduleRetry() {
    _renewTimer?.cancel();
    final delay = _retryDelays[
        _retryIndex < _retryDelays.length ? _retryIndex : _retryDelays.length - 1];
    _retryIndex += 1;
    _renewTimer = Timer(delay, () => unawaited(renew()));
  }

  void _endSession() {
    _renewTimer?.cancel();
    _actor = null;
    _accessToken = null;
    _expiresAt = null;
    unawaited(_store.clear());
    _events.add(const SignedOut('sessionEnded'));
  }

  void dispose() {
    _renewTimer?.cancel();
    _events.close();
  }
}
