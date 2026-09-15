import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/network/auth_api.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/core/session/session_manager.dart';
import 'package:college_erp/core/session/session_store.dart';
import 'package:college_erp/core/widgets/otp_code_field.dart';
import 'package:college_erp/features/auth/presentation/sign_in_cubit.dart';
import 'package:college_erp/features/auth/presentation/sign_in_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// OTP-2 (AD-82): the college app signs in with a code to email or mobile.
/// What matters: nothing incomplete reaches the server, the code step says
/// where the code went without saying whether anyone has that identifier, a
/// wrong code keeps the person on the code step, the right one opens the
/// session, and there is no password anywhere.
class _Store implements SessionStore {
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
  @override
  Future<CollegeBrand?> readCollege() async => null;
  @override
  Future<void> writeCollege(CollegeBrand value) async {}
  @override
  Future<void> clearCollege() async {}
}

class _Server implements AuthApi {
  final asked = <String>[];
  final codes = <String>[];
  CodeDestination destination = CodeDestination.email;

  @override
  Future<Result<CodeChallenge>> requestCode({required String institutionCode, required String identifier}) async {
    asked.add('$institutionCode/$identifier');
    return Ok(CodeChallenge(token: 'challenge-${asked.length}', destination: destination, expiresAt: DateTime.now()));
  }

  @override
  Future<Result<AuthSession>> verifyCode({
    required String institutionCode,
    required String challenge,
    required String code,
  }) async {
    codes.add(code);
    if (code != '123456') {
      return const Err(Failure(code: FailureCode.unauthenticated, message: 'That code is not correct.'));
    }
    return Ok(AuthSession(
      actor: const Actor(id: 'p1', fullName: 'admin@sunrise.edu', tenantId: 't1'),
      accessToken: 'access',
      accessTokenExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
      refreshToken: 'refresh',
    ));
  }

  @override
  Future<Result<AuthSession>> refresh(String refreshToken) async => const Err(Failure.unknown);
  @override
  Future<void> signOut(String refreshToken) async {}
  @override
  Future<Result<CollegeBrand>> lookupCollege(String code) async => const Err(Failure.unknown);
}

void main() {
  late _Server server;
  late SessionManager session;

  setUp(() {
    server = _Server();
    session = SessionManager(api: server, store: _Store());
  });
  tearDown(() => session.dispose());

  test('an empty identifier never reaches the server', () async {
    final cubit = SignInCubit(session, 'sunrise');
    await cubit.requestCode('   ');
    expect(cubit.state.failure?.message, 'Enter your email or mobile number.');
    expect(server.asked, isEmpty);
    await cubit.close();
  });

  test('asking moves to the code step, and says where the code went', () async {
    server.destination = CodeDestination.mobile;
    final cubit = SignInCubit(session, 'sunrise');
    await cubit.requestCode(' 98765 43210 ');
    expect(server.asked, ['sunrise/98765 43210']);
    expect(cubit.state.step, SignInStep.code);
    expect(cubit.state.challenge?.destination, CodeDestination.mobile);
    expect(session.actor, isNull, reason: 'asking signs nobody in');
    await cubit.close();
  });

  test('a wrong code stays on the code step; the right one, however pasted, signs in', () async {
    final cubit = SignInCubit(session, 'sunrise');
    await cubit.requestCode('admin@sunrise.edu');

    await cubit.submitCode('12');
    expect(cubit.state.failure?.message, 'Enter the six-digit code.');
    expect(server.codes, isEmpty);

    await cubit.submitCode('000000');
    expect(cubit.state.step, SignInStep.code);
    expect(cubit.state.failure?.message, 'That code is not correct.');

    await cubit.submitCode('Your code is 123 456');
    expect(server.codes.last, '123456');
    expect(session.actor?.id, 'p1');
    await cubit.close();
  });

  test('a new code says the earlier one no longer works; Change goes back', () async {
    final cubit = SignInCubit(session, 'sunrise');
    await cubit.requestCode('admin@sunrise.edu');
    await cubit.requestCode(cubit.state.identifier, again: true);
    expect(cubit.state.notice, contains('earlier one no longer works'));
    expect(server.asked, hasLength(2));

    cubit.changeIdentifier();
    expect(cubit.state.step, SignInStep.identifier);
    expect(cubit.state.identifier, 'admin@sunrise.edu', reason: 'what was typed is kept');
    await cubit.close();
  });

  testWidgets('the screen asks for an email or mobile, then a code; there is no password', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: SignInScreen(
        college: const CollegeBrand(code: 'sunrise', name: 'Sunrise College'),
        onChangeCollege: () {},
        session: session,
      ),
    ));
    expect(find.text('Email or mobile number'), findsOneWidget);
    expect(find.textContaining('assword'), findsNothing);
    expect(find.text('I have an invitation'), findsNothing);

    await tester.enterText(find.widgetWithText(TextField, 'Email or mobile number'), 'admin@sunrise.edu');
    await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
    await tester.pumpAndSettle();

    expect(find.text('Enter the 6-digit code sent to admin@sunrise.edu'), findsOneWidget);
    expect(find.text('Send a new code'), findsOneWidget);
    // FB-4: six boxes; typing the last digit signs in without a tap.
    expect(find.byType(OtpCodeField), findsOneWidget);
    await tester.enterText(find.byType(OtpCodeField), '123456');
    await tester.pumpAndSettle();
    for (final digit in ['1', '2', '3', '4', '5', '6']) {
      expect(find.text(digit), findsOneWidget, reason: 'each digit sits in its own box');
    }
    expect(server.codes, ['123456'], reason: 'signed in once, by the last digit');
    expect(session.actor?.id, 'p1');

    // The session schedules its next renewal; end it inside the test so no
    // timer outlives the widget tree.
    session.dispose();
  });
}
