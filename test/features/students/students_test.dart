import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/academic/domain/academic.dart';
import 'package:college_erp/features/sections/domain/section.dart';
import 'package:college_erp/features/students/data/students_api.dart';
import 'package:college_erp/features/students/domain/student.dart';
import 'package:college_erp/features/students/presentation/students_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-9 (AD-81): students on the phone. What matters: the list opens on
/// enrolled students and filters on the server, a record shows its section
/// history, and withdrawing needs a reason and warns that places end.
void main() {
  test('filters become the server query', () {
    expect(const StudentFilter().query, 'limit=200&status=enrolled');
    expect(
      const StudentFilter(search: 'asha', programId: 'p1', unplacedOnly: true).copyWith(anyStatus: true).query,
      'limit=200&q=asha&program_id=p1&unplaced=true',
    );
  });

  Future<_FakeStudents> pump(WidgetTester tester, Set<String> permissions) async {
    final repo = _FakeStudents();
    await tester.pumpWidget(MaterialApp(
      home: StudentsScreen(authority: Authority(permissions: permissions, hasAccess: true), repository: repo),
    ));
    await tester.pumpAndSettle();
    return repo;
  }

  Finder inDialog(String label) =>
      find.descendant(of: find.byType(AlertDialog), matching: find.widgetWithText(FilledButton, label));

  testWidgets('the list opens on enrolled students; a filter asks the server again', (tester) async {
    final repo = await pump(tester, {'student.read'});
    expect(repo.queries.first, 'limit=200&status=enrolled');
    expect(find.text('Asha Rao'), findsOneWidget);
    expect(find.text('CSE26001 · BTech CSE · Term 1 · section A'), findsOneWidget);
    expect(find.widgetWithText(FloatingActionButton, 'Admit student'), findsNothing);

    await tester.tap(find.text('Not in a section'));
    await tester.pumpAndSettle();
    expect(repo.queries.last, 'limit=200&status=enrolled&unplaced=true');
  });

  testWidgets('withdrawing needs a reason, warns, and changes the record', (tester) async {
    final repo = await pump(tester, {'student.read', 'student.manage', 'section.read'});
    expect(find.widgetWithText(FloatingActionButton, 'Admit student'), findsOneWidget);
    await tester.tap(find.text('Asha Rao'));
    await tester.pumpAndSettle();
    expect(find.text('BTech CSE · term 1 · A'), findsOneWidget, reason: 'section history, named');

    await tester.tap(find.text('Change status'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Withdrawn'));
    await tester.pumpAndSettle();
    expect(find.textContaining('ends their place in their section'), findsOneWidget);
    await tester.tap(inDialog('Change status'));
    await tester.pumpAndSettle();
    expect(find.text('Give a reason. It explains the record later.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Moved to another city');
    await tester.tap(inDialog('Change status'));
    await tester.pumpAndSettle();

    expect(repo.changed, ['st1/withdrawn/Moved to another city']);
    expect(find.text('Withdrawn'), findsOneWidget);
  });

  testWidgets('OTP-6: an account manager changes where a student\'s sign-in code goes', (tester) async {
    final repo = await pump(tester, {'student.read', 'student.manage', 'account.manage'});
    await tester.tap(find.text('Asha Rao'));
    await tester.pumpAndSettle();
    expect(find.text('Mobile'), findsNothing, reason: 'no mobile on record yet');

    await tester.tap(find.text('Edit email or mobile'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number'), ' 98765 43210 ');
    await tester.tap(inDialog('Save'));
    await tester.pumpAndSettle();

    expect(repo.contacts, ['pa1/null/98765 43210'], reason: 'the person, trimmed, an empty email as null');
    expect(find.text('98765 43210'), findsOneWidget, reason: 'the record re-reads and shows it');
  });

  testWidgets('without account management there is no way to change it', (tester) async {
    await pump(tester, {'student.read', 'student.manage'});
    await tester.tap(find.text('Asha Rao'));
    await tester.pumpAndSettle();
    expect(find.text('Edit email or mobile'), findsNothing);
  });
}

class _FakeStudents implements StudentsRepository {
  final queries = <String>[];
  final changed = <String>[];
  final contacts = <String>[];
  String status = 'enrolled';
  String? phone;

  Student _asha() => Student(
        id: 'st1', fullName: 'Asha Rao', enrolmentNumber: 'CSE26001', programId: 'p1', programName: 'BTech CSE',
        admittedOn: '2026-07-01', status: status, sectionId: status == 'enrolled' ? 'x1' : null,
        sectionLabel: 'A', sectionTermNumber: 1, personId: 'pa1', phone: phone,
      );

  @override
  Future<Result<void>> changeContact(String personId, {required String? email, required String? phone}) async {
    contacts.add('$personId/$email/$phone');
    this.phone = phone;
    return const Ok(null);
  }

  @override
  Future<Result<List<Student>>> students(StudentFilter filter) async {
    queries.add(filter.query);
    return Ok([_asha()]);
  }

  @override
  Future<Result<Student>> student(String id) async => Ok(_asha());

  @override
  Future<Result<List<Placement>>> placements(String id) async =>
      const Ok([Placement(id: 'm1', sectionId: 'x1', validFrom: '2026-07-01')]);

  @override
  Future<Result<void>> setStatus(String id, String to, {String? reason}) async {
    changed.add('$id/$to/$reason');
    status = to;
    return const Ok(null);
  }

  @override
  Future<Result<List<Program>>> programs() async => const Ok([]);

  @override
  Future<Result<StudentAccessCode>> issueAccess(String id) async => Ok(StudentAccessCode(
        kind: 'activation', code: 'ABCD-EFGH-JKLM', expiresAt: DateTime.utc(2026, 9, 21), loginIdentifier: 'cse26001',
      ));

  @override
  Future<Result<List<Section>>> sections() async => const Ok([
        Section(
          id: 'x1', label: 'A', status: 'active', termNumber: 1, programId: 'p1', programName: 'BTech CSE',
          termId: 't1', termName: 'Semester 1', yearName: '2026-27', allowedTransitions: [],
        ),
      ]);
}
