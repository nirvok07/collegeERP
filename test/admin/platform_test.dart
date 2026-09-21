import 'package:college_erp/core/widgets/app_sheet.dart';
import 'package:college_erp/admin/platform/accounts_screen.dart';
import 'package:college_erp/admin/platform/audit_screen.dart';
import 'package:college_erp/admin/platform/platform_api.dart';
import 'package:college_erp/admin/platform_authority.dart';
import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// SAM-3 (AD-72, AD-81): platform accounts and the audit in the Super Admin
/// app. What matters: an Owner invites and gets a code to hand over, only the
/// server's actions are offered and never on your own account, every change
/// carries a reason, the last Owner's refusal stays in the form, and the
/// audit pages by cursor.
void main() {
  Finder inDialog(String label) =>
      find.descendant(of: find.byType(AppSheet), matching: find.widgetWithText(FilledButton, label));

  const owner = PlatformAuthority(
    role: 'owner',
    permissions: {'platform.accounts.read', 'platform.accounts.manage', 'platform.roles.manage', 'platform.audit.read'},
  );

  testWidgets('an Owner invites Support and gets the code to hand over', (tester) async {
    final repo = _FakePlatform();
    await tester.pumpWidget(MaterialApp(home: PlatformAccountsScreen(authority: owner, repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('Asha Owner (you)'), findsOneWidget);

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Invite'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Full name'), 'Ravi Support');
    await tester.enterText(find.widgetWithText(TextField, 'Email'), 'Ravi@Nirvok.com');
    await tester.tap(inDialog('Invite'));
    await tester.pumpAndSettle();

    expect(repo.invited, ['ravi@nirvok.com/Ravi Support/support']);
    expect(find.textContaining('Invitation code: inv-123'), findsOneWidget);
    expect(find.textContaining('I have an invitation'), findsOneWidget);
  });

  testWidgets("your own account offers nothing; another Owner's disable is refused as the last Owner", (tester) async {
    final repo = _FakePlatform();
    await tester.pumpWidget(MaterialApp(home: PlatformAccountScreen(id: 'me', authority: owner, repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('This is you. Another Owner changes your account.'), findsOneWidget);
    expect(find.text('Disable'), findsNothing);

    // A new key: the same screen type in the same place would otherwise keep the first account's state.
    await tester.pumpWidget(MaterialApp(home: PlatformAccountScreen(key: const ValueKey('o2'), id: 'o2', authority: owner, repository: repo)));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Disable'));
    await tester.pumpAndSettle();
    await tester.tap(inDialog('Disable'));
    await tester.pumpAndSettle();
    expect(find.text('Say why, in a few words.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Left the company');
    await tester.tap(inDialog('Disable'));
    await tester.pumpAndSettle();
    expect(find.text('The platform must always keep an active Owner.'), findsOneWidget);
  });

  testWidgets('Support sees accounts but no way to change them', (tester) async {
    final repo = _FakePlatform();
    const support = PlatformAuthority(role: 'support', permissions: {'platform.accounts.read'});
    await tester.pumpWidget(MaterialApp(home: PlatformAccountScreen(id: 'o2', authority: support, repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('Disable'), findsNothing);
    expect(find.text('Change role'), findsNothing);
  });

  testWidgets('the audit loads a further page by its cursor', (tester) async {
    final repo = _FakePlatform();
    await tester.pumpWidget(MaterialApp(home: PlatformAuditScreen(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('Institution plan changed'), findsOneWidget);
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(repo.cursors, [null, 'c2']);
    expect(find.text('Account disabled'), findsOneWidget);
    expect(find.text('Load more'), findsNothing);
  });
}

class _FakePlatform implements PlatformRepository {
  final invited = <String>[];
  final cursors = <String?>[];

  static PlatformAccount _acc(String id, String name, {bool isYou = false, List<String> actions = const []}) => PlatformAccount(
        id: id, email: '$id@nirvok.com', fullName: name, status: 'active', role: 'owner', mfaEnrolled: true,
        isYou: isYou, actions: actions,
      );

  @override
  Future<Result<List<PlatformAccount>>> accounts() async =>
      Ok([_acc('me', 'Asha Owner', isYou: true), _acc('o2', 'Dev Owner')]);

  @override
  Future<Result<PlatformAccount>> account(String id) async => Ok(id == 'me'
      ? _acc('me', 'Asha Owner', isYou: true)
      : _acc('o2', 'Dev Owner', actions: const ['disable', 'change_role', 'reset_mfa']));

  @override
  Future<Result<PlatformInvite>> invite({required String email, required String fullName, required String role}) async {
    invited.add('$email/$fullName/$role');
    return Ok(PlatformInvite(
      account: PlatformAccount(id: 'n1', email: email, fullName: fullName, status: 'invited', role: role, mfaEnrolled: false),
      token: 'inv-123',
      expiresAt: DateTime.utc(2026, 9, 17),
    ));
  }

  @override
  Future<Result<PlatformInvite>> reissue(String id) async => const Err(Failure.unknown);

  @override
  Future<Result<PlatformAccount>> resetAuthenticator(String id, String reason) async => const Err(Failure.unknown);

  @override
  Future<Result<PlatformAccount>> setStatus(String id, String action, String reason) async =>
      const Err(Failure(code: FailureCode.conflict, message: 'The platform must always keep an active Owner.'));

  @override
  Future<Result<PlatformAccount>> changeRole(String id, {required String role, required String? expectedRole, required String reason}) async =>
      const Err(Failure.unknown);

  @override
  Future<Result<AuditPage>> audit({String? collegeId, String? cursor}) async {
    cursors.add(cursor);
    return Ok(cursor == null
        ? AuditPage(events: [
            AuditEvent(id: 'e1', at: DateTime.utc(2026, 9, 14, 9), action: 'institution.plan_changed', subjectType: 'institution', actorName: 'Asha Owner', collegeName: 'Sunrise College'),
          ], nextCursor: 'c2')
        : AuditPage(events: [
            AuditEvent(id: 'e2', at: DateTime.utc(2026, 9, 13, 9), action: 'account.disabled', subjectType: 'platform_account', actorName: 'Asha Owner'),
          ]));
  }
}
