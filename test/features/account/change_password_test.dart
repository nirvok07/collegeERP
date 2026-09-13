import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/account/change_password.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-1: changing one's own password on the phone. Nothing incomplete reaches
/// the server; the server's refusal is shown against its field.
void main() {
  late List<({String current, String next})> sent;
  Result<void> answer = const Ok(null);

  Future<Result<void>> change({required String current, required String next}) async {
    sent.add((current: current, next: next));
    return answer;
  }

  setUp(() {
    sent = [];
    answer = const Ok(null);
  });

  test('refuses what the server would, without asking it', () async {
    final cubit = ChangePasswordCubit(change);
    await cubit.submit(current: '', next: 'fresh-pass-77', again: 'fresh-pass-77');
    expect(cubit.state.failure?.fieldErrors['current_password'], isNotNull);
    await cubit.submit(current: 'old-pass-123', next: 'short1', again: 'short1');
    expect(cubit.state.failure?.fieldErrors['new_password'], contains('ten characters'));
    await cubit.submit(current: 'old-pass-123', next: 'old-pass-123', again: 'old-pass-123');
    expect(cubit.state.failure?.fieldErrors['new_password'], contains('not the current'));
    await cubit.submit(current: 'old-pass-123', next: 'fresh-pass-77', again: 'fresh-pass-78');
    expect(cubit.state.failure?.fieldErrors['again'], contains('do not match'));
    expect(sent, isEmpty);
    await cubit.close();
  });

  test('sends the change and is done; a wrong current password is shown against its field', () async {
    final cubit = ChangePasswordCubit(change);
    await cubit.submit(current: 'old-pass-123', next: 'fresh-pass-77', again: 'fresh-pass-77');
    expect(sent.single, (current: 'old-pass-123', next: 'fresh-pass-77'));
    expect(cubit.state.done, isTrue);

    answer = const Err(Failure(
      code: FailureCode.validationFailed,
      message: 'That is not your current password.',
      fieldErrors: {'current_password': 'Not your current password'},
    ));
    final again = ChangePasswordCubit(change);
    await again.submit(current: 'wrong-pass-1', next: 'fresh-pass-77', again: 'fresh-pass-77');
    expect(again.state.done, isFalse);
    expect(again.state.failure?.fieldErrors['current_password'], isNotNull);
    await cubit.close();
    await again.close();
  });
}
