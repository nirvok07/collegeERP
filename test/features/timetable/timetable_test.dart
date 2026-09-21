import 'package:college_erp/core/widgets/app_sheet.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/delivery/domain/class_session.dart';
import 'package:college_erp/features/rooms/domain/room.dart';
import 'package:college_erp/features/timetable/data/timetable_api.dart';
import 'package:college_erp/features/timetable/domain/timetable.dart';
import 'package:college_erp/features/timetable/presentation/offering_timetable.dart';
import 'package:college_erp/features/timetable/presentation/timetable_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-8 (AD-81): the timetable on the phone. What matters: a slot is added
/// with sensible defaults, generation is previewed and a clash stops it,
/// and the college's week lists classes an administrator can cancel.
void main() {
  Finder inDialog(String label) =>
      find.descendant(of: find.byType(AppSheet), matching: find.widgetWithText(FilledButton, label));

  test('the week starts on Monday', () {
    expect(mondayOf('2026-09-14'), '2026-09-14');
    expect(mondayOf('2026-09-20'), '2026-09-14');
  });

  Future<_FakeTimetable> pumpOffering(WidgetTester tester, {bool clash = false, bool withSlot = false}) async {
    final repo = _FakeTimetable()..clash = clash;
    // Seeded before the first pump: the block reads its slots once, when it opens.
    if (withSlot) repo.slotList.add(const Slot(id: 's1', dayOfWeek: 1, startsAt: '09:00', endsAt: '10:00'));
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ListView(children: [OfferingTimetable(offeringId: 'o1', repository: repo, canManage: true)])),
    ));
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('a slot is added on Monday 09:00–10:00 by default', (tester) async {
    final repo = await pumpOffering(tester);
    expect(find.textContaining('No slots yet'), findsOneWidget);
    await tester.tap(find.text('Add slot'));
    await tester.pumpAndSettle();
    await tester.tap(inDialog('Add slot'));
    await tester.pumpAndSettle();
    expect(repo.added, ['1/09:00/10:00/null']);
    expect(find.text('Monday 09:00 – 10:00'), findsOneWidget);
  });

  testWidgets('generation is previewed, then creates the classes', (tester) async {
    final repo = await pumpOffering(tester, withSlot: true);

    await tester.tap(find.text("Generate the term's classes"));
    await tester.pumpAndSettle();
    expect(find.text('Create 18 classes?'), findsOneWidget);
    expect(find.textContaining('Skipped: 2026-11-08 (Diwali)'), findsOneWidget);
    await tester.tap(inDialog('Create classes'));
    await tester.pumpAndSettle();
    expect(repo.generated, isTrue);
    expect(find.text('18 classes created'), findsOneWidget);
  });

  testWidgets('a clash found by the preview stops generation', (tester) async {
    final repo = await pumpOffering(tester, clash: true, withSlot: true);
    await tester.tap(find.text("Generate the term's classes"));
    await tester.pumpAndSettle();
    expect(find.text('These classes clash'), findsOneWidget);
    expect(find.textContaining('room LH-101 is busy with PH101'), findsOneWidget);
    expect(repo.generated, isFalse);
  });

  testWidgets("the college's week: an administrator cancels a class with a reason", (tester) async {
    final repo = _FakeTimetable();
    await tester.pumpWidget(MaterialApp(
      home: TimetableScreen(
        authority: const Authority(permissions: {'session.read', 'session.manage', 'term.manage'}, hasAccess: true),
        repository: repo,
        today: '2026-09-14',
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('09:00 – 10:00 · CS101 · A'), findsOneWidget);

    await tester.tap(find.byTooltip('More for CS101 at 09:00'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Teacher on leave');
    await tester.tap(inDialog('Cancel class'));
    await tester.pumpAndSettle();
    expect(repo.cancelled, ['x1/Teacher on leave']);
  });
}

class _FakeTimetable implements TimetableRepository {
  final slotList = <Slot>[];
  final added = <String>[];
  final cancelled = <String>[];
  bool clash = false;
  bool generated = false;

  @override
  Future<Result<List<Slot>>> slots(String offeringId) async => Ok(List.of(slotList));

  @override
  Future<Result<void>> addSlot(String offeringId, {required int day, required String startsAt, required String endsAt, String? roomId}) async {
    added.add('$day/$startsAt/$endsAt/$roomId');
    slotList.add(Slot(id: 's${slotList.length + 1}', dayOfWeek: day, startsAt: startsAt, endsAt: endsAt));
    return const Ok(null);
  }

  @override
  Future<Result<void>> removeSlot(String slotId) async => const Ok(null);

  @override
  Future<Result<GenerationReport>> generate(String offeringId, {required bool preview}) async {
    if (!preview) generated = true;
    return Ok(GenerationReport.fromJson({
      'from': '2026-07-01',
      'to': '2026-11-30',
      'created': preview ? 0 : 18,
      'already_scheduled': 0,
      'skipped_days': [
        {'date': '2026-11-08', 'label': 'Diwali'},
      ],
      'clashes': clash
          ? [
              {'kind': 'room', 'date': '2026-07-06', 'starts_at': '09:00', 'subject': 'LH-101', 'with_course_code': 'PH101', 'with_section_label': 'B'},
            ]
          : [],
      'occurrences': List.generate(18, (i) => {'date': '2026-07-06'}),
    }));
  }

  @override
  Future<Result<List<Room>>> rooms() async => const Ok([]);

  @override
  Future<Result<List<ClassSession>>> sessions({required String from, required String to}) async => Ok([
        ClassSession.fromJson({
          'id': 'x1', 'offering_id': 'o1', 'date': '2026-09-14', 'starts_at': '09:00', 'ends_at': '10:00',
          'status': 'scheduled', 'course': {'code': 'CS101', 'title': 'Programming'}, 'section': {'label': 'A'},
          'program': {'name': 'BTech CSE'}, 'term': {'name': 'Semester 1'}, 'room': null,
          'teacher': {'full_name': 'Meera Iyer'}, 'allowed_actions': ['reschedule', 'cancel', 'complete', 'reassign'],
        }),
      ]);

  @override
  Future<Result<void>> reschedule(String sessionId, {required String date, required String startsAt, required String endsAt, String? roomId, String? reason}) async =>
      const Ok(null);

  @override
  Future<Result<void>> cancel(String sessionId, String reason) async {
    cancelled.add('$sessionId/$reason');
    return const Ok(null);
  }

  @override
  Future<Result<List<Holiday>>> holidays() async => const Ok([]);

  @override
  Future<Result<void>> addHoliday(String onDate, String label) async => const Ok(null);

  @override
  Future<Result<void>> removeHoliday(String id) async => const Ok(null);
}
