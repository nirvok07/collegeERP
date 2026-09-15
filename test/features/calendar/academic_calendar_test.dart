import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/calendar/data/calendar_api.dart';
import 'package:college_erp/features/calendar/presentation/academic_calendar_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// CAL-1, CAL-2: everyone sees the month, its holidays and events, and what
/// is coming; nothing about terms. Only the College Admin adds, changes and
/// removes; a break of several days is one entry and removing it removes
/// every day.
class _Repo implements CalendarRepository {
  _Repo(this.holidays, [this.events = const []]);
  List<CalendarHoliday> holidays;
  List<CalendarEvent> events;
  final added = <Map<String, String?>>[];
  final savedEvents = <(EventDraft, String?)>[];
  final removed = <String>[];

  @override
  Future<Result<AcademicCalendar>> read() async => Ok(AcademicCalendar(holidays: holidays, events: events));

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

  @override
  Future<Result<void>> saveEvent(EventDraft draft, {String? id}) async {
    savedEvents.add((draft, id));
    return const Ok(null);
  }

  @override
  Future<Result<void>> removeEvent(String id) async {
    removed.add(id);
    events = events.where((e) => e.id != id).toList();
    return const Ok(null);
  }
}

List<CalendarHoliday> _diwali() => const [
      CalendarHoliday(id: 'd1', onDate: '2026-10-30', label: 'Diwali break'),
      CalendarHoliday(id: 'd2', onDate: '2026-10-31', label: 'Diwali break'),
      CalendarHoliday(id: 'd3', onDate: '2026-11-01', label: 'Diwali break'),
      CalendarHoliday(id: 'g1', onDate: '2026-10-02', label: 'Gandhi Jayanti'),
    ];

List<CalendarEvent> _events() => const [
      CalendarEvent(id: 'e1', title: 'Farewell party', onDate: '2026-10-20'),
      CalendarEvent(id: 'e2', title: "Teachers' Day celebration", onDate: '2026-10-22', startsAt: '11:00', endsAt: '14:00'),
    ];

/// A phone-shaped screen tall enough that the lists below the month are built.
void _tallScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(420, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  test('consecutive days under one label are one break; a different label starts another', () {
    final c = AcademicCalendar(holidays: _diwali());
    expect(c.runs.map((r) => '${r.label}:${r.length}'), ['Gandhi Jayanti:1', 'Diwali break:3']);
    expect(c.runsIn(DateTime(2026, 11)).single.label, 'Diwali break', reason: 'a break spanning two months is in both');
    expect(c.upcoming(DateTime(2026, 10, 15)).single.label, 'Diwali break');
  });

  test('an event says when: all day, or its hours on a 12-hour clock', () {
    expect(_events()[0].when, 'All day');
    expect(_events()[1].when, '11 AM – 2 PM');
    expect(twelveHour('00:30'), '12:30 AM');
    expect(twelveHour('12:00'), '12 PM');
  });

  testWidgets('a student sees holidays and events, nothing about terms, and cannot change anything', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(MaterialApp(
      home: AcademicCalendarScreen(canManage: false, repository: _Repo(_diwali(), _events()), today: DateTime(2026, 10, 15)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('October 2026'), findsOneWidget);
    expect(find.text('Gandhi Jayanti'), findsOneWidget);
    expect(find.text('Diwali break'), findsWidgets);
    expect(find.textContaining('3 days · Holiday · In 15 days'), findsOneWidget);
    expect(find.text('Farewell party'), findsWidgets);
    expect(find.textContaining('11 AM – 2 PM'), findsWidgets);
    expect(find.textContaining('Semester'), findsNothing);
    expect(find.text('Terms'), findsNothing);
    expect(find.text('Add'), findsNothing);
    expect(find.byIcon(Icons.delete_outline_rounded), findsNothing);
  });

  testWidgets('the College Admin removes a whole break, after confirming', (tester) async {
    _tallScreen(tester);
    final repo = _Repo(_diwali());
    await tester.pumpWidget(MaterialApp(
      home: AcademicCalendarScreen(canManage: true, repository: repo, today: DateTime(2026, 10, 15)),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Remove Diwali break').first);
    await tester.pumpAndSettle();
    expect(find.text('Remove Diwali break?'), findsOneWidget);
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    expect(repo.removed, ['d1', 'd2', 'd3']);
    expect(find.text('Diwali break'), findsNothing);
  });

  testWidgets('adding a holiday sends its name and day', (tester) async {
    _tallScreen(tester);
    final repo = _Repo([]);
    await tester.pumpWidget(MaterialApp(
      home: AcademicCalendarScreen(canManage: true, repository: repo, today: DateTime(2026, 10, 15)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Foundation Day');
    await tester.tap(find.widgetWithText(FilledButton, 'Add holiday'));
    await tester.pumpAndSettle();
    expect(repo.added, [
      {'from': '2026-10-15', 'to': null, 'label': 'Foundation Day'},
    ]);
  });

  testWidgets('adding a full-day event, and changing a timed one', (tester) async {
    _tallScreen(tester);
    final repo = _Repo([], _events());
    await tester.pumpWidget(MaterialApp(
      home: AcademicCalendarScreen(canManage: true, repository: repo, today: DateTime(2026, 10, 15)),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    // The sheet's choice, not the month's legend, which says "Event" too.
    await tester.tap(find.descendant(of: find.byType(BottomSheet), matching: find.text('Event')));
    await tester.pumpAndSettle();
    expect(find.text('Announced to everyone; classes go on as usual.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Annual fest');
    await tester.tap(find.widgetWithText(FilledButton, 'Add event'));
    await tester.pumpAndSettle();
    final (added, addedId) = repo.savedEvents.single;
    expect(addedId, isNull);
    expect(added.toJson(), {'title': 'Annual fest', 'on_date': '2026-10-15', 'starts_at': null, 'ends_at': null, 'note': null});

    // Tapping an event opens it for change, keeping its hours.
    await tester.tap(find.text("Teachers' Day celebration").first);
    await tester.pumpAndSettle();
    expect(find.text('Change the event'), findsOneWidget);
    expect(find.text('From 11 AM'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Save changes'));
    await tester.pumpAndSettle();
    final (changed, changedId) = repo.savedEvents.last;
    expect(changedId, 'e2');
    expect([changed.startsAt, changed.endsAt], ['11:00', '14:00']);
  });
}
