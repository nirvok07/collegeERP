import 'dart:math';

import 'package:college_erp/core/network/idempotency.dart';
import 'package:flutter_test/flutter_test.dart';

/// A key per logical write, reused only while that exact write is retried
/// (AD-58). The server honours the reuse; this pins down when it happens.
void main() {
  group('a fresh key', () {
    test('is 128 random bits written as 32 hex characters', () {
      final key = newIdempotencyKey();
      expect(key, matches(RegExp(r'^[0-9a-f]{32}$')));
    });

    test('passes the server format of 8 to 128 letters, digits, dashes or underscores', () {
      expect(newIdempotencyKey(), matches(RegExp(r'^[A-Za-z0-9_-]{8,128}$')));
    });

    test('is different every time, because two separate saves are two writes', () {
      final keys = List.generate(50, (_) => newIdempotencyKey()).toSet();
      expect(keys, hasLength(50));
    });

    test('is deterministic given a seeded source, which keeps tests exact', () {
      expect(newIdempotencyKey(Random(7)), newIdempotencyKey(Random(7)));
    });
  });

  group('one logical write', () {
    var counter = 0;
    IdempotentWrite write() => IdempotentWrite(() => 'key-${++counter}');

    setUp(() => counter = 0);

    test('keeps its key while the identical request is retried', () {
      final w = write();
      final first = w.keyFor('v1:marks');
      expect(w.keyFor('v1:marks'), first, reason: 'a resend of the same write');
    });

    test('takes a new key the moment the request changes', () {
      final w = write();
      final first = w.keyFor('v1:marks-a');
      expect(w.keyFor('v1:marks-b'), isNot(first));
    });

    test('forgets its key once the server confirms success', () {
      final w = write();
      final first = w.keyFor('v1:marks');
      w.settle();
      expect(w.keyFor('v1:marks'), isNot(first), reason: 'the next write is a new write');
    });
  });
}
