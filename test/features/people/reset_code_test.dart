import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/features/people/domain/reset_code.dart';
import 'package:college_erp/features/people/presentation/reset_code_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// AD-80: the code is handed over by hand, so the message must carry
/// everything: the college code, the code itself, until when, and what to tap.
void main() {
  const college = CollegeBrand(code: 'abc-college', name: 'ABC College');

  test('a reset code reads as one and names the college', () {
    final code = ResetCode.fromJson({'kind': 'reset', 'token': 'tok-42', 'expires_at': '2026-09-15T10:00:00Z'});
    expect(code.isInvitation, isFalse);
    final text = code.message(college: college);
    expect(text, contains('Password reset code: tok-42'));
    expect(text, contains('College code: abc-college'));
    expect(text, contains('Forgot password?'));
  });

  test('for someone who never accepted, it is an invitation', () {
    final code = ResetCode.fromJson({'kind': 'invitation', 'token': 'tok-7', 'expires_at': '2026-09-20T10:00:00Z'});
    expect(code.isInvitation, isTrue);
    expect(code.message(), contains('Invitation code: tok-7'));
  });

  testWidgets('the handover screen shows the message once, to copy', (tester) async {
    final code = ResetCode(kind: 'reset', token: 'tok-42', expiresAt: DateTime.utc(2026, 9, 15));
    await tester.pumpWidget(MaterialApp(home: ResetCodeScreen(code: code, name: 'Ravi Kumar', college: college)));
    expect(find.text('A reset code for Ravi Kumar.'), findsOneWidget);
    expect(find.textContaining('tok-42'), findsOneWidget);
    expect(find.text('Copy message for Ravi Kumar'), findsOneWidget);
  });
}
