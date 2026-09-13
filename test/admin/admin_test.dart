import 'package:college_erp/admin/auth/platform_auth_api.dart';
import 'package:college_erp/admin/auth/platform_sign_in_cubit.dart';
import 'package:college_erp/admin/auth/platform_sign_in_screen.dart' show formatManualKey;
import 'package:college_erp/admin/colleges/college_models.dart';
import 'package:college_erp/admin/colleges/colleges_api.dart';
import 'package:college_erp/admin/colleges/colleges_screen.dart';
import 'package:college_erp/admin/platform_authority.dart';
import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/network/auth_api.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/core/session/session_manager.dart';
import 'package:college_erp/core/session/session_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// AD-72: the super admin app. What matters: a password alone never signs
/// anybody in; enrolment and expired steps behave as on the web; a college
/// session never opens this app; and the colleges screen offers only what the
/// platform role allows.
AuthSession session() => AuthSession(
  actor: const Actor(id: 'pa1', fullName: 'Platform Owner', tenantId: null),
  accessToken: 'access',
  accessTokenExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
  refreshToken: 'refresh',
);

class _FakePlatformAuth implements PlatformAuthApi {
  Result<PlatformStep> step = const Ok(PlatformStep(kind: PlatformStepKind.secondFactor, challenge: 'ch1'));
  Result<AuthSession>? verify;
  Result<void> confirm = const Ok(null);
  final codes = <String>[];

  @override
  Future<Result<PlatformStep>> signIn({required String email, required String password}) async => step;

  @override
  Future<Result<AuthSession>> verifyCode({required String challenge, required String code}) async {
    codes.add(code);
    return verify ?? Ok(session());
  }

  @override
  Future<Result<TotpEnrolment>> beginEnrolment(String challenge) async =>
      const Ok(TotpEnrolment(otpauthUri: 'otpauth://totp/x', manualKey: 'ABCDEFGHIJKLMNOP'));

  @override
  Future<Result<void>> confirmEnrolment({required String challenge, required String code}) async => confirm;
}

class _Store implements SessionStore {
  String? token;
  @override
  Future<String?> readRefreshToken() async => token;
  @override
  Future<void> writeRefreshToken(String value) async => token = value;
  @override
  Future<String?> readInstitutionCode() async => null;
  @override
  Future<void> writeInstitutionCode(String code) async {}
  @override
  Future<CollegeBrand?> readCollege() async => null;
  @override
  Future<void> writeCollege(CollegeBrand college) async {}
  @override
  Future<void> clearCollege() async {}
  @override
  Future<void> clear() async => token = null;
}

class _AuthApi implements AuthApi {
  @override
  Future<Result<AuthSession>> signIn({required String institutionCode, required String identifier, required String password}) async =>
      const Err(Failure.unknown);
  @override
  Future<Result<AuthSession>> refresh(String refreshToken) async => Ok(session());
  @override
  Future<void> signOut(String refreshToken) async {}
  @override
  Future<Result<CollegeBrand>> lookupCollege(String code) async => const Err(Failure.unknown);
}

class _Colleges implements CollegesRepository {
  @override
  Future<Result<List<CollegeSummary>>> list() async => const Ok([
    CollegeSummary(id: 'c1', code: 'sunrise', name: 'Sunrise College', status: 'active', seatLimit: 500),
    CollegeSummary(id: 'c2', code: 'blossoms', name: 'Blossoms School', status: 'trial', seatLimit: 100),
  ]);
  @override
  Future<Result<CollegeDetail>> detail(String id) async => const Err(Failure.unknown);
  @override
  Future<Result<ProvisionedCollege>> provision(ProvisionInput input) async => const Err(Failure.unknown);
}

const expired = Failure(code: FailureCode.unauthenticated, message: 'This sign-in has expired. Start again.');
const wrong = Failure(code: FailureCode.unauthenticated, message: 'That code is not correct.');

void main() {
  group('platform sign-in', () {
    test('a password leads to a code step, and only a correct code adopts a session', () async {
      final api = _FakePlatformAuth();
      final adopted = <AuthSession>[];
      final cubit = PlatformSignInCubit(api, (s) async => adopted.add(s));

      await cubit.submitPassword(email: ' Owner@Nirvok.com ', password: 'pw');
      expect(cubit.state.step, PlatformSignInStep.code);
      expect(adopted, isEmpty, reason: 'a password alone never signs in');

      await cubit.submitCode('12 34');
      expect(api.codes, isEmpty, reason: 'an incomplete code is not sent');
      expect(cubit.state.failure?.message, 'Enter the six-digit code.');

      api.verify = const Err(wrong);
      await cubit.submitCode('123456');
      expect(cubit.state.step, PlatformSignInStep.code, reason: 'a wrong code stays on the step');
      expect(cubit.state.failure, wrong);

      api.verify = Ok(session());
      await cubit.submitCode('654321');
      expect(adopted, hasLength(1));
      await cubit.close();
    });

    test('an expired step goes back to the password', () async {
      final api = _FakePlatformAuth()..verify = const Err(expired);
      final cubit = PlatformSignInCubit(api, (_) async {});
      await cubit.submitPassword(email: 'o@n.com', password: 'pw');
      await cubit.submitCode('123456');
      expect(cubit.state.step, PlatformSignInStep.password);
      expect(cubit.state.failure, expired);
      await cubit.close();
    });

    test('first sign-in sets up the authenticator, then asks for the password again', () async {
      final api = _FakePlatformAuth()
        ..step = const Ok(PlatformStep(kind: PlatformStepKind.enrolment, challenge: 'ch2'));
      final cubit = PlatformSignInCubit(api, (_) async {});
      await cubit.submitPassword(email: 'o@n.com', password: 'pw');
      expect(cubit.state.step, PlatformSignInStep.enrol);
      expect(cubit.state.enrolment?.manualKey, 'ABCDEFGHIJKLMNOP');

      await cubit.confirmEnrolment('111111');
      expect(cubit.state.step, PlatformSignInStep.password);
      expect(cubit.state.enrolment, isNull, reason: 'the secret is gone from memory');
      expect(cubit.state.notice, contains('authenticator is set up'));
      await cubit.close();
    });

    test('codes are digits only, and keys print in groups of four', () {
      expect(PlatformSignInCubit.normaliseCode(' 12-34 56 78'), '123456');
      expect(formatManualKey('ABCDEFGHIJ'), 'ABCD EFGH IJ');
    });

    test('an adopted platform session is kept and announced like any other', () async {
      final store = _Store();
      final manager = SessionManager(api: _AuthApi(), store: store);
      final events = <SessionEvent>[];
      final sub = manager.events.listen(events.add);
      await manager.adoptSession(session());
      await Future<void>.delayed(Duration.zero);
      expect(store.token, 'refresh');
      expect(manager.actor?.tenantId, isNull);
      expect(events.single, isA<SignedIn>());
      await sub.cancel();
      manager.dispose();
    });
  });

  test('a college session is not a platform authority', () {
    expect(PlatformAuthority.fromJson({'actor_type': 'person', 'permissions': ['person.read']}), isNull);
    final owner = PlatformAuthority.fromJson({
      'actor_type': 'platform', 'platform_role': 'owner', 'permissions': ['platform.colleges.manage'],
    })!;
    expect(owner.can('platform.colleges.manage'), isTrue);
    expect(owner.roleLabel, 'Owner');
  });

  group('college records', () {
    test('detail reads seats, branding and the administrator, who may be absent', () {
      final json = {
        'id': 'c1', 'code': 'sunrise', 'name': 'Sunrise', 'status': 'trial', 'plan': 'standard',
        'timezone': 'Asia/Kolkata', 'logo_url': null, 'brand_color': '#1E3A8A',
        'seats': {'used': 3, 'limit': 10, 'remaining': 7, 'state': 'UNDER_LIMIT'},
        'administrator': {
          'full_name': 'Priya', 'email': 'p@s.edu', 'account_status': 'invited',
          'invitation': {'state': 'pending', 'expires_at': '2026-09-20T10:00:00.000Z'}, 'can_reissue': true,
        },
      };
      final detail = CollegeDetail.fromJson(json);
      expect(detail.seatsRemaining, 7);
      expect(detail.brandColor, '#1E3A8A');
      expect(detail.administrator?.invitationLabel, 'Invitation waiting');
      expect(CollegeDetail.fromJson({...json, 'administrator': null}).administrator, isNull);
    });

    test('the form suggests a code and names the first problem', () {
      expect(slugify('Sunrise College of Engineering!'), 'sunrise-college-of-engineering');
      const ok = ProvisionInput(code: 'sunrise', name: 'Sunrise', adminName: 'Priya', adminEmail: 'p@s.edu');
      expect(provisionFormError(ok), isNull);
      expect(
        provisionFormError(const ProvisionInput(code: 'x', name: 'Sunrise', adminName: 'Priya', adminEmail: 'p@s.edu')),
        contains('code'),
      );
      expect(
        provisionFormError(const ProvisionInput(
          code: 'sunrise', name: 'Sunrise', adminName: 'Priya', adminEmail: 'p@s.edu', logoUrl: 'http://x/l.png',
        )),
        contains('https'),
      );
      expect(ok.toJson()['logo_url'], isNull);
      expect((ok.toJson()['admin'] as Map)['email'], 'p@s.edu');
    });
  });

  group('colleges screen', () {
    Future<void> pump(WidgetTester tester, Set<String> permissions) async {
      await tester.pumpWidget(MaterialApp(
        home: CollegesScreen(
          authority: PlatformAuthority(role: 'owner', permissions: permissions),
          repository: _Colleges(),
        ),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('an Owner sees every college and can add one', (tester) async {
      await pump(tester, {'platform.colleges.read', 'platform.colleges.manage'});
      expect(find.text('Sunrise College'), findsOneWidget);
      expect(find.text('Blossoms School'), findsOneWidget);
      expect(find.text('Add college'), findsOneWidget);
    });

    testWidgets('without manage permission there is no way to add one', (tester) async {
      await pump(tester, {'platform.colleges.read'});
      expect(find.text('Sunrise College'), findsOneWidget);
      expect(find.text('Add college'), findsNothing);
    });
  });
}
