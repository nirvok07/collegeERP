import 'package:college_erp/app/routes.dart';
import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/features/onboarding/data/onboarding_api.dart';
import 'package:college_erp/features/onboarding/domain/onboarding.dart';
import 'package:college_erp/features/onboarding/presentation/admit_student_screen.dart';
import 'package:college_erp/features/onboarding/presentation/appoint_teacher_screen.dart';
import 'package:college_erp/features/onboarding/presentation/onboarding_cubits.dart';
import 'package:college_erp/features/onboarding/presentation/onboarding_screen.dart';
import 'package:college_erp/features/onboarding/presentation/teacher_invited_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ONB-1: the College Admin onboards from the phone. What matters: a teacher is
/// invited with the Faculty role in a department (the role's own scope), a
/// student is admitted into a program, nothing incomplete reaches the server,
/// and a college without departments or programs says what to do instead.
class _Repo implements OnboardingRepository {
  List<DepartmentOption> depts = const [DepartmentOption(id: 'd1', name: 'Computer Science', campusName: 'Main')];
  List<ProgramOption> progs = const [ProgramOption(id: 'p1', name: 'B.Tech CSE', code: 'BTCSE', departmentName: 'CS')];
  final teachers = <TeacherInput>[];
  final students = <StudentInput>[];

  @override
  Future<Result<List<DepartmentOption>>> departments() async => Ok(depts);
  @override
  Future<Result<List<ProgramOption>>> programs() async => Ok(progs);
  @override
  Future<Result<AppointedTeacher>> appointTeacher(TeacherInput input) async {
    teachers.add(input);
    return const Ok(AppointedTeacher(personId: 'p9'));
  }
  @override
  Future<Result<void>> admitStudent(StudentInput input) async {
    students.add(input);
    return const Ok(null);
  }
}

const args = OnboardingArgs(canAppoint: true, canAdmit: true, college: CollegeBrand(code: 'iit-doon', name: 'IIT Doon'));

void main() {
  test('a teacher is invited as staff with a department role; a head gets the head role', () {
    const input = TeacherInput(fullName: ' Ravi Kumar ', email: 'Ravi@IIT.edu', departmentId: 'd1');
    final json = input.toJson();
    expect(json['person_type'], 'staff');
    expect(json['email'], 'ravi@iit.edu');
    expect(json['role'], {'role_key': 'faculty', 'scope_type': 'department', 'scope_ref_id': 'd1'});
    const head = TeacherInput(fullName: 'A B', email: 'a@b.edu', departmentId: 'd1', asHead: true);
    expect((head.toJson()['role'] as Map)['role_key'], 'department_head');
  });

  test('forms name the first missing thing', () {
    expect(teacherFormError(const TeacherInput(fullName: 'Ravi', email: 'r@x.edu', departmentId: null)), contains('department'));
    expect(teacherFormError(const TeacherInput(fullName: 'Ravi', email: 'nope', departmentId: 'd1')), contains('email'));
    expect(studentFormError(const StudentInput(fullName: 'Nisha', enrolmentNumber: ' ', programId: 'p1', admittedOn: '2026-09-14')),
        contains('enrolment'));
    expect(studentFormError(const StudentInput(fullName: 'Nisha', enrolmentNumber: 'E1', programId: 'p1', admittedOn: '2026-09-14')), isNull);
    expect(const StudentInput(fullName: 'Nisha', enrolmentNumber: ' E1 ', programId: 'p1', admittedOn: '2026-09-14').toJson()
        .containsKey('email'), isFalse);
  });

  test('OTP-4: a student\'s mobile is sent when given, for their sign-in code (AD-82)', () {
    const withMobile = StudentInput(
      fullName: 'Diya', enrolmentNumber: 'E2', programId: 'p1', admittedOn: '2026-09-14', phone: ' +91 91234 56789 ',
    );
    expect(withMobile.toJson()['phone'], '+91 91234 56789');
    expect(const StudentInput(fullName: 'Diya', enrolmentNumber: 'E2', programId: 'p1', admittedOn: '2026-09-14').toJson()
        .containsKey('phone'), isFalse);
  });

  test('the appointment reads the server response, and ignores its invitation (AD-82)', () {
    final t = AppointedTeacher.fromJson({
      'person_id': 'p1', 'account_id': 'a1',
      'invitation': {'token': 'tok', 'expires_at': '2026-09-21T10:00:00.000Z', 'delivery': 'pending'},
    });
    expect(t.personId, 'p1');
  });

  test('an incomplete teacher form never reaches the server', () async {
    final repo = _Repo();
    final cubit = AppointTeacherCubit(repo);
    await cubit.load();
    expect(await cubit.submit(const TeacherInput(fullName: 'R', email: 'r@x.edu', departmentId: 'd1')), isNull);
    expect(repo.teachers, isEmpty);
    expect(cubit.state.failure?.code, FailureCode.validationFailed);
    expect(await cubit.submit(const TeacherInput(fullName: 'Ravi', email: 'r@x.edu', departmentId: 'd1')), isNotNull);
    expect(repo.teachers, hasLength(1));
    await cubit.close();
  });

  testWidgets('the hub offers only what the role allows', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: OnboardingScreen(args: OnboardingArgs(canAppoint: false, canAdmit: true)),
    ));
    expect(find.text('Onboard a student'), findsOneWidget);
    expect(find.text('Appoint a teacher'), findsNothing);
  });

  testWidgets('a college without departments is told where to add one', (tester) async {
    final repo = _Repo()..depts = const [];
    await tester.pumpWidget(MaterialApp(home: AppointTeacherScreen(args: args, repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('No departments yet'), findsOneWidget);
  });

  testWidgets('a student is admitted from the phone, and the form is ready for the next', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(MaterialApp(home: AdmitStudentScreen(args: args, repository: repo)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Nisha Rao');
    await tester.enterText(find.byType(TextField).at(1), 'CSE2026-001');
    await tester.tap(find.text('Admit student'));
    await tester.pumpAndSettle();
    expect(repo.students.single.programId, 'p1', reason: 'the only program is chosen for them');
    expect(repo.students.single.enrolmentNumber, 'CSE2026-001');
    expect(find.text('Nisha Rao is admitted.'), findsOneWidget);
  });

  test('the teacher message has the college code and says a sign-in code comes; no invitation', () {
    final text = TeacherInvitedScreen.message(const TeacherInvitedArgs(
      teacher: AppointedTeacher(personId: 'p'),
      name: 'Ravi',
      college: CollegeBrand(code: 'iit-doon', name: 'IIT Doon'),
    ));
    expect(text, contains('IIT Doon'));
    expect(text, contains('College code: iit-doon'));
    expect(text, contains('sign-in code will be sent'));
    expect(text, isNot(contains('nvitation')));
    expect(text, isNot(contains('assword')));
  });
}
