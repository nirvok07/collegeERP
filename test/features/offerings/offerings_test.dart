import 'package:college_erp/core/widgets/app_sheet.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/curriculum/domain/curriculum.dart';
import 'package:college_erp/features/offerings/data/offerings_api.dart';
import 'package:college_erp/features/offerings/domain/offering.dart';
import 'package:college_erp/features/offerings/presentation/offering_screen.dart';
import 'package:college_erp/features/sections/domain/section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-7 (AD-81): a course taught to a section, on the phone. What matters:
/// it cannot start without a teacher, a teacher is assigned from staff, the
/// whole section is enrolled in one step, and a reader changes nothing.
void main() {
  Future<_FakeOfferings> pump(WidgetTester tester, Set<String> permissions) async {
    final repo = _FakeOfferings();
    await tester.pumpWidget(MaterialApp(
      home: OfferingScreen(offeringId: 'o1', repository: repo, authority: Authority(permissions: permissions, hasAccess: true)),
    ));
    await tester.pumpAndSettle();
    return repo;
  }

  const admin = {'offering.read', 'offering.manage', 'instructor.assign', 'enrolment.manage'};

  Finder inDialog(String label) =>
      find.descendant(of: find.byType(AppSheet), matching: find.widgetWithText(FilledButton, label));

  testWidgets('a reader sees the course and changes nothing', (tester) async {
    await pump(tester, {'offering.read'});
    expect(find.text('CS101 · Programming'), findsOneWidget);
    expect(find.text('Start teaching'), findsNothing);
    expect(find.text('Assign'), findsNothing);
    expect(find.text('Enrol section A'), findsNothing);
  });

  testWidgets('it cannot start without a teacher; assigning one opens the way', (tester) async {
    final repo = await pump(tester, admin);
    final start = find.widgetWithText(FilledButton, 'Start teaching');
    expect(tester.widget<FilledButton>(start).onPressed, isNull);
    expect(find.text('Assign a teacher first.'), findsOneWidget);

    await tester.tap(find.text('Assign'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Meera Iyer'));
    await tester.pump();
    await tester.tap(inDialog('Assign'));
    await tester.pumpAndSettle();

    expect(repo.assigned, ['p1/lead']);
    expect(find.text('Meera Iyer'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Start teaching')).onPressed, isNotNull);
  });

  testWidgets('the whole section is enrolled in one step', (tester) async {
    await pump(tester, admin);
    expect(find.text('Students (0)'), findsOneWidget);
    await tester.tap(find.text('Enrol section A'));
    await tester.pumpAndSettle();
    expect(find.text('Students (2)'), findsOneWidget);
    expect(find.text('2 students enrolled'), findsOneWidget);
  });
}

class _FakeOfferings implements OfferingsRepository {
  final instructors = <Instructor>[];
  final enrolled = <RosterStudent>[];
  final assigned = <String>[];

  Offering _current() => Offering(
        id: 'o1', component: 'lecture', status: 'planned', courseId: 'c1', courseCode: 'CS101', courseTitle: 'Programming',
        sectionId: 's1', sectionLabel: 'A', sectionStatus: 'active', termNumber: 1, programName: 'BTech CSE',
        termName: 'Semester 1', instructors: List.of(instructors), allowedTransitions: const ['active', 'cancelled'],
        canActivate: instructors.isNotEmpty,
      );

  @override
  Future<Result<Offering>> offering(String id) async => Ok(_current());

  @override
  Future<Result<List<RosterStudent>>> roster(String offeringId) async => Ok(List.of(enrolled));

  @override
  Future<Result<List<StaffOption>>> staff() async => const Ok([
        StaffOption(personId: 'p1', fullName: 'Meera Iyer', email: 'meera@college.edu'),
        StaffOption(personId: 'p2', fullName: 'Ravi Kumar'),
      ]);

  @override
  Future<Result<void>> assign(String offeringId, String personId, String role) async {
    assigned.add('$personId/$role');
    instructors.add(Instructor(assignmentId: 'a1', personId: personId, fullName: 'Meera Iyer', role: role));
    return const Ok(null);
  }

  @override
  Future<Result<int?>> enrolSection(String offeringId) async {
    enrolled.addAll(const [
      RosterStudent(studentId: 'st1', fullName: 'Asha Rao', enrolmentNumber: 'CSE26001'),
      RosterStudent(studentId: 'st2', fullName: 'Dev Shah', enrolmentNumber: 'CSE26002'),
    ]);
    return const Ok(2);
  }

  @override
  Future<Result<List<Offering>>> forSection(String sectionId) async => Ok([_current()]);

  @override
  Future<Result<List<Course>>> courses() async => const Ok([]);

  @override
  Future<Result<void>> create({required String sectionId, required String courseId, required String component}) async =>
      const Ok(null);

  @override
  Future<Result<void>> transition(String id, String to, {String? reason}) async => const Ok(null);

  @override
  Future<Result<void>> endAssignment(String assignmentId, String reason) async => const Ok(null);

  @override
  Future<Result<List<Member>>> sectionMembers(String sectionId) async => const Ok([]);

  @override
  Future<Result<void>> enrol(String offeringId, String studentId) async => const Ok(null);

  @override
  Future<Result<void>> drop(String offeringId, String studentId, String reason) async => const Ok(null);
}
