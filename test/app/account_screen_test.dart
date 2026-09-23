import 'dart:convert';
import 'dart:typed_data';

import 'package:college_erp/app/account_screen.dart';
import 'package:college_erp/core/di/locator.dart';
import 'package:college_erp/core/network/api_client.dart';
import 'package:college_erp/core/saved_reads/saved_reads.dart';
import 'package:college_erp/core/saved_reads/saved_reads_database.dart';
import 'package:college_erp/core/session/authority.dart';
import 'package:college_erp/core/session/session_store.dart';
import 'package:college_erp/features/teaching/data/teaching_api.dart';
import 'package:college_erp/features/teaching/domain/teaching_repository.dart';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The Profile screen does not join the rest of the app's saved-first screens
/// in refreshing themselves quietly: it opens once from the network, saves
/// what it read, and every later open answers from that until the person
/// pulls to refresh.
class _Server implements HttpClientAdapter {
  final asked = <String>[];
  Object? name = 'Asha Rao';
  List<String> permissions = const [];
  List<Map<String, Object?>> teaching = const [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    asked.add(options.path);
    final body = options.path.contains('/me/teaching')
        ? {'data': teaching}
        : {
            'data': {'permissions': permissions, 'has_access': true, 'full_name': name},
          };
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;

  late SavedReadsDatabase db;
  late SavedReads saved;
  late _Server server;

  setUp(() {
    db = SavedReadsDatabase(NativeDatabase.memory());
    saved = SavedReads(db);
    server = _Server();
    final client = ApiClient(
      dio: Dio(BaseOptions(validateStatus: (_) => true))..httpClientAdapter = server,
      accessToken: () async => 'token',
      renew: () async => true,
      saved: () => saved,
      scope: () => 'c1/asha',
    );
    if (locator.isRegistered<AuthorityApi>()) locator.unregister<AuthorityApi>();
    if (locator.isRegistered<SessionStore>()) locator.unregister<SessionStore>();
    if (locator.isRegistered<TeachingRepository>()) locator.unregister<TeachingRepository>();
    locator.registerSingleton<AuthorityApi>(AuthorityApi(client));
    locator.registerSingleton<SessionStore>(SessionStore());
    locator.registerSingleton<TeachingRepository>(TeachingApi(client));
  });

  tearDown(() async {
    await db.close();
    locator.unregister<AuthorityApi>();
    locator.unregister<SessionStore>();
    locator.unregister<TeachingRepository>();
  });

  testWidgets('opens on the network once, then on what was saved, until a pull refreshes it', (tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(const MaterialApp(home: AccountScreen()));
      for (var i = 0; i < 20; i++) {
        await tester.pump();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(find.text('Asha Rao'), findsOneWidget);
      expect(server.asked, hasLength(2), reason: 'the first open reads the network (authority and teaching)');

      // Leaving and coming back must not ask again.
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      await tester.pumpWidget(const MaterialApp(home: AccountScreen()));
      await tester.pump();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await tester.pump();
      expect(find.text('Asha Rao'), findsOneWidget);
      expect(server.asked, hasLength(2), reason: 'the second open answers from what was saved');

      // A pull to refresh does ask, and shows what changed.
      server.name = 'Asha Verma';
      await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(server.asked, hasLength(4), reason: 'pull to refresh is the one thing that asks again');
      expect(find.text('Asha Verma'), findsOneWidget);
    });
  });

  testWidgets('what you can access lists only granted modules, plainly named', (tester) async {
    server.permissions = ['session.read'];
    await tester.runAsync(() async {
      await tester.pumpWidget(const MaterialApp(home: AccountScreen()));
      for (var i = 0; i < 20; i++) {
        await tester.pump();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(find.text('What you can access'), findsOneWidget);
      expect(find.text('Schedule'), findsOneWidget);
      expect(find.text('Fee heads'), findsNothing);
      expect(find.text('People'), findsNothing);
    });
  });

  testWidgets('your teaching shows department, class and subject for what a teacher teaches', (tester) async {
    server.teaching = [
      {
        'id': 'off-1',
        'component': 'lecture',
        'status': 'active',
        'course': {'id': 'c1', 'code': 'CS301', 'title': 'Operating Systems'},
        'section': {'id': 's1', 'label': 'A', 'status': 'active', 'term_number': 5},
        'program': {'id': 'p1', 'name': 'B.Tech CSE'},
        'department_name': 'Computer Science',
        'term': {'id': 't1', 'name': 'Semester 1'},
        'academic_year_name': '2026-27',
        'instructors': <Object?>[],
      },
    ];
    await tester.runAsync(() async {
      await tester.pumpWidget(const MaterialApp(home: AccountScreen()));
      for (var i = 0; i < 20; i++) {
        await tester.pump();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(find.text('Your teaching'), findsOneWidget);
      expect(find.text('CS301 · Operating Systems'), findsOneWidget);
      expect(find.text('Computer Science · Lecture'), findsOneWidget);
      expect(find.textContaining('B.Tech CSE'), findsOneWidget);
      expect(find.textContaining('Section A'), findsOneWidget);
    });
  });
}
