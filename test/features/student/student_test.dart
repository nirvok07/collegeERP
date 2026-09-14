import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/features/auth/presentation/student_activation_screen.dart';
import 'package:college_erp/features/student/data/my_attendance.dart';
import 'package:college_erp/features/student/presentation/student_home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ST-1 (AD-69): a student's sign-up and home. What matters: an incomplete
/// activation never reaches the server, the right values do, and the home
/// shows attendance by course with a course below 75% called out.
void main() {
  group('activation', () {
    late List<String> sent;
    StudentActivationCubit cubit({Failure? refuse}) {
      sent = [];
      return StudentActivationCubit(
        ({required institutionCode, required enrolmentNumber, required code, required password}) async {
          sent.add('$institutionCode/$enrolmentNumber/$code');
          return refuse == null ? const Ok(null) : Err(refuse);
        },
        'sunrise',
      );
    }

    test('an incomplete form is refused on the phone', () async {
      final c = cubit();
      await c.submit(enrolment: '', code: 'ABCD-EFGH-JKLM', password: 'student-pass-1', again: 'student-pass-1');
      expect(c.state.failure?.message, 'Enter your enrolment number.');
      await c.submit(enrolment: 'CSE26-001', code: 'ABCD', password: 'student-pass-1', again: 'student-pass-1');
      expect(c.state.failure?.message, contains('12-character code'));
      await c.submit(enrolment: 'CSE26-001', code: 'abcdefghjklm', password: 'short1', again: 'short1');
      expect(c.state.failure?.message, contains('ten characters'));
      await c.submit(enrolment: 'CSE26-001', code: 'abcd efgh jklm', password: 'student-pass-1', again: 'student-pass-2');
      expect(c.state.failure?.message, 'The passwords do not match.');
      expect(sent, isEmpty);
    });

    test('the right values reach the server; its refusal is shown', () async {
      final c = cubit();
      await c.submit(enrolment: ' CSE26-001 ', code: 'abcd-efgh-jklm', password: 'student-pass-1', again: 'student-pass-1');
      expect(sent, ['sunrise/CSE26-001/abcd-efgh-jklm']);
      expect(c.state.done, isTrue);

      final refused = cubit(refuse: const Failure(code: FailureCode.unauthenticated, message: 'This code is no longer valid. Ask for a new one.'));
      await refused.submit(enrolment: 'CSE26-001', code: 'ABCD-EFGH-JKLM', password: 'student-pass-1', again: 'student-pass-1');
      expect(refused.state.failure?.message, 'This code is no longer valid. Ask for a new one.');
    });
  });

  testWidgets('the home shows attendance by course, and a course below 75% stands out', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: StudentHomeScreen(
        authority: const Authority(
          permissions: {},
          hasAccess: false,
          student: StudentInfo(id: 's1', enrolmentNumber: 'CSE26-001', programName: 'BTech CSE', status: 'enrolled', sectionLabel: 'A', sectionTermNumber: 1),
        ),
        college: const CollegeBrand(code: 'sunrise', name: 'Sunrise College'),
        repository: _FakeSelf(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('BTech CSE · term 1 · section A'), findsOneWidget);
    expect(find.text('80%'), findsOneWidget, reason: 'overall');
    expect(find.text('CS101 · Programming'), findsOneWidget);
    expect(find.text('PH101 · Physics'), findsOneWidget);
    expect(find.textContaining('below 75%'), findsOneWidget, reason: 'only Physics is short');
  });
}

class _FakeSelf implements StudentSelfRepository {
  @override
  Future<Result<MyAttendance>> myAttendance() async => Ok(MyAttendance.fromJson({
        'overall': {'present': 7, 'late': 1, 'absent': 2, 'excused': 0, 'total': 10, 'percent': 80},
        'courses': [
          {'course': {'code': 'CS101', 'title': 'Programming'}, 'component': 'lecture', 'present': 6, 'late': 0, 'absent': 0, 'excused': 0, 'total': 6, 'percent': 100},
          {'course': {'code': 'PH101', 'title': 'Physics'}, 'component': 'lecture', 'present': 1, 'late': 1, 'absent': 2, 'excused': 0, 'total': 4, 'percent': 50},
        ],
      }));
}
