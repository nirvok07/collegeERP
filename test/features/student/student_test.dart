import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/features/student/data/my_attendance.dart';
import 'package:college_erp/features/student/presentation/student_home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ST-1: a student's home. A student signs in with their enrolment number and
/// a code (AD-82); what matters here is that the home shows attendance by
/// course, with a course below 75% called out.
void main() {
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

  @override
  Future<DateTime?> myAttendanceSavedAt() async => null;
}
