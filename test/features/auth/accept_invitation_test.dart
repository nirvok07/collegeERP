import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/features/auth/presentation/accept_invitation_cubit.dart';
import 'package:college_erp/features/auth/presentation/accept_invitation_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ACC-1: accepting a college invitation on the phone. What matters: nothing
/// incomplete reaches the server, the server's refusal is shown in its words,
/// and the college is the one chosen on the first screen, never typed again.
void main() {
  group('AcceptInvitationCubit', () {
    late List<({String college, String token, String password})> sent;
    Result<void> answer = const Ok(null);

    Future<Result<void>> accept({required String institutionCode, required String token, required String password}) async {
      sent.add((college: institutionCode, token: token, password: password));
      return answer;
    }

    setUp(() {
      sent = [];
      answer = const Ok(null);
    });

    test('an incomplete form is refused without asking the server', () async {
      final cubit = AcceptInvitationCubit(accept, 'iit-doon');
      await cubit.submit(token: ' ', password: 'strong-pass-9', again: 'strong-pass-9');
      expect(cubit.state.failure?.message, contains('invitation code'));
      await cubit.submit(token: 'tok', password: 'short1', again: 'short1');
      expect(cubit.state.failure?.message, contains('ten characters'));
      await cubit.submit(token: 'tok', password: 'strong-pass-9', again: 'strong-pass-8');
      expect(cubit.state.failure?.message, contains('do not match'));
      expect(sent, isEmpty);
      await cubit.close();
    });

    test('sends the chosen college, the trimmed code and the password; then it is done', () async {
      final cubit = AcceptInvitationCubit(accept, 'iit-doon');
      await cubit.submit(token: '  tok-123 ', password: 'strong-pass-9', again: 'strong-pass-9');
      expect(sent.single, (college: 'iit-doon', token: 'tok-123', password: 'strong-pass-9'));
      expect(cubit.state.done, isTrue);
      await cubit.close();
    });

    test("a used or replaced invitation is refused in the server's words", () async {
      answer = const Err(Failure(
        code: FailureCode.unauthenticated,
        message: 'This invitation link is no longer valid. Ask for a new one.',
      ));
      final cubit = AcceptInvitationCubit(accept, 'iit-doon');
      await cubit.submit(token: 'old', password: 'strong-pass-9', again: 'strong-pass-9');
      expect(cubit.state.done, isFalse);
      expect(cubit.state.failure?.message, contains('no longer valid'));
      await cubit.close();
    });
  });

  testWidgets('the screen shows the college and ends by sending the person to sign in', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: AcceptInvitationScreen(
        college: const CollegeBrand(code: 'iit-doon', name: 'IIT Doon'),
        accept: ({required institutionCode, required token, required password}) async => const Ok(null),
      ),
    ));
    expect(find.text('IIT Doon'), findsOneWidget);
    await tester.enterText(find.byType(TextField).at(0), 'tok-123');
    await tester.enterText(find.byType(TextField).at(1), 'strong-pass-9');
    await tester.enterText(find.byType(TextField).at(2), 'strong-pass-9');
    await tester.tap(find.text('Set password'));
    await tester.pumpAndSettle();
    expect(find.text('Your password is set.'), findsOneWidget);
    expect(find.text('Go to sign in'), findsOneWidget);
  });
}
