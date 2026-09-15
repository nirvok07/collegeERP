import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:college_erp/core/di/outbox_setup.dart';
import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/outbox/offline_writes.dart';
import 'package:college_erp/core/outbox/outbox.dart';
import 'package:college_erp/core/outbox/outbox_database.dart';
import 'package:college_erp/core/outbox/outbox_replayer.dart';
import 'package:college_erp/core/outbox/outbox_storage.dart';
import 'package:college_erp/features/assessment/domain/assessment.dart';
import 'package:college_erp/features/assessment/domain/assessment_repository.dart';
import 'package:college_erp/features/attendance/domain/attendance_repository.dart';
import 'package:college_erp/features/attendance/domain/attendance_sheet.dart';
import 'package:college_erp/features/delivery/domain/class_session.dart';
import 'package:college_erp/features/delivery/domain/delivery_repository.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// The durable outbox (AD-59): what is kept, what is sent, what stops for a
/// person, and whose writes may be sent at all.
const teacher = OutboxScope(tenantId: 't1', personId: 'asha');
const otherTeacher = OutboxScope(tenantId: 't1', personId: 'ravi');

class _MemoryKeys implements DatabaseKeyStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String key) async => value = key;
}

/// Answers each send from a script, recording what was sent.
class _ScriptedSender implements OutboxSender {
  final List<Result<int?>> script = [];
  final sent = <({OutboxKind kind, int? version, String key})>[];
  Completer<void>? gate;

  @override
  Future<Result<int?>> send(OutboxItem item, int? version) async {
    sent.add((kind: item.kind, version: version, key: item.idempotencyKey));
    if (gate != null) await gate!.future;
    return script.isEmpty ? const Ok(null) : script.removeAt(0);
  }
}

const _conflict = Failure(code: FailureCode.conflict, message: 'Somebody else changed this register.');
const _server = Failure(code: FailureCode.server, message: 'The server is not responding.');

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;

  late OutboxDatabase db;
  late Outbox outbox;
  late _ScriptedSender sender;
  late OutboxReplayer replayer;
  late DateTime now;
  OutboxScope? scope = teacher;

  setUp(() {
    now = DateTime(2026, 9, 13, 10);
    scope = teacher;
    db = OutboxDatabase(NativeDatabase.memory());
    outbox = Outbox(db, clock: () => now);
    sender = _ScriptedSender();
    replayer = OutboxReplayer(outbox: outbox, sender: sender, scope: () => scope, clock: () => now);
  });

  tearDown(() async {
    replayer.stop();
    await db.close();
  });

  Future<int> save({String target = 's1', String key = 'key-save-0001', int? base = 3}) =>
      outbox.enqueue(
        teacher,
        kind: OutboxKind.attendanceSave,
        targetId: target,
        payload: {
          'marks': [
            {'student_id': 'st1', 'state': 'present'},
          ],
        },
        idempotencyKey: key,
        label: 'Attendance · CS301 · 2026-06-02',
        baseVersion: base,
      );

  test('1. enqueues only what replay needs, waiting to send', () async {
    await save();
    final items = await outbox.unsynced(teacher);
    expect(items, hasLength(1));
    final item = items.single;
    expect(item.state, OutboxState.pending);
    expect(item.idempotencyKey, 'key-save-0001');
    expect(item.baseVersion, 3);
    expect(item.payload.keys, ['marks'], reason: 'no roster, no names, no server entity');
    expect(item.toString(), isNot(contains('st1')), reason: 'what may reach a log has no payload');
  });

  group('the encrypted store', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('outbox'));
    tearDown(() => dir.deleteSync(recursive: true));

    test('2. keeps queued writes across a restart', () async {
      final keys = _MemoryKeys();
      final file = File('${dir.path}/outbox.sqlite');
      var opened = await openOutboxDatabase(keys: keys, file: file, inBackground: false);
      await Outbox(opened.database).enqueue(
        teacher,
        kind: OutboxKind.sessionTaught,
        targetId: 's9',
        payload: const {},
        idempotencyKey: 'key-taught-001',
        label: 'Taught',
      );
      await opened.database.close();

      opened = await openOutboxDatabase(keys: keys, file: file, inBackground: false);
      final items = await Outbox(opened.database).unsynced(teacher);
      expect(opened.recreated, isFalse);
      expect(items.single.idempotencyKey, 'key-taught-001');
      await opened.database.close();
    });

    test('3. takes its key from secure storage, encrypts the file, and fails closed without it',
        () async {
      final keys = _MemoryKeys();
      final file = File('${dir.path}/outbox.sqlite');
      final opened = await openOutboxDatabase(keys: keys, file: file, inBackground: false);
      expect(keys.value, matches(RegExp(r'^[0-9a-f]{64}$')), reason: '256 bits, created once');
      final firstKey = keys.value;
      await Outbox(opened.database).enqueue(
        teacher,
        kind: OutboxKind.attendanceSave,
        targetId: 's1',
        payload: {'marks': [{'student_id': 'student-plaintext-marker', 'state': 'absent'}]},
        idempotencyKey: 'key-enc-00001',
        label: 'Attendance',
        baseVersion: 1,
      );
      await opened.database.close();

      expect(latin1.decode(file.readAsBytesSync()), isNot(contains('student-plaintext-marker')));

      final again = await openOutboxDatabase(keys: keys, file: file, inBackground: false);
      expect(keys.value, firstKey, reason: 'the stored key is reused, not replaced');
      await again.database.close();

      // A different key cannot read the file: it is replaced, and that is said.
      keys.value = newDatabaseKey();
      final replaced = await openOutboxDatabase(keys: keys, file: file, inBackground: false);
      expect(replaced.recreated, isTrue);
      expect(await Outbox(replaced.database).unsynced(teacher), isEmpty);
      await replaced.database.close();
    });
  });

  test('4. a retry sends the same idempotency key', () async {
    await save();
    sender.script
      ..add(const Err(Failure.network))
      ..add(const Ok(4));
    await replayer.drain();
    now = now.add(const Duration(seconds: 3));
    await replayer.drain();
    expect(sender.sent.map((s) => s.key), ['key-save-0001', 'key-save-0001']);
    expect(await outbox.unsynced(teacher), isEmpty);
  });

  test('5. a changed write is a new write with its own key, after the first', () async {
    await save(key: 'key-first-0001');
    await save(key: 'key-second-002', base: 99);
    final items = await outbox.unsynced(teacher);
    expect(items.map((i) => i.idempotencyKey), ['key-first-0001', 'key-second-002']);
    expect(items[1].predecessorId, items[0].id);
    expect(items[1].baseVersion, isNull, reason: 'it takes the version its predecessor returns');
  });

  test('6. replays successfully and chains the returned version', () async {
    await save();
    await outbox.enqueue(
      teacher,
      kind: OutboxKind.attendanceSubmit,
      targetId: 's1',
      payload: const {},
      idempotencyKey: 'key-submit-001',
      label: 'Attendance',
      baseVersion: 3,
    );
    sender.script
      ..add(const Ok(4))
      ..add(const Ok(null));
    await replayer.drain();
    expect(sender.sent.map((s) => s.version), [3, 4]);
    expect(await outbox.unsynced(teacher), isEmpty);
  });

  test('7. a transient failure stays queued with backoff; a failing server stops for a person',
      () async {
    await save();
    sender.script.add(const Err(Failure.network));
    await replayer.drain();
    var item = (await outbox.unsynced(teacher)).single;
    expect(item.state, OutboxState.pending);
    expect(item.attempts, 1);

    // Not due yet: nothing is sent.
    await replayer.drain();
    expect(sender.sent, hasLength(1));

    for (var i = 0; i < OutboxReplayer.maxServerAttempts; i++) {
      now = now.add(const Duration(minutes: 11));
      sender.script.add(const Err(_server));
      await replayer.drain();
    }
    item = (await outbox.unsynced(teacher)).single;
    expect(item.state, OutboxState.failed);

    await outbox.retry(teacher, item.id);
    sender.script
      ..clear()
      ..add(const Ok(4));
    await replayer.drain();
    expect(await outbox.unsynced(teacher), isEmpty, reason: 'retried by a person');
  });

  test('8. a conflict stops the lane for a person and is never rebased', () async {
    await save(key: 'key-first-0001');
    await save(key: 'key-second-002');
    sender.script.add(const Err(_conflict));
    await replayer.drain();

    final items = await outbox.unsynced(teacher);
    expect(items.first.state, OutboxState.conflict);
    expect(items.first.errorMessage, _conflict.message);
    expect(items.last.state, OutboxState.pending);
    expect(sender.sent, hasLength(1), reason: 'nothing behind a conflict is sent on a guess');

    await outbox.retry(teacher, items.first.id);
    expect((await outbox.unsynced(teacher)).first.state, OutboxState.conflict,
        reason: 'a conflict is not retried');

    expect(await outbox.discard(teacher, items.first.id), 2);
    expect(await outbox.unsynced(teacher), isEmpty);
  });

  test('9. two drains at once send each write once', () async {
    await save();
    sender.gate = Completer();
    final a = replayer.drain();
    final b = replayer.drain();
    await Future<void>.delayed(Duration.zero);
    sender.gate!.complete();
    await Future.wait([a, b]);
    expect(sender.sent, hasLength(1));
    expect(await outbox.claimNext(teacher), isNull);
  });

  test('10. one teacher\'s writes never send as another, and sign-out removes only theirs',
      () async {
    await save();
    await outbox.enqueue(
      otherTeacher,
      kind: OutboxKind.sessionTaught,
      targetId: 's2',
      payload: const {},
      idempotencyKey: 'key-ravi-0001',
      label: 'Taught',
    );
    scope = otherTeacher;
    await replayer.drain();
    expect(sender.sent.map((s) => s.key), ['key-ravi-0001']);
    expect(await outbox.unsynced(otherTeacher), isEmpty);
    expect(await outbox.unsynced(teacher), hasLength(1), reason: 'waits for its own teacher');

    scope = null;
    await replayer.drain();
    expect(sender.sent, hasLength(1), reason: 'signed out: nothing is sent');

    await outbox.purge(teacher);
    expect(await outbox.unsynced(teacher), isEmpty);
  });

  test('11. a write interrupted mid-send is sent again after a restart, with its key', () async {
    await save();
    final claimed = await outbox.claimNext(teacher);
    expect(claimed!.state, OutboxState.sending);

    // The process dies here. A fresh replayer on the same store:
    final restarted = OutboxReplayer(outbox: Outbox(db, clock: () => now), sender: sender, scope: () => scope);
    sender.script.add(const Ok(4));
    await restarted.start(observeLifecycle: false);
    restarted.stop();
    expect(sender.sent.single.key, 'key-save-0001');
    expect(await outbox.unsynced(teacher), isEmpty);
  });

  test('pauses on an ended session and resumes on sign-in, without losing the write', () async {
    await save();
    sender.script.add(const Err(Failure.sessionEnded));
    await replayer.drain();
    final item = (await outbox.unsynced(teacher)).single;
    expect(item.state, OutboxState.pending);
    expect(item.attempts, 0, reason: 'not the write\'s fault');

    await replayer.drain();
    expect(sender.sent, hasLength(1), reason: 'paused until a sign-in');
    sender.script.add(const Ok(4));
    await replayer.resume();
    expect(await outbox.unsynced(teacher), isEmpty);
  });

  test('12. all six approved writes replay through their repositories, in order', () async {
    final attendance = _Attendance();
    final delivery = _Delivery();
    final assessment = _Assessment();
    final real = OutboxReplayer(
      outbox: outbox,
      scope: () => teacher,
      sender: RepositoryOutboxSender(attendance: attendance, delivery: delivery, assessment: assessment),
      clock: () => now,
    );
    Future<void> put(OutboxKind kind, String target, Map<String, Object?> payload, [int? base]) =>
        outbox.enqueue(
          teacher,
          kind: kind,
          targetId: target,
          payload: payload,
          idempotencyKey: 'key-${kind.name}',
          label: kind.name,
          baseVersion: base,
        );

    final marks = {
      'marks': [
        {'student_id': 'st1', 'state': 'present'},
      ],
    };
    await put(OutboxKind.attendanceSave, 's1', marks, 3);
    await put(OutboxKind.attendanceSubmit, 's1', const {});
    await put(OutboxKind.sessionTaught, 's1', const {});
    await put(OutboxKind.assessmentHeldOn, 'a1', {'held_on': '2026-06-10'}, 7);
    await put(OutboxKind.assessmentMarks, 'a1', {
      'marks': [
        {'student_id': 'st1', 'status': 'scored', 'score': 42},
      ],
    });
    await put(OutboxKind.assessmentSubmit, 'a1', const {});

    await real.drain();
    real.stop();

    expect(attendance.calls, ['save v3 key-attendanceSave', 'submit v4 key-attendanceSubmit']);
    expect(delivery.calls, ['taught s1 key-sessionTaught']);
    expect(assessment.calls, [
      'held 2026-06-10 v7 key-assessmentHeldOn',
      'marks v8 key-assessmentMarks',
      'submit v9 key-assessmentSubmit',
    ]);
    expect(await outbox.unsynced(teacher), isEmpty);
  });

  test('a write waits behind an earlier one for the same record, even when online', () async {
    final writes = OfflineWrites(outbox: outbox, replayer: replayer, scope: () => scope);
    var onlineCalls = 0;
    Future<Result<int>> online() async {
      onlineCalls++;
      return const Err(Failure.network);
    }

    final first = await writes.run<int>(
      kind: OutboxKind.attendanceSave,
      targetId: 's1',
      payload: const {'marks': []},
      idempotencyKey: 'key-online-001',
      label: 'Attendance',
      baseVersion: 3,
      online: online,
    );
    expect(first, isA<Queued<int>>());
    expect((await outbox.unsynced(teacher)).single.idempotencyKey, 'key-online-001',
        reason: 'the same key the failed online attempt used');

    final second = await writes.run<int>(
      kind: OutboxKind.attendanceSave,
      targetId: 's1',
      payload: const {'marks': []},
      idempotencyKey: 'key-online-002',
      label: 'Attendance',
      online: online,
    );
    expect(second, isA<Queued<int>>());
    expect(onlineCalls, 1, reason: 'sending past the queued write would arrive out of order');

    final refused = await writes.run<int>(
      kind: OutboxKind.attendanceSave,
      targetId: 's2',
      payload: const {'marks': []},
      idempotencyKey: 'key-online-003',
      label: 'Attendance',
      baseVersion: 1,
      online: () async => const Err(_conflict),
    );
    expect(refused, isA<Refused<int>>(), reason: 'a refusal is shown, never queued');
  });
}

class _Attendance implements AttendanceRepository {
  final calls = <String>[];
  @override
  Future<Result<AttendanceSheet>> readSheet(String sessionId) => throw UnimplementedError();
  @override
  Future<Result<int>> saveMarks({
    required String sessionId,
    required int version,
    required List<Map<String, Object?>> marks,
    required String idempotencyKey,
  }) async {
    calls.add('save v$version $idempotencyKey');
    return Ok(version + 1);
  }

  @override
  Future<Result<void>> submit({
    required String sessionId,
    required int version,
    required String idempotencyKey,
  }) async {
    calls.add('submit v$version $idempotencyKey');
    return const Ok(null);
  }
}

class _Delivery implements DeliveryRepository {
  final calls = <String>[];
  @override
  Future<Result<List<ClassSession>>> mySessions({required String from, required String to}) =>
      throw UnimplementedError();
  @override
  Future<DateTime?> mySessionsSavedAt({required String from, required String to}) async => null;
  @override
  Future<Result<void>> markTaught(String sessionId, {required String idempotencyKey}) async {
    calls.add('taught $sessionId $idempotencyKey');
    return const Ok(null);
  }
}

class _Assessment implements AssessmentRepository {
  final calls = <String>[];
  @override
  Future<Result<List<AssessmentComponent>>> myComponents() => throw UnimplementedError();
  @override
  Future<Result<AssessmentSheet>> readSheet(String componentId) => throw UnimplementedError();
  @override
  Future<Result<int>> recordHeldOn({
    required String componentId,
    required int version,
    required String heldOn,
    required String idempotencyKey,
  }) async {
    calls.add('held $heldOn v$version $idempotencyKey');
    return Ok(version + 1);
  }

  @override
  Future<Result<int>> saveMarks({
    required String componentId,
    required int version,
    required List<Map<String, Object?>> marks,
    required String idempotencyKey,
  }) async {
    calls.add('marks v$version $idempotencyKey');
    return Ok(version + 1);
  }

  @override
  Future<Result<void>> submit({
    required String componentId,
    required int version,
    required String idempotencyKey,
  }) async {
    calls.add('submit v$version $idempotencyKey');
    return const Ok(null);
  }
}
