import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/network/auth_api.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/core/session/session_manager.dart';
import 'package:college_erp/core/session/session_store.dart';
import 'package:flutter_test/flutter_test.dart';

/// The rule under test, identical to the web client's: the user is not signed
/// out while still working. Only an unrenewable session, an explicit sign-out
/// or a revoked credential ends one.
class _FakeStore implements SessionStore {
  String? token;
  String? institution;

  @override
  Future<String?> readRefreshToken() async => token;
  @override
  Future<void> writeRefreshToken(String value) async => token = value;
  @override
  Future<String?> readInstitutionCode() async => institution;
  @override
  Future<void> writeInstitutionCode(String code) async => institution = code;
  @override
  Future<void> clear() async => token = null;

  CollegeBrand? college;
  @override
  Future<CollegeBrand?> readCollege() async => college;
  @override
  Future<void> writeCollege(CollegeBrand value) async => college = value;
  @override
  Future<void> clearCollege() async => college = null;
}

class _FakeAuthApi implements AuthApi {
  @override
  Future<Result<void>> activateStudent({
    required String institutionCode,
    required String enrolmentNumber,
    required String code,
    required String password,
  }) async => const Err(Failure.unknown);

  _FakeAuthApi(this.response);

  Result<AuthSession> response;
  int refreshCalls = 0;
  int signOutCalls = 0;

  static AuthSession session({Duration validFor = const Duration(minutes: 15)}) => AuthSession(
        actor: const Actor(id: 'p1', fullName: 'Asha Rao', tenantId: 't1'),
        accessToken: 'access-${DateTime.now().microsecondsSinceEpoch}',
        accessTokenExpiresAt: DateTime.now().add(validFor),
        refreshToken: 'refresh-${DateTime.now().microsecondsSinceEpoch}',
      );

  @override
  Future<Result<AuthSession>> signIn({
    required String institutionCode,
    required String identifier,
    required String password,
  }) async =>
      response;

  @override
  Future<Result<AuthSession>> refresh(String refreshToken) async {
    refreshCalls += 1;
    return response;
  }

  @override
  Future<void> signOut(String refreshToken) async => signOutCalls += 1;

  @override
  Future<Result<CollegeBrand>> lookupCollege(String code) async => const Err(Failure.unknown);

  @override
  Future<Result<void>> acceptInvitation({
    required String institutionCode,
    required String token,
    required String password,
  }) async => const Err(Failure.unknown);
}

void main() {
  late _FakeStore store;
  late _FakeAuthApi api;
  late SessionManager session;

  setUp(() {
    store = _FakeStore();
    api = _FakeAuthApi(Ok(_FakeAuthApi.session()));
    session = SessionManager(api: api, store: store);
  });

  tearDown(() => session.dispose());

  test('a launch while offline keeps the session and reports the renewal as pending', () async {
    store.token = 'stored-refresh-token';
    api.response = const Err(Failure.network);
    expect(await session.restore(), isFalse);
    expect(session.renewalPending, isTrue, reason: 'the shell waits instead of asking for a password');
    expect(store.token, 'stored-refresh-token', reason: 'nothing is cleared while offline');

    api.response = Ok(_FakeAuthApi.session());
    expect(await session.renew(), isTrue);
    expect(session.renewalPending, isFalse);
    expect(session.actor?.id, 'p1');
  });

  test('a refused renewal at launch is not pending: that session really ended', () async {
    store.token = 'stored-refresh-token';
    api.response = const Err(Failure.sessionEnded);
    expect(await session.restore(), isFalse);
    expect(session.renewalPending, isFalse);
  });

  test('signing in keeps the access token in memory and the refresh token in storage', () async {
    final result = await session.signIn(
      institutionCode: 'sunrise', identifier: 'asha@sunrise.edu', password: 'pw',
    );
    expect(result.isOk, isTrue);
    expect(session.accessToken, isNotNull);
    expect(store.token, startsWith('refresh-'));
    expect(session.actor?.fullName, 'Asha Rao');
  });

  test('remembers the institution code, which is not a secret', () async {
    await session.signIn(institutionCode: 'sunrise', identifier: 'a', password: 'b');
    expect(store.institution, 'sunrise');
  });

  test('restores a session at launch without a sign-in screen', () async {
    store.token = 'stored-refresh';
    expect(await session.restore(), isTrue);
    expect(api.refreshCalls, 1);
    expect(session.actor, isNotNull);
  });

  test('does not attempt a restore when nothing was stored', () async {
    expect(await session.restore(), isFalse);
    expect(api.refreshCalls, 0);
  });

  test('a network failure does NOT sign the user out', () async {
    await session.signIn(institutionCode: 'c', identifier: 'a', password: 'b');
    final events = <SessionEvent>[];
    session.events.listen(events.add);

    api.response = const Err(Failure.network);
    expect(await session.renew(), isFalse);
    await Future<void>.delayed(Duration.zero);

    expect(events.whereType<SessionDegraded>(), isNotEmpty);
    expect(events.whereType<SignedOut>(), isEmpty);
    expect(session.actor, isNotNull, reason: 'the session survives a dropped connection');
  });

  test('a server outage does NOT sign the user out', () async {
    await session.signIn(institutionCode: 'c', identifier: 'a', password: 'b');
    final events = <SessionEvent>[];
    session.events.listen(events.add);

    api.response = const Err(Failure(code: FailureCode.server, message: 'down'));
    await session.renew();
    await Future<void>.delayed(Duration.zero);

    expect(events.whereType<SignedOut>(), isEmpty);
  });

  test('signs out only when the server refuses the renewal', () async {
    await session.signIn(institutionCode: 'c', identifier: 'a', password: 'b');
    final events = <SessionEvent>[];
    session.events.listen(events.add);

    api.response = const Err(Failure.sessionEnded);
    expect(await session.renew(), isFalse);
    await Future<void>.delayed(Duration.zero);

    expect(events.whereType<SignedOut>(), isNotEmpty);
    expect(session.actor, isNull);
    expect(store.token, isNull, reason: 'a dead token is not left on the device');
  });

  test('collapses concurrent renewals into one request', () async {
    await session.signIn(institutionCode: 'c', identifier: 'a', password: 'b');
    api.refreshCalls = 0;

    await Future.wait([session.renew(), session.renew(), session.renew()]);
    expect(api.refreshCalls, 1);
  });

  test('reports an expired access token as absent, so callers renew first', () async {
    api.response = Ok(_FakeAuthApi.session(validFor: const Duration(seconds: -1)));
    await session.signIn(institutionCode: 'c', identifier: 'a', password: 'b');
    expect(session.accessToken, isNull);
  });

  test('explicit sign-out clears the device and tells the server', () async {
    await session.signIn(institutionCode: 'c', identifier: 'a', password: 'b');
    await session.signOut();
    expect(session.actor, isNull);
    expect(store.token, isNull);
    expect(api.signOutCalls, 1);
  });
}
