import 'package:college_erp/core/widgets/app_sheet.dart';
import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/features/organisation/domain/org_unit.dart';
import 'package:college_erp/features/rooms/data/rooms_api.dart';
import 'package:college_erp/features/rooms/domain/room.dart';
import 'package:college_erp/features/rooms/presentation/rooms_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// ADM-5 (AD-81): rooms on the phone. What matters: a reader sees rooms by
/// campus and nothing to change, a manager adds and archives them, and the
/// server's refusal to archive a room in use stays in the form.
void main() {
  Future<_FakeRooms> pump(WidgetTester tester, Set<String> permissions) async {
    final repo = _FakeRooms();
    await tester.pumpWidget(MaterialApp(
      home: RoomsScreen(authority: Authority(permissions: permissions, hasAccess: true), repository: repo),
    ));
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('a reader sees rooms by campus, and no way to change them', (tester) async {
    final repo = await pump(tester, {'session.read'});
    expect(find.text('Main Campus'), findsOneWidget);
    expect(find.text('LH-101 · Lecture Hall 101'), findsOneWidget);
    expect(find.text('Classroom · 60 seats · in 2 timetable slots'), findsOneWidget);
    expect(find.widgetWithText(FloatingActionButton, 'Add room'), findsNothing);
    expect(repo.campusReads, 0, reason: 'campuses are only read for someone who may add a room');
  });

  testWidgets('a manager adds a lab; the code is sent in capitals', (tester) async {
    final repo = await pump(tester, {'session.read', 'room.manage'});
    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add room'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Room code'), 'lab-2');
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Physics Lab');
    await tester.tap(find.text('Classroom').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lab').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Seats (optional)'), '30');
    await tester.tap(find.widgetWithText(FilledButton, 'Add room'));
    await tester.pumpAndSettle();

    expect(repo.created, ['c1/LAB-2/Physics Lab/lab/30']);
    expect(find.text('LAB-2 · Physics Lab'), findsOneWidget);
  });

  testWidgets("archiving a room the timetable uses: the server's refusal stays in the form", (tester) async {
    await pump(tester, {'session.read', 'room.manage'});
    await tester.tap(find.byTooltip('More for LH-101'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archive'));
    await tester.pumpAndSettle();
    expect(find.textContaining('is in the timetable'), findsOneWidget, reason: 'warned before asking');
    await tester.tap(find.widgetWithText(FilledButton, 'Archive'));
    await tester.pumpAndSettle();
    expect(find.textContaining('still used by 2 timetable slots'), findsOneWidget);
    expect(find.byType(AppSheet), findsOneWidget);
  });
}

class _FakeRooms implements RoomsRepository {
  final _rooms = [
    const Room(
      id: 'r1', campusId: 'c1', campusName: 'Main Campus', code: 'LH-101', name: 'Lecture Hall 101',
      kind: 'classroom', capacity: 60, slotCount: 2,
    ),
  ];
  final created = <String>[];
  int campusReads = 0;

  @override
  Future<Result<List<Room>>> rooms() async => Ok(List.of(_rooms));

  @override
  Future<Result<List<Campus>>> campuses() async {
    campusReads++;
    return const Ok([Campus(id: 'c1', name: 'Main Campus', code: 'main', isDefault: true, departmentCount: 0)]);
  }

  @override
  Future<Result<void>> createRoom({
    required String campusId,
    required String code,
    required String name,
    required String kind,
    int? capacity,
  }) async {
    created.add('$campusId/$code/$name/$kind/$capacity');
    _rooms.add(Room(id: 'r${_rooms.length + 1}', campusId: campusId, campusName: 'Main Campus', code: code, name: name, kind: kind, capacity: capacity));
    return const Ok(null);
  }

  @override
  Future<Result<void>> updateRoom(String id, {required String name, required String kind, int? capacity}) async =>
      const Ok(null);

  @override
  Future<Result<void>> archiveRoom(String id) async => const Err(Failure(
        code: FailureCode.conflict,
        message: 'Room LH-101 is still used by 2 timetable slots. Move them first.',
      ));
}
