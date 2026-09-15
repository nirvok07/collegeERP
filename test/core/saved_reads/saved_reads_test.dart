import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:college_erp/core/network/api_client.dart';
import 'package:college_erp/core/outbox/outbox_storage.dart';
import 'package:college_erp/core/saved_reads/saved_reads.dart';
import 'package:college_erp/core/saved_reads/saved_reads_database.dart';
import 'package:college_erp/core/widgets/screen_state.dart';
import 'package:college_erp/features/onboarding/data/onboarding_api.dart';
import 'package:college_erp/features/onboarding/presentation/onboarding_cubits.dart';
import 'package:college_erp/features/student/data/my_attendance.dart';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// OF-R1 (AD-9 amended): reads are saved as they arrive, a screen opens on
/// them, and the network's answer replaces them. Saved per account, wiped at
/// sign-out, encrypted at rest.
class _Server implements HttpClientAdapter {
  final answers = <String, (int, Object?)>{};
  final asked = <String>[];
  var offline = false;

  void answer(String path, Object? data, {int status = 200}) => answers[path] = (
    status,
    status < 400
        ? {'data': data}
        : {
            'error': {'code': 'FORBIDDEN', 'message': 'You cannot see this.'},
          },
  );

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    asked.add(options.path);
    if (offline) throw DioException.connectionError(requestOptions: options, reason: 'offline');
    final (status, body) =
        answers[options.path] ??
        (
          404,
          {
            'error': {'code': 'NOT_FOUND', 'message': 'Not found.'},
          },
        );
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _MemoryKeys implements DatabaseKeyStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String key) async => value = key;
}

Map<String, Object?> attendance(int present, {int total = 10}) => {
  'overall': {
    'present': present,
    'late': 0,
    'absent': total - present,
    'excused': 0,
    'total': total,
    'percent': present * 100 / total,
  },
  'courses': <Object?>[],
};

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;

  late SavedReadsDatabase db;
  late SavedReads saved;
  late _Server server;
  String? scope;

  ApiClient client() => ApiClient(
    dio: Dio(BaseOptions(validateStatus: (_) => true))..httpClientAdapter = server,
    accessToken: () async => 'token',
    renew: () async => true,
    saved: () => saved,
    scope: () => scope,
  );

  setUp(() {
    db = SavedReadsDatabase(NativeDatabase.memory());
    saved = SavedReads(db);
    server = _Server();
    scope = 't1/asha';
  });
  tearDown(() => db.close());

  group('the store', () {
    test('keeps one answer per account and read, and forgets it on request', () async {
      await saved.write('t1/asha', '/x', {'n': 1}, generation: saved.generation);
      await saved.write('t1/asha', '/x', {'n': 2}, generation: saved.generation);

      expect((await saved.read('t1/asha', '/x'))!.data, {'n': 2}, reason: 'the newest answer wins');
      expect(await saved.read('t1/ravi', '/x'), isNull, reason: 'another account has its own');

      await saved.drop('t1/asha', '/x');
      expect(await saved.read('t1/asha', '/x'), isNull);
    });

    test('a sign-out clears everyone, and a read begun before it saves nothing after', () async {
      await saved.write('t1/asha', '/x', 1, generation: saved.generation);
      await saved.write('t2/ravi', '/y', 2, generation: saved.generation);
      final before = saved.generation;

      await saved.clear();
      expect(await saved.read('t1/asha', '/x'), isNull);
      expect(await saved.read('t2/ravi', '/y'), isNull);

      await saved.write('t1/asha', '/x', 1, generation: before);
      expect(await saved.read('t1/asha', '/x'), isNull, reason: 'a late answer from before the sign-out');
    });

    test('the file is encrypted at rest with its own key', () async {
      final dir = Directory.systemTemp.createTempSync('saved_reads');
      addTearDown(() => dir.deleteSync(recursive: true));
      final file = File('${dir.path}/saved_reads.sqlite');
      final keys = _MemoryKeys();

      final opened = await openEncryptedDatabase(
        keys: keys,
        file: file,
        build: SavedReadsDatabase.new,
        inBackground: false,
      );
      final store = SavedReads(opened.database);
      await store.write('t1/asha', '/v1/students', {'name': 'plaintext-student-marker'}, generation: 0);
      await opened.database.close();

      expect(keys.value, matches(RegExp(r'^[0-9a-f]{64}$')));
      expect(latin1.decode(file.readAsBytesSync()), isNot(contains('plaintext-student-marker')));
    });
  });

  group('ApiClient', () {
    test('saves a successful read and answers it again from the phone, without the network', () async {
      server.answer('/v1/me/attendance', attendance(8));
      final api = client();
      await api.get('/v1/me/attendance', (d) => d);

      server.offline = true;
      Object? replayed;
      final shown = await fromSaved(() async {
        replayed = (await api.get('/v1/me/attendance', (d) => d)).valueOrNull;
      });

      expect(shown, isTrue);
      expect(((replayed! as Map)['overall'] as Map)['present'], 8);
      expect(server.asked, hasLength(1), reason: 'the saved pass never touches the network');
    });

    test('a read never saved ends the saved pass quietly', () async {
      final shown = await fromSaved(() => client().get('/v1/me/attendance', (d) => d));

      expect(shown, isFalse);
      expect(server.asked, isEmpty);
    });

    test('several reads in one pass: the misses nobody awaits do not escape', () async {
      server.answer('/a', 1);
      final api = client();
      await api.get('/a', (d) => d);

      final shown = await fromSaved(() async {
        final a = api.get('/a', (d) => d);
        final b = api.get('/b', (d) => d);
        final c = api.get('/c', (d) => d);
        await b;
        await a;
        await c;
      });

      expect(shown, isFalse);
    });

    test('a refusal drops what was saved; being offline keeps it', () async {
      final api = client();
      server.answer('/v1/students/s1', {'name': 'Asha'});
      await api.get('/v1/students/s1', (d) => d);

      server.offline = true;
      await api.get('/v1/students/s1', (d) => d);
      expect(await saved.read('t1/asha', '/v1/students/s1'), isNotNull, reason: 'offline is not a refusal');

      server.offline = false;
      server.answer('/v1/students/s1', null, status: 403);
      await api.get('/v1/students/s1', (d) => d);
      expect(await saved.read('t1/asha', '/v1/students/s1'), isNull, reason: 'access taken away does not linger');
    });

    test('another account, or nobody, is never answered from what one account saved', () async {
      server.answer('/v1/me/attendance', attendance(6));
      await client().get('/v1/me/attendance', (d) => d);

      scope = 't1/ravi';
      expect(await fromSaved(() => client().get('/v1/me/attendance', (d) => d)), isFalse);

      scope = null;
      expect(await fromSaved(() => client().get('/v1/me/attendance', (d) => d)), isFalse);
      await client().get('/v1/me/attendance', (d) => d);
      expect(await saved.read('null', '/v1/me/attendance'), isNull, reason: 'signed out: nothing is saved');
    });

    test('a read whose dates shift daily is found again by the name it is saved as', () async {
      server.answer('/v1/me/sessions?from=2026-09-01&to=2026-09-14', <Object?>[]);
      await client().get(
        '/v1/me/sessions?from=2026-09-01&to=2026-09-14',
        (d) => d,
        saveAs: '/v1/me/sessions?days=13',
      );

      final shown = await fromSaved(
        () => client().get('/v1/me/sessions?from=2026-09-02&to=2026-09-15', (d) => d, saveAs: '/v1/me/sessions?days=13'),
      );
      expect(shown, isTrue, reason: "tomorrow's window opens on today's answer");
    });
  });

  group('a screen (CR-1: saved-only until an explicit refresh)', () {
    test('opens on what was saved; only a pull to refresh asks the server again', () async {
      server.answer('/v1/me/attendance', attendance(6));
      final first = StudentHomeCubit(StudentSelfApi(client()));
      await first.load();
      expect(first.state.attendance!.overall.present, 6);
      await first.close();

      server.answer('/v1/me/attendance', attendance(9));
      final again = StudentHomeCubit(StudentSelfApi(client()));
      await again.load();
      expect(again.state.attendance!.overall.present, 6, reason: 'opening never asks the network on its own');
      expect(server.asked, hasLength(1), reason: 'only the very first cubit ever asked');

      await again.load(refresh: true);
      expect(again.state.attendance!.overall.present, 9, reason: 'a refresh does ask, and shows what changed');
      expect(server.asked, hasLength(2));
      await again.close();
    });

    test('offline, a refresh stays on what was saved and says why', () async {
      server.answer('/v1/me/attendance', attendance(6));
      final first = StudentHomeCubit(StudentSelfApi(client()));
      await first.load();
      await first.close();

      final again = StudentHomeCubit(StudentSelfApi(client()));
      await again.load();
      server.offline = true;
      await again.load(refresh: true);

      expect(again.state.status, LoadStatus.success);
      expect(again.state.attendance!.overall.present, 6);
      expect(again.state.failure, isNotNull, reason: 'the refresh failed, and the screen can say so');
      await again.close();
    });

    test('REF-1: Appoint a teacher opens on saved departments, not a fresh call every visit', () async {
      server.answer('/v1/departments', [
        {'id': 'd1', 'name': 'Computer Science', 'campus_name': 'Main'},
      ]);
      final first = AppointTeacherCubit(OnboardingApi(client()));
      await first.load();
      expect(first.state.options, hasLength(1));
      await first.close();

      final again = AppointTeacherCubit(OnboardingApi(client()));
      await again.load();
      expect(again.state.options, hasLength(1), reason: 'opening the form again answers from what was saved');
      expect(server.asked, hasLength(1), reason: 'only the very first open ever asked the network');

      server.answer('/v1/departments', [
        {'id': 'd1', 'name': 'Computer Science', 'campus_name': 'Main'},
        {'id': 'd2', 'name': 'Physics', 'campus_name': 'Main'},
      ]);
      await again.load(refresh: true);
      expect(again.state.options, hasLength(2), reason: 'a pull to refresh does ask, and shows what changed');
      expect(server.asked, hasLength(2));
      await again.close();
    });
  });
}
