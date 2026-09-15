import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/calendar/data/calendar_api.dart';
import 'package:college_erp/features/calendar/presentation/academic_calendar_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// CAL-1: everyone sees the month, its holidays and term, and the breaks to
/// come; only the College Admin adds and removes, a break of several days is
/// one entry, and removing it removes every day.
class _Repo implements CalendarRepository {
  _Repo(this.holidays);
  List<CalendarHoliday> holidays;
  final added = <Map<String, String?>>[];
  final removed = <String>[];

  @override
  Future<Result<AcademicCalendar>> read() async => Ok(AcademicCalendar(
        holidays: holidays,
        periods: [
          CalendarPeriod(
            isTerm: true, id: 't1', name: 'Semester 1', yearName: '2026-27',
            startsOn: DateTime(2026, 6, 1), endsOn: DateTime(2026, 11, 30), isCurrent: true,
          ),
        ],
      ));

  @override
  Future<Result<void>> addHoliday({required String from, String? to, required String label}) async {
    added.add({'from': from, 'to': to, 'label': label});
    return const Ok(null);
  }

  @override
  Future<Result<void>> removeHoliday(String id) async {
    removed.add(id);
    holidays = holidays.where((h) => h.id != id).toList();
    return const Ok(null);
  }
}

List<CalendarHoliday> _diwali() => const [
      CalendarHoliday(id: 'd1', onDate: '2026-10-30', label: 'Diwali break'),
      CalendarHoliday(id: 'd2', onDate: '2026-10-31', label: 'Diwali break'),
      CalendarHoliday(id: 'd3', onDate: '2026-11-01', label: 'Diwali break'),
      CalendarHoliday(id: 'g1', onDate: '2026-10-02', label: 'Gandhi Jayanti'),
    ];

/// A phone-shaped screen tall enough that the lists below the month are built.
void _tallScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(420, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  test('consecutive days under one label are one break; a different label starts another', () {
    final c = AcademicCalendar(holidays: _diwali(), periods: const []);
    expect(c.runs.map((r) => '${r.label}:${r.length}'), ['Gandhi Jayanti:1', 'Diwali break:3']);
    expect(c.runsIn(DateTime(2026, 11)).single.label, 'Diwali break', reason: 'a break spanning two months is in both');
    expect(c.upcoming(DateTime(2026, 10, 15)).single.label, 'Diwali break');
  });

  testWidgets('a student sees the month, the term and what is coming, and cannot change it', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(MaterialApp(
      home: AcademicCalendarScreen(canManage: false, repository: _Repo(_diwali()), today: DateTime(2026, 10, 15)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('October 2026'), findsOneWidget);
    expect(find.text('Semester 1 · 2026-27'), findsWidgets);
    expect(find.text('Gandhi Jayanti'), findsOneWidget);
    expect(find.text('Diwali break'), findsWidgets);
    expect(find.textContaining('3 days · In 15 days'), findsOneWidget);
    expect(find.text('Add holiday'), findsNothing);
    expect(find.byIcon(Icons.delete_outline_rounded), findsNothing);
  });

  testWidgets('the College Admin removes a whole break, after confirming', (tester) async {
    _tallScreen(tester);
    final repo = _Repo(_diwali());
    await tester.pumpWidget(MaterialApp(
      home: AcademicCalendarScreen(canManage: true, repository: repo, today: DateTime(2026, 10, 15)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Add holiday'), findsOneWidget);

    await tester.tap(find.byTooltip('Remove Diwali break').first);
    await tester.pumpAndSettle();
    expect(find.text('Remove Diwali break?'), findsOneWidget);
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    expect(repo.removed, ['d1', 'd2', 'd3']);
    expect(find.text('Diwali break'), findsNothing);
  });

  testWidgets('adding a holiday sends its name and day, then shows its month', (tester) async {
    _tallScreen(tester);
    final repo = _Repo([]);
    await tester.pumpWidget(MaterialApp(
      home: AcademicCalendarScreen(canManage: true, repository: repo, today: DateTime(2026, 10, 15)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add holiday'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Foundation Day');
    await tester.tap(find.widgetWithText(FilledButton, 'Add holiday'));
    await tester.pumpAndSettle();
    expect(repo.added, [
      {'from': '2026-10-15', 'to': null, 'label': 'Foundation Day'},
    ]);
  });
}
