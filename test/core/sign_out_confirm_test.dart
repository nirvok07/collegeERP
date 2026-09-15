import 'dart:async';

import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/network/auth_api.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/core/session/session_manager.dart';
import 'package:college_erp/core/session/session_store.dart';
import 'package:college_erp/core/widgets/confirm_sign_out.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Signing out asks first; Cancel keeps the session. Once confirmed, it ends
/// at once, even when the server never answers.
class _Store implements SessionStore {
  String? token = 'refresh';
  @override
  Future<String?> readRefreshToken() async => token;
  @override
  Future<void> writeRefreshToken(String value) async => token = value;
  @override
  Future<String?> readInstitutionCode() async => null;
  @override
  Future<void> writeInstitutionCode(String code) async {}
  @override
  Future<void> clear() async => token = null;
  @override
  Future<CollegeBrand?> readCollege() async => null;
  @override
  Future<void> writeCollege(CollegeBrand value) async {}
  @override
  Future<void> clearCollege() async {}
}

/// A server that never answers a sign-out.
class _SilentServer implements AuthApi {
  final hanging = Completer<void>();
  int signOuts = 0;
  @override
  Future<void> signOut(String refreshToken) {
    signOuts += 1;
    return hanging.future;
  }

  @override
  Future<Result<AuthSession>> refresh(String refreshToken) async => const Err(Failure.unknown);
  @override
  Future<Result<CodeChallenge>> requestCode({required String institutionCode, required String identifier}) async =>
      const Err(Failure.unknown);
  @override
  Future<Result<AuthSession>> verifyCode({
    required String institutionCode,
    required String challenge,
    required String code,
  }) async =>
      const Err(Failure.unknown);
  @override
  Future<Result<CollegeBrand>> lookupCollege(String code) async => const Err(Failure.unknown);
}

/// Opens the dialog; the answer lands in the returned list once it closes.
Future<List<bool>> _ask(WidgetTester tester, {int unsent = 0}) async {
  final answers = <bool>[];
  await tester.pumpWidget(MaterialApp(
    home: Builder(
      builder: (context) => TextButton(
        onPressed: () async => answers.add(await confirmSignOut(context, unsent: unsent)),
        child: const Text('open'),
      ),
    ),
  ));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return answers;
}

void main() {
  testWidgets('Cancel keeps the person signed in', (tester) async {
    final answers = await _ask(tester);
    expect(find.text('Sign out?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out?'), findsNothing);
    expect(answers, [false]);
  });

  testWidgets('Sign out confirms', (tester) async {
    final answers = await _ask(tester);
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(answers, [true]);
  });

  testWidgets('unsent changes are named before they are deleted', (tester) async {
    await _ask(tester, unsent: 2);
    expect(find.text('Changes not sent yet'), findsOneWidget);
    expect(find.textContaining('2 changes have not reached the server'), findsOneWidget);
    expect(find.text('Delete and sign out'), findsOneWidget);
  });

  test('once confirmed, the session ends without waiting for the server', () async {
    final server = _SilentServer();
    final store = _Store();
    final session = SessionManager(api: server, store: store);
    final events = <SessionEvent>[];
    final sub = session.events.listen(events.add);

    await session.signOut().timeout(const Duration(seconds: 1));
    await Future<void>.delayed(Duration.zero);

    expect(events.whereType<SignedOut>(), hasLength(1));
    expect(store.token, isNull);
    expect(server.signOuts, 1, reason: 'the server is still told, best effort');
    await sub.cancel();
    session.dispose();
  });
}
